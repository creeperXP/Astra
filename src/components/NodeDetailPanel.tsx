/**
 * Full-screen node detail panel.
 * Click concept → full-screen card with blurred backdrop.
 * Hit "Done" → dramatic Session Complete popup (5s auto-dismiss → galaxy glow ripple).
 * Tabs: Notes | Quiz | Course Info | History | Recs | Diagram | 3D
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { updateBeta, initialBetaFromPrior } from '../lib/bayesian';
import {
  generateNodeContent, bayesianUpdate, getNodeContent, saveNodeContent,
  fetchMasteryFeedback, fetchResourceRecommendations, explainRipple,
  fetchPrerequisites, callNemotron, persistMastery,
  type NodeContentData, type QuizAttempt, type ResourceItem,
} from '../lib/api';
import { GameModal } from './GameModal.tsx';
import { ThreeScenePopup } from './ThreeScenePopup.tsx';
import type { GraphNode, GraphData } from '../types/graph';

// ── Mastery ring ─────────────────────────────────────────────────────────────
function MasteryRing({ value, size = 64 }: { value: number; size?: number }) {
  const r    = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const dash = circ * value;
  const col  = value >= 0.8 ? '#4ade80' : value >= 0.5 ? '#fbbf24' : '#f87171';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col}
        strokeWidth={5} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}/>
    </svg>
  );
}

// ── Pure SVG Radar / Spider Chart ────────────────────────────────────────────
interface RadarAxis { label: string; value: number; color?: string }

function RadarChart({ axes, size = 200 }: { axes: RadarAxis[]; size?: number }) {
  if (axes.length < 3) return null;
  const cx = size / 2, cy = size / 2;
  const r  = size * 0.36;
  const n  = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt    = (i: number, frac: number) => ({
    x: cx + Math.cos(angle(i)) * r * frac,
    y: cy + Math.sin(angle(i)) * r * frac,
  });
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const polyPoints = axes.map((a, i) => {
    const p = pt(i, Math.max(0.05, a.value));
    return `${p.x},${p.y}`;
  }).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {gridLevels.map((lvl) => (
        <polygon key={lvl}
          points={axes.map((_, i) => { const p = pt(i, lvl); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={0.8}/>
      ))}
      {/* Axis spokes */}
      {axes.map((_, i) => {
        const outer = pt(i, 1.0);
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y}
          stroke="rgba(255,255,255,0.1)" strokeWidth={0.8}/>;
      })}
      {/* Data polygon */}
      <polygon points={polyPoints}
        fill="rgba(96,165,250,0.15)" stroke="rgba(96,165,250,0.7)" strokeWidth={1.5}/>
      {/* Dots at each axis */}
      {axes.map((a, i) => {
        const p = pt(i, Math.max(0.05, a.value));
        const col = a.color ?? (a.value >= 0.7 ? '#4ade80' : a.value >= 0.4 ? '#fbbf24' : '#f87171');
        return <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={col}/>;
      })}
      {/* Axis labels */}
      {axes.map((a, i) => {
        const labelR = r * 1.32;
        const lx = cx + Math.cos(angle(i)) * labelR;
        const ly = cy + Math.sin(angle(i)) * labelR;
        const col = a.color ?? (a.value >= 0.7 ? '#4ade80' : a.value >= 0.4 ? '#fbbf24' : '#f87171');
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
            fontSize={8.5} fontFamily="monospace" fill={col} fontWeight="600">
            {a.label}
          </text>
        );
      })}
      {/* Value % labels on polygon */}
      {axes.map((a, i) => {
        const p = pt(i, Math.max(0.05, a.value) + 0.12);
        return (
          <text key={`v${i}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
            fontSize={7} fontFamily="monospace" fill="rgba(255,255,255,0.5)">
            {(a.value * 100).toFixed(0)}%
          </text>
        );
      })}
    </svg>
  );
}

// ── Course Info panel ─────────────────────────────────────────────────────────
function CourseInfoPanel({ node, getMastery, level2Data }: {
  node: GraphNode | null;
  getMastery: (id: string) => number;
  level2Data: GraphData | null;
}) {
  if (!node) return null;
  const nd      = (node as any).nebulaData as any;
  const ld      = nd?.letter_distribution ?? node.gradeDistribution ?? {};
  const dfw     = nd?.dfw_rate ?? node.dfwRate ?? 0.18;
  const reddit  = (node as any).redditSummary as string | undefined;
  const profRaw = (node as any).professorProfile as any;

  // Concept mastery across level2 nodes
  const conceptMastery = level2Data?.nodes
    .filter((n: GraphNode) => n.type === 'concept')
    .map((n: GraphNode) => getMastery(n.id)) ?? [];
  const avgConceptMastery = conceptMastery.length
    ? conceptMastery.reduce((a: number, b: number) => a + b, 0) / conceptMastery.length
    : 0;

  const aRate     = (ld['A'] ?? 0);
  const bRate     = (ld['B'] ?? 0);
  const passRate  = aRate + bRate + (ld['C'] ?? 0);
  const diffScore = 1 - dfw;

  // Grade bars (no DFW)
  const gradeOrder = ['A+','A','A-','B+','B','B-','C+','C','C-'];
  const detailedDist = nd?.detailed_distribution ?? {};
  const GRADE_COLORS: Record<string, string> = {
    'A+': '#4ade80', 'A': '#22c55e', 'A-': '#16a34a',
    'B+': '#60a5fa', 'B': '#3b82f6', 'B-': '#2563eb',
    'C+': '#fde68a', 'C': '#fbbf24', 'C-': '#d97706',
  };
  const maxPct = Math.max(0.01, ...gradeOrder.map((g) => detailedDist[g]?.pct ?? 0));

  return (
    <div className="course-info-panel">

      {/* ── Professor card ── */}
      {(profRaw || (node as any).professor) && (
        <div className="ci-professor-card">
          <div className="ci-prof-header">
            <div className="ci-prof-avatar">
              {((node as any).professor ?? profRaw?.name ?? 'P')[0].toUpperCase()}
            </div>
            <div className="ci-prof-meta">
              <p className="ci-prof-name">{(node as any).professor ?? profRaw?.name}</p>
              {profRaw && (
                <div className="ci-prof-meters">
                  <span className="ci-meter">
                    <span className="ci-meter-label">Difficulty</span>
                    <span className="ci-meter-bar">
                      <span className="ci-meter-fill" style={{ width: `${(profRaw.difficulty ?? 0.5) * 100}%`, background: profRaw.difficulty > 0.65 ? '#f87171' : profRaw.difficulty > 0.4 ? '#fbbf24' : '#4ade80' }}/>
                    </span>
                    <span className="ci-meter-val">{((profRaw.difficulty ?? 0.5) * 10).toFixed(1)}</span>
                  </span>
                  <span className="ci-meter">
                    <span className="ci-meter-label">Clarity</span>
                    <span className="ci-meter-bar">
                      <span className="ci-meter-fill" style={{ width: `${(profRaw.clarity ?? 0.7) * 100}%`, background: '#60a5fa' }}/>
                    </span>
                    <span className="ci-meter-val">{((profRaw.clarity ?? 0.7) * 10).toFixed(1)}</span>
                  </span>
                  <span className="ci-meter">
                    <span className="ci-meter-label">Workload</span>
                    <span className="ci-meter-bar">
                      <span className="ci-meter-fill" style={{ width: `${(profRaw.workload ?? 0.6) * 100}%`, background: '#a78bfa' }}/>
                    </span>
                    <span className="ci-meter-val">{((profRaw.workload ?? 0.6) * 10).toFixed(1)}</span>
                  </span>
                </div>
              )}
              {profRaw?.tags?.length > 0 && (
                <div className="ci-prof-tags">
                  {(profRaw.tags as string[]).slice(0, 4).map((t: string) => (
                    <span key={t} className="ci-prof-tag">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {profRaw?.teaching_style && (
            <p className="ci-prof-detail"><b>📖 Teaching:</b> {profRaw.teaching_style}</p>
          )}
          {profRaw?.exam_style && (
            <p className="ci-prof-detail"><b>📝 Exams:</b> {profRaw.exam_style}</p>
          )}
          {profRaw?.vibe && (
            <p className="ci-prof-detail"><b>✨ Vibe:</b> {profRaw.vibe}</p>
          )}
          {profRaw?.tips && (
            <div className="ci-prof-tips">💡 {profRaw.tips}</div>
          )}
        </div>
      )}

      {/* ── Grade Distribution (prominent, no DFW) ── */}
      <div className="ci-grade-section">
        <div className="ci-grade-header">
          <h4>Grade Distribution</h4>
          <div className="ci-grade-badges">
            {nd?.total_students && (
              <span className="ci-grade-meta">{nd.total_students.toLocaleString()} students · {nd.semesters} sems</span>
            )}
          </div>
        </div>
        <div className="grade-chart-bars ci-grade-bars">
          {gradeOrder.map((grade) => {
            const entry = detailedDist[grade];
            const pct   = entry?.pct ?? 0;
            if (pct < 0.005) return null;
            const barH = (pct / maxPct) * 80;
            const col  = GRADE_COLORS[grade] ?? '#6b7280';
            return (
              <div key={grade} className="grade-bar-col"
                title={`${grade}: ${(pct * 100).toFixed(1)}%`}>
                <span className="grade-pct" style={{ color: col }}>{(pct * 100).toFixed(0)}%</span>
                <div className="grade-bar" style={{ height: barH, background: col }}/>
                <span className="grade-label" style={{ color: col, fontSize: 11, fontWeight: 700 }}>{grade}</span>
              </div>
            );
          })}
        </div>
        <div className="ci-grade-summary">
          <span style={{ color: '#4ade80' }}>✓ A rate {(aRate * 100).toFixed(0)}%</span>
          <span style={{ color: '#60a5fa' }}>B rate {(bRate * 100).toFixed(0)}%</span>
          <span style={{ color: '#fbbf24' }}>Pass {(passRate * 100).toFixed(0)}%</span>
          <span style={{ color: diffScore > 0.7 ? '#4ade80' : diffScore > 0.5 ? '#fbbf24' : '#f87171' }}>
            {diffScore > 0.75 ? '🟢 Approachable' : diffScore > 0.55 ? '🟡 Moderate' : '🔴 Challenging'}
          </span>
        </div>
      </div>

      {/* ── Prereq mastery ── */}
      {conceptMastery.length > 0 && (
        <div className="course-detail-card">
          <span className="detail-icon">🎯</span>
          <div>
            <p className="detail-label">Concept Mastery</p>
            <p className="detail-value" style={{ color: avgConceptMastery >= 0.7 ? '#4ade80' : avgConceptMastery >= 0.4 ? '#fbbf24' : '#f87171' }}>
              {(avgConceptMastery * 100).toFixed(0)}% avg across {conceptMastery.length} topics
            </p>
          </div>
        </div>
      )}

      {/* ── Syllabus Overview & Weights ── */}
      {(() => {
        const weights = (node as any).syllabusWeights as Array<{ component: string; weight: number; description: string }> | undefined;
        const overview = (node as any).syllabusOverview as string | undefined;
        if (!weights?.length && !overview) return null;
        return (
          <div className="ci-syllabus-section">
            <h4 className="ci-section-title">📋 Syllabus</h4>
            {overview && <p className="ci-syllabus-overview">{overview}</p>}
            {weights && weights.length > 0 && (
              <div className="ci-syllabus-weights">
                {weights.map((w, i) => (
                  <div key={i} className="ci-weight-row">
                    <div className="ci-weight-header">
                      <span className="ci-weight-name">{w.component}</span>
                      <span className="ci-weight-pct">{w.weight}%</span>
                    </div>
                    <div className="ci-weight-bar-bg">
                      <div className="ci-weight-bar-fill" style={{ width: `${w.weight}%` }}/>
                    </div>
                    <p className="ci-weight-desc">{w.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Reddit summary ── */}
      {reddit && (
        <div className="course-reddit-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span>💬</span><h4 style={{ margin: 0 }}>Student Insights</h4>
          </div>
          <p className="ndp-hint" style={{ lineHeight: 1.6 }}>{reddit}</p>
        </div>
      )}
    </div>
  );
}

// ── 3D Orbital canvas ────────────────────────────────────────────────────────
// ── Nemotron Visual-Explanation Panel ────────────────────────────────────────
function NemotronPanel({ nodeName, nodeDescription }: { nodeName: string; nodeDescription?: string }) {
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{
    explanation: string;
    key_points: string[];
    visualization_description: string;
    analogy: string;
    common_mistakes: string[];
  } | null>(null);
  const [error, setError]     = useState('');
  const [showScene, setShowScene] = useState(false);

  const handleGenerate = async () => {
    const q = input.trim() || `Explain ${nodeName} visually`;
    setLoading(true); setError(''); setShowScene(false);
    try {
      const res = await callNemotron({ prompt: q, context: nodeDescription });
      if (res.success) { setResult(res.data); }
      else { setError(res.error ?? 'Unknown error'); setResult(res.data); }
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally { setLoading(false); }
  };

  return (
    <div className="nemotron-panel">
      {/* Three.js scene popup */}
      {showScene && (
        <ThreeScenePopup
          nodeName={nodeName}
          description={nodeDescription}
          vizDescription={result?.visualization_description}
          onClose={() => setShowScene(false)}
        />
      )}

      <div className="nemotron-header">
        <span className="nemotron-badge">⚡ Nemotron Nano</span>
        <p className="nemotron-sub">Ask anything about <strong>{nodeName}</strong> — get an AI explanation + 3D scene</p>
      </div>
      <div className="nemotron-input-row">
        <input
          className="nemotron-input"
          placeholder={`e.g. "How does ${nodeName} work?"`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleGenerate()}
        />
        <button className="nemotron-go-btn" onClick={handleGenerate} disabled={loading}>
          {loading ? '…' : '→'}
        </button>
      </div>

      {/* Always-visible 3D scene button */}
      <button
        className="nem-scene-btn"
        onClick={() => setShowScene(true)}
        title="Open Three.js visualization"
      >
        🎲 View 3D Scene
      </button>

      {loading && (
        <div className="ndp-empty" style={{ padding: '1.5rem 0' }}>
          <div className="processing-orb" style={{ width: 36, height: 36 }}/>
          <p style={{ fontSize: '0.8rem' }}>Nemotron is thinking…</p>
        </div>
      )}
      {error && !loading && (
        <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.5rem' }}>⚠ {error}</p>
      )}
      {result && !loading && (
        <div className="nemotron-result">
          {result.explanation && (
            <div className="nem-section">
              <h4 className="nem-label">📖 Explanation</h4>
              <p className="nem-text">{result.explanation}</p>
            </div>
          )}
          {result.analogy && (
            <div className="nem-section nem-analogy">
              <h4 className="nem-label">💡 Analogy</h4>
              <p className="nem-text">{result.analogy}</p>
            </div>
          )}
          {result.visualization_description && (
            <div className="nem-section nem-viz">
              <h4 className="nem-label">🎨 What the 3D scene shows</h4>
              <p className="nem-text">{result.visualization_description}</p>
              <button className="nem-scene-btn" style={{ marginTop: '0.5rem' }} onClick={() => setShowScene(true)}>
                🎲 Open 3D Scene
              </button>
            </div>
          )}
          {result.key_points.length > 0 && (
            <div className="nem-section">
              <h4 className="nem-label">✦ Key Points</h4>
              <ul className="nem-list">
                {result.key_points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          {result.common_mistakes.length > 0 && (
            <div className="nem-section nem-mistakes">
              <h4 className="nem-label">⚠ Common Mistakes</h4>
              <ul className="nem-list">
                {result.common_mistakes.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      {!result && !loading && (
        <p className="nem-hint">Ask a question for an AI explanation, or click "View 3D Scene" for an instant visualization.</p>
      )}
    </div>
  );
}

// ── Diagram SVG ──────────────────────────────────────────────────────────────
function DiagramView({ content }: { content: Record<string, unknown> }) {
  if (!content?.nodes) return (
    <div className="ndp-empty">
      <p>No diagram yet.</p>
      <p className="ndp-hint">Click "Generate Diagram" in the top bar.</p>
    </div>
  );
  const nodes = content.nodes as Array<{ id: string; label: string }>;
  const edges = (content.edges ?? []) as Array<{ source: string; target: string; label: string }>;
  const gap = 110, startX = 20, startY = 40;
  return (
    <div className="ndp-diagram-wrap">
      <p className="ndp-diagram-title">{content.title as string ?? 'Concept Diagram'}</p>
      <svg viewBox={`0 0 ${nodes.length * gap + 60} 220`} style={{ width: '100%' }}>
        <defs>
          <marker id="arr2" viewBox="0 0 10 10" refX={5} refY={5} markerWidth={4} markerHeight={4} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(96,165,250,0.7)"/>
          </marker>
        </defs>
        {edges.map((e, i) => {
          const si = nodes.findIndex((n) => n.id === e.source);
          const ti = nodes.findIndex((n) => n.id === e.target);
          if (si < 0 || ti < 0) return null;
          return (
            <line key={i}
              x1={startX + si * gap + 45} y1={90}
              x2={startX + ti * gap + 45} y2={90}
              stroke="rgba(96,165,250,0.5)" strokeWidth={1.5} markerEnd="url(#arr2)"/>
          );
        })}
        {nodes.map((n, i) => (
          <g key={n.id}>
            <rect x={startX + i * gap} y={startY} width={85} height={32} rx={6}
              fill="rgba(96,165,250,0.1)" stroke="rgba(96,165,250,0.3)" strokeWidth={1}/>
            <text x={startX + i * gap + 42} y={startY + 20} fontSize={8.5} fill="#e8e8f0" textAnchor="middle">{n.label}</text>
          </g>
        ))}
      </svg>
      {content.description ? <p className="ndp-hint" style={{ marginTop: '0.5rem' }}>{String(content.description)}</p> : null}
    </div>
  );
}

// ── Answer Toast (top-center, correct OR wrong) ───────────────────────────────
function AnswerToast({
  visible, correct, delta, connectedCount, recommendations, nodeName,
}: {
  visible: boolean; correct: boolean;
  delta: number; connectedCount: number;
  recommendations: string; nodeName: string;
}) {
  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`answer-toast ${correct ? 'answer-toast-correct' : 'answer-toast-wrong'}`}
          initial={{ opacity: 0, y: -28, scale: 0.92 }}
          animate={{ opacity: 1, y: 0,   scale: 1 }}
          exit={{    opacity: 0, y: -28, scale: 0.92 }}
          transition={{ type: 'spring', damping: 20, stiffness: 320 }}
        >
          <div className="answer-toast-top">
            <span className="answer-toast-icon">{correct ? '✓' : '✗'}</span>
            <div>
              <p className="answer-toast-title">
                {correct
                  ? `+${(delta * 100).toFixed(1)}% Mastery · ${nodeName}`
                  : `Incorrect · ${nodeName}`}
              </p>
              {correct && connectedCount > 0 && (
                <p className="answer-toast-sub">
                  🔗 Light propagating to {connectedCount} connected topic{connectedCount !== 1 ? 's' : ''}
                </p>
              )}
              {!correct && (
                <p className="answer-toast-sub">Review the explanation below and try again</p>
              )}
            </div>
          </div>
          {recommendations && (
            <div className="answer-toast-recs">
              <p className="answer-toast-rec-label">🤖 Gemini Recommendation</p>
              <p className="answer-toast-rec-text">{recommendations}</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ── Session Complete Popup ───────────────────────────────────────────────────
interface SessionSummary {
  nodeName:          string;
  masteryBefore:     number;
  masteryAfter:      number;
  questionsAnswered: number;
  correctAnswers:    number;
  affectedCourses:   string[];
  prereqsAdded?:     string[];   // adaptive prereq node names injected into graph
  prereqExplanation?: string;    // Gemini's WHY the student is struggling
  prereqsPending?:   boolean;    // true when we triggered add but API hasn't returned yet (show heads-up anyway)
  wrongQuestions?:   string[];   // questions the student got wrong this session
}

function ParticleBurst() {
  // 30 particles bursting from center, pure CSS
  return (
    <div className="particle-burst" aria-hidden>
      {Array.from({ length: 30 }, (_, i) => (
        <span key={i} className="particle" style={{
          '--angle': `${(i / 30) * 360}deg`,
          '--dist':  `${80 + Math.random() * 120}px`,
          '--delay': `${Math.random() * 0.3}s`,
          '--size':  `${4 + Math.random() * 6}px`,
          '--hue':   `${100 + Math.random() * 140}`,
        } as React.CSSProperties}/>
      ))}
    </div>
  );
}

function SessionCompletePopup({ summary, onDismiss }: {
  summary: SessionSummary;
  onDismiss: () => void;
}) {
  const delta    = summary.masteryAfter - summary.masteryBefore;
  const improved = delta > 0.005;
  const accuracy = summary.questionsAnswered > 0
    ? summary.correctAnswers / summary.questionsAnswered : 0;

  // SVG arcs: show before (grey) then after (colour)
  const size = 120, r = 48, circ = 2 * Math.PI * r;
  const beforeDash = circ * Math.max(0, summary.masteryBefore);
  const afterDash  = circ * Math.max(0, summary.masteryAfter);
  const arcColor   = improved ? '#4ade80' : summary.masteryAfter >= 0.6 ? '#fbbf24' : '#f87171';

  return createPortal(
    <motion.div className="session-complete-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="session-complete-card"
        initial={{ scale: 0.5, y: 60, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', damping: 16, stiffness: 200 }}>

        {improved && <ParticleBurst />}

        {/* Header */}
        <div className="sc-header">
          <span className="sc-star">{improved ? '🌟' : '📚'}</span>
          <h2 className="sc-title">{improved ? 'Session Complete' : 'Keep Practising'}</h2>
        </div>

        {/* Mastery arc */}
        <div className="sc-arc-wrap">
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size/2} cy={size/2} r={r} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth={10}/>
            {/* Before arc (grey) */}
            <circle cx={size/2} cy={size/2} r={r} fill="none"
              stroke="rgba(255,255,255,0.18)" strokeWidth={10}
              strokeDasharray={`${beforeDash} ${circ}`} strokeLinecap="round"/>
            {/* After arc (colour) */}
            <circle cx={size/2} cy={size/2} r={r} fill="none"
              stroke={arcColor} strokeWidth={10}
              strokeDasharray={`${afterDash} ${circ}`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1.2s ease-out 0.3s' }}/>
          </svg>
          <div className="sc-arc-center">
            <p className="sc-arc-pct" style={{ color: arcColor }}>
              {(summary.masteryAfter * 100).toFixed(0)}%
            </p>
            <p className="sc-arc-label">mastery</p>
          </div>
        </div>

        {/* Node + delta */}
        <div className="sc-concept-name">{summary.nodeName}</div>
        <div className="sc-delta-row">
          <span className="sc-from" style={{ color: 'var(--muted)' }}>
            started {(summary.masteryBefore * 100).toFixed(0)}%
          </span>
          <span className="sc-arrow">→</span>
          <span className="sc-to" style={{ color: arcColor }}>
            now {(summary.masteryAfter * 100).toFixed(0)}%
          </span>
          {improved && (
            <span className="sc-gain">+{(delta * 100).toFixed(0)}%</span>
          )}
          {!improved && delta < -0.005 && (
            <span style={{ fontSize: '0.72rem', color: '#f87171' }}>
              {(delta * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="sc-bar-wrap">
          <div className="sc-bar-bg">
            <div className="sc-bar-before" style={{ width: `${summary.masteryBefore * 100}%` }}/>
            <motion.div className="sc-bar-fill"
              style={{ background: arcColor }}
              initial={{ width: `${summary.masteryBefore * 100}%` }}
              animate={{ width: `${summary.masteryAfter * 100}%` }}
              transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}/>
          </div>
        </div>

        {/* Stats row */}
        <div className="sc-stats-row">
          <div className="sc-stat">
            <p className="sc-stat-val">{summary.questionsAnswered}</p>
            <p className="sc-stat-lab">Questions</p>
          </div>
          <div className="sc-stat">
            <p className="sc-stat-val" style={{ color: '#4ade80' }}>{summary.correctAnswers}</p>
            <p className="sc-stat-lab">Correct</p>
          </div>
          <div className="sc-stat">
            <p className="sc-stat-val" style={{ color: accuracy >= 0.7 ? '#4ade80' : '#fbbf24' }}>
              {(accuracy * 100).toFixed(0)}%
            </p>
            <p className="sc-stat-lab">Accuracy</p>
          </div>
        </div>

        {/* Affected courses (only on improvement) */}
        {improved && summary.affectedCourses.length > 0 && (
          <div className="sc-courses">
            {summary.affectedCourses.slice(0, 3).map((c) => (
              <div key={c} className="sc-course-row">
                <span className="sc-course-icon">↑</span>
                <span className="sc-course-name">{c} readiness ↑</span>
              </div>
            ))}
            {summary.affectedCourses.length > 0 && (
              <div className="sc-unlocked">
                ✦ {summary.affectedCourses.length} course{summary.affectedCourses.length !== 1 ? 's' : ''} unlocked
              </div>
            )}
          </div>
        )}

        {/* WHY section — shown whenever there are wrong answers */}
        {(summary.wrongQuestions?.length ?? 0) > 0 && (
          <div className="sc-why-section">
            <p className="sc-why-title">📌 Questions you got wrong</p>
            {summary.wrongQuestions!.slice(0, 5).map((q, i) => (
              <div key={i} className="sc-wrong-q">
                <span className="sc-wrong-idx">{i + 1}</span>
                <span className="sc-wrong-text">{q}</span>
              </div>
            ))}
          </div>
        )}

        {/* Heads-up: we added prerequisite nodes this session */}
        {((summary.prereqsAdded?.length ?? 0) > 0 || summary.prereqsPending) && (
          <div className="sc-prereqs-heads-up">
            <p className="sc-prereqs-heads-up-title">Heads-up</p>
            <p className="sc-prereqs-heads-up-body">
              {summary.prereqsPending
                ? "We detected knowledge gaps and are adding prerequisite nodes to your graph. They'll appear on your map shortly — master those first, then return to this concept."
                : "We added prerequisite nodes to your graph so you can build the missing foundations. Master those first, then come back to this concept."}
            </p>
          </div>
        )}

        {/* Gemini gap explanation */}
        {summary.prereqExplanation && (
          <div className="sc-gap-explain">
            <p className="sc-gap-title">🧠 Why this is hard right now</p>
            <p className="sc-gap-body">{summary.prereqExplanation}</p>
          </div>
        )}

        {/* Adaptive prereq nodes added — list */}
        {(summary.prereqsAdded?.length ?? 0) > 0 && (
          <div className="sc-prereqs-added">
            <p className="sc-prereqs-title">⚡ Prerequisite nodes added</p>
            <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
              Master these first, then come back to <strong>{summary.nodeName}</strong>:
            </p>
            {summary.prereqsAdded!.map((n) => (
              <p key={n} className="sc-prereq-node">{n}</p>
            ))}
          </div>
        )}

        {/* Dismiss — no timer, just the button */}
        <div className="sc-dismiss-row">
          <button
            className={`sc-dismiss-btn${!improved ? ' warn' : ''}`}
            onClick={onDismiss}
          >
            {improved ? 'Continue exploring ✦' : 'Got it — keep going'}
          </button>
        </div>

      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── Ripple Explanation banner ─────────────────────────────────────────────────
function RippleBanner({ data, onClose }: {
  data: { ripple_headline: string; ripple_explanation: string; prereq_gap_message: string; next_action: string; encouragement: string };
  onClose: () => void;
}) {
  return (
    <motion.div className="ripple-banner"
      initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ type: 'spring', damping: 22, stiffness: 240 }}>
      <button className="ripple-banner-close" onClick={onClose}>✕</button>
      <div className="ripple-banner-glow" aria-hidden/>
      <p className="ripple-headline">{data.ripple_headline}</p>
      <p className="ripple-explanation">{data.ripple_explanation}</p>
      {data.prereq_gap_message && (
        <p className="ripple-gap">⚠️ {data.prereq_gap_message}</p>
      )}
      <p className="ripple-action">👉 {data.next_action}</p>
      <p className="ripple-encourage">{data.encouragement}</p>
    </motion.div>
  );
}

// ── Recommendations panel ────────────────────────────────────────────────────
/** Always return a working search URL instead of potentially dead direct links. */
function safeResUrl(r: { url?: string; title: string; type?: string }): string {
  const q = encodeURIComponent(r.title);
  if (r.type === 'youtube') return `https://www.youtube.com/results?search_query=${q}`;
  // For direct links that look like real URLs, still use a Google search so they never 404
  return `https://www.google.com/search?q=${q}`;
}

function RecommendationsPanel({ node, mastery, quizHistory, level2Data, getMastery, courseName }: {
  node: GraphNode | null;
  mastery: number;
  quizHistory: QuizAttempt[];
  level2Data: GraphData | null;
  getMastery: (id: string) => number;
  courseName: string;
}) {
  const [shortRes, setShortRes]   = useState<ResourceItem[]>([]);
  const [longRes, setLongRes]     = useState<ResourceItem[]>([]);
  const [practiceRes, setPracRes] = useState<ResourceItem[]>([]);
  const [practiceSuggestions, setPractice] = useState<string[]>([]);
  const [learningPath, setLearningPath] = useState('');
  const [quizFocus, setQuizFocus] = useState('');
  const [estHours, setEstHours]   = useState(0);
  const [loading, setLoading]     = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [resTab, setResTab]       = useState<'short' | 'long' | 'practice'>('short');

  // Weak areas from level2 mastery
  const weakAreas = (level2Data?.nodes ?? [])
    .filter((n: GraphNode) => n.type === 'concept' && getMastery(n.id) < 0.4)
    .map((n: GraphNode) => n.name)
    .slice(0, 5);

  // Mastery timeline from history
  const recentHistory = [...quizHistory].slice(-20);
  const correctCount  = recentHistory.filter((h) => h.correct).length;
  const accuracy      = recentHistory.length > 0 ? correctCount / recentHistory.length : 0;

  const loadRecs = async () => {
    if (!node || loading) return;
    setLoading(true);
    try {
      const res = await fetchResourceRecommendations({
        nodeName:        node.name,
        nodeDescription: node.description ?? '',
        courseName:      courseName || '',
        mastery,
        weakAreas,
      });
      setShortRes((res.short_resources ?? res.resources ?? []) as ResourceItem[]);
      setLongRes((res.long_resources ?? []) as ResourceItem[]);
      setPracRes((res.practice_resources ?? []) as ResourceItem[]);
      setPractice(res.practice_suggestions);
      setQuizFocus(res.adaptive_quiz_focus);
      setEstHours(res.estimated_hours);
      setLearningPath(res.learning_path ?? '');
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (node) { setLoaded(false); setShortRes([]); setLongRes([]); setPracRes([]); setPractice([]); setLearningPath(''); }
  }, [node?.id]);

  // Explainability: why this proficiency %
  const masteryExplanation = (() => {
    const parts: string[] = [];
    if (recentHistory.length > 0) {
      parts.push(`Based on ${recentHistory.length} quiz attempt${recentHistory.length !== 1 ? 's' : ''} (${(accuracy * 100).toFixed(0)}% correct) on this topic.`);
    } else {
      parts.push('No quiz attempts yet on this topic; value from your prior progress or course placement.');
    }
    if (weakAreas.length > 0) {
      parts.push(` Weaker in related areas: ${weakAreas.slice(0, 3).join(', ')} — improving these can raise overall mastery.`);
    } else if (level2Data?.nodes) {
      const strong = (level2Data.nodes as GraphNode[])
        .filter((n) => n.type === 'concept' && n.id !== node?.id && getMastery(n.id) >= 0.6)
        .map((n) => n.name)
        .slice(0, 2);
      if (strong.length > 0) {
        parts.push(` Strong in related topics (e.g. ${strong.join(', ')}) supports this estimate.`);
      }
    }
    return parts.join('');
  })();

  return (
    <div className="recs-panel">
      {/* Mastery snapshot */}
      <div className="recs-snapshot">
        <div className="recs-snap-item">
          <p className="recs-snap-val" style={{ color: mastery >= 0.7 ? '#4ade80' : mastery >= 0.4 ? '#fbbf24' : '#f87171' }}>
            {(mastery * 100).toFixed(0)}%
          </p>
          <p className="recs-snap-label">Current Mastery</p>
        </div>
        <div className="recs-snap-item">
          <p className="recs-snap-val" style={{ color: accuracy >= 0.7 ? '#4ade80' : accuracy >= 0.4 ? '#fbbf24' : '#f87171' }}>
            {recentHistory.length > 0 ? `${(accuracy * 100).toFixed(0)}%` : '—'}
          </p>
          <p className="recs-snap-label">Quiz Accuracy</p>
        </div>
        <div className="recs-snap-item">
          <p className="recs-snap-val" style={{ color: '#60a5fa' }}>{recentHistory.length}</p>
          <p className="recs-snap-label">Attempts</p>
        </div>
      </div>
      <div className="recs-mastery-explanation">
        <span className="recs-mastery-why-label">Why this %?</span>
        <span className="recs-mastery-why-text">{masteryExplanation}</span>
      </div>

      {/* Weak areas */}
      {weakAreas.length > 0 && (
        <div className="recs-weak-areas">
          <p className="recs-section-title">📚 Focus Areas</p>
          <div className="area-chips">
            {weakAreas.map((w) => <span key={w} className="area-chip weak-chip">{w}</span>)}
          </div>
        </div>
      )}

      {/* Load recommendations button */}
      {!loaded && (
        <button className="btn-primary recs-load-btn" onClick={loadRecs} disabled={loading}>
          {loading ? <><span className="spin" style={{display:'inline-block'}}>◌</span> Generating…</> : '✨ Get Personalised Resources'}
        </button>
      )}

      {/* Resource tabs: Short / Long / Practice */}
      {loaded && (
        <>
          {/* Learning path blurb */}
          {learningPath && (
            <div className="recs-learning-path">
              <span className="recs-lp-icon">🗺</span>
              <p>{learningPath}</p>
            </div>
          )}

          {/* Tab switcher */}
          <div className="recs-tab-row">
            {(['short', 'long', 'practice'] as const).map((t) => (
              <button key={t} className={`recs-tab-btn ${resTab === t ? 'active' : ''}`}
                onClick={() => setResTab(t)}>
                {t === 'short' ? '⚡ Quick' : t === 'long' ? '📚 Deep' : '🏋 Practice'}
              </button>
            ))}
          </div>

          {/* Resource cards */}
          {(() => {
            const list = resTab === 'short' ? shortRes : resTab === 'long' ? longRes : practiceRes;
            return list.length > 0 ? (
              <div className="recs-resource-cards">
                {list.map((r, i) => (
                  <a key={i} href={safeResUrl(r)} target="_blank" rel="noopener noreferrer"
                    className={`recs-res-card recs-res-${r.type}`}>
                    <div className="recs-res-header">
                      <span className="recs-res-icon">
                        {r.type === 'youtube' ? '▶' : r.type === 'practice' ? '🏋' : '📄'}
                      </span>
                      <div>
                        <p className="recs-res-title">{r.title}</p>
                        {r.duration && <p className="recs-res-duration">{r.duration}</p>}
                      </div>
                      <span className="recs-res-arrow">↗</span>
                    </div>
                    {r.reason && <p className="recs-res-reason">{r.reason}</p>}
                  </a>
                ))}
              </div>
            ) : (
              <p className="ndp-hint" style={{ textAlign: 'center', padding: '1rem' }}>
                No {resTab} resources yet.
              </p>
            );
          })()}

          {/* Practice suggestions */}
          {practiceSuggestions.length > 0 && (
            <div className="recs-practice">
              <p className="recs-section-title">💪 Practice Suggestions</p>
              {practiceSuggestions.map((s, i) => (
                <div key={i} className="recs-practice-item">
                  <span className="recs-practice-num">{i + 1}</span>
                  <p>{s}</p>
                </div>
              ))}
            </div>
          )}

          {/* Adaptive quiz focus */}
          {quizFocus && (
            <div className="recs-quiz-focus">
              <p className="recs-section-title">🧠 Next Quiz Focus</p>
              <div className="recs-focus-pill">{quizFocus}</div>
              {estHours > 0 && (
                <p className="ndp-hint" style={{ marginTop: '0.4rem' }}>
                  ~{estHours}h estimated to reach 80% mastery
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Reload */}
      {loaded && (
        <button className="btn-secondary" style={{ fontSize: '0.72rem', marginTop: '0.5rem' }}
          onClick={() => { setLoaded(false); loadRecs(); }}>
          ↺ Refresh Recommendations
        </button>
      )}
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ history, level2Data, getMastery, courseId }: {
  history: QuizAttempt[];
  level2Data: GraphData | null;
  getMastery: (id: string) => number;
  courseId?: string;   // when set, filter concept nodes to this course only
}) {
  const correct  = history.filter((h) => h.correct).length;
  const total    = history.length;
  const accuracy = total > 0 ? correct / total : 0;

  // Filter concept nodes to this course when rendering a course history panel
  const relevantNodes = (level2Data?.nodes ?? []).filter((n: GraphNode) =>
    n.type === 'concept' && (!courseId || n.courseId === courseId)
  );

  // Build radar axes from mastery of relevant concept nodes
  const conceptAxes: RadarAxis[] = relevantNodes
    .slice(0, 8)
    .map((n: GraphNode) => {
      const m = getMastery(n.id);
      return {
        label: n.name.length > 12 ? n.name.slice(0, 10) + '…' : n.name,
        value: m,
        color: m >= 0.7 ? '#4ade80' : m >= 0.4 ? '#fbbf24' : '#f87171',
      };
    });

  // Strong areas vs needs work
  const strong = conceptAxes.filter((a) => a.value >= 0.7).map((a) => a.label);
  const weak   = conceptAxes.filter((a) => a.value < 0.4).map((a) => a.label);

  return (
    <div className="history-panel">
      {/* Overview cards */}
      <div className="history-stats-row">
        <div className="history-stat-card">
          <p className="history-stat-value" style={{ color: '#60a5fa' }}>{total}</p>
          <p className="history-stat-label">Questions</p>
        </div>
        <div className="history-stat-card">
          <p className="history-stat-value" style={{ color: '#4ade80' }}>{correct}</p>
          <p className="history-stat-label">Correct</p>
        </div>
        <div className="history-stat-card">
          <p className="history-stat-value" style={{ color: accuracy >= 0.7 ? '#4ade80' : accuracy >= 0.4 ? '#fbbf24' : '#f87171' }}>
            {(accuracy * 100).toFixed(0)}%
          </p>
          <p className="history-stat-label">Accuracy</p>
        </div>
      </div>

      {/* Mastery radar across course topics */}
      {conceptAxes.length >= 3 && (
        <div className="history-radar-wrap">
          <h4>Topic Mastery Map</h4>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
            <RadarChart axes={conceptAxes} size={200}/>
          </div>
        </div>
      )}

      {/* Strong / weak areas */}
      {(strong.length > 0 || weak.length > 0) && (
        <div className="history-areas">
          {strong.length > 0 && (
            <div className="history-area-card strong">
              <p className="area-title">💪 Strong Areas</p>
              <div className="area-chips">
                {strong.map((s) => <span key={s} className="area-chip strong-chip">{s}</span>)}
              </div>
            </div>
          )}
          {weak.length > 0 && (
            <div className="history-area-card weak">
              <p className="area-title">📚 Needs Work</p>
              <div className="area-chips">
                {weak.map((s) => <span key={s} className="area-chip weak-chip">{s}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-concept mastery breakdown (shown for course panels when there's no direct quiz history) */}
      {courseId && relevantNodes.length > 0 && (
        <div className="history-concept-breakdown">
          <h4>Concept Progress</h4>
          {relevantNodes.slice(0, 12).map((n: GraphNode) => {
            const m = getMastery(n.id);
            const col = m >= 0.78 ? '#4ade80' : m >= 0.55 ? '#fbbf24' : m >= 0.3 ? '#fb923c' : '#f87171';
            return (
              <div key={n.id} className="history-concept-row">
                <span className="history-concept-name">{n.name}</span>
                <div className="history-concept-bar-wrap">
                  <div className="history-concept-bar" style={{ width: `${m * 100}%`, background: col }}/>
                </div>
                <span className="history-concept-pct" style={{ color: col }}>{(m * 100).toFixed(0)}%</span>
              </div>
            );
          })}
          {relevantNodes.length === 0 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Open this course's concept map to track per-concept mastery.
            </p>
          )}
        </div>
      )}

      {/* Past attempts */}
      {total > 0 ? (
        <div className="history-log">
          <h4>Quiz History</h4>
          <div className="history-attempts">
            {[...history].reverse().slice(0, 20).map((attempt, i) => (
              <div key={i} className={`history-attempt ${attempt.correct ? 'correct' : 'wrong'}`}>
                <span className={`attempt-icon ${attempt.correct ? 'correct' : 'wrong'}`}>
                  {attempt.correct ? '✓' : '✗'}
                </span>
                <div className="attempt-body">
                  <p className="attempt-q">{attempt.question.length > 80 ? attempt.question.slice(0, 80) + '…' : attempt.question}</p>
                  <div className="attempt-meta">
                    <span>{new Date(attempt.timestamp).toLocaleDateString()}</span>
                    <span style={{ color: '#60a5fa' }}>
                      {(attempt.mastery_before * 100).toFixed(0)}% → {(attempt.mastery_after * 100).toFixed(0)}%
                    </span>
                    <span style={{ color: '#9ca3af' }}>diff {(attempt.difficulty * 10).toFixed(0)}/10</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        !courseId && (
          <div className="ndp-empty">
            <p>No quiz history yet.</p>
            <p className="ndp-hint">Answer quiz questions to track your progress here.</p>
          </div>
        )
      )}
    </div>
  );
}

// ── Gamification ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_quiz',    label: '🎯 First Quiz',    xp: 50,  req: (xp: number) => xp >= 50   },
  { id: 'quiz_streak_3', label: '🔥 3-Quiz Streak', xp: 100, req: (xp: number) => xp >= 150  },
  { id: 'mastery_50',    label: '⚡ 50% Mastery',   xp: 200, req: (xp: number) => xp >= 200  },
  { id: 'mastery_80',    label: '🌟 80% Mastery',   xp: 500, req: (xp: number) => xp >= 500  },
  { id: 'note_taker',    label: '📝 Note Taker',    xp: 75,  req: (xp: number) => xp >= 275  },
] as const;

function xpToLevel(xp: number) { return Math.floor(Math.sqrt(xp / 50)) + 1; }
function xpToNextLevel(xp: number) {
  const lvl = xpToLevel(xp);
  return { current: xp - 50 * (lvl - 1) ** 2, total: 50 * lvl ** 2 - 50 * (lvl - 1) ** 2 };
}

// ── Main component ────────────────────────────────────────────────────────────
interface QuizQ { q: string; options: string[]; correct: number; difficulty?: number; explanation?: string }

export function NodeDetailPanel() {
  const {
    selectedNode, nodeDetailOpen, setNodeDetailOpen,
    getMastery, getMasteryParams, masteryParams, pendingMasteryUpdates, queueMasteryUpdate, flushMasteryUpdates,
    setNodePanelOpen, nodeNotes, setNodeNotes, nodeXP, addNodeXP,
    level1Data, level2Data, level2CourseId, setLevel2Data, setMasteryPulse, addRippleBoostedNodeIds, clearRippleBoostedNodeId,
  } = useStore();

  const isCourse = selectedNode?.type === 'course';

  const [activeTab, setActiveTab]   = useState<'notes' | 'quiz' | 'info' | 'history' | 'recs' | 'diagram' | '3d'>('notes');
  const [quiz, setQuiz]             = useState<QuizQ[] | null>(null);
  const [quizLoading, setQuizLoad]  = useState(false);
  const [currentQ, setCurrentQ]     = useState(0);
  const [quizResult, setQuizResult] = useState<'correct' | 'wrong' | null>(null);
  const [quizExplanation, setQuizExpl] = useState('');
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [diagram, setDiagram]       = useState<Record<string, unknown>>({});
  const [diagLoading, setDiagLoad]  = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [dbContent, setDbContent]   = useState<NodeContentData>({});
  const [quizHistory, setQuizHistory] = useState<QuizAttempt[]>([]);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Ref to avoid applying loaded content after user has switched to a different node/course
  const selectedNodeIdRef = useRef<string | null>(null);
  // Session tracking for Session Complete popup
  const masteryAtOpen   = useRef<number>(0);
  const lastMasteryRef  = useRef<number | null>(null);  // tracks most-recent post-answer mastery
  const questionsThisSession  = useRef(0);
  const correctThisSession    = useRef(0);
  // Adaptive graph: count consecutive wrong answers per node
  const consecutiveFailsRef  = useRef(0);
  const wrongQuestionsRef    = useRef<string[]>([]);
  // Store prereq Gemini result in state; ref is set in same tick as graph update so handleClose sees it even if user closes before state flushes
  const [prereqResult, setPrereqResult] = useState<{
    prereqNames: string[];
    explanation: string;
  } | null>(null);
  const lastPrereqsAddedRef = useRef<{ prereqNames: string[]; explanation: string } | null>(null);
  const prereqRequestedThisSessionRef = useRef(false);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);

  // Ripple explanation banner (Explainable AI)
  const [rippleData, setRippleData] = useState<{
    ripple_headline: string; ripple_explanation: string;
    prereq_gap_message: string; next_action: string; encouragement: string;
  } | null>(null);

  // Answer toast state
  const [toast, setToast] = useState<{
    correct: boolean; delta: number; connectedCount: number; recommendations: string;
  } | null>(null);

  // Prerequisite gap banner (shown after adaptive injection)
  const [prereqBanner, setPrereqBanner] = useState<{
    explanation: string; encouragement: string;
  } | null>(null);
  const [prereqLoading, setPrereqLoading] = useState(false);

  // Game modal
  const [showGame, setShowGame] = useState(false);

  const node    = selectedNode;
  const mastery = node ? getMastery(node.id) : 0;
  const notes   = node ? (nodeNotes[node.id] ?? '') : '';
  const xp      = node ? (nodeXP[node.id] ?? 0) : 0;
  const level   = xpToLevel(xp);
  const { current: xpCurrent, total: xpTotal } = xpToNextLevel(xp);
  const unlockedAchievements = ACHIEVEMENTS.filter((a) => a.req(xp));

  /** Forward (prereq → downstream): nodes this one is a prerequisite for. Correct answer = you might be good at what depends on this. */
  const getRippleTargetsForward = useCallback((sourceId: string): Array<{ id: string; distance: number }> => {
    if (!level2Data) return [];
    const forward = new Map<string, string[]>();
    for (const l of level2Data.links) {
      if (l.type !== 'hard') continue;
      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (!forward.has(s)) forward.set(s, []);
      forward.get(s)!.push(t);
    }
    const out: Array<{ id: string; distance: number }> = [];
    const seen = new Set<string>([sourceId]);
    const queue: Array<{ id: string; d: number }> = [{ id: sourceId, d: 0 }];
    while (queue.length > 0) {
      const { id: cur, d } = queue.shift()!;
      for (const next of forward.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        out.push({ id: next, distance: d + 1 });
        queue.push({ id: next, d: d + 1 });
      }
    }
    if (out.length === 0 && level2Data.nodes.length > 1) {
      for (const n of level2Data.nodes) {
        if (n.id !== sourceId) out.push({ id: n.id, distance: 1 });
      }
    }
    return out;
  }, [level2Data]);

  /** Backward (prereq gaps): nodes that are prerequisites of this one. Wrong answer = signal gaps in those. */
  const getRippleTargetsBackward = useCallback((sourceId: string): Array<{ id: string; distance: number }> => {
    if (!level2Data) return [];
    const backward = new Map<string, string[]>();
    for (const l of level2Data.links) {
      if (l.type !== 'hard') continue;
      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (!backward.has(t)) backward.set(t, []);
      backward.get(t)!.push(s);
    }
    const out: Array<{ id: string; distance: number }> = [];
    const seen = new Set<string>([sourceId]);
    const queue: Array<{ id: string; d: number }> = [{ id: sourceId, d: 0 }];
    while (queue.length > 0) {
      const { id: cur, d } = queue.shift()!;
      for (const next of backward.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        out.push({ id: next, distance: d + 1 });
        queue.push({ id: next, d: d + 1 });
      }
    }
    return out;
  }, [level2Data]);

  // Load saved DB content when panel opens — always clear per-node state when node changes so we never show another class/node's data
  useEffect(() => {
    if (!nodeDetailOpen || !node) return;
    selectedNodeIdRef.current = node.id;
    setActiveTab(isCourse ? 'info' : 'notes');
    setQuiz(null); setCurrentQ(0); setQuizResult(null); setQuizAnswered(false);
    setDiagram({}); setToast(null); setRippleData(null);
    setQuizHistory([]);
    setDbContent({});
    // Track mastery at session open
    masteryAtOpen.current     = getMastery(node.id);
    lastMasteryRef.current    = null;
    questionsThisSession.current  = 0;
    correctThisSession.current    = 0;
    consecutiveFailsRef.current = 0;
    wrongQuestionsRef.current   = [];
    setPrereqResult(null);
    lastPrereqsAddedRef.current = null;
    prereqRequestedThisSessionRef.current = false;
    const nodeId = node.id;
    getNodeContent(nodeId).then((data) => {
      if (selectedNodeIdRef.current !== nodeId) return;
      setDbContent(data);
      setQuiz((data.quiz_cache?.length ? data.quiz_cache : []) as QuizQ[]);
      setDiagram(data.diagram_cache && Object.keys(data.diagram_cache).length ? data.diagram_cache : {});
      setQuizHistory(data.quiz_history ?? []);
    }).catch(() => {
      if (selectedNodeIdRef.current === nodeId) setQuizHistory([]);
    });
  }, [nodeDetailOpen, node?.id, isCourse]);

  const noteNotes = () => notesRef.current?.value ?? (node ? (nodeNotes[node.id] ?? '') : '');

  const handleClose = useCallback(() => {
    if (!node) {
      flushMasteryUpdates();
      setNodeDetailOpen(false);
      setNodePanelOpen(false);
      return;
    }
    // Save to DB
    saveNodeContent(node.id, {
      ...dbContent, notes: noteNotes(),
      xp: nodeXP[node.id] ?? 0,
      achievements: unlockedAchievements.map((a) => a.id),
      quiz_cache: quiz ?? [],
      quiz_history: quizHistory,
      diagram_cache: diagram,
    });

    flushMasteryUpdates();
    setNodeDetailOpen(false);
    setNodePanelOpen(false);

    // Build session summary — use tracked mastery to avoid stale-closure issues
    const masteryNow = lastMasteryRef.current ?? getMastery(node.id);
    if (questionsThisSession.current > 0 || Math.abs(masteryNow - masteryAtOpen.current) > 0.001) {
      // Find affected courses (level1 nodes connected to this concept's course)
      const affectedCourses: string[] = [];
      if (level2Data) {
        // This concept's mastery affects the parent course readiness
        // Pull connected concept IDs and find their course names
        const connIds = level2Data.links
          .filter((l) => {
            const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
            const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
            return s === node.id || t === node.id;
          })
          .flatMap((l) => {
            const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
            const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
            return [s, t];
          })
          .filter((id) => id !== node.id);
        connIds.forEach((id) => {
          const n = level2Data.nodes.find((x) => x.id === id);
          if (n?.name && !affectedCourses.includes(n.name)) affectedCourses.push(n.name);
        });
      }
      const prereqData = prereqResult ?? lastPrereqsAddedRef.current;
      setSessionSummary({
        nodeName:           node.name,
        masteryBefore:      masteryAtOpen.current,
        masteryAfter:       masteryNow,
        questionsAnswered:  questionsThisSession.current,
        correctAnswers:     correctThisSession.current,
        affectedCourses:    affectedCourses.slice(0, 4),
        prereqsAdded:       prereqData?.prereqNames,
        prereqExplanation:  prereqData?.explanation,
        prereqsPending:     prereqRequestedThisSessionRef.current && !prereqData,
        wrongQuestions:     wrongQuestionsRef.current.length > 0 ? [...wrongQuestionsRef.current] : undefined,
      });
    }
  }, [node, quiz, quizHistory, diagram, dbContent, nodeXP, unlockedAchievements,
      flushMasteryUpdates, setNodeDetailOpen, setNodePanelOpen, getMastery, level2Data, level2CourseId, prereqResult]);

  const handleSaveNotes = () => {
    if (!node) return;
    setNodeNotes(node.id, notesRef.current?.value ?? '');
    addNodeXP(node.id, 75);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  };

  const handleNextQuestion = () => {
    setQuizResult(null); setQuizExpl(''); setQuizAnswered(false);
    if (quiz && currentQ < quiz.length - 1) {
      setCurrentQ((q) => q + 1);
    } else {
      setQuiz(null); setCurrentQ(0);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!node) return;
    setQuizLoad(true); setActiveTab('quiz');
    setQuizResult(null); setQuizAnswered(false); setCurrentQ(0);
    // Build richer context so Gemini generates unique questions per concept
    const parentCourse = level1Data?.nodes.find(
      (n) => n.type === 'course' && (n.courseId === node.courseId || n.id === node.courseId)
    );
    const siblingNames = (level2Data?.nodes ?? [])
      .filter((n) => n.type === 'concept' && n.id !== node.id)
      .map((n) => n.name)
      .slice(0, 8)
      .join(', ');
    // Use whatever history we have (up to last 10) — works with 0, 1, 2, … 10 attempts
    const recent = (quizHistory ?? []).slice(-10);
    const recentCorrect = recent.filter((a) => a.correct).length;
    const recentAccuracy = recent.length > 0 ? recentCorrect / recent.length : 0.5;
    let consecutiveWrong = 0;
    for (let i = recent.length - 1; i >= 0 && !recent[i].correct; i--) consecutiveWrong += 1;
    try {
      const res = await generateNodeContent(node.id, 'Make quiz', {
        mastery,
        course_description: node.description ?? parentCourse?.description,
        course_name: parentCourse?.name,
        sibling_concepts: siblingNames || undefined,
        recent_accuracy: recent.length > 0 ? recentAccuracy : undefined,
        recent_attempt_count: recent.length,
        consecutive_wrong: consecutiveWrong > 0 ? consecutiveWrong : undefined,
      });
      if (res?.payload?.questions?.length) {
        setQuiz(res.payload.questions); setCurrentQ(0);
      } else throw new Error('no questions');
    } catch {
      const desc = node.description ?? node.name;
      setQuiz([
        { q: `What is the primary focus of "${node.name}"?`, options: [desc.slice(0,50)+'…','Advanced networking','Database indexes','Hardware assembly'], correct: 0, difficulty: 0.3, explanation: `"${node.name}" focuses on: ${desc.slice(0,100)}` },
        { q: `Which skill is most directly required to master "${node.name}"?`, options: ['Foundational domain understanding','Artistic design','Physical repair','Legal compliance'], correct: 0, difficulty: 0.5 },
        { q: `A learner who has mastered "${node.name}" best demonstrates it by:`, options: ['Applying concepts to new problems','Only memorising definitions','Avoiding related topics','Ignoring prerequisites'], correct: 0, difficulty: 0.7 },
      ]);
      setCurrentQ(0);
    } finally { setQuizLoad(false); }
  };

  const handleAnswer = async (correctIdx: number, chosenIdx: number, diff: number) => {
    if (!node) return;
    const success      = chosenIdx === correctIdx;
    const prevMastery  = getMastery(node.id);
    const questionText = quiz?.[currentQ]?.q ?? '';

    setQuizResult(success ? 'correct' : 'wrong');
    setQuizAnswered(true);
    setQuizExpl(quiz?.[currentQ]?.explanation ?? '');
    addNodeXP(node.id, success ? 50 : 0);  // wrong = 0 XP

    let newMastery = prevMastery;
    const { alpha: curAlpha, beta: curBeta } = getMasteryParams(node.id);
    try {
      const res = await bayesianUpdate(node.id, success, diff, curAlpha, curBeta);
      queueMasteryUpdate(node.id, res.alpha, res.beta);
      clearRippleBoostedNodeId(node.id);
      newMastery = res.mastery_probability;
    } catch {
      const { alpha, beta } = getMasteryParams(node.id);
      const prior = alpha + beta <= 0 ? initialBetaFromPrior(prevMastery) : { alpha, beta };
      const next = updateBeta(prior.alpha, prior.beta, success, diff);
      queueMasteryUpdate(node.id, next.alpha, next.beta);
      clearRippleBoostedNodeId(node.id);
      newMastery = next.alpha / (next.alpha + next.beta);
      persistMastery(node.id, next.alpha, next.beta).catch(() => {});
    }

    // Always track the most recent mastery value for the session summary
    lastMasteryRef.current = newMastery;

    const delta = newMastery - prevMastery;

    // ── Adaptive graph: 3 wrong in a row → AI automatically adds prerequisite nodes (you forgot something) ──
    if (!success) {
      consecutiveFailsRef.current += 1;
    } else {
      consecutiveFailsRef.current = 0;
    }
    if (
      consecutiveFailsRef.current >= 3 &&
      level2Data &&
      !level2Data.nodes.some(n => n.id === `prereq_${node.id}_1`) &&
      !prereqLoading
    ) {
      consecutiveFailsRef.current = 0; // reset before async to avoid double-inject
      prereqRequestedThisSessionRef.current = true;
      setPrereqLoading(true);
      fetchPrerequisites({
        conceptName:      node.name,
        mastery:          newMastery,
        consecutiveFails: 3,
        courseCode:       node.courseId,
        courseDescription: node.description,
      }).then((geminiResult) => {
        if (!level2Data) return;
        const prereqs = geminiResult.prereqs.slice(0, 3);
        const newNodes: GraphData['nodes'] = prereqs.map((p, i) => ({
          id:                `prereq_${node.id}_${i + 1}`,
          name:              p.name,
          type:              'concept' as const,
          courseId:          node.courseId ?? '',
          description:       p.description,
          isEstimatedConcept: true,
        }));
        // Chain: prereq[0] → prereq[1] → prereq[2] → failing node
        const newLinks: GraphData['links'] = [
          ...newNodes.slice(0, -1).map((n, i) => ({
            id: `${n.id}->${newNodes[i + 1].id}`, source: n.id, target: newNodes[i + 1].id, type: 'hard' as const,
          })),
          { id: `${newNodes[newNodes.length - 1].id}->${node.id}`, source: newNodes[newNodes.length - 1].id, target: node.id, type: 'hard' as const },
        ];
        const normLinks = level2Data.links.map(l => ({
          ...l,
          source: typeof l.source === 'string' ? l.source : (l.source as any).id,
          target: typeof l.target === 'string' ? l.target : (l.target as any).id,
        }));
        setLevel2Data(
          { nodes: [...level2Data.nodes, ...newNodes], links: [...normLinks, ...newLinks] },
          level2CourseId
        );
        const prereqNames = prereqs.map(p => p.name);
        const prereqPayload = { prereqNames, explanation: geminiResult.explanation };
        lastPrereqsAddedRef.current = prereqPayload;
        setPrereqResult(prereqPayload);
        setPrereqBanner({ explanation: geminiResult.explanation, encouragement: geminiResult.encouragement });
        setPrereqLoading(false);
      }).catch(() => {
        prereqRequestedThisSessionRef.current = false;
        setPrereqLoading(false);
      });
    }

    // Append to quiz history
    const attempt: QuizAttempt = {
      question:       questionText,
      correct:        success,
      timestamp:      new Date().toISOString(),
      mastery_before: prevMastery,
      mastery_after:  newMastery,
      difficulty:     diff,
    };
    setQuizHistory((prev) => [...prev, attempt]);

    // Track session stats
    questionsThisSession.current += 1;
    if (success) {
      correctThisSession.current += 1;
    } else {
      // Record the question text for the session-complete WHY summary
      const qText = questionText || quiz?.[currentQ]?.q || '';
      if (qText && !wrongQuestionsRef.current.includes(qText)) {
        wrongQuestionsRef.current = [...wrongQuestionsRef.current, qText].slice(-5);
      }
    }

    if (success) {
      const rippleTargets = getRippleTargetsForward(node.id);
      const allRippleIds = rippleTargets.map((t) => t.id);
      setMasteryPulse({ sourceId: node.id, connectedIds: allRippleIds, masteryDelta: delta });
      setTimeout(() => setMasteryPulse(null), 3200);

      // Propagation: ripple to related nodes; strength decays with distance. Ensure red nodes can turn yellow.
      if (rippleTargets.length > 0) {
        const RIPPLE_BASE = 0.5;    // stronger so one correct visibly pushes neighbors
        const RIPPLE_DECAY = 0.45;
        const MIN_GAIN = 0.01;
        const MAX_DISTANCE = 5;
        const YELLOW_FLOOR = 0.45;  // so red (0%) nodes jump into visible yellow after one ripple
        const effectiveDelta = Math.max(delta, 0.08);
        for (const { id: targetId, distance } of rippleTargets) {
          if (distance > MAX_DISTANCE) continue;
          let rippleGain = RIPPLE_BASE * Math.pow(RIPPLE_DECAY, distance - 1) * effectiveDelta;
          const { alpha, beta } = getMasteryParams(targetId);
          const total = alpha + beta;
          if (total <= 0) continue;
          const currentMastery = alpha / total;
          if (currentMastery < 0.4 && distance === 1) rippleGain = Math.max(rippleGain, YELLOW_FLOOR - currentMastery);
          if (rippleGain < MIN_GAIN) continue;
          const newMastery = Math.min(0.95, currentMastery + rippleGain);
          if (newMastery <= currentMastery) continue;
          const newAlpha = newMastery * total;
          const newBeta = (1 - newMastery) * total;
          queueMasteryUpdate(targetId, newAlpha, newBeta);
          persistMastery(targetId, newAlpha, newBeta).catch(() => {});
        }
        addRippleBoostedNodeIds(allRippleIds);
        flushMasteryUpdates();
      }

      const connectedTopics = allRippleIds
        .map((id) => level2Data?.nodes.find((n) => n.id === id)?.name ?? id)
        .filter(Boolean);

      setToast({ correct: true, delta, connectedCount: allRippleIds.length, recommendations: '' });

      // Mastery feedback
      fetchMasteryFeedback({
        nodeId: node.id, nodeName: node.name,
        success, prevMastery, newMastery, connectedTopics,
        questionText,
      }).then((fb) => {
        setToast((t) => t ? { ...t, recommendations: fb.recommendations } : null);
      }).catch(() => {});

      // Explainable AI — explain why ripple happened (includes both direct and related nodes)
      const connectedNodeObjs = allRippleIds
        .map((id) => {
          const n = level2Data?.nodes.find((x) => x.id === id);
          return n ? { id, name: n.name, mastery: getMastery(id) } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string; mastery: number }>;
      const prereqGaps = (level2Data?.nodes ?? [])
        .filter((n) => getMastery(n.id) < 0.4 && n.id !== node.id)
        .map((n) => n.name)
        .slice(0, 4);
      explainRipple({
        answeredNode:   node.name,
        masteryBefore:  prevMastery,
        masteryAfter:   newMastery,
        connectedNodes: connectedNodeObjs,
        prereqGaps,
      }).then((xai) => setRippleData(xai)).catch(() => {});

      setTimeout(() => setToast(null), 7000);
    } else if (!success) {
      setToast({ correct: false, delta: 0, connectedCount: 0, recommendations: '' });
      setTimeout(() => setToast(null), 4000);

      // Failure propagation: wrong answer ripples backward to prerequisites (prereq gaps)
      const rippleTargets = getRippleTargetsBackward(node.id);
      if (rippleTargets.length > 0) {
        const FAILURE_RIPPLE_BASE = 0.18;
        const FAILURE_DECAY = 0.4;
        const MAX_DISTANCE = 5;
        for (const { id: targetId, distance } of rippleTargets) {
          if (distance > MAX_DISTANCE) continue;
          const addBeta = FAILURE_RIPPLE_BASE * Math.pow(FAILURE_DECAY, distance - 1);
          if (addBeta < 0.01) continue;
          const { alpha, beta } = getMasteryParams(targetId);
          const newBeta = beta + addBeta;
          queueMasteryUpdate(targetId, alpha, newBeta);
          persistMastery(targetId, alpha, newBeta).catch(() => {});
        }
        flushMasteryUpdates();
      }
    }
    // No auto-advance — user clicks "Next Question" button
  };

  const handleGenerateDiagram = async () => {
    if (!node) return;
    setDiagLoad(true); setActiveTab('diagram');
    try {
      const res = await generateNodeContent(node.id, 'Generate diagram', { mastery, course_description: node.description });
      if (res?.payload) setDiagram(res.payload);
    } catch {
      setDiagram({ title: node.name, description: node.description ?? '', nodes: [{ id: 'n0', label: node.name }], edges: [] });
    } finally { setDiagLoad(false); }
  };

  if (!nodeDetailOpen || !node) {
    return createPortal(
      <AnimatePresence>
        {sessionSummary && (
          <SessionCompletePopup
            summary={sessionSummary}
            onDismiss={() => setSessionSummary(null)}
          />
        )}
      </AnimatePresence>,
      document.body
    );
  }

  // ── COURSE tabs (right sidebar) ──────────────────────────────────────────
  const COURSE_TABS = [
    { id: 'info'    as const, label: '📊 Info'    },
    { id: 'history' as const, label: '📈 History' },
    { id: 'recs'    as const, label: '🎯 Recs'    },
  ];

  // ── CONCEPT tabs (full-screen card) ──────────────────────────────────────
  const CONCEPT_TABS = [
    { id: 'notes'   as const, label: '📝 Notes'   },
    { id: 'quiz'    as const, label: '🧠 Quiz'    },
    { id: 'recs'    as const, label: '🎯 Recs'    },
    { id: 'history' as const, label: '📈 History' },
    { id: 'diagram' as const, label: '🗺 Diagram' },
    { id: '3d'      as const, label: '⚡ AI Viz'  },
  ];

  const TABS = isCourse ? COURSE_TABS : CONCEPT_TABS;

  // Mastery colors (concept nodes: use actual ML params, courses always show their color)
  const attempted = node.id in masteryParams || node.id in pendingMasteryUpdates;
  const displayMastery = attempted ? mastery : 0;
  const masteryColor = !attempted ? '#e8eaf6' : mastery >= 0.7 ? '#4ade80' : mastery >= 0.4 ? '#fbbf24' : '#f87171';
  const masteryLabel = !attempted ? 'Not Started' : mastery >= 0.8 ? 'Expert' : mastery >= 0.5 ? 'Proficient' : 'Learning';

  // ── Shared tab content renderer ────────────────────────────────────────────
  const tabContent = (
    <AnimatePresence mode="wait">

      {/* Course Info */}
      {activeTab === 'info' && isCourse && (
        <motion.div key="info" className="ndp-tab-pane"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <CourseInfoPanel node={node} getMastery={getMastery} level2Data={level2Data}/>
        </motion.div>
      )}

      {/* Notes */}
      {activeTab === 'notes' && !isCourse && (
        <motion.div key="notes" className="ndp-tab-pane"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {node.description && (
            <div className="ndp-description-card">
              <h4>About</h4><p>{node.description}</p>
            </div>
          )}
          {(node as any).resources?.length > 0 && (
            <div className="ndp-resources">
              <h4>📚 Resources</h4>
              {((node as any).resources as Array<{ type: string; title: string; url: string; description?: string }>).map((r, i) => (
                <a key={i} href={safeResUrl(r)} target="_blank" rel="noopener noreferrer" className="ndp-resource-card">
                  <span>{r.type === 'youtube' ? '▶' : '🌐'}</span>
                  <div>
                    <p className="ndp-resource-title">{r.title}</p>
                    {r.description && <p className="ndp-resource-desc">{r.description}</p>}
                  </div>
                </a>
              ))}
            </div>
          )}
          <div className="ndp-notes-editor">
            <h4>✏️ My Notes</h4>
            <textarea ref={notesRef} className="ndp-notes-textarea"
              defaultValue={notes} rows={7}
              placeholder="Write your notes here…"/>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              {notesSaved && <span style={{ color: '#4ade80', fontSize: '0.75rem', alignSelf: 'center' }}>✓ Saved</span>}
              <button className="btn-primary" style={{ fontSize: '0.75rem' }} onClick={handleSaveNotes}>Save +75 XP</button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quiz (concepts only) */}
      {activeTab === 'quiz' && !isCourse && (
        <motion.div key="quiz" className="ndp-tab-pane"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {quizLoading ? (
            <div className="ndp-empty">
              <div className="processing-orb" style={{ width: 40, height: 40 }}/>
              <p>Generating quiz…</p>
            </div>
          ) : !quiz ? (
            <div className="ndp-empty">
              <p style={{ color: 'var(--muted)' }}>No quiz yet.</p>
              <p className="ndp-quiz-ripple-hint">Correct answers raise mastery and ripple to related nodes on the map.</p>
              <button className="btn-primary" onClick={handleGenerateQuiz}>✨ Generate Quiz</button>
            </div>
          ) : (
            <div className="ndp-quiz">
              <p className="ndp-quiz-ripple-hint">Correct answers boost this node and ripple to related nodes.</p>
              <div className="quiz-progress">
                <span>Q {currentQ + 1}/{quiz.length}</span>
                <span className="quiz-diff">{'★'.repeat(Math.round((quiz[currentQ]?.difficulty ?? 0.5) * 3))}</span>
              </div>
              <p className="quiz-q">{quiz[currentQ]?.q}</p>
              <div className="quiz-options">
                {quiz[currentQ]?.options.map((opt, i) => (
                  <button key={i} type="button"
                    className={quizResult ? (i === quiz[currentQ].correct ? 'quiz-correct' : 'quiz-wrong-opt') : ''}
                    onClick={() => handleAnswer(quiz[currentQ].correct, i, quiz[currentQ].difficulty ?? 0.5)}
                    disabled={quizResult !== null}>
                    <span className="quiz-opt-letter">{String.fromCharCode(65+i)}</span> {opt}
                  </button>
                ))}
              </div>
              {quizAnswered && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`quiz-feedback ${quizResult}`}>
                  <span>{quizResult === 'correct' ? '✓ Correct! +50 XP' : '✗ Incorrect'}</span>
                  {prereqLoading && <p style={{ fontSize: '0.72rem', color: '#60a5fa', marginTop: '0.3rem' }}>⚡ Analysing knowledge gaps…</p>}
                  {quizExplanation && <p className="quiz-explanation">{quizExplanation}</p>}
                  <button
                    className={`quiz-next-btn ${quizResult === 'correct' ? 'correct' : 'wrong'}`}
                    onClick={handleNextQuestion}
                  >
                    {quiz && currentQ < quiz.length - 1 ? 'Next Question →' : 'Finish Quiz ✓'}
                  </button>
                </motion.div>
              )}
              {/* Prerequisite gap explanation banner */}
              <AnimatePresence>
                {prereqBanner && (
                  <motion.div className="prereq-gap-banner"
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="prereq-gap-header">
                      <span>⚡ Knowledge gap detected</span>
                      <button onClick={() => setPrereqBanner(null)} className="prereq-gap-close">✕</button>
                    </div>
                    <p className="prereq-gap-body">{prereqBanner.explanation}</p>
                    <p className="prereq-gap-enc">{prereqBanner.encouragement}</p>
                    <p className="prereq-gap-hint">Prerequisite nodes have been added to your learning graph →</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button className="btn-secondary" style={{ flex: 1, fontSize: '0.72rem' }}
                  onClick={handleGenerateQuiz}>↺ New Quiz</button>
                <button className="btn-game" onClick={() => setShowGame(true)}>🎮 Game Mode</button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Recs */}
      {activeTab === 'recs' && (
        <motion.div key="recs" className="ndp-tab-pane"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <RecommendationsPanel
            node={node} mastery={mastery} quizHistory={quizHistory}
            level2Data={level2Data} getMastery={getMastery}
            courseName={(() => {
              if (!node) return '';
              if (node.type === 'course') return node.name;
              if (!level1Data) return '';
              const parent = level1Data.nodes.find(
                (n) => n.type === 'course' && (n.courseId === node.courseId || n.id === node.courseId)
              );
              return parent?.name ?? '';
            })()}
          />
        </motion.div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <motion.div key="history" className="ndp-tab-pane"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <HistoryPanel
            history={quizHistory}
            level2Data={level2Data}
            getMastery={getMastery}
            courseId={isCourse ? node.courseId : undefined}
          />
        </motion.div>
      )}

      {/* Diagram (concepts only) */}
      {activeTab === 'diagram' && !isCourse && (
        <motion.div key="diagram" className="ndp-tab-pane"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {diagLoading ? (
            <div className="ndp-empty">
              <div className="processing-orb" style={{ width: 40, height: 40 }}/>
              <p>Generating diagram…</p>
            </div>
          ) : (
            <>
              <DiagramView content={diagram}/>
              <button className="btn-secondary" style={{ marginTop: '0.75rem', fontSize: '0.72rem' }}
                onClick={handleGenerateDiagram}>↺ Regenerate</button>
            </>
          )}
        </motion.div>
      )}

      {/* 3D / Nemotron visual explanation (concepts only) */}
      {activeTab === '3d' && !isCourse && (
        <motion.div key="3d" className="ndp-tab-pane"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <NemotronPanel nodeName={node.name} nodeDescription={node.description}/>
        </motion.div>
      )}

    </AnimatePresence>
  );

  // ── COURSE PANEL — right sidebar ──────────────────────────────────────────
  if (isCourse) {
    return createPortal(
      <>
        <AnimatePresence>
          {nodeDetailOpen && (
            <motion.div
              className="ndp-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            >
              {/* Top bar */}
              <div className="ndp-topbar">
                <div className="ndp-topbar-center">
                  <div>
                    <h2 className="ndp-title">{node.name}</h2>
                    {node.professor && (
                      <p className="ndp-subtitle" style={{ color: 'var(--muted)' }}>
                        👤 {node.professor}
                      </p>
                    )}
                  </div>
                </div>
                <div className="ndp-topbar-actions">
                  <button className="ndp-close-left" onClick={handleClose} title="Close">✕</button>
                </div>
              </div>
              {/* Tabs */}
              <div className="ndp-tabs">
                {TABS.map((t) => (
                  <button key={t.id}
                    className={`ndp-tab ${activeTab === t.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.id as typeof activeTab)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Content */}
              <div className="ndp-scroll-body">
                {tabContent}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>,
      document.body
    );
  }

  // ── CONCEPT PANEL — full-screen card ──────────────────────────────────────
  const panel = (
    <>
    {/* Blurred backdrop */}
    <motion.div
      className="ndp-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClose}
    />
    <motion.div
      className="ndp-panel ndp-fullscreen"
      initial={{ scale: 0.88, opacity: 0, y: 30 }}
      animate={{ scale: 1,    opacity: 1, y: 0  }}
      exit={{    scale: 0.88, opacity: 0, y: 30 }}
      transition={{ type: 'spring', damping: 24, stiffness: 220 }}
    >
      {/* Top bar */}
      <div className="ndp-topbar">
        <div className="ndp-topbar-center">
          <MasteryRing value={displayMastery} size={44} />
          <div>
            <h2 className="ndp-title">{node.name}</h2>
            <p className="ndp-subtitle" style={{ color: masteryColor }}>
              {attempted ? `${(mastery * 100).toFixed(0)}% · ` : ''}{masteryLabel}
            </p>
          </div>
        </div>
        <div className="ndp-topbar-actions">
          <button className="ndp-action-btn" onClick={handleGenerateQuiz} title="Generate Quiz">🧠 Quiz</button>
          <button className="ndp-action-btn" onClick={handleGenerateDiagram} title="Diagram">🗺 Diagram</button>
          <button className="ndp-action-btn" onClick={() => setActiveTab('3d')} title="AI Viz">⚡ AI Viz</button>
          <button className="ndp-done-btn" onClick={handleClose} title="Done">✓ Done</button>
        </div>
      </div>

      {/* Ripple Explanation Banner (Explainable AI) */}
      <AnimatePresence>
        {rippleData && (
          <RippleBanner data={rippleData} onClose={() => setRippleData(null)}/>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="ndp-tabs">
        {TABS.map((t) => (
          <button key={t.id}
            className={`ndp-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id as typeof activeTab)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content + Gamification */}
      <div className="ndp-scroll-body">
        {tabContent}

        {/* Gamification rail */}
        <div className="ndp-gamif">
          <div className="ndp-xp-card">
            <div className="ndp-level-badge">LVL {level}</div>
            <div className="ndp-xp-bar-wrap">
              <div className="ndp-xp-label"><span>XP</span><span>{xp}</span></div>
              <div className="ndp-xp-bar">
                <div className="ndp-xp-fill" style={{ width: `${Math.min(100,(xpCurrent/xpTotal)*100)}%` }}/>
              </div>
              <div className="ndp-xp-sub">{xpCurrent}/{xpTotal} to Lvl {level+1}</div>
            </div>
          </div>
          <div className="ndp-mastery-card">
            <h4>Mastery</h4>
            <div className="ndp-mastery-display">
              <MasteryRing value={displayMastery} size={56}/>
              <div>
                <p className="ndp-mastery-pct" style={{ color: masteryColor }}>{(displayMastery*100).toFixed(0)}%</p>
                <p className="ndp-mastery-label">{masteryLabel}</p>
              </div>
            </div>
          </div>
          <div className="ndp-achievements">
            <h4>Achievements</h4>
            {ACHIEVEMENTS.map((a) => {
              const unlocked = a.req(xp);
              return (
                <div key={a.id} className={`ndp-achievement ${unlocked?'unlocked':'locked'}`}>
                  <span>{a.label}</span>
                  {unlocked ? <span className="ach-unlocked">✓</span> : <span className="ach-xp">+{a.xp}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
    </>
  );

  return createPortal(
    <>
      <AnimatePresence>{nodeDetailOpen && panel}</AnimatePresence>
      {showGame && node && (
        <GameModal
          node={node}
          questions={quiz ?? []}
          onClose={(xpEarned) => {
            setShowGame(false);
            if (xpEarned > 0) addNodeXP(node.id, xpEarned);
          }}
        />
      )}
      <AnswerToast
        visible={toast !== null}
        correct={toast?.correct ?? true}
        delta={toast?.delta ?? 0}
        connectedCount={toast?.connectedCount ?? 0}
        recommendations={toast?.recommendations ?? ''}
        nodeName={node?.name ?? ''}
      />
      <AnimatePresence>
        {sessionSummary && (
          <SessionCompletePopup
            summary={sessionSummary}
            onDismiss={() => {
              setSessionSummary(null);
              // Trigger a final glow pulse on all visible nodes
              if (node) {
                const ids = level2Data?.nodes.map((n) => n.id) ?? [];
                setMasteryPulse({ sourceId: node.id, connectedIds: ids, masteryDelta: 0 });
                setTimeout(() => setMasteryPulse(null), 3500);
              }
            }}
          />
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
