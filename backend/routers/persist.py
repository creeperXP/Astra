"""
Persistence endpoints – save/load app state from MongoDB.

POST /api/persist/mastery         – upsert one node's mastery params
POST /api/persist/course          – upsert one user-added course
POST /api/persist/folder          – upsert one folder
DELETE /api/persist/folder/{id}   – delete a folder
POST /api/persist/personal        – upsert one personal skill
GET  /api/persist/snapshot        – return all saved data (mastery, courses, folders, personal)
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from services.mongodb_service import (
    save_mastery, save_course, delete_course as mongo_delete_course,
    save_personal_skill, save_folder, delete_folder, load_snapshot,
)
from services.bayesian_service import update as bayesian_update

router = APIRouter()


# ── Mastery ──────────────────────────────────────────────────────────────────

class MasteryPayload(BaseModel):
    node_id: str
    alpha:   float
    beta:    float


@router.post("/persist/mastery")
async def persist_mastery(payload: MasteryPayload):
    await save_mastery(payload.node_id, payload.alpha, payload.beta)
    return {"ok": True}


# ── Course ────────────────────────────────────────────────────────────────────

class CoursePayload(BaseModel):
    course_id:           str
    name:                str
    code:                str
    professor:           str = ""
    semester:            str = ""
    description:         str = ""
    concepts:            list[dict[str, Any]] = []
    grade_distribution:  dict[str, float] = {}
    dfw_rate:            float = 0.18
    institutional_success: float = 0.72
    # Extended fields persisted alongside core data
    nebula_data:         dict[str, Any] = {}
    reddit_summary:      str = ""
    professor_profile:   dict[str, Any] = {}
    prereq_course_ids:   list[str] = []


@router.post("/persist/course")
async def persist_course(payload: CoursePayload):
    await save_course(payload.model_dump())
    # Do NOT pre-create mastery (alpha=1, beta=1) for concepts — that showed 50% with 0 attempts.
    # New concepts stay without a mastery record until the user does a quiz; frontend shows 0%.
    print(f"[PERSIST] course={payload.course_id!r}  concepts={len(payload.concepts)}  stored ✅")
    return {"ok": True}


@router.delete("/persist/course/{course_id}")
async def remove_course(course_id: str):
    await mongo_delete_course(course_id)
    return {"ok": True}


# ── Folder ────────────────────────────────────────────────────────────────────

class FolderPayload(BaseModel):
    folder_id:  str
    name:       str
    semester:   str = ""
    course_ids: list[str] = []


@router.post("/persist/folder")
async def persist_folder(payload: FolderPayload):
    await save_folder(payload.model_dump())
    return {"ok": True}


@router.delete("/persist/folder/{folder_id}")
async def remove_folder(folder_id: str):
    await delete_folder(folder_id)
    return {"ok": True}


# ── Personal skill ────────────────────────────────────────────────────────────

class PersonalSkillPayload(BaseModel):
    skill_id:    str
    name:        str
    emoji:       str = "⭐"
    description: str = ""
    nodes:       list[dict[str, Any]] = []
    links:       list[dict[str, Any]] = []


@router.post("/persist/personal")
async def persist_personal(payload: PersonalSkillPayload):
    await save_personal_skill(payload.model_dump())
    return {"ok": True}


# ── Snapshot ──────────────────────────────────────────────────────────────────

@router.get("/persist/snapshot")
async def get_snapshot():
    return await load_snapshot()
