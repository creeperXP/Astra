"""
MongoDB persistence layer using motor (async).

Collections:
  nebula_mastery        { user_id, node_id, alpha, beta, ts }
  nebula_courses        { user_id, course_id, name, code, professor, semester,
                          description, concepts, grade_distribution, created_at }
  nebula_personal       { user_id, skill_id, name, emoji, description,
                          nodes, links, created_at }
  nebula_folders        { user_id, folder_id, name, semester, course_ids }
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

_client = None
_db = None

def _get_db():
    global _client, _db
    if _db is not None:
        return _db
    try:
        import motor.motor_asyncio as motor  # noqa: PLC0415

        # Try os.environ first (populated by load_dotenv in main.py),
        # then fall back to the pydantic settings object
        uri = os.getenv("MONGODB_URI", "")
        if not uri:
            try:
                from config import settings as _s  # noqa: PLC0415
                uri = _s.mongodb_uri
            except Exception:
                pass
        if not uri:
            print("[MONGODB] ⚠️  MONGODB_URI not set — running without persistence")
            return None

        # macOS LibreSSL 2.8.x has TLS1.3 negotiation issues with Atlas.
        # tlsAllowInvalidCertificates bypasses the handshake error while still
        # using TLS transport (all data encrypted, just cert not verified).
        _client = motor.AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=5000,
            tlsAllowInvalidCertificates=True,
        )
        _db = _client["nebula_galaxy"]
        print("[MONGODB] ✅ Connected to MongoDB Atlas — db=nebula_galaxy")
        return _db
    except Exception as exc:
        print(f"[MONGODB] ❌ Init failed: {exc}")
        log.warning("MongoDB init failed: %s", exc)
        return None

USER_ID = "default"


# ── Mastery ──────────────────────────────────────────────────────────────────

async def save_mastery(node_id: str, alpha: float, beta: float) -> None:
    db = _get_db()
    if db is None:
        return
    try:
        await db.nebula_mastery.update_one(
            {"user_id": USER_ID, "node_id": node_id},
            {"$set": {"alpha": alpha, "beta": beta, "ts": datetime.now(timezone.utc)}},
            upsert=True,
        )
        mastery = alpha / (alpha + beta) if (alpha + beta) > 0 else 0.5
        print(f"[MONGODB] 💾 save_mastery  node={node_id!r}  α={alpha:.2f}  β={beta:.2f}  P={mastery:.3f}")
    except Exception as exc:
        print(f"[MONGODB] ❌ save_mastery failed: {exc}")
        log.warning("save_mastery failed: %s", exc)


async def load_all_mastery() -> dict[str, dict[str, float]]:
    db = _get_db()
    if db is None:
        return {}
    try:
        result: dict[str, dict[str, float]] = {}
        async for doc in db.nebula_mastery.find({"user_id": USER_ID}):
            result[doc["node_id"]] = {"alpha": doc["alpha"], "beta": doc["beta"]}
        print(f"[MONGODB] 📥 load_all_mastery — loaded {len(result)} node records")
        return result
    except Exception as exc:
        print(f"[MONGODB] ❌ load_all_mastery failed: {exc}")
        log.warning("load_all_mastery failed: %s", exc)
        return {}


# ── Courses ───────────────────────────────────────────────────────────────────

async def save_course(course: dict[str, Any]) -> None:
    db = _get_db()
    if db is None:
        return
    try:
        await db.nebula_courses.update_one(
            {"user_id": USER_ID, "course_id": course["course_id"]},
            {"$set": {**course, "user_id": USER_ID, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except Exception as exc:
        log.warning("save_course failed: %s", exc)


async def load_all_courses() -> list[dict[str, Any]]:
    db = _get_db()
    if db is None:
        return []
    try:
        courses = []
        async for doc in db.nebula_courses.find({"user_id": USER_ID}):
            doc.pop("_id", None)
            courses.append(doc)
        return courses
    except Exception as exc:
        log.warning("load_all_courses failed: %s", exc)
        return []


async def delete_course(course_id: str) -> None:
    db = _get_db()
    if db is None:
        return
    try:
        await db.nebula_courses.delete_one({"user_id": USER_ID, "course_id": course_id})
        log.info("delete_course: %s", course_id)
    except Exception as exc:
        log.warning("delete_course failed: %s", exc)


# ── Personal Skills ──────────────────────────────────────────────────────────

async def save_personal_skill(skill: dict[str, Any]) -> None:
    db = _get_db()
    if db is None:
        return
    try:
        await db.nebula_personal.update_one(
            {"user_id": USER_ID, "skill_id": skill["skill_id"]},
            {"$set": {**skill, "user_id": USER_ID, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except Exception as exc:
        log.warning("save_personal_skill failed: %s", exc)


async def load_all_personal_skills() -> list[dict[str, Any]]:
    db = _get_db()
    if db is None:
        return []
    try:
        skills = []
        async for doc in db.nebula_personal.find({"user_id": USER_ID}):
            doc.pop("_id", None)
            skills.append(doc)
        return skills
    except Exception as exc:
        log.warning("load_all_personal_skills failed: %s", exc)
        return []


# ── Folders ───────────────────────────────────────────────────────────────────

async def save_folder(folder: dict[str, Any]) -> None:
    db = _get_db()
    if db is None:
        return
    try:
        await db.nebula_folders.update_one(
            {"user_id": USER_ID, "folder_id": folder["folder_id"]},
            {"$set": {**folder, "user_id": USER_ID}},
            upsert=True,
        )
    except Exception as exc:
        log.warning("save_folder failed: %s", exc)


async def delete_folder(folder_id: str) -> None:
    db = _get_db()
    if db is None:
        return
    try:
        await db.nebula_folders.delete_one({"user_id": USER_ID, "folder_id": folder_id})
    except Exception as exc:
        log.warning("delete_folder failed: %s", exc)


async def load_all_folders() -> list[dict[str, Any]]:
    db = _get_db()
    if db is None:
        return []
    try:
        folders = []
        async for doc in db.nebula_folders.find({"user_id": USER_ID}):
            doc.pop("_id", None)
            folders.append(doc)
        return folders
    except Exception as exc:
        log.warning("load_all_folders failed: %s", exc)
        return []


# ── Snapshot (load everything at once) ───────────────────────────────────────

async def load_snapshot() -> dict[str, Any]:
    """Return all user data in one call for app init."""
    mastery  = await load_all_mastery()
    courses  = await load_all_courses()
    skills   = await load_all_personal_skills()
    folders  = await load_all_folders()
    return {
        "mastery":  mastery,
        "courses":  courses,
        "personal": skills,
        "folders":  folders,
    }
