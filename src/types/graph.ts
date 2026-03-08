export type NodeId = string;
export type EdgeId = string;

export type NodeType = 'course' | 'concept';

export interface GraphNode {
  id: NodeId;
  name: string;
  type: NodeType;
  /** course_<code> e.g. course_cs3345 */
  courseId?: string;
  /** For concepts: concept_<courseCode>_<slug> e.g. concept_cs3345_introduction */
  x?: number;
  y?: number;
  z?: number;
  /** 0–1 mastery probability */
  mastery?: number;
  /** Institutional (UTD) average success */
  institutionalSuccess?: number;
  /** Estimated from description only (no syllabus) */
  isEstimatedConcept?: boolean;
  /** Course metadata when type === 'course' */
  dfwRate?: number;
  gradeDistribution?: Record<string, number>;
  nebulaData?: unknown;
  redditSummary?: string;
  professorProfile?: unknown;
  professor?: string;
  syllabusWeights?: unknown;
  syllabusOverview?: string;
  description?: string;
  /** For centripetal force: parent course position when in Level 2 */
  parentPosition?: { x: number; y: number; z: number };
}

export interface GraphEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  /** Hard = prereq/dependency; soft = semantic similarity */
  type: 'hard' | 'soft';
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}
