import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';
import { useStore } from '../store/useStore';
import { loadLevel1Graph, loadLevel2Graph } from '../data/loadGraph';

const COURSE_PALETTE = [
  '#38bdf8', '#a78bfa', '#34d399', '#f472b6',
  '#fbbf24', '#818cf8', '#fb923c', '#4ade80',
];

function measureEl(el: HTMLElement | null) {
  if (!el) return { w: window.innerWidth, h: window.innerHeight };
  const r = el.getBoundingClientRect();
  return { w: Math.max(r.width, 200), h: Math.max(r.height, 200) };
}

// Deterministic hash for star placement
function hash(a: number, b: number, i: number): number {
  let s = ((a * 1664525 + b * 1013904223 + i * 22695477) >>> 0);
  s ^= s >>> 11; s = (s + (s << 3)) >>> 0;
  s ^= s >>> 4; s = Math.imul(s, 2246822519) >>> 0; s ^= s >>> 16;
  return (s >>> 0) / 4294967296;
}

function buildStarField(count = 2000, spread = 600): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const color     = new THREE.Color();
  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (hash(i, 1, 0) - 0.5) * spread * 2;
    positions[i * 3 + 1] = (hash(i, 2, 0) - 0.5) * spread * 2;
    positions[i * 3 + 2] = (hash(i, 3, 0) - 0.5) * spread * 2;
    const t = hash(i, 4, 0);
    if (t > 0.95)      color.setHSL(0.6, 0.8, 0.9);   // blue-white
    else if (t > 0.88) color.setHSL(0.75, 0.7, 0.85);  // purple-white
    else               color.setHSL(0.15, 0.1, 0.8 + t * 0.2);
    colors[i * 3]     = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  const mat = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.85 });
  return new THREE.Points(geo, mat);
}

function buildNebula(): THREE.Mesh {
  // Large faint sphere that creates a soft nebula glow around everything
  const geo = new THREE.SphereGeometry(500, 32, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#0a0520'),
    side: THREE.BackSide,
    transparent: true,
    opacity: 1,
  });
  return new THREE.Mesh(geo, mat);
}

interface GalaxyGraphProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function GalaxyGraph({ containerRef }: GalaxyGraphProps) {
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState(() => measureEl(null));
  const sceneSetupDone  = useRef(false);
  const hasFitRef       = useRef(false);

  const {
    level1Data, setLevel1Data,
    setSelectedNode, setSelectedNodePosition,
    setNodePanelOpen, setBreadcrumbs,
    setLevel2Data, setViewLevel,
  } = useStore();

  // ── size tracking ────────────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      const d = measureEl(containerRef.current);
      setDims((p) => (p.w === d.w && p.h === d.h ? p : d));
    };
    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 200);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [containerRef]);

  // ── load graph — only when store is empty (never overwrite user-added courses) ──
  useEffect(() => {
    if (level1Data) return;   // already loaded — navigating back shouldn't wipe the store
    loadLevel1Graph().then(setLevel1Data);
  }, [level1Data, setLevel1Data]);

  // ── inject Three.js scene decorations once the graph is ready ────────────
  useEffect(() => {
    if (!fgRef.current || sceneSetupDone.current || !level1Data) return;
    sceneSetupDone.current = true;
    const scene: THREE.Scene = fgRef.current.scene();
    scene.add(buildStarField());
    scene.add(buildNebula());
    // soft ambient + directional lights so MeshStandardMaterial nodes look good
    scene.add(new THREE.AmbientLight(0x222244, 2));
    const dir = new THREE.DirectionalLight(0x6699ff, 1.5);
    dir.position.set(50, 80, 50);
    scene.add(dir);
    // add a point light in the center for a nebula glow feel
    const pt = new THREE.PointLight(0x4466ff, 2, 300);
    scene.add(pt);
  }, [level1Data]);

  // ── graph data ───────────────────────────────────────────────────────────
  const graphData = useMemo(() => {
    if (!level1Data) return { nodes: [], links: [] };
    let ci = 0;
    const colorMap: Record<string, string> = {};
    level1Data.nodes.forEach((n) => {
      if (n.type === 'course' && n.id !== 'quest_root') {
        colorMap[n.id] = COURSE_PALETTE[ci++ % COURSE_PALETTE.length];
      }
    });
    const nodes = level1Data.nodes.map((n) => ({
      ...n,
      color: n.id === 'quest_root' ? '#60a5fa' : colorMap[n.id] ?? '#38bdf8',
    }));

    // ForceGraph3D mutates link.source/target from string IDs to node objects in-place.
    // Always re-normalise to strings so link endpoints are resolved correctly each render.
    const normId = (v: unknown): string =>
      typeof v === 'string' ? v : ((v as { id?: string })?.id ?? String(v));
    const links = level1Data.links.map((l) => ({
      ...l,
      source: normId(l.source),
      target: normId(l.target),
    }));

    return { nodes, links };
  }, [level1Data]);

  // ── 3D node objects ──────────────────────────────────────────────────────
  const nodeThreeObject = useCallback((node: any) => {
    const isRoot   = node.id === 'quest_root';
    const isCourse = node.type === 'course';
    const hex: string = node.color ?? '#38bdf8';
    const col = new THREE.Color(hex);
    const group = new THREE.Group();

    const radius = isRoot ? 7 : isCourse ? 5 : 2.5;

    // core sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 20),
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.5,
      }),
    );
    group.add(sphere);

    // glow halo
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.9, 16, 16),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, side: THREE.BackSide }),
    );
    group.add(halo);

    // outer soft halo
    const outerHalo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 2.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.03, side: THREE.BackSide }),
    );
    group.add(outerHalo);

    // ring for courses
    if (isCourse || isRoot) {
      const ringGeo = new THREE.TorusGeometry(radius * 1.5, 0.15, 8, 48);
      ringGeo.rotateX(Math.PI / 4);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4 }),
      );
      group.add(ring);
    }

    // sprite label
    const canvas = document.createElement('canvas');
    canvas.width  = 320;
    canvas.height = 72;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 320, 72);
    const fontSize = isCourse || isRoot ? 18 : 13;
    ctx.font      = `${isCourse || isRoot ? 700 : 500} ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = hex;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur  = 8;
    const label = node.name.length > 26 ? node.name.slice(0, 26) + '…' : node.name;
    ctx.fillText(label, 160, 48);
    const tex     = new THREE.CanvasTexture(canvas);
    const sprite  = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(22, 5.5, 1);
    sprite.position.set(0, -(radius + 6), 0);
    group.add(sprite);

    return group;
  }, []);

  // ── node click ───────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((node: any) => {
    if (node.type === 'course' || node.id === 'quest_root') {
      // Navigate into the concept subgraph for this course
      const pos = { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 };
      const l2  = loadLevel2Graph(node as GraphNode, pos);
      setLevel2Data(l2, node.id);
      setBreadcrumbs([
        { id: 'galaxy', name: 'Galaxy', type: 'galaxy' },
        { id: node.id, name: node.name, type: 'course' },
      ]);
      setViewLevel(2);
    } else {
      setSelectedNode(node as GraphNode);
      setSelectedNodePosition(node.x != null ? { x: node.x, y: node.y, z: node.z ?? 0 } : null);
      setNodePanelOpen(true);
    }
  }, [setLevel2Data, setBreadcrumbs, setViewLevel, setSelectedNode, setSelectedNodePosition, setNodePanelOpen]);

  if (!level1Data) return <div className="graph-loading">Loading galaxy…</div>;

  return (
    <div className="galaxy-graph-wrap">
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        width={dims.w}
        height={dims.h}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeLabel={() => ''}
        onNodeClick={handleNodeClick}
        // nodeRelSize=1 + nodeVal=r³ → ForceGraph effective radius = ∛(r³)*1 = r
        // This makes arrow endpoints and collision zones match the actual sphere radius.
        nodeRelSize={1}
        nodeVal={(node: any) => {
          const r = node.id === 'quest_root' ? 7 : node.type === 'course' ? 5 : 2.5;
          return Math.pow(r, 3);
        }}
        linkDirectionalArrowLength={5}
        linkDirectionalArrowRelPos={0.9}
        linkDirectionalArrowColor={() => 'rgba(96,165,250,0.85)'}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => 'rgba(167,139,250,0.9)'}
        linkDirectionalParticleWidth={0.8}
        linkColor={() => 'rgba(96,165,250,0.35)'}
        linkWidth={0.6}
        backgroundColor="#020208"
        showNavInfo={false}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={100}
        cooldownTicks={200}
        onEngineStop={() => {
          if (!hasFitRef.current && fgRef.current) {
            hasFitRef.current = true;
            setTimeout(() => fgRef.current?.zoomToFit?.(1000, 40), 150);
          }
        }}
      />
      <div className="graph-hint">
        Click a course to explore · Drag to orbit · Scroll to zoom
      </div>
    </div>
  );
}
