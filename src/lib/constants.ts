/**
 * LOCKED: Embedding dimension is 1024 on day 1.
 * NV-Embed-v2 (4096) is projected to 1024 via PCA/MRL before storage.
 * Never store raw 4096-dim vectors in MongoDB.
 */
export const EMBED_DIM = 1024;

export const ID_PREFIX = {
  COURSE: 'course_',
  CONCEPT: 'concept_',
} as const;

export const MAX_DEPTH_RECURSIVE = 3;

export const MASTERY_TONE_ANCHORS = {
  URGENT: { min: 0, max: 0.5, label: 'Urgent/Supportive' },
  CONSTRUCTIVE: { min: 0.5, max: 0.85, label: 'Constructive' },
  EXPERT: { min: 0.85, max: 1, label: 'Expert/Challenging' },
} as const;

export const NEBULA_PRIOR_SUCCESS = 0.72;
