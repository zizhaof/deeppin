# backend/routers/sessions.py
"""
Session 路由
Session router — create and retrieve sessions.

端点列表 / Endpoints:
  GET    /api/sessions                          列出当前用户的所有 sessions
  POST   /api/sessions                          创建 session（同时自动创建主线 thread）
  GET    /api/sessions/{session_id}             获取 session 及其所有 active threads
  DELETE /api/sessions/{session_id}             删除 session（CASCADE 删除所有 threads/messages/summaries）
  GET    /api/sessions/{session_id}/messages    批量获取所有 thread 消息
  POST   /api/sessions/{session_id}/flatten     将所有子线程按 preorder 合并回主线（不可逆）
"""

import asyncio
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException

from db.supabase import get_supabase
from dependencies.auth import CurrentUser, get_current_user, get_current_user_full
from models.session import CreateSessionRequest, Session
from services.flatten_service import compute_preorder, is_already_flattened

logger = logging.getLogger(__name__)

router = APIRouter()

# 匿名用户最多只能持有 1 个 session；登录/linkIdentity 后解除限制。
# Anonymous users may hold at most 1 session; linking an identity removes the cap.
ANON_MAX_SESSIONS = 1


async def _db(fn):
    """将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.get("/sessions")
async def list_sessions(auth=Depends(get_current_user)):
    """获取当前用户的所有 sessions，按创建时间倒序，最多返回 50 条。"""
    _user_id, sb = auth
    res = await _db(lambda: (
        sb.table("sessions")
        .select("id, title, created_at, turn_count")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    ))
    return res.data or []


@router.post("/sessions", response_model=Session, status_code=201)
async def create_session(
    body: CreateSessionRequest,
    user: CurrentUser = Depends(get_current_user_full),
):
    """创建新 session，并自动创建对应的主线 thread（depth=0）。
    匿名用户最多持有 1 个 session：超出直接 402，提示登录解除上限。
    Anonymous users get at most 1 session; beyond that returns 402 and nudges sign-in."""
    user_id, sb = user.user_id, user.sb

    if user.is_anonymous:
        count_res = await _db(lambda: (
            sb.table("sessions").select("id", count="exact").limit(1).execute()
        ))
        if (count_res.count or 0) >= ANON_MAX_SESSIONS:
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "anon_session_limit",
                    "limit": ANON_MAX_SESSIONS,
                    "message": (
                        "匿名试用仅支持 1 个会话，登录后可开新对话。"
                        " / Free trial supports 1 session. Sign in to start new conversations."
                    ),
                },
            )

    row: dict = {"title": body.title, "user_id": user_id}
    if body.id:
        row["id"] = str(body.id)
    session_res = await _db(lambda: sb.table("sessions").insert(row).execute())

    if not session_res.data:
        raise HTTPException(status_code=500, detail="创建 session 失败 / Failed to create session")

    session = session_res.data[0]

    thread_res = await _db(lambda: sb.table("threads").insert({
        "session_id": session["id"],
        "depth": 0,
    }).execute())

    if not thread_res.data:
        await _db(lambda: sb.table("sessions").delete().eq("id", session["id"]).execute())
        raise HTTPException(status_code=500, detail="创建主线程失败 / Failed to create main thread")

    return session


@router.get("/sessions/{session_id}")
async def get_session(session_id: uuid.UUID, auth=Depends(get_current_user)):
    """获取指定 session 及其所有 threads（按创建时间升序）。RLS 自动过滤非本人数据。"""
    _user_id, sb = auth

    session_res = await _db(lambda: (
        sb.table("sessions").select("*").eq("id", str(session_id)).maybe_single().execute()
    ))
    if not session_res or not session_res.data:
        raise HTTPException(status_code=404, detail="Session 不存在 / Session not found")

    # 仅返回 active 线程；扁平化吸收的子线程（status='flattened'）作为 tombstone 留在 DB 但不暴露给前端
    # Return only active threads; flattened sub-thread tombstones stay in DB but aren't exposed to the client
    threads_res = await _db(lambda: (
        sb.table("threads")
        .select("*")
        .eq("session_id", str(session_id))
        .eq("status", "active")
        .order("created_at")
        .execute()
    ))

    return {
        **session_res.data,
        "threads": threads_res.data or [],
    }


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user_full),
):
    """删除指定 session（RLS 保证只能删自己的）。CASCADE 自动清理 threads/messages/summaries。
    匿名用户禁止删除 —— 否则可以「删除 + 重建」绕过生命期 20 轮配额。
    Anonymous users can't delete — otherwise delete+recreate would reset the lifetime 20-turn cap."""
    if user.is_anonymous:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "anon_cannot_delete",
                "message": (
                    "匿名试用不支持删除对话，登录后可管理所有会话。"
                    " / Sign in to delete or manage sessions."
                ),
            },
        )
    sb = user.sb
    res = await _db(lambda: (
        sb.table("sessions").delete().eq("id", str(session_id)).execute()
    ))
    if not res.data:
        raise HTTPException(status_code=404, detail="Session 不存在或无权限 / Session not found or unauthorized")


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: uuid.UUID, auth=Depends(get_current_user)):
    """
    批量获取该 session 下所有 active 线程的消息，按 thread_id 分组返回。
    Bulk-fetch all messages of active threads in this session, grouped by thread_id.

    扁平化后：所有原子线程消息已迁到主线，主线消息按 (position NULLS LAST, created_at) 排序。
    Post-flatten: all sub-thread messages now live on the main thread, ordered by
    (position NULLS LAST, created_at) so future un-positioned messages append at the end.
    """
    _user_id, sb = auth

    threads_res = await _db(lambda: (
        sb.table("threads")
        .select("id")
        .eq("session_id", str(session_id))
        .eq("status", "active")
        .execute()
    ))
    thread_ids = [t["id"] for t in (threads_res.data or [])]
    if not thread_ids:
        return {}

    messages_res = await _db(lambda: (
        sb.table("messages")
        .select("*")
        .in_("thread_id", thread_ids)
        .order("created_at")
        .execute()
    ))

    result: dict[str, list] = {tid: [] for tid in thread_ids}
    for msg in (messages_res.data or []):
        tid = msg["thread_id"]
        if tid in result:
            result[tid].append(msg)

    # position-aware 排序：有 position 的按 position 升序，无 position 的回落到 created_at
    # Position-aware sort: messages with position come first in ascending order; the rest fall back to created_at
    for tid in result:
        result[tid].sort(key=_message_sort_key)

    return result


def _message_sort_key(m: dict) -> tuple:
    """
    扁平化后排序键：先按 position（null 排最后），再按 created_at。
    Sort key after flatten: position first (nulls last), then created_at as tiebreaker.
    """
    pos = m.get("position")
    return (0, pos, m.get("created_at") or "") if pos is not None else (1, 0, m.get("created_at") or "")


@router.post("/sessions/{session_id}/flatten")
async def flatten_session(session_id: uuid.UUID, auth=Depends(get_current_user)):
    """
    把 session 下所有子线程的消息按 preorder DFS 合并回主线，并把子线程标记为 flattened。
    Merge all sub-thread messages into the main thread via preorder DFS, then mark
    sub-threads as flattened.

    **不可逆**：原子线程消息会被改写 thread_id；子线程行保留为 status='flattened' tombstone。
    **Irreversible**: sub-thread messages have their thread_id rewritten; sub-thread rows
    are retained as status='flattened' tombstones.

    幂等：若主线已有任何带 position 的消息，视为已扁平化，直接返回当前快照。
    Idempotent: if any main-thread message already has a position, treat as already
    flattened and return the current snapshot without changes.

    返回 / Returns:
      {
        "main_thread_id": str,
        "flattened_thread_count": int,        # 本次新标记为 flattened 的子线程数
        "message_count": int,                  # 主线当前消息总数
        "already_flattened": bool,
      }
    """
    _user_id, sb = auth

    # 1. 校验 session 存在
    session_res = await _db(lambda: (
        sb.table("sessions").select("id").eq("id", str(session_id)).maybe_single().execute()
    ))
    if not session_res or not session_res.data:
        raise HTTPException(status_code=404, detail="Session 不存在 / Session not found")

    # 2. 拉所有 active threads（含 anchor 信息）
    threads_res = await _db(lambda: (
        sb.table("threads")
        .select("id, parent_thread_id, anchor_message_id, depth, created_at")
        .eq("session_id", str(session_id))
        .eq("status", "active")
        .order("created_at")
        .execute()
    ))
    threads = threads_res.data or []
    main_thread = next((t for t in threads if t.get("parent_thread_id") is None), None)
    if not main_thread:
        raise HTTPException(status_code=500, detail="主线不存在 / Main thread missing")
    main_thread_id = main_thread["id"]

    # 3. 拉所有相关消息
    thread_ids = [t["id"] for t in threads]
    msgs_res = await _db(lambda: (
        sb.table("messages")
        .select("id, thread_id, position, created_at")
        .in_("thread_id", thread_ids)
        .order("created_at")
        .execute()
    ))
    all_msgs = msgs_res.data or []

    messages_by_thread: dict[str, list[dict]] = {tid: [] for tid in thread_ids}
    main_msgs: list[dict] = []
    for m in all_msgs:
        tid = m["thread_id"]
        if tid in messages_by_thread:
            messages_by_thread[tid].append(m)
        if tid == main_thread_id:
            main_msgs.append(m)

    # 4. 幂等：主线已有 position 即认为已扁平化
    if is_already_flattened(main_msgs):
        return {
            "main_thread_id": main_thread_id,
            "flattened_thread_count": 0,
            "message_count": len(main_msgs),
            "already_flattened": True,
        }

    # 5. 计算 preorder 序列
    orders = compute_preorder(main_thread_id, threads, messages_by_thread)
    if not orders:
        # session 没有任何消息：仍然把子线程标记为 flattened（如果有），避免残留
        # Session has no messages: still flatten any empty sub-threads to clean state
        sub_count = sum(1 for t in threads if t["id"] != main_thread_id)
        if sub_count > 0:
            await _db(lambda: (
                sb.table("threads")
                .update({"status": "flattened"})
                .eq("session_id", str(session_id))
                .neq("id", main_thread_id)
                .eq("status", "active")
                .execute()
            ))
        return {
            "main_thread_id": main_thread_id,
            "flattened_thread_count": sub_count,
            "message_count": 0,
            "already_flattened": False,
        }

    # 6. 调 RPC 一次性原子写入（messages 重写 + threads 标记 flattened）
    try:
        await _db(lambda: sb.rpc("flatten_session", {
            "p_session_id": str(session_id),
            "p_main_thread_id": main_thread_id,
            "p_message_orders": orders,
        }).execute())
    except Exception as exc:
        logger.exception("flatten RPC 失败 / flatten RPC failed (session=%s)", session_id)
        raise HTTPException(status_code=500, detail=f"扁平化失败 / Flatten failed: {exc}")

    flattened_count = sum(1 for t in threads if t["id"] != main_thread_id)
    return {
        "main_thread_id": main_thread_id,
        "flattened_thread_count": flattened_count,
        "message_count": len(orders),
        "already_flattened": False,
    }
