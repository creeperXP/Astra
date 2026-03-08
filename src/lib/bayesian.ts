/**
 * Beta-Binomial mastery with slip/guess weighting.
 * α_new = α_old + (1 - P_guess) * success
 * β_new = β_old + (1 - P_slip) * failure
 */

const P_GUESS = 0.25;
const P_SLIP = 0.2;
const SUCCESS_WEIGHT = 1.2;
const MID_RANGE_MASTERY_MIN = 0.45;
const MID_RANGE_MASTERY_MAX = 0.88;
const MID_RANGE_BOOST = 1.9;

export function masteryFromBeta(alpha: number, beta: number): number {
  if (alpha + beta <= 0) return 0.5;
  return alpha / (alpha + beta);
}

export function updateBeta(
  alpha: number,
  beta: number,
  success: boolean,
  difficulty: number
): { alpha: number; beta: number } {
  let wSuccess = (1 - P_GUESS * (1 - difficulty)) * SUCCESS_WEIGHT;
  if (success) {
    const total = alpha + beta;
    const mastery = total > 0 ? alpha / total : 0.5;
    if (mastery >= MID_RANGE_MASTERY_MIN && mastery <= MID_RANGE_MASTERY_MAX) wSuccess *= MID_RANGE_BOOST;
  }
  const wFailure = 1 - P_SLIP * difficulty;
  if (success) {
    return { alpha: alpha + wSuccess, beta };
  }
  return { alpha, beta: beta + wFailure };
}

export function initialBetaFromPrior(priorSuccess: number): { alpha: number; beta: number } {
  // Softer prior (total 4) so 2–3 correct gets to ~30% (matches backend PRIOR_BETA_NEW)
  const total = 4;
  const alpha = priorSuccess * total;
  const beta = total - alpha;
  return { alpha: Math.max(0.5, alpha), beta: Math.max(0.5, beta) };
}
