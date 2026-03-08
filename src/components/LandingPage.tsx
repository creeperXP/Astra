/**
 * Full-screen galactic landing: starfield and nebula all around, central CTA.
 * Two login buttons (Student / Professional). No auth — hardcoded login.
 */
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';

const STAR_COUNT = 1200;
const NEBULA_PATCHES = 8;

function useGalaxyCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Stars distributed across entire screen (and a bit beyond)
    const stars: { x: number; y: number; r: number; alpha: number; twinkle: number; phase: number }[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * (w + 200) - 100,
        y: Math.random() * (h + 200) - 100,
        r: 0.3 + Math.random() * 1.4,
        alpha: 0.3 + Math.random() * 0.7,
        twinkle: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Nebula glow patches around the screen (not just center)
    const nebulas: { x: number; y: number; radius: number; hue: number; intensity: number }[] = [];
    for (let i = 0; i < NEBULA_PATCHES; i++) {
      nebulas.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: 120 + Math.random() * 220,
        hue: 200 + Math.random() * 40,
        intensity: 0.04 + Math.random() * 0.08,
      });
    }
    // Larger background nebulas — blues, purples, cyan only (no orange/red/yellow)
    nebulas.push({ x: w * 0.15, y: h * 0.25, radius: 320, hue: 210, intensity: 0.055 });
    nebulas.push({ x: w * 0.88, y: h * 0.35, radius: 280, hue: 260, intensity: 0.05 });
    nebulas.push({ x: w * 0.75, y: h * 0.78, radius: 260, hue: 240, intensity: 0.045 });
    nebulas.push({ x: w * 0.12, y: h * 0.7, radius: 240, hue: 200, intensity: 0.04 });
    nebulas.push({ x: w * 0.5, y: h * 0.92, radius: 300, hue: 250, intensity: 0.035 });

    // Planets: soft blue/purple orbs only
    const planets: { x: number; y: number; r: number; hue: number; alpha: number }[] = [];
    [[0.18, 0.22], [0.82, 0.18], [0.85, 0.72], [0.12, 0.78]].forEach(([px, py]) => {
      planets.push({
        x: w * px,
        y: h * py,
        r: 18 + Math.random() * 22,
        hue: 220 + Math.random() * 50,
        alpha: 0.18 + Math.random() * 0.12,
      });
    });

    let t = 0;
    let raf: number;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.012;

      // Clear with dark fade for trail effect
      ctx.fillStyle = 'rgba(2, 4, 18, 0.14)';
      ctx.fillRect(0, 0, w, h);

      // 1) Full-screen nebula glows
      nebulas.forEach((n, i) => {
        const pulse = 0.85 + 0.15 * Math.sin(t * 0.5 + i);
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
        grad.addColorStop(0, `hsla(${n.hue}, 70%, 60%, ${n.intensity * pulse})`);
        grad.addColorStop(0.5, `hsla(${n.hue}, 60%, 50%, ${n.intensity * 0.4 * pulse})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2);
      });

      // 2) Stars all over (no heavy cluster in center)
      stars.forEach((s) => {
        const twinkle = s.alpha * (0.7 + 0.3 * Math.sin(t * 2 + s.phase));
        ctx.fillStyle = `rgba(220, 230, 255, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3) Planets (soft orbs, not covering logo)
      planets.forEach((p, i) => {
        const pulse = 0.9 + 0.1 * Math.sin(t * 0.6 + i);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
        grad.addColorStop(0, `hsla(${p.hue}, 75%, 70%, ${p.alpha * pulse})`);
        grad.addColorStop(0.5, `hsla(${p.hue}, 60%, 55%, ${p.alpha * 0.5 * pulse})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    animate();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
}

export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setAppMode, setOnboardingComplete } = useStore();
  useGalaxyCanvas(canvasRef);

  const onStudent = () => {
    setOnboardingComplete(true);
    setAppMode('student');
  };

  const onProfessional = () => {
    setAppMode('professional');
  };

  return (
    <main className="landing-page">
      <canvas ref={canvasRef} className="landing-canvas" aria-hidden />
      <div className="landing-bg-overlay" />
      <div className="landing-content">
        <motion.div
          className="landing-brand"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="landing-icon" aria-hidden>◇</span>
          <motion.h1
            className="landing-title"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            Astra
          </motion.h1>
          <motion.p
            className="landing-tagline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            Learn, Explore, Visualize
          </motion.p>
          <span className="landing-icon landing-icon-r" aria-hidden>◇</span>
        </motion.div>

        <motion.div
          className="landing-actions"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.button
            type="button"
            className="landing-btn landing-btn-student"
            onClick={onStudent}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <span className="landing-btn-icon">🎓</span>
            <span className="landing-btn-label">Student</span>
            <span className="landing-btn-desc">Courses, concepts & mastery tracking</span>
          </motion.button>
          <motion.button
            type="button"
            className="landing-btn landing-btn-pro"
            onClick={onProfessional}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <span className="landing-btn-icon">💼</span>
            <span className="landing-btn-label">Professional</span>
            <span className="landing-btn-desc">Topics, time crunch & next-step recommendations</span>
          </motion.button>
        </motion.div>

      </div>
    </main>
  );
}
