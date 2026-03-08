export type ExperienceLevel = 1 | 2 | 3 | 4 | 5;

export interface OnboardingProfile {
  major: string;
  minor?: string;
  experienceBySubject: Record<string, ExperienceLevel>;
  gpaGoal: number;
  careerGoals: string;
}

export interface UserFeatureVector {
  priorGpa: number;
  selfReportedExperience: number;
  courseDifficulty: number;
  dwfRate: number;
  prereqMasteryAvg: number;
}

/** Weighted prior: (GPA × 0.6) + (Experience_Level × 0.4) normalized to 0–1 */
export function adjustedPrior(gpa: number, experienceLevel: number): number {
  const normalizedGpa = Math.min(4, Math.max(0, gpa)) / 4;
  const normalizedExp = Math.min(5, Math.max(1, experienceLevel)) / 5;
  return normalizedGpa * 0.6 + normalizedExp * 0.4;
}
