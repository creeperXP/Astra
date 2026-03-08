import { create } from 'zustand';
import type { GraphNode, GraphData } from '../types/graph';
import type { OnboardingProfile } from '../types/user';
import type { PersonalSkill } from '../types/personal';
import { NEBULA_PRIOR_SUCCESS } from '../lib/constants';

export interface BreadcrumbItem {
  id: string;
  name: string;
  type: 'galaxy' | 'course' | 'concept';
}

export type AppMode = null | 'student' | 'professional';

interface NebulaState {
  // Landing / app mode (null = show landing with Student | Professional login)
  appMode: AppMode;
  setAppMode: (m: AppMode) => void;

  // Onboarding & user
  onboardingComplete: boolean;
  profile: OnboardingProfile | null;
  setOnboardingComplete: (v: boolean) => void;
  setProfile: (p: OnboardingProfile | null) => void;

  // Level 1 graph
  level1Data: GraphData | null;
  level1Positions: Record<string, { x: number; y: number; z: number }> | null;
  setLevel1Data: (d: GraphData | null) => void;
  setLevel1Positions: (p: Record<string, { x: number; y: number; z: number }> | null) => void;

  // Level 2 (concept subgraph for one course)
  level2Data: GraphData | null;
  level2CourseId: string | null;
  setLevel2Data: (d: GraphData | null, courseId: string | null) => void;

  // Current view  (1=galaxy, 2=course concepts, 3=personal skill)
  viewLevel: 1 | 2 | 3;
  setViewLevel: (level: 1 | 2 | 3) => void;

  // Node detail panel (right-side drawer)
  nodeDetailOpen: boolean;
  setNodeDetailOpen: (open: boolean) => void;

  // Mastery pulse — triggers light propagation in the graph after a correct quiz answer
  masteryPulse: { sourceId: string; connectedIds: string[]; masteryDelta: number } | null;
  setMasteryPulse: (p: { sourceId: string; connectedIds: string[]; masteryDelta: number } | null) => void;
  // Nodes that got mastery only from ripple (propagation) — show as fainter yellow
  rippleBoostedNodeIds: Record<string, true>;
  addRippleBoostedNodeIds: (ids: string[]) => void;
  clearRippleBoostedNodeId: (id: string) => void;

  // Node content: user notes + XP per node
  nodeNotes: Record<string, string>;
  setNodeNotes: (nodeId: string, text: string) => void;
  nodeXP: Record<string, number>;
  addNodeXP: (nodeId: string, xp: number) => void;

  // Selected node & panel
  selectedNode: GraphNode | null;
  selectedNodePosition: { x: number; y: number; z: number } | null;
  setSelectedNode: (n: GraphNode | null) => void;
  setSelectedNodePosition: (p: { x: number; y: number; z: number } | null) => void;
  nodePanelOpen: boolean;
  setNodePanelOpen: (open: boolean) => void;

  // Mastery state: nodeId -> { alpha, beta }
  masteryParams: Record<string, { alpha: number; beta: number }>;
  setMasteryParams: (nodeId: string, alpha: number, beta: number) => void;
  getMastery: (nodeId: string) => number;
  /** Used by Bayesian ripple: get (alpha, beta) for a node (from pending or saved, or prior for 0). */
  getMasteryParams: (nodeId: string) => { alpha: number; beta: number };

  // Breadcrumbs
  breadcrumbs: BreadcrumbItem[];
  setBreadcrumbs: (b: BreadcrumbItem[]) => void;

  // Batched mastery update (trigger ripple on panel close)
  pendingMasteryUpdates: Record<string, { alpha: number; beta: number }>;
  queueMasteryUpdate: (nodeId: string, alpha: number, beta: number) => void;
  flushMasteryUpdates: () => void;

  // Sidebar tab
  sidebarTab: 'classes' | 'personal';
  setSidebarTab: (tab: 'classes' | 'personal') => void;

  // Folders (can hold courses, tagged with semester)
  folders: Array<{ id: string; name: string; semester: string; courseIds: string[] }>;
  addFolder: (name: string, semester: string) => void;
  renameFolder: (id: string, name: string, semester: string) => void;
  deleteFolder: (id: string) => void;
  addCourseToFolder: (folderId: string, courseId: string) => void;
  removeCourseFromFolder: (folderId: string, courseId: string) => void;

  // Personal skills (hobby / freeform)
  personalSkills: PersonalSkill[];
  addPersonalSkill: (skill: PersonalSkill) => void;
  removePersonalSkill: (skillId: string) => void;
  selectedPersonalSkill: PersonalSkill | null;
  setSelectedPersonalSkill: (skill: PersonalSkill | null) => void;

  // Left sidebar: legacy user-created classes and topics (folder → topics)
  userClasses: Array<{ id: string; name: string; topicIds: string[]; semester?: string }>;
  userTopics: Record<string, { id: string; name: string }>;
  addUserClass: (name: string) => void;
  addUserTopic: (classId: string, name: string) => void;
  removeUserClass: (id: string) => void;
  removeUserTopic: (classId: string, topicId: string) => void;

  // Remove a course node (and its links) from the galaxy graph
  removeCourseFromGraph: (courseId: string) => void;

  // Add a fully-built course (with concepts) directly to the galaxy graph
  addCourseToGraph: (course: {
    id: string;
    name: string;
    code: string;
    description?: string;
    dfwRate?: number;
    institutionalSuccess?: number;
    professor?: string;
    gradeDistribution?: Record<string, number>;
    nebulaData?: unknown;
    redditSummary?: string;
    professorProfile?: unknown;
    prereqCourseIds?: string[];
  }, concepts: Array<{ id: string; name: string; deps: string[]; is_estimated?: boolean }>) => void;
}

function defaultMastery(): number {
  return 0;
}

export const useStore = create<NebulaState>((set, get) => ({
  appMode: null,
  setAppMode: (m) => set({ appMode: m }),

  onboardingComplete: true,
  profile: null,
  setOnboardingComplete: (v) => set({ onboardingComplete: v }),
  setProfile: (p) => set({ profile: p }),

  level1Data: null,
  level1Positions: null,
  setLevel1Data: (d) => set({ level1Data: d }),
  setLevel1Positions: (p) => set({ level1Positions: p }),

  level2Data: null,
  level2CourseId: null,
  setLevel2Data: (d, courseId) => set({ level2Data: d, level2CourseId: courseId }),

  viewLevel: 1,
  // Reset nodeDetailOpen when changing views so the panel backdrop never covers a new graph
  setViewLevel: (level) => set({ viewLevel: level, nodeDetailOpen: false }),

  nodeDetailOpen: false,
  setNodeDetailOpen: (open) => set({ nodeDetailOpen: open }),

  masteryPulse: null,
  setMasteryPulse: (p) => set({ masteryPulse: p }),
  rippleBoostedNodeIds: {},
  addRippleBoostedNodeIds: (ids) =>
    set((s) => {
      const next = { ...s.rippleBoostedNodeIds };
      ids.forEach((id) => { next[id] = true; });
      return { rippleBoostedNodeIds: next };
    }),
  clearRippleBoostedNodeId: (id) =>
    set((s) => {
      if (!s.rippleBoostedNodeIds[id]) return {};
      const next = { ...s.rippleBoostedNodeIds };
      delete next[id];
      return { rippleBoostedNodeIds: next };
    }),

  nodeNotes: {},
  setNodeNotes: (nodeId, text) => set((s) => ({ nodeNotes: { ...s.nodeNotes, [nodeId]: text } })),
  nodeXP: {},
  addNodeXP: (nodeId, xp) => set((s) => ({ nodeXP: { ...s.nodeXP, [nodeId]: (s.nodeXP[nodeId] ?? 0) + xp } })),

  selectedNode: null,
  selectedNodePosition: null,
  setSelectedNode: (n) => set({ selectedNode: n }),
  setSelectedNodePosition: (p) => set({ selectedNodePosition: p }),
  nodePanelOpen: false,
  setNodePanelOpen: (open) => set({ nodePanelOpen: open }),

  masteryParams: {},
  setMasteryParams: (nodeId, alpha, beta) =>
    set((s) => ({
      masteryParams: { ...s.masteryParams, [nodeId]: { alpha, beta } },
    })),
  getMastery: (nodeId) => {
    const params = get().getMasteryParams(nodeId);
    // Backend used to init new concepts with (1,1) = 50%; treat that as "no attempts" = 0%
    if (params.alpha === 1 && params.beta === 1) return 0;
    if (params.alpha + params.beta <= 0) return defaultMastery();
    return params.alpha / (params.alpha + params.beta);
  },
  getMasteryParams: (nodeId) => {
    const state = get();
    const params = state.pendingMasteryUpdates[nodeId] ?? state.masteryParams[nodeId];
    if (params) return { alpha: params.alpha, beta: params.beta };
    return { alpha: 0, beta: 4 };
  },

  breadcrumbs: [{ id: 'galaxy', name: 'Galaxy', type: 'galaxy' }],
  setBreadcrumbs: (b) => set({ breadcrumbs: b }),

  pendingMasteryUpdates: {},
  queueMasteryUpdate: (nodeId, alpha, beta) =>
    set((s) => ({
      pendingMasteryUpdates: { ...s.pendingMasteryUpdates, [nodeId]: { alpha, beta } },
    })),
  flushMasteryUpdates: () => {
    const pending = get().pendingMasteryUpdates;
    set((s) => {
      const next = { ...s.masteryParams };
      for (const [id, p] of Object.entries(pending)) next[id] = p;
      return { masteryParams: next, pendingMasteryUpdates: {} };
    });
  },

  sidebarTab: 'classes',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  folders: [],
  addFolder: (name, semester) =>
    set((s) => {
      const id = `folder_${Date.now()}`;
      return { folders: [...s.folders, { id, name, semester, courseIds: [] }] };
    }),
  renameFolder: (id, name, semester) =>
    set((s) => ({ folders: s.folders.map((f) => f.id === id ? { ...f, name, semester } : f) })),
  deleteFolder: (id) =>
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) })),
  addCourseToFolder: (folderId, courseId) =>
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId && !f.courseIds.includes(courseId)
          ? { ...f, courseIds: [...f.courseIds, courseId] }
          : f
      ),
    })),
  removeCourseFromFolder: (folderId, courseId) =>
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId ? { ...f, courseIds: f.courseIds.filter((c) => c !== courseId) } : f
      ),
    })),

  personalSkills: [],
  addPersonalSkill: (skill) =>
    set((s) => {
      const exists = s.personalSkills.find((p) => p.skill_id === skill.skill_id);
      if (exists) return {};
      return { personalSkills: [...s.personalSkills, skill] };
    }),
  removePersonalSkill: (skillId) =>
    set((s) => ({ personalSkills: s.personalSkills.filter((p) => p.skill_id !== skillId) })),
  selectedPersonalSkill: null,
  setSelectedPersonalSkill: (skill) => set({ selectedPersonalSkill: skill }),

  userClasses: [],
  userTopics: {},
  addUserClass: (name) =>
    set((s) => {
      const id = `class_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        userClasses: [...s.userClasses, { id, name, topicIds: [] }],
      };
    }),
  addUserTopic: (classId, name) =>
    set((s) => {
      const topicId = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const userTopics = { ...s.userTopics, [topicId]: { id: topicId, name } };
      const userClasses = s.userClasses.map((c) =>
        c.id === classId ? { ...c, topicIds: [...c.topicIds, topicId] } : c
      );
      return { userTopics, userClasses };
    }),
  removeUserClass: (id) =>
    set((s) => {
      const removed = s.userClasses.find((c) => c.id === id);
      const topicIdsToRemove = new Set(removed?.topicIds ?? []);
      return {
        userClasses: s.userClasses.filter((c) => c.id !== id),
        userTopics: Object.fromEntries(
          Object.entries(s.userTopics).filter(([tid]) => !topicIdsToRemove.has(tid))
        ),
      };
    }),
  removeUserTopic: (classId, topicId) =>
    set((s) => ({
      userClasses: s.userClasses.map((c) =>
        c.id === classId ? { ...c, topicIds: c.topicIds.filter((t) => t !== topicId) } : c
      ),
      userTopics: Object.fromEntries(Object.entries(s.userTopics).filter(([id]) => id !== topicId)),
    })),

  removeCourseFromGraph: (courseId) => {
    set((s) => {
      if (!s.level1Data) return {};
      return {
        level1Data: {
          nodes: s.level1Data.nodes.filter((n) => n.id !== courseId),
          links: s.level1Data.links.filter(
            (l) => l.source !== courseId && l.target !== courseId &&
                   (l.source as any)?.id !== courseId && (l.target as any)?.id !== courseId
          ),
        },
      };
    });
  },

  addCourseToGraph: (course, concepts) => {
    set((s) => {
      const existing = s.level1Data;
      if (!existing) return {};

      // Avoid duplicate: same id or same course code
      const already = existing.nodes.some(
        (n) => n.type === 'course' && (n.id === course.id || (n as GraphNode & { courseId?: string }).courseId === course.code)
      );
      if (already) return {};

      // Build new course node
      const courseNode: GraphNode = {
        id: course.id,
        name: course.name,
        type: 'course',
        courseId: course.code,
        description: course.description,
        dfwRate: course.dfwRate,
        institutionalSuccess: course.institutionalSuccess ?? 0.72,
        gradeDistribution: course.gradeDistribution,
        nebulaData: course.nebulaData,
        redditSummary: course.redditSummary,
        professorProfile: course.professorProfile,
        professor: course.professor,
      };

      // Connect to quest_root if not already there.
      // ForceGraph3D mutates link.source/target from strings to node objects in-place,
      // so always normalise back to string IDs before passing new data to the graph.
      const normId = (v: unknown): string =>
        typeof v === 'string' ? v : ((v as { id?: string })?.id ?? String(v));

      const links = existing.links.map((l) => ({
        ...l,
        source: normId(l.source),
        target: normId(l.target),
      }));
      if (!existing.nodes.find((n) => n.id === course.id)) {
        links.push({ id: `quest_root->${course.id}`, source: 'quest_root', target: course.id, type: 'hard' });
      }

      // Add prereq edges (Gemini-detected cross-course connections)
      for (const prereqId of (course.prereqCourseIds ?? [])) {
        const edgeId = `${prereqId}->${course.id}`;
        if (!links.find((l) => l.id === edgeId)) {
          links.push({ id: edgeId, source: prereqId, target: course.id, type: 'soft' });
        }
      }

      const nodes = existing.nodes.filter((n) => n.id !== course.id);
      nodes.push(courseNode);

      // Store concepts in global __demoData so loadLevel2Graph can find them
      const demoData = (window as unknown as { __demoData?: { concepts?: Record<string, unknown[]> } }).__demoData;
      if (demoData) {
        if (!demoData.concepts) demoData.concepts = {};
        demoData.concepts[course.id] = concepts;
      }

      // ── Auto-persist course + all concepts to MongoDB ──────────────────────
      // Fire-and-forget: don't block the graph update
      import('../lib/api').then(({ persistCourse }) => {
        persistCourse({
          course_id:             course.id,
          name:                  course.name,
          code:                  course.code,
          professor:             (course as any).professor ?? '',
          description:           course.description ?? '',
          concepts:              concepts.map((c) => ({ id: c.id, name: c.name, deps: c.deps })),
          grade_distribution:    course.gradeDistribution ?? {},
          dfw_rate:              course.dfwRate ?? 0.18,
          institutional_success: course.institutionalSuccess ?? 0.72,
          nebula_data:           (course.nebulaData as Record<string, unknown>) ?? {},
          reddit_summary:        course.redditSummary ?? '',
          professor_profile:     (course.professorProfile as Record<string, unknown>) ?? {},
          prereq_course_ids:     course.prereqCourseIds ?? [],
        });
      }).catch(() => {});

      return { level1Data: { nodes, links } };
    });
  },
}));
