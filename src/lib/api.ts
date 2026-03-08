const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function generateNodeContent(
  nodeId: string,
  goal: 'Make quiz' | 'Generate diagram' | 'Generate 3D game' | 'Add node from PDF',
  context?: Record<string, unknown>
) {
  const res = await fetch(`${API_BASE}/generate-node-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, user_goal: goal, context }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function predictMastery(nodeId: string, featureVector: number[]) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, feature_vector: featureVector }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchMasteryFeedback(opts: {
  nodeId: string; nodeName: string; success: boolean;
  prevMastery: number; newMastery: number;
  connectedTopics?: string[]; questionText?: string;
}): Promise<{ recommendations: string; mastery_delta: number; mastery_pct: number }> {
  const res = await fetch(`${API_BASE}/mastery-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id:          opts.nodeId,
      node_name:        opts.nodeName,
      success:          opts.success,
      prev_mastery:     opts.prevMastery,
      new_mastery:      opts.newMastery,
      connected_topics: opts.connectedTopics ?? [],
      question_text:    opts.questionText ?? '',
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function bayesianUpdate(
  nodeId: string,
  success: boolean,
  questionDifficulty: number,
  currentAlpha?: number,
  currentBeta?: number
) {
  const body: Record<string, unknown> = {
    node_id: nodeId,
    success,
    question_difficulty: questionDifficulty,
  };
  if (currentAlpha != null && currentBeta != null) {
    body.current_alpha = currentAlpha;
    body.current_beta = currentBeta;
  }
  const res = await fetch(`${API_BASE}/bayesian-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function extractConcepts(
  courseCode: string,
  opts: { syllabusText?: string; courseDescription?: string }
) {
  const res = await fetch(`${API_BASE}/extract-concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course_code: courseCode,
      syllabus_text: opts.syllabusText,
      course_description: opts.courseDescription,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    concepts: { id: string; name: string; deps: string[]; is_estimated: boolean }[];
    source: string;
  }>;
}

export async function computeSoftEdges(
  nodeIds: string[],
  texts: string[],
  threshold = 0.82
) {
  const res = await fetch(`${API_BASE}/soft-edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_ids: nodeIds, texts, threshold }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    edges: { source: string; target: string; similarity: number; type: 'soft' }[];
  }>;
}

export async function parsePdf(file: File): Promise<{ text: string; char_count: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/parse-pdf`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchProfessorInfo(professorName: string, courseCode: string, courseName: string) {
  const res = await fetch(`${API_BASE}/professor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ professor_name: professorName, course_code: courseCode, course_name: courseName }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    professor: string; course: string; rating: number; difficulty: number;
    clarity: number; helpfulness: number; would_take_again: number;
    tags: string[]; summary: string; grade_distribution: Record<string, number>;
    source: string;
  }>;
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function persistMastery(nodeId: string, alpha: number, beta: number) {
  await fetch(`${API_BASE}/persist/mastery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, alpha, beta }),
  }).catch(() => {});
}

export async function persistCourse(course: Record<string, unknown>) {
  await fetch(`${API_BASE}/persist/course`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(course),
  }).catch(() => {});
}

export async function deleteCourseFromSnapshot(courseId: string) {
  await fetch(`${API_BASE}/persist/course/${encodeURIComponent(courseId)}`, { method: 'DELETE' }).catch(() => {});
}

export async function persistFolder(folder: Record<string, unknown>) {
  await fetch(`${API_BASE}/persist/folder`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folder),
  }).catch(() => {});
}

export async function deleteFolderApi(folderId: string) {
  await fetch(`${API_BASE}/persist/folder/${folderId}`, { method: 'DELETE' }).catch(() => {});
}

export async function persistPersonalSkill(skill: Record<string, unknown>) {
  await fetch(`${API_BASE}/persist/personal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  }).catch(() => {});
}

export async function loadSnapshot(): Promise<{
  mastery: Record<string, { alpha: number; beta: number }>;
  courses: unknown[];
  personal: unknown[];
  folders: unknown[];
}> {
  const res = await fetch(`${API_BASE}/persist/snapshot`);
  if (!res.ok) return { mastery: {}, courses: [], personal: [], folders: [] };
  return res.json();
}

export async function generatePersonalSkill(
  skillName: string,
  description: string,
  links: string[]
) {
  const res = await fetch(`${API_BASE}/personal/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill_name: skillName, description, links }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    skill_id: string; name: string; emoji: string; description: string;
    nodes: unknown[]; links: unknown[];
  }>;
}

// ── Node content ─────────────────────────────────────────────────────────────

export interface QuizAttempt {
  question:      string;
  correct:       boolean;
  timestamp:     string;
  mastery_before: number;
  mastery_after:  number;
  difficulty:    number;
}

export interface NodeContentData {
  node_id?: string;
  notes?: string;
  quiz_cache?: unknown[];
  quiz_history?: QuizAttempt[];
  diagram_cache?: Record<string, unknown>;
  three_js_params?: Record<string, unknown>;
  files?: Array<{ name: string; content: string; type: string; url: string }>;
  xp?: number;
  achievements?: string[];
}

export async function getNodeContent(nodeId: string): Promise<NodeContentData> {
  const res = await fetch(`${API_BASE}/node-content/${encodeURIComponent(nodeId)}`);
  if (!res.ok) return { node_id: nodeId };
  return res.json();
}

export async function saveNodeContent(nodeId: string, data: NodeContentData) {
  await fetch(`${API_BASE}/node-content/${encodeURIComponent(nodeId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {});
}

// ── UTD Nebula API grade distribution ────────────────────────────────────────

export interface NebulaGradeData {
  source: 'nebula_api' | 'mock';
  course_code: string;
  total_students: number;
  semesters: number;
  letter_distribution: Record<string, number>;
  detailed_distribution: Record<string, { count: number; pct: number }>;
  grade_order: string[];
  dfw_rate: number;
  semester_data: Array<{ semester: string; total: number; distribution: Record<string, number> }>;
}

export async function fetchNebulaGrades(
  courseCode: string,
  professorLastName = ''
): Promise<NebulaGradeData> {
  const res = await fetch(`${API_BASE}/nebula-grades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_code: courseCode, professor_last_name: professorLastName }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Reddit course info ────────────────────────────────────────────────────────

export interface RedditCourseData {
  source: 'reddit' | 'mock';
  course_code: string;
  posts: Array<{ title: string; url: string; score: number }>;
  summary: string;
  total_found: number;
}

export async function fetchRedditCourseInfo(
  courseCode: string,
  courseName = ''
): Promise<RedditCourseData> {
  const res = await fetch(`${API_BASE}/reddit-course-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_code: courseCode, course_name: courseName }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchProfessorProfile(opts: {
  professorName: string;
  courseCode?: string;
  courseName?: string;
}): Promise<{
  name: string; course_code: string;
  teaching_style: string; exam_style: string; vibe: string;
  difficulty: number; clarity: number; workload: number;
  tags: string[]; tips: string;
  prior_alpha: number; prior_beta: number; source: string;
}> {
  const res = await fetch(`${API_BASE}/professor-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      professor_name: opts.professorName,
      course_code:    opts.courseCode ?? '',
      course_name:    opts.courseName ?? '',
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface ResourceItem {
  type: string;
  format: 'short' | 'long' | 'practice';
  title: string;
  url: string;
  duration: string;
  reason: string;
}

export async function fetchResourceRecommendations(opts: {
  nodeName: string;
  nodeDescription?: string;
  courseName?: string;
  mastery: number;
  weakAreas?: string[];
}): Promise<{
  resources: ResourceItem[];
  short_resources: ResourceItem[];
  long_resources: ResourceItem[];
  practice_resources: ResourceItem[];
  practice_suggestions: string[];
  adaptive_quiz_focus: string;
  estimated_hours: number;
  learning_path: string;
}> {
  const res = await fetch(`${API_BASE}/resource-recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_name:        opts.nodeName,
      node_description: opts.nodeDescription ?? '',
      course_name:      opts.courseName ?? '',
      mastery:          opts.mastery,
      weak_areas:       opts.weakAreas ?? [],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchCoursePrereqs(opts: {
  newCourseCode: string;
  newCourseName: string;
  existingCourses: Array<{ id: string; code: string; name: string }>;
}): Promise<{ prereq_ids: string[]; reasoning: string; source: string }> {
  const res = await fetch(`${API_BASE}/course-prereqs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      new_course_code:  opts.newCourseCode,
      new_course_name:  opts.newCourseName,
      existing_courses: opts.existingCourses,
    }),
  });
  if (!res.ok) return { prereq_ids: [], reasoning: '', source: 'error' };
  return res.json();
}

export async function explainRipple(opts: {
  answeredNode: string;
  courseName?: string;
  masteryBefore: number;
  masteryAfter: number;
  connectedNodes: Array<{ id: string; name: string; mastery: number }>;
  prereqGaps: string[];
}): Promise<{
  ripple_headline: string;
  ripple_explanation: string;
  prereq_gap_message: string;
  next_action: string;
  encouragement: string;
}> {
  const res = await fetch(`${API_BASE}/explain-ripple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answered_node:   opts.answeredNode,
      course_name:     opts.courseName ?? '',
      mastery_before:  opts.masteryBefore,
      mastery_after:   opts.masteryAfter,
      connected_nodes: opts.connectedNodes,
      prereq_gaps:     opts.prereqGaps,
    }),
  });
  if (!res.ok) return {
    ripple_headline: `${opts.answeredNode} mastery updated!`,
    ripple_explanation: 'Your progress rippled through connected concepts.',
    prereq_gap_message: '',
    next_action: 'Keep practising!',
    encouragement: 'Great work!',
  };
  return res.json();
}

// ── Gemini prerequisite gap analyser ─────────────────────────────────────────

export async function fetchPrerequisites(opts: {
  conceptName: string;
  mastery: number;
  consecutiveFails: number;
  courseCode?: string;
  courseDescription?: string;
}): Promise<{
  prereqs: Array<{ name: string; description: string }>;
  explanation: string;
  encouragement: string;
}> {
  const res = await fetch(`${API_BASE}/prerequisites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      concept_name:      opts.conceptName,
      mastery:           opts.mastery,
      consecutive_fails: opts.consecutiveFails,
      course_code:       opts.courseCode,
      course_description: opts.courseDescription,
    }),
  });
  if (!res.ok) return {
    prereqs: [
      { name: `${opts.conceptName} Fundamentals`, description: 'Core building blocks' },
      { name: `Introduction to ${opts.conceptName.split(' ')[0]}`, description: 'Entry-level overview' },
    ],
    explanation: `You've missed ${opts.consecutiveFails} questions on "${opts.conceptName}". These prerequisites have been added to your graph.`,
    encouragement: 'Build from the bottom up — you got this!',
  };
  return res.json();
}

// ── Nemotron Nano (NVIDIA) visual explanation ─────────────────────────────────

export async function callNemotron(opts: {
  prompt: string;
  context?: string;
}): Promise<{
  success: boolean;
  data: {
    explanation: string;
    key_points: string[];
    visualization_description: string;
    analogy: string;
    common_mistakes: string[];
  };
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/nemotron`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: opts.prompt, context: opts.context }),
  });
  if (!res.ok) return {
    success: false,
    error: await res.text(),
    data: { explanation: 'Could not reach Nemotron.', key_points: [], visualization_description: '', analogy: '', common_mistakes: [] },
  };
  return res.json();
}

/** Professional: get learning flow steps from Nemotron (divided topics). */
export async function fetchNemotronFlowchart(opts: {
  topics: string[];
  prompt?: string;
}): Promise<{ success: boolean; steps: Array<{ id: string; label: string; description: string }>; error?: string }> {
  const res = await fetch(`${API_BASE}/nemotron/flowchart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topics: opts.topics, prompt: opts.prompt || undefined }),
  });
  if (!res.ok) return { success: false, steps: [], error: await res.text() };
  const data = await res.json();
  return { success: data.success !== false, steps: data.steps ?? [], error: data.error };
}

export interface StepSource {
  title: string;
  type: 'youtube' | 'article';
  url?: string;
  timestamp?: string;
}

export interface StepDetailData {
  explanation: string;
  key_points: string[];
  practice_scenario?: string;
  visualization_description: string;
  analogy: string;
  sources: StepSource[];
}

/** Professional: get recommendations, sources (with timestamps), and visuals for one step. */
export async function fetchStepDetails(opts: {
  topic: string;
  description?: string;
  project_context?: string;
}): Promise<{ success: boolean; data: StepDetailData }> {
  const res = await fetch(`${API_BASE}/nemotron/step-details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: opts.topic,
      description: opts.description ?? '',
      project_context: opts.project_context ?? '',
    }),
  });
  if (!res.ok) return { success: false, data: { explanation: '', key_points: [], practice_scenario: '', visualization_description: '', analogy: '', sources: [] } };
  const json = await res.json();
  const data = json.data ?? {};
  return {
    success: json.success !== false,
    data: {
      explanation: data.explanation ?? '',
      key_points: Array.isArray(data.key_points) ? data.key_points : [],
      practice_scenario: data.practice_scenario ?? '',
      visualization_description: data.visualization_description ?? '',
      analogy: data.analogy ?? '',
      sources: Array.isArray(data.sources) ? data.sources : [],
    },
  };
}

/** Professional: get prerequisite or follow-up steps from a per-card prompt. */
export async function fetchBranches(opts: {
  step_id: string;
  step_label: string;
  prompt: string;
  branch_type: 'prerequisites' | 'follow_up';
}): Promise<{ success: boolean; steps: Array<{ id: string; label: string; description: string }> }> {
  const res = await fetch(`${API_BASE}/nemotron/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) return { success: false, steps: [] };
  const json = await res.json();
  return { success: json.success !== false, steps: json.steps ?? [] };
}

/** Professional: ask a general question about the entire learning path. */
export async function fetchPathQuestion(opts: {
  path_summary: string;
  question: string;
  project_context?: string;
}): Promise<{ success: boolean; answer: string }> {
  const res = await fetch(`${API_BASE}/nemotron/path-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path_summary: opts.path_summary,
      question: opts.question,
      project_context: opts.project_context ?? '',
    }),
  });
  if (!res.ok) return { success: false, answer: '' };
  const json = await res.json();
  return { success: json.success !== false, answer: json.answer ?? '' };
}

/** Professional: get clarification only (no new steps added to path). */
export async function fetchClarify(opts: {
  step_id: string;
  step_label: string;
  prompt: string;
}): Promise<{ success: boolean; clarification: string }> {
  const res = await fetch(`${API_BASE}/nemotron/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) return { success: false, clarification: '' };
  const json = await res.json();
  return { success: json.success !== false, clarification: json.clarification ?? '' };
}

/** Professional: ask a question; returns clarification and optionally suggested steps (user confirms before adding). */
export async function fetchAsk(opts: {
  step_id: string;
  step_label: string;
  prompt: string;
}): Promise<{
  success: boolean;
  clarification: string;
  suggested_steps: Array<{ id: string; label: string; description: string }> | null;
  suggested_type: 'prerequisites' | 'follow_up' | null;
}> {
  const res = await fetch(`${API_BASE}/nemotron/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    return { success: false, clarification: '', suggested_steps: null, suggested_type: null };
  }
  const json = await res.json();
  return {
    success: json.success !== false,
    clarification: json.clarification ?? '',
    suggested_steps: json.suggested_steps ?? null,
    suggested_type: json.suggested_type ?? null,
  };
}

export async function fetchNebulaCourses(): Promise<{ courses: unknown[] }> {
  const key = import.meta.env.VITE_NEBULA_API_KEY;
  if (!key) {
    const r = await fetch('/demo_data.json');
    const data = await r.json();
    return { courses: data.courses };
  }
  const res = await fetch(`${API_BASE}/nebula/courses`, {
    headers: { 'X-Nebula-Key': key },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
