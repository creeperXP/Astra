"""
Per-node content storage: notes, generated quiz/diagram cache, XP, achievements, files.

GET  /api/node-content/{node_id}
POST /api/node-content/{node_id}
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger(__name__)
router = APIRouter()

USER_ID = "default"


def _col():
    from services.mongodb_service import _get_db  # noqa: PLC0415
    db = _get_db()
    return db.nebula_node_content if db is not None else None


class NodeFile(BaseModel):
    name:    str
    content: str = ""   # plain text extracted from PDF / notes
    type:    str = "pdf"
    url:     str = ""


class QuizAttempt(BaseModel):
    question:   str
    correct:    bool
    timestamp:  str = ""     # ISO string
    mastery_before: float = 0.0
    mastery_after:  float = 0.0
    difficulty: float = 0.5


class NodeContentPayload(BaseModel):
    notes:            str = ""
    quiz_cache:       list[dict[str, Any]] = []
    quiz_history:     list[dict[str, Any]] = []   # list of QuizAttempt dicts
    diagram_cache:    dict[str, Any] = {}
    three_js_params:  dict[str, Any] = {}
    files:            list[NodeFile] = []
    xp:               int = 0
    achievements:     list[str] = []


@router.get("/node-content/{node_id}")
async def get_node_content(node_id: str):
    col = _col()
    if col is None:
        return {"node_id": node_id}
    try:
        doc = await col.find_one({"user_id": USER_ID, "node_id": node_id})
        if doc:
            doc.pop("_id", None)
            return doc
    except Exception as exc:
        log.warning("get_node_content failed: %s", exc)
    return {"node_id": node_id}


@router.post("/node-content/{node_id}")
async def save_node_content(node_id: str, payload: NodeContentPayload):
    col = _col()
    if col is None:
        return {"ok": True}
    try:
        await col.update_one(
            {"user_id": USER_ID, "node_id": node_id},
            {"$set": {
                "user_id":         USER_ID,
                "node_id":         node_id,
                "notes":           payload.notes,
                "quiz_cache":      payload.quiz_cache,
                "quiz_history":    payload.quiz_history,
                "diagram_cache":   payload.diagram_cache,
                "three_js_params": payload.three_js_params,
                "files":           [f.model_dump() for f in payload.files],
                "xp":              payload.xp,
                "achievements":    payload.achievements,
                "updated_at":      datetime.now(timezone.utc),
            }},
            upsert=True,
        )
    except Exception as exc:
        log.warning("save_node_content failed: %s", exc)
    return {"ok": True}
