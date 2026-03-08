from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.bayesian_service import update as bayesian_update

router = APIRouter()


class BayesianRequest(BaseModel):
    node_id: str
    success: bool
    question_difficulty: float
    current_alpha: Optional[float] = None  # from frontend (incl. propagation) so backend uses same state
    current_beta: Optional[float] = None


@router.post("/bayesian-update")
def bayesian_update_endpoint(req: BayesianRequest):
    alpha, beta, mastery = bayesian_update(
        req.node_id,
        req.success,
        req.question_difficulty,
        prior_alpha=req.current_alpha,
        prior_beta=req.current_beta,
    )
    return {"alpha": alpha, "beta": beta, "mastery_probability": mastery}


# ── /api/mastery-feedback  (Gemini-powered recommendations) ──────────────────

class MasteryFeedbackRequest(BaseModel):
    node_id:           str
    node_name:         str
    success:           bool
    prev_mastery:      float
    new_mastery:       float
    connected_topics:  list[str] = []
    question_text:     str = ""


@router.post("/mastery-feedback")
def mastery_feedback(req: MasteryFeedbackRequest):
    """
    Return Gemini-powered study recommendations after a quiz answer.
    Also prints a diagnostic summary of the full ML pipeline step.
    """
    delta = req.new_mastery - req.prev_mastery
    print(
        f"[PIPELINE] ✨ Quiz answer processed\n"
        f"           Node:       {req.node_name!r}\n"
        f"           Outcome:    {'✓ CORRECT' if req.success else '✗ WRONG'}\n"
        f"           Mastery:    {req.prev_mastery:.1%} → {req.new_mastery:.1%} ({delta:+.1%})\n"
        f"           Connected:  {req.connected_topics[:4]}"
    )

    recommendations = _gemini_recommendations(req)
    return {
        "recommendations":  recommendations,
        "mastery_delta":    round(delta, 4),
        "mastery_pct":      round(req.new_mastery * 100, 1),
        "prev_mastery_pct": round(req.prev_mastery * 100, 1),
    }


def _gemini_recommendations(req: MasteryFeedbackRequest) -> str:
    try:
        from services.gemini_service import _generate, _GENAI_OK, _get_key  # noqa: PLC0415
        if not _GENAI_OK or not _get_key():
            raise RuntimeError("Gemini not available")

        outcome   = "correctly" if req.success else "incorrectly"
        connected = ", ".join(req.connected_topics[:4]) or "none identified"
        delta_pct = f"{abs(req.new_mastery - req.prev_mastery):.1%}"

        prompt = (
            f"A student answered a quiz about '{req.node_name}' {outcome}. "
            f"Their mastery is now {req.new_mastery:.0%} (changed by {delta_pct}). "
            f"Connected topics: {connected}.\n\n"
            f"Write exactly 2-3 actionable study recommendations (max 120 words). "
            f"Be direct, encouraging, specific to this topic. "
            f"{'Celebrate the win and suggest harder challenges.' if req.success else 'Be supportive and give concrete improvement tips.'} "
            "No bullet points, no headers — just natural flowing sentences."
        )
        text = _generate(prompt, as_json=False).strip()
        if text:
            print(f"[GEMINI] 🎯 mastery_feedback recommendations ({len(text)} chars)")
            return text
        raise RuntimeError("empty response")
    except Exception as exc:
        print(f"[GEMINI] ⚠️  mastery_feedback fallback: {exc}")

    if req.success:
        return (
            f"Great work on {req.node_name}! Your mastery is now {req.new_mastery:.0%}. "
            f"Try exploring {req.connected_topics[0] if req.connected_topics else 'related concepts'} next "
            "to build on this momentum."
        )
    return (
        f"Keep going with {req.node_name} — you're at {req.new_mastery:.0%} mastery. "
        "Review the core definitions first, then retry the quiz. "
        "Breaking the topic into smaller pieces often helps."
    )
