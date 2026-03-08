import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import {
  parsePdf, extractConcepts,
  fetchNebulaGrades, fetchRedditCourseInfo, fetchCoursePrereqs, fetchProfessorProfile,
  type NebulaGradeData, type RedditCourseData,
} from '../lib/api';

interface Props { onClose: () => void }
type Step = 'info' | 'upload' | 'processing' | 'preview';

interface CourseForm {
  courseName: string;
  courseCode: string;
  professor: string;
}
interface ProcessingStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}
interface ConceptNode {
  id: string; name: string; deps: string[]; is_estimated?: boolean;
}

// ── Grade colours per letter ─────────────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  'A+': '#4ade80', 'A': '#22c55e', 'A-': '#16a34a',
  'B+': '#60a5fa', 'B': '#3b82f6', 'B-': '#2563eb',
  'C+': '#fde68a', 'C': '#fbbf24', 'C-': '#d97706',
  'D+': '#fb923c', 'D': '#f97316', 'D-': '#ea580c',
  'F':  '#ef4444', 'W': '#9ca3af',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function NebulaGradeChart({ data }: { data: NebulaGradeData }) {
  const { detailed_distribution, grade_order, total_students, semesters, dfw_rate, source } = data;
  const maxPct = Math.max(0.01, ...grade_order.map((g) => detailed_distribution[g]?.pct ?? 0));
  return (
    <div className="nebula-grade-chart">
      <div className="grade-chart-header">
        <span className="grade-chart-title">Grade Distribution</span>
      </div>
      <div className="grade-chart-bars">
        {grade_order.map((grade) => {
          const entry = detailed_distribution[grade];
          if (!entry) return null;
          const barH = (entry.pct / maxPct) * 72;
          const col   = GRADE_COLORS[grade] ?? '#6b7280';
          return (
            <div key={grade} className="grade-bar-col"
              title={`${grade}: ${entry.count} students (${(entry.pct * 100).toFixed(1)}%)`}>
              <span className="grade-pct" style={{ color: col }}>{(entry.pct * 100).toFixed(0)}%</span>
              <div className="grade-bar" style={{ height: barH, background: col, borderRadius: '3px 3px 0 0' }} />
              <span className="grade-label" style={{ color: col, fontSize: 10 }}>{grade}</span>
            </div>
          );
        })}
      </div>
      <div className="grade-stats-row">
        <span>📊 {total_students.toLocaleString()} students</span>
        <span>📅 {semesters} sems</span>
        <span style={{ color: dfw_rate > 0.25 ? '#f87171' : dfw_rate > 0.15 ? '#fbbf24' : '#34d399' }}>
          ⚠ DFW {(dfw_rate * 100).toFixed(1)}%
        </span>
        <span style={{ color: '#4ade80' }}>
          ★ A-rate {((data.letter_distribution['A'] ?? 0) * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function RedditSection({ data }: { data: RedditCourseData }) {
  return (
    <div className="reddit-section">
      <div className="reddit-header">
        <span className="reddit-icon">💬</span>
        <h4>Student Opinions</h4>
        {data.source === 'reddit' && data.total_found > 0 && (
          <a href={`https://www.reddit.com/r/UTDallas/search/?q=${encodeURIComponent(data.course_code.replace(' ', ''))}&restrict_sr=1`}
            target="_blank" rel="noopener noreferrer" className="reddit-badge">
            r/UTDallas ↗
          </a>
        )}
      </div>
      <p className="reddit-summary">{data.summary}</p>
      {data.posts.length > 0 && (
        <div className="reddit-posts">
          {data.posts.slice(0, 3).map((post, i) => (
            <a key={i} href={post.url} target="_blank" rel="noopener noreferrer" className="reddit-post-link">
              <span className="reddit-score">↑{post.score}</span>
              <span className="reddit-title">{post.title.length > 70 ? post.title.slice(0, 70) + '…' : post.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ConceptPreview({ concepts }: { concepts: ConceptNode[] }) {
  return (
    <div className="concept-preview">
      {concepts.map((c, i) => (
        <motion.div key={c.id} className="concept-chip"
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}>
          <span className="concept-dot" />
          <span>{c.name}</span>
          {c.deps.length > 0 && (
            <span className="concept-deps">← {c.deps.length} prereq{c.deps.length > 1 ? 's' : ''}</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AddClassModal({ onClose }: Props) {
  const addCourseToGraph = useStore((s) => s.addCourseToGraph);
  const level1Data       = useStore((s) => s.level1Data);

  const [step, setStep]         = useState<Step>('info');
  const [form, setForm]         = useState<CourseForm>({ courseName: '', courseCode: '', professor: '' });
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [isDragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [nebulaData, setNebulaData]     = useState<NebulaGradeData | null>(null);
  const [redditData, setRedditData]     = useState<RedditCourseData | null>(null);
  const [profProfile, setProfProfile]   = useState<Record<string, unknown> | null>(null);
  const [concepts, setConcepts]         = useState<ConceptNode[]>([]);
  const [prereqIds, setPrereqIds]       = useState<string[]>([]);
  const [error, setError]               = useState('');

  const updateStep = useCallback((idx: number, status: ProcessingStep['status']) => {
    setProcessingSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, status } : s)));
  }, []);

  const handleInfoNext = () => {
    if (!form.courseName.trim() || !form.courseCode.trim()) {
      setError('Course name and code are required.');
      return;
    }
    setError(''); setStep('upload');
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.pdf')) { setError('Only PDF files are supported.'); return; }
    setError(''); setPdfFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  const handleProcess = async () => {
    const steps: ProcessingStep[] = [
      { label: 'Parsing syllabus PDF',                   status: pdfFile ? 'pending' : 'done' },
      { label: 'Extracting course topics with Gemini',   status: 'pending' },
      { label: 'Fetching real grade data (Nebula API)',   status: 'pending' },
      { label: 'Gathering Reddit student reviews',        status: 'pending' },
      { label: 'Scraping professor teaching style',       status: form.professor ? 'pending' : 'done' },
      { label: 'Detecting prerequisite connections',      status: 'pending' },
      { label: 'Building concept graph',                  status: 'pending' },
    ];
    setProcessingSteps(steps);
    setStep('processing');
    setError('');

    let syllabusText: string | undefined;

    // Step 0: PDF
    if (pdfFile) {
      updateStep(0, 'running');
      try { syllabusText = (await parsePdf(pdfFile)).text; updateStep(0, 'done'); }
      catch { updateStep(0, 'error'); }
    }

    // Step 1: Concepts
    updateStep(1, 'running');
    let extractedConcepts: ConceptNode[] = [];
    try {
      const res = await extractConcepts(form.courseCode.replace(/\s+/g, '').toLowerCase(), {
        syllabusText, courseDescription: form.courseName,
      });
      extractedConcepts = res.concepts;
      updateStep(1, 'done');
    } catch {
      updateStep(1, 'error');
      const base = form.courseCode.replace(/\s+/g, '_').toLowerCase();
      extractedConcepts = [
        { id: `concept_${base}_intro`,    name: `Introduction to ${form.courseName}`, deps: [] },
        { id: `concept_${base}_core`,     name: 'Core Principles',                    deps: [`concept_${base}_intro`] },
        { id: `concept_${base}_advanced`, name: 'Advanced Topics',                    deps: [`concept_${base}_core`] },
      ];
    }
    setConcepts(extractedConcepts);

    // Step 2: Nebula grade data
    updateStep(2, 'running');
    let grades: NebulaGradeData | null = null;
    try {
      const profLast = form.professor.trim().split(/\s+/).pop() ?? '';
      grades = await fetchNebulaGrades(form.courseCode, profLast);
      setNebulaData(grades);
      updateStep(2, 'done');
    } catch {
      updateStep(2, 'error');
    }

    // Step 3: Reddit
    updateStep(3, 'running');
    try {
      const reddit = await fetchRedditCourseInfo(form.courseCode, form.courseName);
      setRedditData(reddit);
      updateStep(3, 'done');
    } catch {
      updateStep(3, 'error');
    }

    // Step 4: Professor profile scraping
    if (form.professor) {
      updateStep(4, 'running');
      try {
        const prof = await fetchProfessorProfile({
          professorName: form.professor,
          courseCode: form.courseCode,
          courseName: form.courseName,
        });
        setProfProfile(prof as unknown as Record<string, unknown>);
        updateStep(4, 'done');
      } catch {
        updateStep(4, 'error');
      }
    }

    // Step 5: Prereq detection via Gemini
    updateStep(5, 'running');
    try {
      const existingCourses = (level1Data?.nodes ?? [])
        .filter((n) => n.type === 'course' && n.id !== 'quest_root')
        .map((n) => ({ id: n.id, code: (n.courseId ?? n.id), name: n.name }));
      if (existingCourses.length > 0) {
        const prereqs = await fetchCoursePrereqs({
          newCourseCode:   form.courseCode,
          newCourseName:   form.courseName,
          existingCourses,
        });
        setPrereqIds(prereqs.prereq_ids);
      }
      updateStep(5, 'done');
    } catch {
      updateStep(5, 'error');
    }

    // Step 6: Graph assembly
    updateStep(6, 'running');
    await new Promise((r) => setTimeout(r, 300));
    updateStep(6, 'done');
    setStep('preview');
  };

  const handleAddToGalaxy = () => {
    const id = `course_${form.courseCode.replace(/\s+/g, '').toLowerCase()}_${Date.now()}`;
    const ld = nebulaData?.letter_distribution;
    addCourseToGraph(
      {
        id,
        name: `${form.courseCode} – ${form.courseName}`,
        code: form.courseCode,
        description: form.courseName,
        dfwRate: nebulaData?.dfw_rate ?? 0.18,
        institutionalSuccess: ld ? ((ld['A'] ?? 0) + (ld['B'] ?? 0)) : 0.65,
        professor: form.professor || undefined,
        gradeDistribution: ld as Record<string, number> | undefined,
        nebulaData: nebulaData ?? undefined,
        redditSummary: redditData?.summary ?? undefined,
        professorProfile: profProfile ?? undefined,
        prereqCourseIds: prereqIds,
      },
      concepts.map((c) => ({ id: c.id, name: c.name, deps: c.deps, is_estimated: c.is_estimated }))
    );
    onClose();
  };

  const STEP_LABELS: Record<Step, string> = {
    info: '1 · Details', upload: '2 · Syllabus',
    processing: '3 · Analysing', preview: '4 · Preview',
  };

  const content = (
    <AnimatePresence>
      <motion.div className="modal-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      {/* Centering wrapper is a plain div — framer-motion must NOT touch it,
          otherwise its transform overrides the translate(-50%,-50%) centering */}
      <div className="modal-center-wrap">
      <motion.div className="add-class-modal"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-icon">🌌</span>
            <h2>Add a Class to Your Galaxy</h2>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Step indicators */}
        <div className="modal-steps">
  {(['info', 'upload', 'processing', 'preview'] as Step[]).map((s, i) => (
    <div 
      key={s} 
      className={`step-dot ${step === s ? 'active' : i < (['info', 'upload', 'processing', 'preview'] as Step[]).indexOf(step) ? 'done' : ''}`}
      title={STEP_LABELS[s]} // Added title for accessibility/hover
    />
  ))}
</div>

        <div className="modal-body">
          <AnimatePresence mode="wait">

            {/* ── Step 1: Info ───────────────────────────────────────────── */}
            {step === 'info' && (
              <motion.div key="info" className="modal-step"
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <h3>Course Details</h3>
                <label>
                  UTD Course Code <span className="req">*</span>
                  <input type="text" placeholder="e.g. CS 3345" value={form.courseCode}
                    onChange={(e) => setForm({ ...form, courseCode: e.target.value })}
                    className="modal-input" />
                </label>
                <label>
                  Course Name <span className="req">*</span>
                  <input type="text" placeholder="e.g. Data Structures and Algorithmic Analysis"
                    value={form.courseName}
                    onChange={(e) => setForm({ ...form, courseName: e.target.value })}
                    className="modal-input" />
                </label>
                <label>
                  Professor <span className="opt">(optional — improves grade data)</span>
                  <input type="text" placeholder="e.g. Dr. Smith" value={form.professor}
                    onChange={(e) => setForm({ ...form, professor: e.target.value })}
                    className="modal-input" />
                </label>
                {error && <p className="modal-error">{error}</p>}
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={onClose}>Cancel</button>
                  <button className="btn-primary" onClick={handleInfoNext}>Next →</button>
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Upload ─────────────────────────────────────────── */}
            {step === 'upload' && (
              <motion.div key="upload" className="modal-step"
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <h3>Upload Syllabus <span className="opt">(optional)</span></h3>
                <p className="modal-hint">
                  Gemini analyses your syllabus to map precise topic planets.
                  Skip to get AI-estimated topics.
                </p>
                <div className={`dropzone ${isDragging ? 'dragging' : ''} ${pdfFile ? 'has-file' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" accept=".pdf" hidden
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  {pdfFile ? (
                    <div className="file-selected">
                      <span className="file-icon">📄</span>
                      <span className="file-name">{pdfFile.name}</span>
                      <span className="file-size">({(pdfFile.size / 1024).toFixed(0)} KB)</span>
                      <button className="remove-file" onClick={(e) => { e.stopPropagation(); setPdfFile(null); }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span className="drop-icon">☁️</span>
                      <p>Drag & drop PDF here, or <u>click to browse</u></p>
                      <p className="drop-sub">Max 10 MB · PDF only</p>
                    </>
                  )}
                </div>
                {error && <p className="modal-error">{error}</p>}
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setStep('info')}>← Back</button>
                  <button className="btn-secondary" onClick={handleProcess}>Skip, use AI estimate</button>
                  <button className="btn-primary" onClick={handleProcess}>
                    {pdfFile ? 'Process Syllabus →' : 'Generate Topics →'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Processing ─────────────────────────────────────── */}
            {step === 'processing' && (
              <motion.div key="processing" className="modal-step processing-step"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="processing-orb" />
                <h3>Building Your Galaxy…</h3>
                <div className="processing-list">
                  {processingSteps.map((s, i) => (
                    <motion.div key={i} className={`processing-item ${s.status}`}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                      <span className="processing-icon">
                        {s.status === 'done' ? '✓' : s.status === 'error' ? '⚠' : s.status === 'running'
                          ? <span className="spin">◌</span> : '○'}
                      </span>
                      <span>{s.label}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Step 4: Preview ───────────────────────────────────────── */}
            {step === 'preview' && (
              <motion.div key="preview" className="modal-step preview-step"
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <h3>{form.courseCode} — {form.courseName}</h3>

                {/* Nebula grade distribution */}
                {nebulaData && <NebulaGradeChart data={nebulaData} />}

                {/* Professor profile */}
                {profProfile && form.professor && (
                  <div className="prof-preview-card">
                    <div className="prof-preview-header">
                      <span className="prof-preview-icon">👨‍🏫</span>
                      <div>
                        <p className="prof-preview-name">{form.professor}</p>
                        <div className="prof-preview-tags">
                          {((profProfile.tags as string[]) ?? []).slice(0, 3).map((t) => (
                            <span key={t} className="prof-tag">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="prof-preview-scores">
                        <span title="Difficulty">🎯 {((profProfile.difficulty as number) * 10).toFixed(1)}</span>
                        <span title="Clarity">💡 {((profProfile.clarity as number) * 10).toFixed(1)}</span>
                      </div>
                    </div>
                    <p className="prof-preview-style">{profProfile.exam_style as string}</p>
                    {profProfile.tips && <p className="prof-preview-tips">💡 {profProfile.tips as string}</p>}
                  </div>
                )}

                {/* Reddit student opinions */}
                {redditData && <RedditSection data={redditData} />}

                {/* Prereq connections */}
                {prereqIds.length > 0 && (
                  <div className="concept-section">
                    <h4>🔗 Auto-connected Prerequisites ({prereqIds.length})</h4>
                    <div className="prereq-chips">
                      {prereqIds.map((pid) => {
                        const n = level1Data?.nodes.find((x) => x.id === pid);
                        return (
                          <span key={pid} className="prereq-chip">
                            ← {n?.name ?? pid}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Concept planets */}
                <div className="concept-section">
                  <h4>Topic Planets ({concepts.length})</h4>
                  <ConceptPreview concepts={concepts} />
                </div>

                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setStep('upload')}>← Edit</button>
                  <button className="btn-primary pulse-btn" onClick={handleAddToGalaxy}>
                    🚀 Launch into Galaxy
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
