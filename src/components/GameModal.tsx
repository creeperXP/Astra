/**
 * GameModal — infinite Three.js-backed quiz game.
 * Questions orbit as glowing spheres; click the right one for XP.
 * Generates new questions automatically when the pool runs out.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { generateNodeContent } from '../lib/api';
import type { GraphNode } from '../types/graph';

interface QuizQ {
  q: string;
  options: string[];
  correct: number;
  difficulty?: number;
  explanation?: string;
}

interface GameModalProps {
  node: GraphNode;
  questions: QuizQ[];
  onClose: (xpEarned: number) => void;
}

// ── Three.js star-field background ───────────────────────────────────────────
function useThreeBackground(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.z = 60;

    // Star field
    const starGeo = new THREE.BufferGeometry();
    const count   = 1200;
    const pos     = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 300;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat  = new THREE.PointsMaterial({ color: 0xc7d2fe, size: 0.35, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeo, starMat));

    // Floating answer orbs (4 positions at cardinal points)
    const orbColors = [0xa78bfa, 0x60a5fa, 0x34d399, 0xfb923c];
    const orbs: THREE.Mesh[] = orbColors.map((c, i) => {
      const mat  = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.3 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.8, 20, 20), mat);
      const angle = (i / 4) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 22, Math.sin(angle) * 12, 0);
      scene.add(mesh);
      return mesh;
    });

    scene.add(new THREE.AmbientLight(0x334466, 4));
    const dl = new THREE.DirectionalLight(0x8899ff, 2);
    dl.position.set(20, 40, 20);
    scene.add(dl);

    let t = 0;
    let raf: number;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.006;
      orbs.forEach((orb, i) => {
        const base  = (i / 4) * Math.PI * 2;
        const angle = base + t * 0.35;
        orb.position.x = Math.cos(angle) * 22;
        orb.position.y = Math.sin(angle) * 12 + Math.sin(t * 1.5 + i) * 1.2;
        orb.rotation.y += 0.015;
        const mat = orb.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.35 + 0.2 * Math.abs(Math.sin(t * 2 + i));
      });
      camera.position.x = Math.sin(t * 0.08) * 4;
      camera.position.y = Math.cos(t * 0.06) * 2;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [canvasRef]);
}

// ── Main component ────────────────────────────────────────────────────────────
export function GameModal({ node, questions: initialQs, onClose }: GameModalProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [qs, setQs]  = useState<QuizQ[]>(initialQs.length ? initialQs : []);
  const [qIdx, setQIdx]        = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [xp, setXp]             = useState(0);
  const [streak, setStreak]     = useState(0);
  const [shake, setShake]       = useState(false);
  const [xpPop, setXpPop]       = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useThreeBackground(canvasRef);

  // Auto-generate more questions when pool nears end
  useEffect(() => {
    if (qs.length === 0 || (qIdx >= qs.length - 1 && !loadingMore)) {
      setLoadingMore(true);
      generateNodeContent(node.id, 'Make quiz', { mastery: 0.5, course_description: node.description })
        .then((res) => {
          if (res?.payload?.questions?.length) {
            setQs((prev) => [...prev, ...(res.payload.questions as QuizQ[])]);
          } else {
            // Generic fallback questions
            setQs((prev) => [...prev, {
              q: `Which statement best describes "${node.name}"?`,
              options: [`A core concept involving ${node.name}`, 'Database indexing', 'Network protocols', 'Memory allocation'],
              correct: 0, difficulty: 0.4,
            }]);
          }
        })
        .catch(() => {
          setQs((prev) => [...prev, {
            q: `"${node.name}" is best characterized as:`,
            options: [`A fundamental concept in its domain`, 'A hardware component', 'A legal framework', 'A visual design pattern'],
            correct: 0, difficulty: 0.3,
          }]);
        })
        .finally(() => setLoadingMore(false));
    }
  }, [qIdx, qs.length, node, loadingMore]);

  const q = qs[qIdx];

  const handleAnswer = useCallback((optIdx: number) => {
    if (answered !== null || !q) return;
    setAnswered(optIdx);
    const correct = optIdx === q.correct;

    if (correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      const multiplier = newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1;
      const gained = 50 * multiplier;
      setXp((x) => x + gained);
      setXpPop(`+${gained} XP${multiplier > 1 ? ` 🔥×${multiplier}` : ''}`);
      setTimeout(() => {
        setAnswered(null);
        setQIdx((i) => i + 1);
        setXpPop(null);
      }, 1100);
    } else {
      setStreak(0);
      const lost = 50;
      setXp((x) => Math.max(0, x - lost));
      setXpPop(`−${lost} XP`);
      setShake(true);
      setTimeout(() => { setShake(false); setAnswered(null); setQIdx((i) => i + 1); setXpPop(null); }, 950);
    }
  }, [answered, q, streak]);

  // Keyboard 1-4
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx <= 3) handleAnswer(idx);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAnswer]);

  const optColors = ['#a78bfa', '#60a5fa', '#34d399', '#fb923c'];

  return createPortal(
    <div className="game-modal-overlay">
      {/* Three.js background */}
      <canvas ref={canvasRef} className="game-bg-canvas"/>

      {/* HUD */}
      <div className="game-hud">
        <button className="game-close-btn" onClick={() => onClose(xp)}>✕ Exit</button>
        <div className="game-stats">
          <span className="game-xp">⚡ {xp} XP</span>
          {streak >= 2 && (
            <motion.span className="game-streak"
              key={streak} initial={{ scale: 0.7 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}>
              🔥 {streak}× streak
            </motion.span>
          )}
        </div>
        <div className="game-topic">{node.name}</div>
      </div>

      {/* Question card */}
      <div className="game-stage">
        {!q ? (
          <div className="game-loading">
            <div className="processing-orb" style={{ width: 48, height: 48 }}/>
            <p>Generating questions…</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={qIdx}
              className={`game-question-card${shake ? ' shake' : ''}`}
              initial={{ scale: 0.82, opacity: 0, y: 28 }}
              animate={{ scale: 1,    opacity: 1, y: 0  }}
              exit={{ scale: 0.82,    opacity: 0, y: -28 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            >
              <p className="game-q-num">Q {qIdx + 1} · {node.name}</p>
              <p className="game-q-text">{q.q}</p>

              <div className="game-options">
                {q.options.map((opt, i) => {
                  let cls = 'game-option';
                  if (answered !== null) {
                    if (i === q.correct) cls += ' correct';
                    else if (i === answered) cls += ' wrong';
                    else cls += ' dim';
                  }
                  return (
                    <motion.button
                      key={i}
                      className={cls}
                      style={{ '--opt-color': optColors[i] } as React.CSSProperties}
                      whileHover={answered === null ? { scale: 1.02, y: -2 } : {}}
                      whileTap={answered === null  ? { scale: 0.97 } : {}}
                      onClick={() => handleAnswer(i)}
                      disabled={answered !== null}
                    >
                      <span className="game-opt-key">{i + 1}</span>
                      {opt}
                    </motion.button>
                  );
                })}
              </div>

              {answered !== null && answered === q.correct && q.explanation && (
                <motion.p className="game-explanation"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  💡 {q.explanation}
                </motion.p>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* XP pop */}
      <AnimatePresence>
        {xpPop && (
          <motion.div className="game-xp-pop"
            style={{ color: xpPop.startsWith('−') ? '#f87171' : '#fbbf24' }}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: 1, y: -70, scale: 1 }}
            exit={{ opacity: 0, y: -120 }}
            transition={{ duration: 0.55 }}>
            {xpPop}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard hint */}
      <p className="game-hint">Press 1 – 4 to answer</p>
    </div>,
    document.body
  );
}
