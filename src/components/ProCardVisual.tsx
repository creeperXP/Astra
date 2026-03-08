/**
 * ProCardVisual — Featherless AI–generated Mermaid diagram for the topic, with Three.js fallback.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function hashToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function hueToHex(hue: number): number {
  const c = 0.7;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.25;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; } else if (hue < 120) { r = x; g = c; } else if (hue < 180) { g = c; b = x; } else if (hue < 240) { g = x; b = c; } else if (hue < 300) { r = x; b = c; } else { r = c; b = x; }
  return Math.floor((r + m) * 255) << 16 | Math.floor((g + m) * 255) << 8 | Math.floor((b + m) * 255);
}

interface ProCardVisualProps {
  topicLabel: string;
  vizDescription?: string;
  /** When provided, diagram is shown immediately (no fetch, no loading). */
  preloadedDiagramContent?: string | null;
  className?: string;
}

const DIAGRAM_HEIGHT = 340;
const DIAGRAM_MIN_HEIGHT = 280;

const visualContainerStyle: React.CSSProperties = {
  width: '100%',
  height: `${DIAGRAM_HEIGHT}px`,
  minHeight: `${DIAGRAM_MIN_HEIGHT}px`,
  borderRadius: '8px',
  overflow: 'hidden',
  background: 'rgba(10, 14, 26, 0.6)',
};

/** Topic diagram (Mermaid, preloaded) or Three.js fallback. No loading: uses only preloaded content. */
export function ProCardVisual({ topicLabel, vizDescription = '', preloadedDiagramContent = null, className }: ProCardVisualProps) {
  const [diagramError, setDiagramError] = useState(false);
  const mermaidIdRef = useRef(0);
  const hasDiagram = Boolean(preloadedDiagramContent?.trim()) && !diagramError;

  return (
    <div className={className} style={visualContainerStyle} aria-hidden>
      {hasDiagram ? (
        <MermaidDiagram
          content={preloadedDiagramContent!}
          idRef={mermaidIdRef}
          onError={() => setDiagramError(true)}
        />
      ) : (
        <ProCardThreeScene topicLabel={topicLabel} vizDescription={vizDescription} />
      )}
    </div>
  );
}

/** Renders Mermaid code into SVG inside the container. */
function MermaidDiagram({
  content,
  idRef,
  onError,
}: {
  content: string;
  idRef: React.MutableRefObject<number>;
  onError: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !content.trim()) return;
    const id = `pro-mermaid-${++idRef.current}-${Date.now()}`;
    let cancelled = false;
    import('mermaid').then((mermaidModule) => {
      if (cancelled || !wrap) return;
      const mermaid = mermaidModule.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: { useMaxWidth: true, htmlLabels: true },
      });
      mermaid
        .render(id, content)
        .then(({ svg }) => {
          if (cancelled || !wrap) return;
          wrap.innerHTML = '';
          const div = document.createElement('div');
          div.className = 'pro-mermaid-wrap';
          div.innerHTML = svg;
          div.style.width = '100%';
          div.style.height = '100%';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.justifyContent = 'center';
          div.style.padding = '8px';
          const svgEl = div.querySelector('svg');
          if (svgEl) {
            svgEl.setAttribute('width', '100%');
            svgEl.setAttribute('height', '100%');
            svgEl.style.maxHeight = '100%';
            svgEl.style.objectFit = 'contain';
          }
          wrap.appendChild(div);
        })
        .catch(() => {
          if (!cancelled) onError();
        });
    }).catch(() => {
      if (!cancelled) onError();
    });
    return () => {
      cancelled = true;
      wrap.innerHTML = '';
    };
  }, [content, idRef, onError]);

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', height: '100%', minHeight: `${DIAGRAM_MIN_HEIGHT}px`, borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}

/** Compact Three.js scene used when no diagram is available. */
function ProCardThreeScene({ topicLabel, vizDescription }: ProCardVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.borderRadius = '8px';
    container.appendChild(canvas);

    const width = container.clientWidth || 400;
    const height = Math.min(container.clientHeight || DIAGRAM_MIN_HEIGHT, DIAGRAM_HEIGHT);
    canvas.width = width;
    canvas.height = height;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x0a0e1a, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    const hue = hashToHue(topicLabel + vizDescription);
    const color = hueToHex(hue);
    const colorHex = new THREE.Color(color);

    scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const dir = new THREE.DirectionalLight(0x8899ff, 1);
    dir.position.set(2, 3, 4);
    scene.add(dir);
    scene.add(new THREE.PointLight(color, 1.5, 20));

    const orbGeo = new THREE.SphereGeometry(0.7, 24, 24);
    const orbMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.5,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    scene.add(orb);

    const particleCount = 80;
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = 1.8 + Math.random() * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    let raf: number;
    let t = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.012;
      orb.rotation.y = t * 0.3;
      orb.rotation.x = Math.sin(t * 0.2) * 0.15;
      (orbMat as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + 0.15 * Math.sin(t);
      particles.rotation.y = t * 0.08;
      particles.rotation.x = Math.sin(t * 0.1) * 0.05;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth || width;
      const h = Math.min(container.clientHeight || height, DIAGRAM_HEIGHT);
      if (w === 0 || h === 0) return;
      canvas.width = w;
      canvas.height = h;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      orbGeo.dispose();
      (orbMat as THREE.Material).dispose();
      pGeo.dispose();
      (pMat as THREE.Material).dispose();
      container.removeChild(canvas);
    };
  }, [topicLabel, vizDescription]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: `${DIAGRAM_MIN_HEIGHT}px`, borderRadius: '8px', overflow: 'hidden' }}
      aria-hidden
    />
  );
}
