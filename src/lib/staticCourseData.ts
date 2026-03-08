/**
 * Hardcoded professor profiles, grade distributions, and syllabus data
 * for all demo UTD courses. Loaded at startup so the Info tab is instant.
 */

export interface StaticProfessorProfile {
  name: string;
  teaching_style: string;
  exam_style: string;
  vibe: string;
  difficulty: number;   // 0–1
  clarity: number;
  workload: number;
  tags: string[];
  tips: string;
  prior_alpha: number;
  prior_beta: number;
}

export interface StaticGradeDetail {
  count: number;
  pct: number;
}

export interface StaticNebulaData {
  source: 'static';
  course_code: string;
  total_students: number;
  semesters: number;
  letter_distribution: Record<string, number>;
  detailed_distribution: Record<string, StaticGradeDetail>;
  grade_order: string[];
  dfw_rate: number;
}

export interface SyllabusWeight {
  component: string;
  weight: number;   // percentage
  description: string;
}

export interface StaticCourseData {
  professor: string;
  professorProfile: StaticProfessorProfile;
  nebulaData: StaticNebulaData;
  redditSummary: string;
  syllabusWeights: SyllabusWeight[];
  syllabusOverview: string;
}

// ── Helper ────────────────────────────────────────────────────────────────────
function mkNebula(
  code: string,
  students: number,
  semesters: number,
  dist: Record<string, number>,   // grade → raw percentage (0–1)
  dfw: number
): StaticNebulaData {
  const order = ['A+','A','A-','B+','B','B-','C+','C','C-'];
  const detailed: Record<string, StaticGradeDetail> = {};
  for (const [g, pct] of Object.entries(dist)) {
    detailed[g] = { count: Math.round(students * pct), pct };
  }
  // letter rollups
  const letter: Record<string, number> = {
    A: (dist['A+'] ?? 0) + (dist['A'] ?? 0) + (dist['A-'] ?? 0),
    B: (dist['B+'] ?? 0) + (dist['B'] ?? 0) + (dist['B-'] ?? 0),
    C: (dist['C+'] ?? 0) + (dist['C'] ?? 0) + (dist['C-'] ?? 0),
  };
  return {
    source: 'static',
    course_code: code,
    total_students: students,
    semesters,
    letter_distribution: letter,
    detailed_distribution: detailed,
    grade_order: order,
    dfw_rate: dfw,
  };
}

// ── Course data ───────────────────────────────────────────────────────────────
export const STATIC_COURSE_DATA: Record<string, StaticCourseData> = {

  course_cs1337: {
    professor: 'Srimathi Srinivasan',
    professorProfile: {
      name: 'Srimathi Srinivasan',
      teaching_style: 'Lecture-heavy with strong emphasis on live coding demos. Uses slides but supplements with whiteboard. Very structured; covers exactly whats on the syllabus, no more.',
      exam_style: 'Multiple choice + short coding questions. Two midterms and one final. Questions are straightforward if you study lecture slides and HW problems. No open-book.',
      vibe: 'Professional and systematic. Not very interactive but very clear. Office hours are genuinely useful.',
      difficulty: 0.40, clarity: 0.78, workload: 0.55,
      tags: ['Structured', 'Live Coding', 'Beginner Friendly', 'Consistent Exams'],
      tips: 'Do every homework yourself — HW problems repeat almost verbatim on exams. Attend every lecture; she covers things once and moves on.',
      prior_alpha: 6.2, prior_beta: 2.8,
    },
    nebulaData: mkNebula('CS1337', 2840, 12,
      { 'A+': 0.06, 'A': 0.18, 'A-': 0.10, 'B+': 0.14, 'B': 0.16, 'B-': 0.10, 'C+': 0.08, 'C': 0.08, 'C-': 0.04 }, 0.06),
    redditSummary: 'Most students find CS 1337 with Srinivasan manageable if they keep up. The homeworks are tedious but exam questions are nearly identical, so completing them is key. Office hours are said to be extremely helpful. Avoid falling behind — the course accelerates fast in week 6.',
    syllabusOverview: 'Intro to C++ programming. Covers variables, control flow, functions, arrays, pointers, structs, file I/O, and basic sorting.',
    syllabusWeights: [
      { component: 'Homework / Labs', weight: 30, description: '~10 programming assignments covering each major topic' },
      { component: 'Midterm 1', weight: 20, description: 'Variables, control flow, functions, arrays' },
      { component: 'Midterm 2', weight: 20, description: 'Pointers, structs, file I/O' },
      { component: 'Final Exam', weight: 25, description: 'Comprehensive — all topics' },
      { component: 'Participation / Quizzes', weight: 5, description: 'In-class quizzes, attendance points' },
    ],
  },

  course_cs2336: {
    professor: 'Scott Dollinger',
    professorProfile: {
      name: 'Scott Dollinger',
      teaching_style: 'Highly interactive lectures with lots of in-class exercises. Emphasizes OOP principles deeply. Uses Java; very good at explaining inheritance and polymorphism visually.',
      exam_style: 'Pen-and-paper written code + multiple choice. Tests require you to trace through object hierarchies by hand. Partial credit is generous for structure.',
      vibe: 'Enthusiastic and approachable. Replies to Piazza fast. Some students find the class harder than expected because OOP concepts need serious practice.',
      difficulty: 0.52, clarity: 0.82, workload: 0.62,
      tags: ['OOP Focus', 'Interactive', 'Design Patterns', 'Project-Based'],
      tips: 'Understand inheritance deeply — not just syntax. Draw UML diagrams before writing any code. The projects are where you really learn.',
      prior_alpha: 5.8, prior_beta: 2.6,
    },
    nebulaData: mkNebula('CS2336', 2210, 10,
      { 'A+': 0.08, 'A': 0.20, 'A-': 0.10, 'B+': 0.14, 'B': 0.18, 'B-': 0.08, 'C+': 0.07, 'C': 0.07, 'C-': 0.03 }, 0.05),
    redditSummary: 'CS 2336 with Dollinger is well-regarded. He makes OOP click for most students. Projects are fun but can be time-consuming — start early. Students consistently mention that his exam questions test understanding, not memorization.',
    syllabusOverview: 'OOP with Java. Covers classes/objects, inheritance, polymorphism, interfaces, generics, exceptions, recursion, linked lists, stacks, and queues.',
    syllabusWeights: [
      { component: 'Programming Projects (3)', weight: 40, description: 'Major OOP projects building progressively complex systems' },
      { component: 'Midterm Exam', weight: 25, description: 'Written code tracing + short answer on OOP concepts' },
      { component: 'Final Exam', weight: 30, description: 'Comprehensive covering all topics' },
      { component: 'Quizzes', weight: 5, description: 'Short weekly canvas quizzes on recent material' },
    ],
  },

  course_cs3345: {
    professor: 'Benjamin Cisneros',
    professorProfile: {
      name: 'Benjamin Cisneros',
      teaching_style: 'Blackboard-style derivations with emphasis on correctness proofs for algorithms. Dense but rigorous. Uses textbook (Weiss) closely.',
      exam_style: 'Long-form written problems: implement or trace algorithms, prove time complexity, derive recurrences. No calculator. Very challenging — most A students spend 20+ hrs/week.',
      vibe: 'Strict but fair. Goes fast. Does not repeat material — attendance is practically mandatory.',
      difficulty: 0.78, clarity: 0.65, workload: 0.80,
      tags: ['Rigorous', 'Theory-Heavy', 'Algorithm Proofs', 'High Workload'],
      tips: 'Practice drawing algorithm traces by hand before exams. Form study groups. The textbook exercises are the best exam prep.',
      prior_alpha: 3.8, prior_beta: 4.2,
    },
    nebulaData: mkNebula('CS3345', 1860, 14,
      { 'A+': 0.04, 'A': 0.13, 'A-': 0.10, 'B+': 0.12, 'B': 0.16, 'B-': 0.12, 'C+': 0.10, 'C': 0.09, 'C-': 0.06 }, 0.08),
    redditSummary: 'CS 3345 is considered one of the hardest core CS classes at UTD. Cisneros is tough but knowledgeable. The course separates serious CS students. Reddit consensus: start projects 2 weeks early, grind practice problems, and form study groups. Office hours lines are long before exams.',
    syllabusOverview: 'Data structures & algorithm analysis. Covers linked lists, stacks, queues, trees (BST, AVL, splay), heaps, graphs (BFS/DFS/Dijkstra), sorting algorithms, and Big-O analysis.',
    syllabusWeights: [
      { component: 'Programming Assignments (5)', weight: 35, description: 'Implement core data structures and algorithms from scratch in Java' },
      { component: 'Midterm 1', weight: 20, description: 'Lists, stacks, queues, trees, analysis' },
      { component: 'Midterm 2', weight: 20, description: 'Heaps, graphs, sorting' },
      { component: 'Final Exam', weight: 20, description: 'Comprehensive' },
      { component: 'Quizzes', weight: 5, description: 'Weekly algorithm trace quizzes' },
    ],
  },

  course_cs3354: {
    professor: 'Lawrence Chung',
    professorProfile: {
      name: 'Lawrence Chung',
      teaching_style: 'Concept-driven lectures using many real-world software case studies. Heavy on UML diagrams and design patterns. Group work is integral to the class.',
      exam_style: 'Mix of short answer and design problems. Expect questions about design patterns (Observer, Factory, Strategy), SDLC models, and UML. Open notes for some exams.',
      vibe: 'Very experienced professor, sometimes dry but clearly loves the subject. Group project is where most of the learning happens.',
      difficulty: 0.45, clarity: 0.72, workload: 0.58,
      tags: ['Design Patterns', 'Group Project', 'UML', 'Conceptual'],
      tips: 'Take the group project seriously — it counts heavily. Memorize the core design patterns with real examples. UML diagrams appear on every exam.',
      prior_alpha: 5.4, prior_beta: 2.8,
    },
    nebulaData: mkNebula('CS3354', 1540, 11,
      { 'A+': 0.10, 'A': 0.22, 'A-': 0.12, 'B+': 0.16, 'B': 0.16, 'B-': 0.08, 'C+': 0.06, 'C': 0.05, 'C-': 0.02 }, 0.03),
    redditSummary: 'CS 3354 is one of the lighter CS core courses. Chung is respected but can be slow-paced. The group project is the real learning experience — pick your teammates carefully. Reddit says it\'s a good GPA booster if you engage with the material and document well.',
    syllabusOverview: 'Software engineering lifecycle: requirements, design, implementation, testing, maintenance. Agile vs Waterfall, design patterns, UML, version control, code reviews.',
    syllabusWeights: [
      { component: 'Group Project (end-to-end)', weight: 40, description: 'Full software project: requirements → design → implementation → testing docs' },
      { component: 'Midterm Exam', weight: 20, description: 'SDLC models, requirements engineering, UML diagrams' },
      { component: 'Final Exam', weight: 25, description: 'Design patterns, testing, maintenance concepts' },
      { component: 'Individual Assignments', weight: 10, description: 'Short UML / design exercises' },
      { component: 'Participation', weight: 5, description: 'In-class discussion' },
    ],
  },

  course_cs3341: {
    professor: 'Ivor Page',
    professorProfile: {
      name: 'Ivor Page',
      teaching_style: 'Theoretical and mathematically precise. Derives proofs for distributions and theorems on the board. Connects probability to real CS applications (ML, networking).',
      exam_style: 'Heavy computation + proof. Expect to derive conditional probabilities, compute expectations, and prove properties of distributions. Long exams.',
      vibe: 'Very smart but expects a lot. Genuinely cares about student understanding. Exams are hard, curve is fair.',
      difficulty: 0.70, clarity: 0.68, workload: 0.72,
      tags: ['Math-Heavy', 'Proofs', 'Curves Exams', 'CS Applications'],
      tips: 'Practice computing probability from first principles. The textbook exercises are essential. If you\'re weak on calculus, review integration before this class.',
      prior_alpha: 4.2, prior_beta: 3.8,
    },
    nebulaData: mkNebula('CS3341', 1320, 10,
      { 'A+': 0.05, 'A': 0.14, 'A-': 0.10, 'B+': 0.13, 'B': 0.16, 'B-': 0.11, 'C+': 0.09, 'C': 0.09, 'C-': 0.06 }, 0.07),
    redditSummary: 'CS 3341 with Ivor Page is math-intensive. Students who are comfortable with calculus and combinatorics tend to do well. Exams require both computation and conceptual understanding. Reddit consistently says: start homework early and form a study group — solo cramming doesn\'t work.',
    syllabusOverview: 'Probability theory for CS: sample spaces, conditional probability, Bayes theorem, random variables, distributions (Binomial, Poisson, Normal, Exponential), expectation, CLT, hypothesis testing, regression basics.',
    syllabusWeights: [
      { component: 'Homework Sets (8)', weight: 30, description: 'Weekly problem sets; show all work for full credit' },
      { component: 'Midterm 1', weight: 20, description: 'Probability basics, counting, conditional probability' },
      { component: 'Midterm 2', weight: 20, description: 'Random variables, distributions, expectation' },
      { component: 'Final Exam', weight: 25, description: 'CLT, hypothesis testing, and comprehensive' },
      { component: 'Quizzes', weight: 5, description: 'Short concept-check quizzes in-class' },
    ],
  },

  course_cs4337: {
    professor: 'Pushpa Ranjith',
    professorProfile: {
      name: 'Pushpa Ranjith',
      teaching_style: 'Conceptual discussion-based lectures. Explores language paradigms with live examples in Haskell, Prolog, and Python. Encourages comparing languages critically.',
      exam_style: 'Short answer + functional programming exercises. Expect to write pure functions, trace lambda calculus reductions, and compare type systems. Open-book for the final.',
      vibe: 'Engaging and thoughtful. Makes abstract theory accessible. Students who enjoy language theory love this class; others find it niche.',
      difficulty: 0.55, clarity: 0.74, workload: 0.50,
      tags: ['Functional Programming', 'Theory', 'Haskell', 'Paradigm Comparison'],
      tips: 'Learn Haskell basics early — it shows up on exams. Understand lambda calculus reductions step-by-step before the final.',
      prior_alpha: 5.0, prior_beta: 3.0,
    },
    nebulaData: mkNebula('CS4337', 980, 8,
      { 'A+': 0.07, 'A': 0.18, 'A-': 0.12, 'B+': 0.14, 'B': 0.17, 'B-': 0.09, 'C+': 0.07, 'C': 0.08, 'C-': 0.04 }, 0.04),
    redditSummary: 'CS 4337 is a unique upper-level course at UTD. Ranjith is a good lecturer who makes language theory interesting. Haskell is the main challenge — set up your environment early. Reddit suggests using the course to genuinely explore programming beyond Java/Python; that mindset makes it enjoyable.',
    syllabusOverview: 'Language paradigms: imperative, OOP, functional, logic. Syntax & semantics, grammars, type systems, lambda calculus, Haskell functional programming, Prolog logic programming, language runtime.',
    syllabusWeights: [
      { component: 'Programming Assignments (4)', weight: 35, description: 'One per paradigm: imperative trace, OOP hierarchy, Haskell functions, Prolog facts' },
      { component: 'Midterm Exam', weight: 25, description: 'Grammars, syntax, semantics, type theory' },
      { component: 'Final Exam (open-book)', weight: 30, description: 'Lambda calculus, functional programming, comprehensive' },
      { component: 'Participation / Discussions', weight: 10, description: 'In-class language comparison exercises' },
    ],
  },

  course_math2413: {
    professor: 'Diana Cuevas',
    professorProfile: {
      name: 'Diana Cuevas',
      teaching_style: 'Problem-first teaching: starts every lecture with a motivating application, then derives the theory. Relies on student participation. Uses lots of visual diagrams for limits and derivatives.',
      exam_style: 'Long-form computation with some conceptual questions. Must show all work. Calculator NOT allowed. Time-limited — speed matters.',
      vibe: 'Encouraging and patient. One of the more student-friendly math professors at UTD. Popular especially with freshmen.',
      difficulty: 0.50, clarity: 0.80, workload: 0.60,
      tags: ['Visual Explanations', 'Application Focus', 'No Calculator', 'Encouraging'],
      tips: 'Practice problems every single day. The exam is time-pressured, so being fast matters. Use her office hours — she gives excellent hints.',
      prior_alpha: 5.5, prior_beta: 2.7,
    },
    nebulaData: mkNebula('MATH2413', 3200, 15,
      { 'A+': 0.07, 'A': 0.19, 'A-': 0.11, 'B+': 0.13, 'B': 0.17, 'B-': 0.10, 'C+': 0.08, 'C': 0.07, 'C-': 0.04 }, 0.04),
    redditSummary: 'Math 2413 (Calc I) is manageable at UTD if you keep up. Cuevas is considered one of the best. The curve helps. Reddit universally agrees: practice is everything — watching videos without doing problems is useless. Khan Academy is a great supplement.',
    syllabusOverview: 'Differential calculus: limits, continuity, differentiation rules, chain rule, implicit differentiation, related rates, optimization, curve sketching, mean value theorem, intro to integrals.',
    syllabusWeights: [
      { component: 'Homework (WebAssign)', weight: 20, description: 'Online weekly homework — unlimited attempts' },
      { component: 'Midterm 1', weight: 20, description: 'Limits and continuity' },
      { component: 'Midterm 2', weight: 20, description: 'Differentiation rules and applications' },
      { component: 'Final Exam', weight: 30, description: 'Comprehensive including optimization and intro integration' },
      { component: 'Quizzes / Recitation', weight: 10, description: 'Weekly recitation quizzes — low stakes, good practice' },
    ],
  },

  course_math2414: {
    professor: 'Pankaj Choudhary',
    professorProfile: {
      name: 'Pankaj Choudhary',
      teaching_style: 'Rigorous and fast-paced. Expects students to read the textbook before class. Uses clicker questions to check understanding. Heavy on integration techniques.',
      exam_style: 'Closed-book. All work shown. Mix of integration computation and series convergence tests. Partial credit available for method even if arithmetic is wrong.',
      vibe: 'Precise and dry. Excellent teacher for students who are self-motivated. Not much hand-holding.',
      difficulty: 0.62, clarity: 0.70, workload: 0.68,
      tags: ['Fast-Paced', 'Rigorous', 'Integration Techniques', 'Series-Heavy'],
      tips: 'Master all integration techniques from day 1 — they compound. For series, memorize the test decision tree. Do textbook problems, not just assigned ones.',
      prior_alpha: 4.6, prior_beta: 3.2,
    },
    nebulaData: mkNebula('MATH2414', 2900, 14,
      { 'A+': 0.05, 'A': 0.16, 'A-': 0.10, 'B+': 0.13, 'B': 0.17, 'B-': 0.11, 'C+': 0.09, 'C': 0.08, 'C-': 0.05 }, 0.06),
    redditSummary: 'Math 2414 (Calc II) is widely considered the hardest of the calculus sequence. Choudhary is knowledgeable but grades are tough. Students consistently recommend: spend 2x the time on series and sequences, and form a study group for exam prep. Watch PatrickJMT videos for integration techniques.',
    syllabusOverview: 'Integral calculus: integration techniques (substitution, parts, trig, partial fractions), improper integrals, applications (area, volume, arc length), sequences, series, convergence tests, power series, Taylor series.',
    syllabusWeights: [
      { component: 'Homework (WebAssign)', weight: 15, description: 'Online weekly problems — mandatory foundation' },
      { component: 'Midterm 1', weight: 20, description: 'Integration techniques and applications' },
      { component: 'Midterm 2', weight: 20, description: 'Improper integrals and parametric/polar' },
      { component: 'Final Exam', weight: 30, description: 'Comprehensive — heavily weighted on series/sequences' },
      { component: 'Quizzes', weight: 15, description: 'Bi-weekly integration quizzes — no partial credit' },
    ],
  },

  course_chem2323: {
    professor: 'Jody Smiley',
    professorProfile: {
      name: 'Jody Smiley',
      teaching_style: 'Mechanism-focused. Draws every reaction mechanism step-by-step on the board. Excellent at connecting structure to reactivity. Uses 3D models.',
      exam_style: 'Draw reaction mechanisms, predict products, name compounds. Long-form — many short questions. Speed is a factor. One nomenclature quiz each chapter.',
      vibe: 'Warm and genuinely invested in student success. One of the most approachable chem professors. Students love her energy.',
      difficulty: 0.60, clarity: 0.82, workload: 0.65,
      tags: ['Mechanism-Focused', 'Hands-On', '3D Models', 'Student-Friendly'],
      tips: 'Draw mechanisms every day. Flashcard every reagent → product. The 3D spatial reasoning for chirality is what trips most students up.',
      prior_alpha: 5.2, prior_beta: 2.8,
    },
    nebulaData: mkNebula('CHEM2323', 1680, 12,
      { 'A+': 0.06, 'A': 0.17, 'A-': 0.11, 'B+': 0.13, 'B': 0.17, 'B-': 0.10, 'C+': 0.08, 'C': 0.08, 'C-': 0.05 }, 0.05),
    redditSummary: 'Orgo I (CHEM 2323) has a tough reputation but Smiley makes it approachable. Reddit says: do NOT cram — mechanisms need to be practiced daily. Study groups are essential. Khan Academy Organic Chemistry and Organic Chemistry Tutor on YouTube are consistently recommended.',
    syllabusOverview: 'Organic Chemistry I: bonding, nomenclature, stereochemistry, nucleophilic substitution (SN1/SN2), elimination (E1/E2), alkene and alkyne reactions, radical reactions.',
    syllabusWeights: [
      { component: 'Exams (3 midterms)', weight: 45, description: 'Mechanism prediction, product identification, naming' },
      { component: 'Final Exam', weight: 25, description: 'Comprehensive — all reactions and mechanisms' },
      { component: 'Laboratory', weight: 20, description: 'Weekly lab reports and pre-lab assignments' },
      { component: 'Quizzes / Homework', weight: 10, description: 'Chapter-by-chapter nomenclature and mechanism checks' },
    ],
  },

  course_chem2325: {
    professor: 'Mohammad Omary',
    professorProfile: {
      name: 'Mohammad Omary',
      teaching_style: 'Research-connected lectures that bridge Orgo II to real-world pharmaceutical and materials chemistry. Very enthusiastic about spectroscopy.',
      exam_style: 'Spectral interpretation (NMR, IR, Mass Spec) + multi-step synthesis design. Requires integrating knowledge from Orgo I. Time-limited.',
      vibe: 'Passionate about chemistry and research. Can be challenging to follow in lecture — office hours are critical.',
      difficulty: 0.72, clarity: 0.62, workload: 0.70,
      tags: ['Research Focus', 'Spectroscopy', 'Multi-Step Synthesis', 'Challenging'],
      tips: 'Master NMR interpretation early — it appears on every exam. Review all Orgo I mechanisms before the course starts. Use the Clayden textbook for deep understanding.',
      prior_alpha: 3.6, prior_beta: 4.0,
    },
    nebulaData: mkNebula('CHEM2325', 1420, 11,
      { 'A+': 0.04, 'A': 0.12, 'A-': 0.09, 'B+': 0.12, 'B': 0.15, 'B-': 0.12, 'C+': 0.10, 'C': 0.10, 'C-': 0.07 }, 0.09),
    redditSummary: 'CHEM 2325 (Orgo II) is the hardest chemistry course most pre-med/pre-pharm students will take. Omary is brilliant but lectures can be fast. Reddit consensus: spectroscopy practice is make-or-break, use Orgo Made Easy YouTube, and work through every practice exam available.',
    syllabusOverview: 'Organic Chemistry II: conjugation, aromaticity, aromatic substitution, aldehydes/ketones, carboxylic acids and derivatives, amines, spectroscopy (NMR, IR, MS), multi-step synthesis.',
    syllabusWeights: [
      { component: 'Exams (3 midterms)', weight: 42, description: 'Mechanisms, synthesis planning, spectral interpretation' },
      { component: 'Final Exam', weight: 28, description: 'Comprehensive with emphasis on synthesis and spectroscopy' },
      { component: 'Laboratory', weight: 20, description: 'Synthesis experiments + spectral analysis reports' },
      { component: 'Quizzes', weight: 10, description: 'Chapter quizzes on reagent/product identification' },
    ],
  },

};

/** Returns static data for a course node ID, or undefined if not found. */
export function getStaticCourseData(courseId: string): StaticCourseData | undefined {
  return STATIC_COURSE_DATA[courseId];
}
