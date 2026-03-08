import type { GraphData, GraphNode, GraphEdge } from '../types/graph';
import { ID_PREFIX } from '../lib/constants';
import { getStaticCourseData } from '../lib/staticCourseData';

interface DemoCourse {
  id: string;
  name: string;
  code: string;
  description?: string;
  dfwRate?: number;
  institutionalSuccess?: number;
  prereqs?: string[];
  gradeDistribution?: Record<string, number>;
}

interface DemoConcept {
  id: string;
  name: string;
  deps: string[];
}

interface DemoData {
  courses: DemoCourse[];
  concepts: Record<string, DemoConcept[]>;
}

const FALLBACK_DATA: DemoData = {
  courses: [
    {
      id: "course_cs3345",
      name: "CS 3345 - Data Structures",
      code: "cs3345",
      description: "Data structures and algorithms: lists, trees, graphs, sorting, hashing.",
      dfwRate: 0.18,
      institutionalSuccess: 0.82,
      prereqs: []
    },
    {
      id: "course_cs3341",
      name: "CS 3341 - Probability and Statistics",
      code: "cs3341",
      description: "Probability, random variables, distributions, estimation, hypothesis testing.",
      dfwRate: 0.22,
      institutionalSuccess: 0.78,
      prereqs: ["course_cs2336"]
    },
    {
      id: "course_cs2336",
      name: "CS 2336 - Computer Science II",
      code: "cs2336",
      description: "Object-oriented design, recursion, basic data structures.",
      dfwRate: 0.15,
      institutionalSuccess: 0.85,
      prereqs: ["course_cs1337"]
    },
    {
      id: "course_cs1337",
      name: "CS 1337 - Computer Science I",
      code: "cs1337",
      description: "Intro to programming, variables, control flow, arrays.",
      dfwRate: 0.12,
      institutionalSuccess: 0.88,
      prereqs: []
    }
  ],
  concepts: {
    "course_cs3345": [
      { id: "concept_cs3345_introduction", name: "Introduction to Data Structures", deps: [] },
      { id: "concept_cs3345_linked_lists", name: "Linked Lists", deps: ["concept_cs3345_introduction"] },
      { id: "concept_cs3345_trees", name: "Trees and BST", deps: ["concept_cs3345_linked_lists"] },
      { id: "concept_cs3345_graphs", name: "Graphs", deps: ["concept_cs3345_trees"] },
      { id: "concept_cs3345_sorting", name: "Sorting Algorithms", deps: ["concept_cs3345_introduction"] }
    ],
    "course_cs3341": [
      { id: "concept_cs3341_probability", name: "Probability Basics", deps: [] },
      { id: "concept_cs3341_random_variables", name: "Random Variables", deps: ["concept_cs3341_probability"] },
      { id: "concept_cs3341_estimation", name: "Estimation", deps: ["concept_cs3341_random_variables"] }
    ]
  }
};

export async function loadLevel1Graph(): Promise<GraphData> {
  let data: DemoData;
  try {
    const res = await fetch('/demo_data.json');
    if (!res.ok) throw new Error('Fetch failed');
    data = await res.json();
  } catch (err) {
    console.warn('Failed to load demo_data.json, using fallback data', err);
    data = FALLBACK_DATA;
  }
  // Ensure demo data is available globally for loadLevel2Graph
  (window as unknown as { __demoData?: DemoData }).__demoData = data;
  
  // Create central "Quest" node
  const questNodeId = 'quest_root';
  const nodes: GraphNode[] = [
    {
      id: questNodeId,
      name: 'Quest',
      type: 'course',
      courseId: 'QUEST',
    }
  ];
  
  const links: GraphEdge[] = [];

  data.courses.forEach((c) => {
    const nodeId = c.id.startsWith(ID_PREFIX.COURSE) ? c.id : `${ID_PREFIX.COURSE}${c.code}`;
    const staticData = getStaticCourseData(nodeId);
    nodes.push({
      id: nodeId,
      name: c.name,
      type: 'course',
      courseId: c.code,
      dfwRate: c.dfwRate,
      institutionalSuccess: c.institutionalSuccess ?? 0.72,
      gradeDistribution: c.gradeDistribution,
      description: c.description,
      // Inject static professor + grade data so the Info tab loads instantly
      professor:        staticData?.professor,
      professorProfile: staticData?.professorProfile,
      nebulaData:       staticData?.nebulaData,
      redditSummary:    staticData?.redditSummary,
      syllabusWeights:  staticData?.syllabusWeights,
      syllabusOverview: staticData?.syllabusOverview,
    } as GraphNode & { syllabusWeights?: unknown; syllabusOverview?: string });
    
    // Connect to Quest if it has no prerequisites
    if (!c.prereqs || c.prereqs.length === 0) {
      links.push({
        id: `${questNodeId}->${nodeId}`,
        source: questNodeId,
        target: nodeId,
        type: 'hard',
      });
    }
  });

  for (const c of data.courses) {
    const sourceId = c.id.startsWith(ID_PREFIX.COURSE) ? c.id : `${ID_PREFIX.COURSE}${c.code}`;
    for (const pre of c.prereqs ?? []) {
      const targetId = pre.startsWith(ID_PREFIX.COURSE) ? pre : `${ID_PREFIX.COURSE}${pre}`;
      links.push({
        id: `${targetId}->${sourceId}`, // Reverse arrow to match dependency flow (prereq -> course)
        source: targetId,
        target: sourceId,
        type: 'hard',
      });
    }
  }
  return { nodes, links };
}

export function loadLevel2Graph(
  courseNode: GraphNode,
  parentPosition: { x: number; y: number; z: number }
): GraphData {
  const res = (window as unknown as { __demoData?: DemoData }).__demoData;
  let concepts: DemoConcept[] = [];
  if (res?.concepts) {
    const key = courseNode.id.replace(ID_PREFIX.COURSE, '');
    concepts = res.concepts[courseNode.id] ?? res.concepts[key] ?? [];
  }
  if (!concepts.length) {
    const introId = `concept_${courseNode.courseId}_intro`;
    concepts = [
      { id: introId, name: 'Introduction', deps: [] },
      { id: `concept_${courseNode.courseId}_core`, name: 'Core Topics', deps: [introId] },
    ];
  }
  const nodes: GraphNode[] = concepts.map((c) => ({
    id: c.id,
    name: c.name,
    type: 'concept',
    courseId: courseNode.courseId,
    parentPosition: { ...parentPosition },
    isEstimatedConcept: false,
  }));
  const links: GraphEdge[] = [];
  for (const c of concepts) {
    for (const depId of c.deps) {
      if (nodes.some((n) => n.id === depId)) {
        links.push({ id: `${c.id}->${depId}`, source: c.id, target: depId, type: 'hard' });
      }
    }
  }
  return { nodes, links };
}

export async function loadDemoData(): Promise<DemoData> {
  let data: DemoData;
  try {
    const res = await fetch('/demo_data.json');
    if (!res.ok) throw new Error('Fetch failed');
    data = await res.json();
  } catch (err) {
    console.warn('Failed to load demo_data.json, using fallback data', err);
    data = FALLBACK_DATA;
  }
  (window as unknown as { __demoData?: DemoData }).__demoData = data;
  return data;
}
