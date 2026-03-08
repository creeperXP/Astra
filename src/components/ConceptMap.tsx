import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';
import { useStore } from '../store/useStore';
import { computeSoftEdges } from '../lib/api';

function measureEl(el: HTMLElement | null) {
  if (!el) return { w: window.innerWidth, h: window.innerHeight };
  const r = el.getBoundingClientRect();
  return { w: Math.max(r.width, 200), h: Math.max(r.height, 200) };
}

// Deterministic star hash
function hash(a: number, b: number): number {
  let s = ((a * 1664525 + b * 1013904223) >>> 0);
  s ^= s >>> 11; s = (s + (s << 3)) >>> 0; s ^= s >>> 4;
  s = Math.imul(s, 2246822519) >>> 0; s ^= s >>> 16;
  return (s >>> 0) / 4294967296;
}

function buildStarField(count = 1500): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c   = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (hash(i, 1) - 0.5) * 1000;
    pos[i * 3 + 1] = (hash(i, 2) - 0.5) * 1000;
    pos[i * 3 + 2] = (hash(i, 3) - 0.5) * 1000;
    const t = hash(i, 4);
    if (t > 0.93)      c.setHSL(0.6, 0.8, 0.9);
    else if (t > 0.85) c.setHSL(0.75, 0.6, 0.85);
    else               c.setHSL(0.15, 0.08, 0.75 + t * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.6, vertexColors: true, transparent: true, opacity: 0.8 }));
}

// Unified mastery color thresholds (same for all subjects: ML, demo, etc.)
const MASTERY_NOT_DONE_MAX = 0.4;   // red = not done (no attempts or low)
const MASTERY_IN_PROGRESS_MAX = 0.7; // yellow = in progress (includes ripple/Bayesian)
// green = mastery (>= MASTERY_IN_PROGRESS_MAX)

interface ConceptMapProps {
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ConceptMap({ containerRef }: ConceptMapProps = {}) {
  const fgRef = useRef<any>(null);
  const sceneReady = useRef(false);
  const [dims, setDims] = useState(() => measureEl(containerRef?.current ?? null));

  const {
    level2Data, level2CourseId,
    breadcrumbs,
    setSelectedNode, setSelectedNodePosition,
    setBreadcrumbs,
    getMastery, masteryParams, pendingMasteryUpdates, masteryPulse, nodePanelOpen,
    rippleBoostedNodeIds,
  } = useStore();

  // ── Suggested "next" node: first unmastered node whose prereqs are all done ──
  const suggestedNodeId = useMemo(() => {
    if (!level2Data) return null;
    const { nodes, links } = level2Data;
    const normId = (v: unknown): string =>
      typeof v === 'string' ? v : ((v as any)?.id ?? String(v));

    // Build incoming-prereq map from hard edges only
    const prereqMap = new Map<string, string[]>();
    for (const l of links) {
      if (l.type === 'hard') {
        const src = normId(l.source);
        const tgt = normId(l.target);
        if (!prereqMap.has(tgt)) prereqMap.set(tgt, []);
        prereqMap.get(tgt)!.push(src);
      }
    }

    const mastered = new Set(
      nodes.filter(n => getMastery(n.id) >= MASTERY_IN_PROGRESS_MAX).map(n => n.id)
    );
    const unmastered = nodes.filter(n => !mastered.has(n.id));
    if (unmastered.length === 0) return null;

    // First unmastered node whose all prereqs are mastered (or has no prereqs)
    for (const n of unmastered) {
      const prereqs = prereqMap.get(n.id) ?? [];
      if (prereqs.every(pid => mastered.has(pid))) return n.id;
    }
    return null;
  }, [level2Data, masteryParams, pendingMasteryUpdates, getMastery]);

  // Unified scheme: red = not done, yellow = in progress (incl. ripple), green = mastery.
  // Ripple-boosted nodes (propagation only) use a fainter yellow so the ripple effect is visible.
  const masteryColor = useCallback((nodeId: string): THREE.Color => {
    const YELLOW = new THREE.Color('#fde047');
    const YELLOW_FAINT = new THREE.Color('#fef9c3'); // fainter yellow for ripple-only nodes
    const RED    = new THREE.Color('#f87171');
    const GREEN  = new THREE.Color('#22c55e');
    const VGREEN = new THREE.Color('#4ade80');
    const m = getMastery(nodeId);
    const isRipple = !!rippleBoostedNodeIds[nodeId];
    const col = new THREE.Color();
    if (m < MASTERY_NOT_DONE_MAX) {
      col.copy(RED);
    } else if (m < MASTERY_IN_PROGRESS_MAX) {
      col.copy(isRipple ? YELLOW_FAINT : YELLOW);
    } else {
      col.lerpColors(GREEN, VGREEN, Math.min(1, (m - MASTERY_IN_PROGRESS_MAX) / 0.3));
    }
    return col;
  }, [masteryParams, pendingMasteryUpdates, getMastery, rippleBoostedNodeIds]);

  // Map of nodeId → sphere MeshStandardMaterial for live colour updates
  const nodeMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());


  // ── size tracking ────────────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      const el = containerRef?.current ?? null;
      const d  = measureEl(el);
      setDims((p) => (p.w === d.w && p.h === d.h ? p : d));
    };
    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    const el = containerRef?.current;
    if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 200);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [containerRef]);

  // ── Three.js scene setup ─────────────────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current || sceneReady.current) return;
    const scene: THREE.Scene = fgRef.current.scene();
    if (!scene) return;
    sceneReady.current = true;
    scene.add(buildStarField());
    scene.add(new THREE.AmbientLight(0x112233, 3));
    const dir = new THREE.DirectionalLight(0x8899ff, 2);
    dir.position.set(30, 60, 30);
    scene.add(dir);
    scene.add(new THREE.PointLight(0x5533ff, 2.5, 200));
  });

  const [softEdges, setSoftEdges] = useState<{ source: string; target: string; similarity: number; type: string }[]>([]);

  // ── graph data ───────────────────────────────────────────────────────────
  const graphData = useMemo(() => {
    if (!level2Data) return { nodes: [], links: [] };

    const courseId = level2CourseId ?? '';
    const nodes = level2Data.nodes.map((n, idx) => {
      const mastery = getMastery(n.id);
      const c = masteryColor(n.id);
      return { ...n, color: '#' + c.getHexString(), _mastery: mastery, _idx: idx, _courseId: courseId };
    });

    // hard (prereq) links – normalise to string IDs
    const hardLinks = level2Data.links.map((l) => ({
      ...l,
      source: typeof l.source === 'string' ? l.source : (l.source as any).id,
      target: typeof l.target === 'string' ? l.target : (l.target as any).id,
      linkType: 'hard',
    }));

    // soft (similarity) links from NV-Embed-v2 discovery
    const softLinks = softEdges.map((e) => ({
      id:     `soft_${e.source}_${e.target}`,
      source: e.source,
      target: e.target,
      type:   'soft',
      linkType: 'soft',
    }));

    return { nodes, links: [...hardLinks, ...softLinks] };
  }, [level2Data, level2CourseId, getMastery, softEdges]);

  // ── compute soft edges via NV-Embed-v2 when concepts load ────────────────
  useEffect(() => {
    if (!level2Data?.nodes.length) return;
    const ids   = level2Data.nodes.map((n) => n.id);
    const texts = level2Data.nodes.map((n) => n.name + (n.description ? '. ' + n.description : ''));
    computeSoftEdges(ids, texts, 0.80)
      .then((res) => setSoftEdges(res.edges))
      .catch(() => setSoftEdges([])); // silent fallback if backend not running
  }, [level2Data]);

  // ── pause / resume on panel toggle ──────────────────────────────────────
  useEffect(() => {
    if (nodePanelOpen) fgRef.current?.pauseAnimation?.();
    else               fgRef.current?.resumeAnimation?.();
  }, [nodePanelOpen]);

  // ── cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      fgRef.current?.pauseAnimation?.();
      try { fgRef.current?.scene?.()?.clear(); } catch (_) {}
      sceneReady.current = false;
      nodeMaterialsRef.current.clear();
    };
  }, []);

  // ── 3D node objects ──────────────────────────────────────────────────────
  const nodeThreeObject = useCallback((node: any) => {
    const mastery = getMastery(node.id);
    const col = masteryColor(node.id);
    const isSuggested = node.id === suggestedNodeId;
    const notDone = mastery < MASTERY_NOT_DONE_MAX;

    const group  = new THREE.Group();
    const radius = isSuggested && notDone ? 3.4 : 3;

    // Core sphere – material stored for live colour updates
    const initIntensity = notDone ? 0.5 : 0.7;
    const mat = new THREE.MeshStandardMaterial({
      color: col.clone(), emissive: col.clone(),
      emissiveIntensity: initIntensity, roughness: 0.2, metalness: 0.4,
    });
    nodeMaterialsRef.current.set(node.id, mat);
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 18), mat));

    // Glow halos
    const halCol = col.clone();
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.8, 14, 14),
      new THREE.MeshBasicMaterial({ color: halCol, transparent: true, opacity: 0.12, side: THREE.BackSide }),
    ));
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(radius * 2.8, 14, 14),
      new THREE.MeshBasicMaterial({ color: halCol, transparent: true, opacity: 0.04, side: THREE.BackSide }),
    ));

    // Mastery ring — arc length = mastery fraction of full circle
    const ringCol = masteryColor(node.id).multiplyScalar(1.4);
    const ringGeo = new THREE.TorusGeometry(radius * 1.5, 0.22, 8, 48, Math.PI * 2 * mastery);
    group.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.9 })));

    // Label sprite
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 72;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 320, 72);
    ctx.font = '600 16px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const labelColor = '#' + col.getHexString();
    ctx.fillStyle = labelColor;
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    ctx.fillText(node.name.length > 28 ? node.name.slice(0, 28) + '…' : node.name, 160, 46);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
    );
    sprite.scale.set(20, 5, 1);
    sprite.position.set(0, -(radius + 5), 0);
    group.add(sprite);

    return group;
  }, [getMastery, masteryColor, suggestedNodeId]);

  // ── Live colour updates when mastery or suggested node changes ──────────
  useEffect(() => {
    for (const [nodeId, mat] of nodeMaterialsRef.current) {
      const col = masteryColor(nodeId);
      mat.color.copy(col);
      mat.emissive.copy(col);
      const m = getMastery(nodeId);
      const isRipple = !!rippleBoostedNodeIds[nodeId];
      mat.emissiveIntensity = m < MASTERY_NOT_DONE_MAX ? 0.5 : (isRipple ? 0.55 : 0.7);
    }
  }, [masteryParams, masteryColor, getMastery, rippleBoostedNodeIds]);

  // ── Light propagation: pulse connected nodes after a correct quiz answer ──
  useEffect(() => {
    if (!masteryPulse) return;
    const { sourceId, connectedIds } = masteryPulse;
    const allIds = [sourceId, ...connectedIds];

    // Save originals and start pulse
    const originals = new Map<string, { emissive: THREE.Color; intensity: number }>();
    for (const id of allIds) {
      const mat = nodeMaterialsRef.current.get(id);
      if (mat) originals.set(id, { emissive: mat.emissive.clone(), intensity: mat.emissiveIntensity });
    }

    // Wave animation: source lights first, then propagate outward
    let phase = 0;
    const PULSES = 5;
    const interval = setInterval(() => {
      phase++;
      const bright = phase % 2 === 1; // odd = lit, even = dim

      for (const [, id] of allIds.entries()) {
        const mat = nodeMaterialsRef.current.get(id);
        if (!mat) continue;
        const isSource = id === sourceId;
        // Source: bright green; connected (ripple): fainter yellow so ripple effect is visible
        mat.emissiveIntensity = bright ? (isSource ? 3.0 : 1.4) : (isSource ? 1.0 : 0.45);
        if (bright) {
          const flash = new THREE.Color();
          if (isSource) {
            flash.set('#86efac'); // bright green flash for source
          } else {
            flash.set('#fef9c3'); // fainter yellow for ripple nodes
          }
          mat.emissive.copy(flash);
        } else {
          const orig = originals.get(id);
          if (orig) mat.emissive.copy(orig.emissive);
        }
      }

      if (phase >= PULSES * 2) {
        clearInterval(interval);
        // Restore to current mastery colour (ripple nodes stay fainter yellow)
        for (const id of allIds) {
          const mat = nodeMaterialsRef.current.get(id);
          if (mat) {
            const col = masteryColor(id);
            mat.color.copy(col);
            mat.emissive.copy(col);
            const m = getMastery(id);
            const isRipple = !!rippleBoostedNodeIds[id];
            mat.emissiveIntensity = m < MASTERY_NOT_DONE_MAX ? 0.5 : (isRipple ? 0.55 : 0.7);
          }
        }
      }
    }, 280);

    return () => clearInterval(interval);
  }, [masteryPulse, getMastery, masteryColor, rippleBoostedNodeIds]);

  // ── node click ───────────────────────────────────────────────────────────
  const { setNodeDetailOpen } = useStore();

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node as GraphNode);
    setSelectedNodePosition(node.x != null ? { x: node.x, y: node.y, z: node.z ?? 0 } : null);
    setNodeDetailOpen(true);   // full-screen detail panel
    const crumbs = breadcrumbs.filter((x) => x.type !== 'concept');
    if (!crumbs.some((x) => x.id === node.id)) {
      crumbs.push({ id: node.id, name: node.name, type: 'concept' });
    }
    setBreadcrumbs(crumbs);
  }, [setSelectedNode, setSelectedNodePosition, setNodeDetailOpen, breadcrumbs, setBreadcrumbs]);

  if (!level2Data || !level2CourseId) return null;

  return (
    <div className="concept-map-wrap">
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
        nodeRelSize={3}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.9}
        linkDirectionalArrowColor={() => 'rgba(167,139,250,0.9)'}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={() => 'rgba(56,189,248,0.9)'}
        linkDirectionalParticleWidth={0.7}
        linkColor={(l: any) => l.linkType === 'soft' ? 'rgba(251,191,36,0.5)' : 'rgba(167,139,250,0.45)'}
        linkWidth={(l: any) => l.linkType === 'soft' ? 0.25 : 0.5}
        linkOpacity={0.7}
        backgroundColor="#020208"
        showNavInfo={false}
        enableNodeDrag={false}
        enableNavigationControls={!nodePanelOpen}
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.35}
        warmupTicks={120}
        cooldownTicks={200}
      />
      <div className="graph-hint">
        Click a concept for details · Drag to orbit · Scroll to zoom
      </div>
    </div>
  );
}
