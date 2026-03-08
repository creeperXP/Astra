from __future__ import annotations

import json
import re
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from services.gemini_service import generate_node_content as gemini_generate
from services.gemini_service import _generate

router = APIRouter()


class GenerateRequest(BaseModel):
    node_id: str
    user_goal: str  # Make quiz | Generate diagram | Generate 3D game | Add node from PDF
    context: dict[str, Any] | None = None


@router.post("/generate-node-content")
def generate_node_content(req: GenerateRequest):
    result = gemini_generate(req.node_id, req.user_goal, req.context)
    return result


# ── Prerequisite gap analyser ─────────────────────────────────────────────────

class PrereqRequest(BaseModel):
    concept_name: str
    mastery: float
    consecutive_fails: int
    course_code: str | None = None
    course_description: str | None = None


@router.post("/prerequisites")
def get_prerequisites(req: PrereqRequest):
    prompt = f"""A student is struggling with the concept "{req.concept_name}" in {req.course_code or 'a course'}.
Current mastery level: {req.mastery:.0%}.
They have failed {req.consecutive_fails} consecutive questions in a row.
Course context: {req.course_description or '(none)'}

Identify 2-3 specific prerequisite concepts this student likely has NOT mastered yet that explain their struggles.
Return ONLY valid JSON (no markdown fences, no extra text):
{{
  "prereqs": [
    {{"name": "specific prereq concept", "description": "1-sentence: why this prereq is needed"}},
    {{"name": "another prereq", "description": "how it directly connects to the failing concept"}}
  ],
  "explanation": "2-3 sentences explaining exactly WHY the student is struggling and which prerequisite gaps are causing it",
  "encouragement": "1 short motivating sentence"
}}"""

    raw = _generate(prompt, as_json=True)
    if raw:
        try:
            cleaned = re.sub(r'```json\s*|\s*```', '', raw).strip()
            match = re.search(r'\{.*\}', cleaned, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception as e:
            print(f"[PREREQ] JSON parse error: {e} | raw: {raw[:200]}")

    # Fallback when Gemini unavailable
    base = req.concept_name.split()[0] if req.concept_name.split() else req.concept_name
    return {
        "prereqs": [
            {"name": f"{base} Fundamentals", "description": f"Core vocabulary and mechanics that underpin {req.concept_name}"},
            {"name": f"Introduction to {base}", "description": f"Entry-level concepts required before tackling {req.concept_name}"},
        ],
        "explanation": f"After {req.consecutive_fails} failed attempts at '{req.concept_name}', it's likely you're missing foundational knowledge that the concept builds on. The prerequisite nodes above have been added to your learning graph.",
        "encouragement": "Every expert was once a beginner — step back, build up, and you'll get it!"
    }
