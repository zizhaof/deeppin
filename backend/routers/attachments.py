# backend/routers/attachments.py
"""
Attachment upload endpoint.

POST /api/sessions/{session_id}/attachments/upload
  → Receives a file and waits for the full pipeline (extract → chunk → embed → store) before returning
  → The frontend keeps an "uploading" state during this time, preventing messages before embeddings are ready
  → Raw file bytes are released after the function returns; nothing is written to disk

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
    Upload a file and synchronously wait for the full pipeline.

        Short text (≤ INLINE_THRESHOLD): returns extracted text for the frontend to embed inline
        Long text (> INLINE_THRESHOLD): chunk → embed → store; embeddings are ready before returning

    Response:
      {
        "filename": "example.pdf",
        "chunk_count": 18,          # Chunks written in RAG mode; 0 for inline / failure
        "inline_text": "..."
      }

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
