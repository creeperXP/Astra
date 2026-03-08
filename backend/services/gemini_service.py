"""
Gemini service — uses the new google-genai SDK (google.genai).
Public interface is unchanged: generate_node_content / extract_concepts_from_syllabus.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

# ── SDK import (try new google-genai, fall back to legacy google-generativeai) ─

_GENAI_OK   = False
_GENAI_MODE = None  # "new" | "legacy"

try:
    from google import genai as _genai_new
    from google.genai import types as _genai_types
    _GENAI_OK   = True
    _GENAI_MODE = "new"
    print("[GEMINI] ✅ google-genai (new SDK) imported")
except Exception as _e1:
    print(f"[GEMINI] ⚠️  google-genai import failed: {_e1}")
    try:
        import google.generativeai as _genai_legacy  # type: ignore[import]
        from google.generativeai.types import GenerationConfig as _LegacyConfig  # type: ignore
        _GENAI_OK   = True
        _GENAI_MODE = "legacy"
        print("[GEMINI] ✅ google-generativeai (legacy SDK) imported")
    except Exception as _e2:
        print(f"[GEMINI] ❌ Both Gemini SDKs failed. New: {_e1} | Legacy: {_e2}")

import config
settings = config.settings


def _get_key() -> str:
    key = settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
    return key


def _client_new():
    """Return a google-genai Client instance."""
    key = _get_key()
    if not key:
        return None
    return _genai_new.Client(api_key=key)


def _generate(prompt: str, as_json: bool = False) -> str:
    """
    Call Gemini and return the response text.
    Works with both SDK modes; returns empty string on failure.
    """
    key = _get_key()
    if not key or not _GENAI_OK:
        if not key:
            print("[GEMINI] ⚠️  GEMINI_API_KEY not set")
        elif not _GENAI_OK:
            print("[GEMINI] ⚠️  No working Gemini SDK installed")
        return ""

    if _GENAI_MODE == "new":
        cfg = _genai_types.GenerateContentConfig(
            temperature=0.3,
            response_mime_type="application/json" if as_json else "text/plain",
        )
        # Model cascade (order: best → lightest, all on v1beta)
        models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-flash-latest",
        ]
        client = _genai_new.Client(api_key=key)
        for model_name in models_to_try:
            try:
                resp = client.models.generate_content(model=model_name, contents=prompt, config=cfg)
                print(f"[GEMINI] ✅ generate OK via {model_name}")
                return resp.text or ""
            except Exception as exc:
                err_str = str(exc)
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    print(f"[GEMINI] ⚠️  {model_name} rate-limited, trying next…")
                    continue
                if "404" in err_str or "NOT_FOUND" in err_str:
                    print(f"[GEMINI] ⚠️  {model_name} not found, trying next…")
                    continue
                print(f"[GEMINI] ❌ generate ({model_name}): {exc}")
                log.error("Gemini error (%s): %s", model_name, exc)
                return ""
        print("[GEMINI] ❌ All models exhausted (rate-limited or not found)")
        return ""

    # Legacy SDK
    try:
        _genai_legacy.configure(api_key=key)
        model = _genai_legacy.GenerativeModel("gemini-2.0-flash")
        gen_cfg = _LegacyConfig(
            response_mime_type="application/json" if as_json else "text/plain",
            temperature=0.3,
        )
        resp = model.generate_content(prompt, generation_config=gen_cfg)
        return resp.text or ""
    except Exception as exc:
        print(f"[GEMINI] ❌ generate (legacy SDK): {exc}")
        log.error("Gemini legacy-SDK error: %s", exc)
        return ""


# ── Thin wrapper kept for callers that use the old _client() pattern ──────────

def _client():
    """Legacy shim — returns a truthy object when Gemini is available."""
    if not _GENAI_OK or not _get_key():
        return None
    return True  # callers only check truthiness or call generate_content


# ── Tone helpers ──────────────────────────────────────────────────────────────

def _tone(mastery: float) -> tuple[str, str]:
    if mastery < 0.50:
        return ("Urgent/Supportive",
                "Be encouraging. Use simple language. Reinforce foundational gaps with empathy.")
    if mastery < 0.85:
        return ("Constructive",
                "Challenge the student to think deeper. Point out common misconceptions.")
    return ("Expert/Challenging",
            "Push the student with edge cases, proofs, and advanced applications.")


# ── Quiz fallbacks ────────────────────────────────────────────────────────────

_QUIZ_FALLBACKS: dict[str, list[dict]] = {
    "Make quiz": [
        {"q": "What is the primary purpose of this concept?",
         "options": ["A: To organise data", "B: To reduce complexity",
                     "C: To enable reuse",  "D: All of the above"],
         "correct": 3, "difficulty": 0.4},
        {"q": "Which statement best describes the time complexity of a balanced BST search?",
         "options": ["O(1)", "O(log n)", "O(n)", "O(n²)"],
         "correct": 1, "difficulty": 0.6},
    ]
}


# ── generate_node_content ─────────────────────────────────────────────────────

def generate_node_content(
    node_id: str,
    user_goal: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ctx         = context or {}
    mastery     = float(ctx.get("mastery", 0.5))
    label, instruction = _tone(mastery)
    course_desc = (ctx.get("course_description") or ctx.get("syllabus") or "")[:2000]

    # Adaptive difficulty: use whatever attempts we have (0 to 10); need minimum attempts before shifting
    recent_accuracy    = ctx.get("recent_accuracy")
    recent_count       = int(ctx.get("recent_attempt_count") or 0)
    consecutive_wrong  = int(ctx.get("consecutive_wrong") or 0)
    if recent_count == 0 or recent_accuracy is None:
        difficulty_hint = "Use difficulties 0.3, 0.5, 0.7 (first quiz or no recent data)."
    elif recent_count >= 2 and (consecutive_wrong >= 2 or recent_accuracy < 0.4):
        difficulty_hint = "EASIER: use difficulties 0.2, 0.35, 0.5 (student is struggling)."
    elif recent_count >= 3 and recent_accuracy >= 0.8 and consecutive_wrong == 0:
        difficulty_hint = "HARDER: use difficulties 0.5, 0.7, 0.85 (student is doing well)."
    else:
        difficulty_hint = "Use difficulties 0.3, 0.5, 0.7 (mixed or not enough data yet)."

    if "quiz" in user_goal.lower():
        goal_prompt = (
            'Return: { "type": "quiz", "payload": { "questions": [\n'
            '  { "q": "...", "options": ["A","B","C","D"], "correct": 0, '
            '"difficulty": 0.5, "explanation": "..." }\n'
            '] } }\n'
            f'Include 3 questions with increasing difficulty. {difficulty_hint} '
            'Add a short "explanation" for each answer.'
        )
    elif "diagram" in user_goal.lower():
        goal_prompt = (
            'Return: { "type": "diagram", "payload": {\n'
            '  "title": "...",\n'
            '  "description": "2-3 sentence visual description",\n'
            '  "nodes": [ { "id": "n1", "label": "...", "type": "concept" } ],\n'
            '  "edges": [ { "source": "n1", "target": "n2", "label": "depends on" } ]\n'
            '} }'
        )
    elif "3d" in user_goal.lower() or "game" in user_goal.lower():
        goal_prompt = (
            'Return: { "type": "3d_game", "payload": {\n'
            '  "template": "orbiting_particles",\n'
            '  "title": "...", "description": "...",\n'
            '  "params": { "num_particles": 40, "orbit_radius": 12,\n'
            '               "pulse_frequency": 0.8, "color_scheme": "nebula" }\n'
            '} }'
        )
    else:
        goal_prompt = 'Return: { "type": "text", "payload": { "content": "..." } }'

    perf_line = ""
    if "quiz" in user_goal.lower() and recent_count > 0 and recent_accuracy is not None:
        perf_line = f"Recent quiz: {recent_count} attempt(s), {recent_accuracy:.0%} correct"
        if consecutive_wrong > 0:
            perf_line += f", {consecutive_wrong} wrong in a row (adapt difficulty accordingly)."
        perf_line += "\n"

    prompt = (
        f"You are a UTD course assistant helping a student master {node_id}.\n"
        f"Mastery level: {mastery:.0%}  |  Tone: {label}\n"
        f"Instruction: {instruction}\n"
        f"{perf_line}"
        f"Course context: {course_desc or 'Not provided.'}\n"
        f"Goal: {user_goal}\n\n"
        f"{goal_prompt}\n"
        "Return ONLY valid JSON. Do not add markdown fences."
    )

    print(f"[GEMINI] 🧠 generate_node_content  node={node_id!r}  goal={user_goal!r}  mastery={mastery:.0%}")

    if not _GENAI_OK or not _get_key():
        fb = _QUIZ_FALLBACKS.get(user_goal, _QUIZ_FALLBACKS["Make quiz"])
        return {"type": "quiz", "payload": {"questions": fb}}

    raw = _generate(prompt, as_json=True)
    if not raw:
        fb = _QUIZ_FALLBACKS.get(user_goal, _QUIZ_FALLBACKS["Make quiz"])
        return {"type": "quiz", "payload": {"questions": fb}}

    try:
        result = json.loads(raw.strip())
        print(f"[GEMINI] ✅ generate_node_content OK  type={result.get('type','?')}")
        return result
    except Exception as exc:
        print(f"[GEMINI] ❌ JSON parse error: {exc}  raw={raw[:120]}")
        log.error("Gemini JSON parse error: %s", exc)
        return {"type": "error", "payload": {"message": str(exc)[:200]}}


# ── extract_concepts_from_syllabus ────────────────────────────────────────────

def extract_concepts_from_syllabus(text: str, course_code: str) -> list[dict]:
    prefix = f"concept_{course_code.lower().replace(' ', '_').replace('-', '_')}_"
    fallback = [
        {"id": f"{prefix}intro",        "name": "Introduction",  "deps": []},
        {"id": f"{prefix}core",         "name": "Core Concepts", "deps": [f"{prefix}intro"]},
        {"id": f"{prefix}applications", "name": "Applications",  "deps": [f"{prefix}core"]},
    ]

    if not _GENAI_OK or not _get_key() or not text.strip():
        return fallback

    print(f"[GEMINI] 📚 extract_concepts_from_syllabus  course={course_code!r}  text_len={len(text)}")

    prompt = (
        f"Analyse this {course_code} course content and extract 5-8 key learning concepts.\n"
        "Each concept should be 2-5 words. Order them from foundational to advanced.\n"
        "Use deps (0-based indices of concepts that MUST come first).\n\n"
        "Return ONLY JSON:\n"
        '{ "concepts": [\n'
        '  { "name": "Concept Name", "deps": [] },\n'
        '  { "name": "Next Concept", "deps": [0] }\n'
        '] }\n\n'
        f"Course content:\n{text[:4000]}"
    )

    raw = _generate(prompt, as_json=True)
    if not raw:
        return fallback

    try:
        data = json.loads(raw.strip())
        raw_list = data.get("concepts", [])[:8]
        out: list[dict] = []
        for i, c in enumerate(raw_list):
            slug  = c.get("name", f"topic_{i}").lower().replace(" ", "_").replace("/", "_")[:30]
            cid   = f"{prefix}{slug}"
            deps  = [out[j]["id"] for j in (c.get("deps") or [])
                     if isinstance(j, int) and 0 <= j < len(out)]
            out.append({"id": cid, "name": c.get("name", f"Concept {i+1}"), "deps": deps})
        print(f"[GEMINI] ✅ extract_concepts OK — {len(out)} concepts extracted")
        return out if out else fallback
    except Exception as exc:
        print(f"[GEMINI] ❌ extract_concepts JSON error: {exc}")
        log.error("Gemini extract_concepts error: %s", exc)
        return fallback
