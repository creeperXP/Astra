export interface GenerateNodeContentRequest {
  node_id: string;
  user_goal: 'Make quiz' | 'Generate diagram' | 'Generate 3D game' | 'Add node from PDF';
  context?: {
    syllabus?: string;
    gradeDistribution?: Record<string, number>;
    rmpMetadata?: { clarity?: number; difficulty?: number };
    subgraphNodeIds?: string[];
    mlFeatureWeights?: Record<string, number>;
    mastery?: number;
  };
}

export interface GenerateNodeContentResponse {
  type: 'quiz' | 'diagram' | '3d_game' | 'concepts';
  payload: unknown;
}

export interface PredictMasteryRequest {
  node_id: string;
  feature_vector: number[];
}

export interface PredictMasteryResponse {
  mastery_probability: number;
  institutional_prior: number;
}

export interface BayesianUpdateRequest {
  node_id: string;
  success: boolean;
  question_difficulty: number; // 0–1, used for slip/guess weighting
}

export interface BayesianUpdateResponse {
  alpha: number;
  beta: number;
  mastery_probability: number;
}
