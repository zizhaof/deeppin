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

from fastapi import APIRouter, File, HTTPException, UploadFile

from services.attachment_processor import process_attachment

router = APIRouter()


@router.post("/sessions/{session_id}/attachments/upload")
async def upload_attachment(
    session_id: uuid.UUID,
    file: UploadFile = File(...),
) -> dict:
    """
    上传文件并同步等待完整处理（提取 → 分块 → 向量化 → 存库）。
    Upload a file and synchronously wait for the full pipeline (extract → chunk → embed → store).

    返回前 embedding 已写入 DB，前端随即可发消息并命中 RAG 检索。
    Embeddings are in the DB before this returns, so the user can immediately send messages
    and have the file content retrieved via RAG.

    返回值 / Response:
      {
        "filename": "example.pdf",
        "chunk_count": 18   # 0 表示提取失败 / 0 means extraction failed
      }
    """
    content = await file.read()
    filename = file.filename or "未命名文件"

    if not content:
        raise HTTPException(status_code=400, detail="文件内容为空 / File content is empty")

    chunk_count = await process_attachment(str(session_id), filename, content)

    return {"filename": filename, "chunk_count": chunk_count}
