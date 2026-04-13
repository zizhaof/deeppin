# backend/routers/attachments.py
"""
附件上传端点
Attachment upload endpoint.

POST /api/sessions/{session_id}/attachments/upload
  → 接收文件，同步等待完整处理（提取 → 分块 → 向量化 → 存库）后返回
  → Receives a file and waits for the full pipeline (extract → chunk → embed → store) before returning
  → 阻塞期间前端 InputBar 保持 uploading 状态，防止用户在 embedding 完成前发消息
  → The frontend keeps an "uploading" state during this time, preventing messages before embeddings are ready
  → 原始文件字节在函数返回后自动释放，不写磁盘
  → Raw file bytes are released after the function returns; nothing is written to disk

chunk_count=0 表示文本提取失败（扫描件、加密 PDF 等），前端应提示用户。
chunk_count=0 means text extraction failed (scanned image, encrypted PDF, etc.);
the frontend should show an error to the user.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from dependencies.auth import get_current_user
from services.attachment_processor import process_attachment

router = APIRouter()


@router.post("/sessions/{session_id}/attachments/upload")
async def upload_attachment(
    session_id: uuid.UUID,
    file: UploadFile = File(...),
    auth=Depends(get_current_user),
) -> dict:
    """
    上传文件并同步等待完整处理。
    Upload a file and synchronously wait for the full pipeline.

    根据提取文本长度自动路由 / Automatically routes based on extracted text length:
      - 短文本（≤ INLINE_THRESHOLD）：直接返回提取文本，前端将其拼入消息 context
        Short text (≤ INLINE_THRESHOLD): returns extracted text for the frontend to embed inline
      - 长文本（> INLINE_THRESHOLD）：分块 → 向量化 → 存库，返回前 embedding 已就绪
        Long text (> INLINE_THRESHOLD): chunk → embed → store; embeddings are ready before returning

    返回值 / Response:
      {
        "filename": "example.pdf",
        "chunk_count": 18,          # RAG 模式写入的块数；内联/失败时为 0
        "inline_text": "..." | null # 内联模式时为提取文本；否则为 null
      }

    chunk_count=0 且 inline_text=null 表示提取失败（扫描件、加密 PDF 等）。
    chunk_count=0 with inline_text=null means extraction failed (scanned image, encrypted PDF, etc.).
    """
    _user_id, _sb = auth
    content = await file.read()
    filename = file.filename or "未命名文件"

    if not content:
        raise HTTPException(status_code=400, detail="文件内容为空 / File content is empty")

    result = await process_attachment(str(session_id), filename, content)

    return {
        "filename": filename,
        "chunk_count": result["chunk_count"],
        "inline_text": result["inline_text"],
    }
