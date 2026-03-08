/**
 * Professional learning: uses your level/skills, background, and past learning (history)
 * to recommend next steps with reasons, key concepts, practice-oriented guidance,
 * a visual learning map (path), and external sources (e.g. YouTube snippets with timestamps).
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import {
  fetchNemotronFlowchart,
  fetchStepDetails,
  fetchClarify,
  fetchBranches,
  fetchPathQuestion,
  type StepDetailData,
  type StepSource,
} from '../lib/api';

function sourceUrl(src: StepSource): string {
  if (src.url && (src.url.startsWith('http://') || src.url.startsWith('https://'))) return src.url;
  const q = encodeURIComponent(src.title);
  if (src.type === 'youtube') return `https://www.youtube.com/results?search_query=${q}`;
  return `https://www.google.com/search?q=${q}`;
}

// ── Galactic background canvas ───────────────────────────────────────────────
function useProGalaxyCanvas(containerRef: React.RefObject<HTMLElement | null>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const stars: { x: number; y: number; r: number; alpha: number; phase: number }[] = [];
    const starCount = 600;
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + Math.random() * 1.2,
        alpha: 0.2 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    let raf: number;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.01;
      ctx.fillStyle = 'rgba(2, 4, 14, 0.4)';
      ctx.fillRect(0, 0, w, h);

      // Nebula blobs (blue/purple)
      const nebulas = [
        { x: w * 0.2, y: h * 0.2, r: 400, hue: 220 },
        { x: w * 0.8, y: h * 0.6, r: 350, hue: 260 },
        { x: w * 0.5, y: h * 0.85, r: 300, hue: 210 },
      ];
      nebulas.forEach((n, i) => {
        const pulse = 0.7 + 0.15 * Math.sin(t * 0.5 + i);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, `hsla(${n.hue}, 60%, 50%, ${0.06 * pulse})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });

      stars.forEach((s) => {
        const twinkle = s.alpha * (0.6 + 0.4 * Math.sin(t * 1.5 + s.phase));
        ctx.fillStyle = `rgba(200, 220, 255, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    animate();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [containerRef]);

  return canvasRef;
}

export function ProfessionalApp() {
  const { setAppMode } = useStore();
  const containerRef = useRef<HTMLElement>(null);
  const canvasRef = useProGalaxyCanvas(containerRef);

  const [work, setWork] = useState('');
  const [expertise, setExpertise] = useState('');
  const [topicsInput, setTopicsInput] = useState('');
  const [timeCrunch, setTimeCrunch] = useState('');
  const [pastExpertise, setPastExpertise] = useState('');
  const [gamePlanPrompt, setGamePlanPrompt] = useState('');
  const [flowSteps, setFlowSteps] = useState<Array<{ id: string; label: string; description: string }>>([]);
  const [stepDetails, setStepDetails] = useState<Record<string, StepDetailData>>({});
  const [flowLoading, setFlowLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; description: string } | null>(null);
  const [askPrompt, setAskPrompt] = useState('');
  const [askResult, setAskResult] = useState<string | null>(null);
  const [fetchingClarify, setFetchingClarify] = useState(false);
  const [suggestedSteps, setSuggestedSteps] = useState<Array<{ id: string; label: string; description: string }> | null>(null);
  const [suggestedType, setSuggestedType] = useState<'prerequisites' | 'follow_up' | null>(null);
  const [addingSuggested, setAddingSuggested] = useState(false);
  const [branchType, setBranchType] = useState<'prerequisites' | 'follow_up'>('prerequisites');
  const [fetchingBranches, setFetchingBranches] = useState(false);
  const [loadingStepCurrent, setLoadingStepCurrent] = useState(0);
  const [loadingStepTotal, setLoadingStepTotal] = useState(0);
  const [pathQuestion, setPathQuestion] = useState('');
  const [pathAnswer, setPathAnswer] = useState<string | null>(null);
  const [pathQuestionLoading, setPathQuestionLoading] = useState(false);

  type SavedPath = {
    id: string;
    name: string;
    savedAt: number;
    flowSteps: typeof flowSteps;
    stepDetails: Record<string, StepDetailData>;
    work?: string;
    expertise?: string;
    topicsInput?: string;
    timeCrunch?: string;
    pastExpertise?: string;
    gamePlanPrompt?: string;
  };
  const [savedPaths, setSavedPaths] = useState<SavedPath[]>(() => {
    try {
      const raw = localStorage.getItem('astra_saved_paths');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const saveCurrentPath = () => {
    if (flowSteps.length === 0) return;
    const name = window.prompt('Name this path', flowSteps.map((s) => s.label).slice(0, 3).join(' → ') || 'My path');
    if (!name?.trim()) return;
    const id = `path-${Date.now()}`;
    const entry: SavedPath = {
      id,
      name: name.trim(),
      savedAt: Date.now(),
      flowSteps: [...flowSteps],
      stepDetails: { ...stepDetails },
      work,
      expertise,
      topicsInput,
      timeCrunch,
      pastExpertise,
      gamePlanPrompt,
    };
    const next = [entry, ...savedPaths].slice(0, 50);
    setSavedPaths(next);
    localStorage.setItem('astra_saved_paths', JSON.stringify(next));
  };

  const loadPath = (path: SavedPath) => {
    setFlowSteps(path.flowSteps);
    setStepDetails(path.stepDetails);
    setSelectedNode(null);
    setWork(path.work ?? '');
    setExpertise(path.expertise ?? '');
    setTopicsInput(path.topicsInput ?? '');
    setTimeCrunch(path.timeCrunch ?? '');
    setPastExpertise(path.pastExpertise ?? '');
    setGamePlanPrompt(path.gamePlanPrompt ?? '');
  };

  const renameSavedPath = (path: SavedPath, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = window.prompt('Rename this save', path.name);
    if (newName == null || !newName.trim()) return;
    const next = savedPaths.map((p) => (p.id === path.id ? { ...p, name: newName.trim() } : p));
    setSavedPaths(next);
    localStorage.setItem('astra_saved_paths', JSON.stringify(next));
  };

  const deleteSavedPath = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = savedPaths.filter((p) => p.id !== id);
    setSavedPaths(next);
    localStorage.setItem('astra_saved_paths', JSON.stringify(next));
  };

  const topics = useMemo(
    () => topicsInput.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
    [topicsInput]
  );
  const projectContext = useMemo(() => {
    const parts: string[] = [];
    if (timeCrunch.trim()) parts.push(`Time available: ${timeCrunch.trim()}`);
    if (work.trim()) parts.push(`Work / role: ${work.trim()}`);
    if (gamePlanPrompt.trim()) parts.push(gamePlanPrompt.trim());
    if (pastExpertise.trim()) parts.push(`Past learning / background: ${pastExpertise.trim()}`);
    return parts.length ? parts.join('\n') : '';
  }, [gamePlanPrompt, work, timeCrunch, pastExpertise]);

  const generateFlow = async () => {
    if (!topics.length) return;
    setFlowLoading(true);
    setFlowSteps([]);
    setStepDetails({});
    setLoadingStepCurrent(0);
    setLoadingStepTotal(0);
    setGenerationStatus('Generating recommendations…');
    try {
      const contextParts: string[] = [];
      if (timeCrunch.trim()) contextParts.push(`Time available: ${timeCrunch.trim()}`);
      if (gamePlanPrompt.trim()) contextParts.push(gamePlanPrompt.trim());
      if (pastExpertise.trim()) contextParts.push(`Past learning / background: ${pastExpertise.trim()}`);
      const context = contextParts.join('\n') || undefined;
      const res = await fetchNemotronFlowchart({ topics, prompt: context });
      const steps = res.steps?.length ? res.steps : topics.map((t, i) => ({ id: `t-${i}`, label: t, description: `Learn and apply ${t}.` }));
      setLoadingStepTotal(steps.length);
      setGenerationStatus(`Loading step details… 1 of ${steps.length}`);
      const details: Record<string, StepDetailData> = {};
      for (let i = 0; i < steps.length; i++) {
        setLoadingStepCurrent(i + 1);
        setGenerationStatus(`Loading step details… ${i + 1} of ${steps.length}`);
        const step = steps[i];
        const detailRes = await fetchStepDetails({
          topic: step.label,
          description: step.description,
          project_context: projectContext,
        });
        if (detailRes.data) details[step.id] = detailRes.data;
      }
      const stepsWithDetails = steps.filter((s) => details[s.id]);
      setFlowSteps(stepsWithDetails);
      setStepDetails(details);
    } catch {
      const fallback = topics.map((t, i) => ({ id: `t-${i}`, label: t, description: `Learn and apply ${t}.` }));
      setFlowSteps(fallback);
      setStepDetails({});
    } finally {
      setFlowLoading(false);
      setGenerationStatus('');
      setLoadingStepCurrent(0);
      setLoadingStepTotal(0);
    }
  };

  const openNodePopup = (node: { id: string; label: string; description: string }) => {
    setSelectedNode(node);
    setAskPrompt('');
    setAskResult(null);
    setSuggestedSteps(null);
    setSuggestedType(null);
  };

  const handleAskClarification = async () => {
    if (!selectedNode || !askPrompt.trim()) return;
    setFetchingClarify(true);
    setAskResult(null);
    try {
      const res = await fetchClarify({
        step_id: selectedNode.id,
        step_label: selectedNode.label,
        prompt: askPrompt.trim(),
      });
      setAskResult(res.clarification?.trim() ? res.clarification : 'Got it. Ask something more specific if you’d like.');
    } finally {
      setFetchingClarify(false);
    }
  };

  const handleSuggestSteps = async () => {
    if (!selectedNode || !askPrompt.trim()) return;
    setFetchingBranches(true);
    setSuggestedSteps(null);
    setSuggestedType(null);
    try {
      const res = await fetchBranches({
        step_id: selectedNode.id,
        step_label: selectedNode.label,
        prompt: askPrompt.trim(),
        branch_type: branchType,
      });
      if (res.steps?.length) {
        setAskResult(null);
        setSuggestedSteps(res.steps);
        setSuggestedType(branchType);
      } else {
        setAskResult('No extra steps suggested for that. Try rephrasing or choose the other type (prerequisites vs follow-up).');
      }
    } finally {
      setFetchingBranches(false);
    }
  };

  const confirmAddSuggestedSteps = async () => {
    if (!selectedNode || !suggestedSteps?.length || !suggestedType) return;
    setAddingSuggested(true);
    try {
      const idx = flowSteps.findIndex((s) => s.id === selectedNode.id);
      if (idx === -1) return;
      const newSteps = suggestedSteps.map((s) => ({ ...s, id: `${s.id}-${Date.now()}` }));
      const next = [...flowSteps];
      if (suggestedType === 'prerequisites') {
        next.splice(idx, 0, ...newSteps);
      } else {
        next.splice(idx + 1, 0, ...newSteps);
      }
      setFlowSteps(next);
      setSuggestedSteps(null);
      setSuggestedType(null);
      for (const step of newSteps) {
        const detailRes = await fetchStepDetails({
          topic: step.label,
          description: step.description,
          project_context: projectContext,
        });
        if (detailRes.data) setStepDetails((d) => ({ ...d, [step.id]: detailRes.data }));
      }
    } finally {
      setAddingSuggested(false);
    }
  };

  const dismissSuggestedSteps = () => {
    setSuggestedSteps(null);
    setSuggestedType(null);
  };

  const handlePathQuestion = async () => {
    const q = pathQuestion.trim();
    if (!q || flowSteps.length === 0) return;
    setPathQuestionLoading(true);
    setPathAnswer(null);
    try {
      const pathSummary = flowSteps.map((s, i) => `${i + 1}. ${s.label}${s.description ? ` — ${s.description}` : ''}`).join('\n');
      const res = await fetchPathQuestion({
        path_summary: pathSummary,
        question: q,
        project_context: projectContext || undefined,
      });
      setPathAnswer(res.answer || 'No answer returned.');
    } catch {
      setPathAnswer('Something went wrong. Please try again.');
    } finally {
      setPathQuestionLoading(false);
    }
  };

  return (
    <main className="pro-app" ref={containerRef}>
      <canvas ref={canvasRef} className="pro-galaxy-canvas" aria-hidden />
      <div className="pro-app-overlay" />

      <header className="pro-header">
        <div className="pro-header-left">
          <h1 className="pro-logo">Astra</h1>
        </div>
        <button type="button" className="pro-logout" onClick={() => setAppMode(null)}>
          ← Back to login
        </button>
      </header>

      <div className="pro-main">
        <aside className="pro-sidebar">
          <section className="pro-form-section">
            <h3>Your level &amp; background</h3>
            <p className="pro-form-hint">Current skills and context for better recommendations.</p>
            <label>Work / role <input type="text" placeholder="e.g. Backend engineer" value={work} onChange={(e) => setWork(e.target.value)} /></label>
            <label>Expertise <textarea placeholder="Languages, tools…" value={expertise} onChange={(e) => setExpertise(e.target.value)} rows={2} /></label>
          </section>
          <section className="pro-form-section">
            <h3>Learning focus</h3>
            <label>Topics <input type="text" placeholder="e.g. ML, API design" value={topicsInput} onChange={(e) => setTopicsInput(e.target.value)} /></label>
            <label>Time available <input type="text" placeholder="e.g. 2 weeks" value={timeCrunch} onChange={(e) => setTimeCrunch(e.target.value)} /></label>
            <label>Past learning (history)</label>
            <textarea placeholder="Courses, experience — we use this like app usage history to tailor next steps" value={pastExpertise} onChange={(e) => setPastExpertise(e.target.value)} rows={2} />
          </section>
          <section className="pro-form-section">
            <h3>Goal / practice focus</h3>
            <label>
              <textarea placeholder="Project or goal, how you want to apply it (helps generate practice scenarios)" value={gamePlanPrompt} onChange={(e) => setGamePlanPrompt(e.target.value)} rows={3} />
            </label>
          </section>
          <button type="button" className="pro-btn-generate" onClick={generateFlow} disabled={!topics.length || flowLoading}>
            {flowLoading ? generationStatus || 'Generating…' : 'Get recommendations'}
          </button>
          {flowLoading && (
            <p className="pro-estimate">Building your learning map and step details with reasons and sources.</p>
          )}
        </aside>

        <section className="pro-center">
          <h3 className="pro-section-title">Learning map (Top-Down path)</h3>
          <div className="pro-flowchart">
            {flowLoading ? (
              <div className="pro-loading-block">
                <p className="pro-flow-loading">{generationStatus || 'Generating…'}</p>
                {loadingStepTotal > 0 && (
                  <div className="pro-loading-bar-wrap">
                    <div
                      className="pro-loading-bar-fill"
                      style={{ width: `${(loadingStepCurrent / loadingStepTotal) * 100}%` }}
                    />
                  </div>
                )}
                <p className="pro-estimate">Typically 45–90 seconds. Cards appear only when all descriptions are loaded.</p>
              </div>
            ) : flowSteps.length === 0 ? (
              <p className="pro-flow-empty">Add your level, topics, and past learning, then click “Get recommendations” to build a learning map with reasons and sources.</p>
            ) : (
              <>
                {flowSteps.map((node, i) => (
                  <motion.div key={node.id} className="pro-flow-node" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <button type="button" className="pro-flow-node-box" onClick={() => openNodePopup(node)}>
                      {node.label}
                    </button>
                    {i < flowSteps.length - 1 && <div className="pro-flow-edge" />}
                  </motion.div>
                ))}
                <div className="pro-path-question-block">
                  <h4 className="pro-path-question-title">Ask about your path</h4>
                  <p className="pro-path-question-hint">Ask a general question about the whole path—e.g. how it fits together, what to focus on first, or how long it might take.</p>
                  <textarea
                    className="pro-path-question-input"
                    placeholder="e.g. How do these steps fit together? What should I focus on first? Is this order right for my goal?"
                    value={pathQuestion}
                    onChange={(e) => setPathQuestion(e.target.value)}
                    rows={2}
                  />
                  <button type="button" className="pro-path-question-btn" onClick={handlePathQuestion} disabled={!pathQuestion.trim() || pathQuestionLoading}>
                    {pathQuestionLoading ? 'Asking…' : 'Ask'}
                  </button>
                  {pathAnswer !== null && (
                    <div className="pro-path-answer">
                      <p className="pro-path-answer-label">Answer</p>
                      <p className="pro-path-answer-text">{pathAnswer}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <aside className="pro-saved-paths">
          <h3>Saves</h3>
          <button type="button" className="pro-save-path-btn" onClick={saveCurrentPath} disabled={flowSteps.length === 0}>
            Save path with descriptions
          </button>
          {savedPaths.length === 0 ? (
            <p className="pro-saved-empty">No saves. Generate a path and click “Save path with descriptions” to load it later.</p>
          ) : (
            <ul className="pro-saved-list">
              {savedPaths.map((path) => (
                <li key={path.id} className="pro-saved-item">
                  <button type="button" className="pro-saved-load" onClick={() => loadPath(path)}>
                    {path.name}
                  </button>
                  <span className="pro-saved-meta">{new Date(path.savedAt).toLocaleDateString()}</span>
                  <button type="button" className="pro-saved-rename" onClick={(e) => renameSavedPath(path, e)} aria-label="Rename">✎</button>
                  <button type="button" className="pro-saved-delete" onClick={(e) => deleteSavedPath(path.id, e)} aria-label="Delete path">✕</button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <AnimatePresence>
        {selectedNode && (
          <motion.div
            className="pro-node-popup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setSelectedNode(null); setAskPrompt(''); setSuggestedSteps(null); }}
          >
            <motion.div className="pro-node-popup pro-node-popup-wide" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <div className="pro-node-popup-header">
                <h4>{selectedNode.label}</h4>
                <button type="button" className="pro-node-popup-close" onClick={() => { setSelectedNode(null); setAskPrompt(''); setSuggestedSteps(null); }}>✕</button>
              </div>
              {selectedNode.description && <p className="pro-node-popup-desc">{selectedNode.description}</p>}

              {stepDetails[selectedNode.id] ? (
                <>
                  <div className="pro-card-section">
                    <h5>Why this step (recommendation reason)</h5>
                    <p className="pro-node-popup-explanation">{stepDetails[selectedNode.id].explanation}</p>
                  </div>
                  {stepDetails[selectedNode.id].key_points.length > 0 && (
                    <div className="pro-card-section">
                      <h5>Key concepts</h5>
                      <ul className="pro-node-popup-points">
                        {stepDetails[selectedNode.id].key_points.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {stepDetails[selectedNode.id].practice_scenario && (
                    <div className="pro-card-section">
                      <h5>Practice scenario</h5>
                      <p className="pro-practice-scenario">{stepDetails[selectedNode.id].practice_scenario}</p>
                    </div>
                  )}
                  {stepDetails[selectedNode.id].visualization_description && (
                    <div className="pro-card-section">
                      <h5>How to picture it</h5>
                      <p className="pro-card-visual-desc">{stepDetails[selectedNode.id].visualization_description}</p>
                    </div>
                  )}
                  {stepDetails[selectedNode.id].analogy && (
                    <p className="pro-node-popup-analogy"><strong>Analogy:</strong> {stepDetails[selectedNode.id].analogy}</p>
                  )}
                  <div className="pro-card-section">
                    <h5>External sources (e.g. video snippets)</h5>
                    <p className="pro-sources-intro">Search links so you always get current results; pick a video or article. Timestamps shown when a specific moment is suggested.</p>
                    <div className="pro-sources-list">
                      {(stepDetails[selectedNode.id].sources || []).map((src: StepSource, i: number) => {
                        const url = sourceUrl(src);
                        return (
                          <div key={i} className="pro-source-row">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="pro-rec-link">
                              {src.type === 'youtube' ? '▶ ' : '📄 '}{src.title}
                            </a>
                            {src.timestamp && <span className="pro-source-timestamp">Start at {src.timestamp}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pro-card-section pro-branch-section">
                    <h5>Ask & suggest steps</h5>
                    <p className="pro-branch-hint">Ask a question for clarification, or ask for prerequisites / follow-up steps to add to your path (you confirm before adding).</p>
                    <textarea
                      className="pro-branch-input"
                      placeholder="e.g. What exactly do you mean by this? / I need prerequisites for this. / What should I do after this?"
                      value={askPrompt}
                      onChange={(e) => setAskPrompt(e.target.value)}
                      rows={2}
                    />
                    <div className="pro-branch-actions">
                      <button type="button" className="pro-branch-btn" onClick={handleAskClarification} disabled={!askPrompt.trim() || fetchingClarify}>
                        {fetchingClarify ? 'Asking…' : 'Ask'}
                      </button>
                      <select value={branchType} onChange={(e) => setBranchType(e.target.value as 'prerequisites' | 'follow_up')} className="pro-branch-select">
                        <option value="prerequisites">Prerequisites</option>
                        <option value="follow_up">Follow-up</option>
                      </select>
                      <button type="button" className="pro-branch-btn" onClick={handleSuggestSteps} disabled={!askPrompt.trim() || fetchingBranches}>
                        {fetchingBranches ? 'Suggesting…' : 'Suggest steps'}
                      </button>
                    </div>
                    {askResult !== null && (
                      <div className="pro-clarification-result">{askResult}</div>
                    )}
                    {suggestedSteps != null && suggestedSteps.length > 0 && suggestedType && (
                      <div className="pro-suggested-steps">
                        <p className="pro-suggested-title">Nemotron suggests adding these {suggestedType === 'prerequisites' ? 'prerequisites' : 'follow-up steps'}:</p>
                        <ul className="pro-suggested-list">
                          {suggestedSteps.map((s) => (
                            <li key={s.id}>{s.label}</li>
                          ))}
                        </ul>
                        <div className="pro-suggested-actions">
                          <button type="button" className="pro-branch-btn" onClick={confirmAddSuggestedSteps} disabled={addingSuggested}>
                            {addingSuggested ? 'Adding…' : 'Add to path'}
                          </button>
                          <button type="button" className="pro-branch-btn pro-branch-btn-secondary" onClick={dismissSuggestedSteps}>
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="pro-node-popup-loading">Card content is loading…</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
