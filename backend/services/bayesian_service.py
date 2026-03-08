"""
Bayesian Beta-Binomial mastery prediction (ML track).
P(Mastery) = α / (α + β). Updates account for slip/guess:
  α_new = α_old + (1 - P_guess) * success   (difficulty-weighted)
  β_new = β_old + (1 - P_slip) * failure
Recursive propagation: correct answers ripple to related nodes (hard edges).
"""
from __future__ import annotations

import os
import json
from typing import Optional

P_GUESS = 0.25
P_SLIP = 0.2
# New/unattempted nodes start at 0%. Softer prior so mastery rises with fewer questions (was 10 → ~5 correct for 30%)
PRIOR_ALPHA_NEW = 0.0
PRIOR_BETA_NEW = 4.0
# Slightly stronger weight per correct so 2–3 correct gets you to ~30%
SUCCESS_WEIGHT = 1.2
# Past 50%, each correct adds less % (alpha+beta is large); boost so 50%→80% doesn’t take 15+ questions
MID_RANGE_MASTERY_MIN = 0.45
MID_RANGE_MASTERY_MAX = 0.88
MID_RANGE_BOOST = 1.9  # multiply w_success in this band so ~2%/q becomes ~4–5%/q

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "mastery_params.json")


def _load_params() -> dict:
    if os.path.isfile(MODEL_PATH):
        with open(MODEL_PATH) as f:
            return json.load(f)
    return {}


def _save_params(params: dict) -> None:
    with open(MODEL_PATH, "w") as f:
        json.dump(params, f, indent=2)


def get_mastery_params(node_id: str) -> tuple[float, float]:
    params = _load_params()
    if node_id in params:
        a, b = params[node_id]["alpha"], params[node_id]["beta"]
        # Old defaults (72% or 50%) = no real attempts; treat as unattempted so first wrong doesn't jump up
        if (abs(a - 7.2) < 0.01 and abs(b - 2.8) < 0.01) or (a == 1 and b == 1):
            return (PRIOR_ALPHA_NEW, max(0.5, PRIOR_BETA_NEW))
        return a, b
    return (PRIOR_ALPHA_NEW, max(0.5, PRIOR_BETA_NEW))


def mastery_probability(alpha: float, beta: float) -> float:
    if alpha + beta <= 0:
        return 0.5
    return alpha / (alpha + beta)


def update(
    node_id: str,
    success: bool,
    question_difficulty: float,
    prior_alpha: Optional[float] = None,
    prior_beta: Optional[float] = None,
) -> tuple[float, float, float]:
    if prior_alpha is not None and prior_beta is not None:
        alpha_old, beta_old = prior_alpha, prior_beta
    else:
        alpha_old, beta_old = get_mastery_params(node_id)
    mastery_old = mastery_probability(alpha_old, beta_old)

    alpha, beta = alpha_old, beta_old
    w_success = (1.0 - P_GUESS * (1.0 - question_difficulty)) * SUCCESS_WEIGHT
    if success and MID_RANGE_MASTERY_MIN <= mastery_old <= MID_RANGE_MASTERY_MAX:
        w_success *= MID_RANGE_BOOST
    w_failure = 1.0 - P_SLIP * question_difficulty
    if success:
        alpha += w_success
    else:
        beta += w_failure

    mastery_new = mastery_probability(alpha, beta)
    delta       = mastery_new - mastery_old
    print(
        f"[BAYESIAN] node={node_id!r:30s}  "
        f"success={str(success):5s}  diff={question_difficulty:.2f}  "
        f"α={alpha_old:.2f}→{alpha:.2f}  β={beta_old:.2f}→{beta:.2f}  "
        f"P(mastery): {mastery_old:.3f} → {mastery_new:.3f}  Δ={delta:+.3f}"
    )

    params = _load_params()
    params[node_id] = {"alpha": alpha, "beta": beta}
    _save_params(params)
    # Async MongoDB write (fire-and-forget, don't block the sync route)
    try:
        import asyncio  # noqa: PLC0415
        from services.mongodb_service import save_mastery  # noqa: PLC0415
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(save_mastery(node_id, alpha, beta))
        else:
            loop.run_until_complete(save_mastery(node_id, alpha, beta))
    except Exception:
        pass  # Never block the response
    return alpha, beta, mastery_probability(alpha, beta)
