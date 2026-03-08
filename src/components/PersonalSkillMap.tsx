import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import type { PersonalSkill, PersonalNode } from '../types/personal';

interface Props {
  skill: PersonalSkill;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function measureEl(el: HTMLElement | null) {
  if (!el) return { w: window.innerWidth, h: window.innerHeight };
  const r = el.getBoundingClientRect();
  return { w: Math.max(r.width, 200), h: Math.max(r.height, 200) };
}

function hash(a: number, b: number): number {
  let s = ((a * 1664525 + b * 1013904223) >>> 0);
  s ^= s >>> 11; s = (s + (s << 3)) >>> 0; s ^= s >>> 4;
  s = Math.imul(s, 2246822519) >>> 0; s ^= s >>> 16;
  return (s >>> 0) / 4294967296;
}

function buildStarField(count = 1500): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (hash(i, 1) - 0.5) * 1000;
    pos[i * 3 + 1] = (hash(i, 2) - 0.5) * 1000;
    pos[i * 3 + 2] = (hash(i, 3) - 0.5) * 1000;
    const t = hash(i, 4);
    if (t > 0.93)      c.setHSL(0.75, 0.9, 0.85);
    else if (t > 0.85) c.setHSL(0.6,  0.7, 0.8);
    else               c.setHSL(0.15, 0.05, 0.75 + t * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.6, vertexColors: true, transparent: true, opacity: 0.8 }));
}

// Purple-teal color palette for personal skill nodes
const NODE_COLORS = ['#a78bfa', '#818cf8', '#38bdf8', '#34d399', '#fb923c', '#f472b6', '#facc15'];

export function PersonalSkillMap({ skill, containerRef }: Props) {
  const fgRef = useRef<any>(null);
  const sceneReady = useRef(false);
  const hasFit = useRef(false);
  const [dims, setDims] = useState(() => measureEl(containerRef?.current ?? null));

  const {
    getMastery, masteryParams,
    setSelectedNode, setSelectedNodePosition,
    setNodeDetailOpen, setBreadcrumbs, breadcrumbs, nodeDetailOpen,
  } = useStore();

  // Map of nodeId → sphere material for live colour updates
  const nodeMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());

  // Red (0%) → Yellow (50%) → Bright Green (100%)
  const masteryColor = (m: number): THREE.Color => {
    const col = new THREE.Color();
    if (m <= 0.5) col.lerpColors(new THREE.Color('#f87171'), new THREE.Color('#fde047'), m * 2);
    else          col.lerpColors(new THREE.Color('#fde047'), new THREE.Color('#4ade80'), (m - 0.5) * 2);
    return col;
  };

  // Responsive sizing
  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims(measureEl(el)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Build Three.js scene decorations
  useEffect(() => {
    if (!fgRef.current || sceneReady.current) return;
    const scene = fgRef.current.scene?.();
    if (!scene) return;
    sceneReady.current = true;
    scene.add(buildStarField());
    scene.add(new THREE.AmbientLight(0x9b6dff, 1.5));
    const dirLight = new THREE.DirectionalLight(0x7c3aed, 2.0);
    dirLight.position.set(100, 100, 100);
    scene.add(dirLight);
    const ptLight = new THREE.PointLight(0x38bdf8, 2.0, 500);
    ptLight.position.set(-50, 60, 80);
    scene.add(ptLight);
  });

  // Pause/resume on detail panel
  useEffect(() => {
    if (nodeDetailOpen) fgRef.current?.pauseAnimation?.();
    else fgRef.current?.resumeAnimation?.();
  }, [nodeDetailOpen]);

  // Cleanup
  useEffect(() => () => {
    fgRef.current?.pauseAnimation?.();
    try { fgRef.current?.scene?.()?.clear(); } catch (_) {}
    sceneReady.current = false;
    hasFit.current = false;
    nodeMaterialsRef.current.clear();
  }, []);

  const graphData = useMemo(() => {
    const nodes = skill.nodes.map((n: PersonalNode) => {
      const mastery = getMastery(n.id);
      const c = masteryColor(mastery);
      return {
        ...n,
        color: '#' + c.getHexString(),
        _mastery: mastery,
        type: 'concept',
        courseId: skill.skill_id,
      };
    });
    const links = skill.links.map((l) => ({ ...l, id: `${l.source}->${l.target}` }));
    return { nodes, links };
  }, [skill, getMastery]);

  const nodeThreeObject = useCallback((node: any) => {
    const mastery = getMastery(node.id);
    const col = masteryColor(mastery);

    const group = new THREE.Group();
    const r = 3.5;

    // Core sphere – material stored for live colour updates
    const mat = new THREE.MeshStandardMaterial({
      color: col.clone(), emissive: col.clone(),
      emissiveIntensity: 0.65, roughness: 0.15, metalness: 0.5,
    });
    nodeMaterialsRef.current.set(node.id, mat);
    group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), mat));

    // Glow halos
    const halCol = col.clone();
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.9, 14, 14),
      new THREE.MeshBasicMaterial({ color: halCol, transparent: true, opacity: 0.12, side: THREE.BackSide }),
    ));
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(r * 3.0, 14, 14),
      new THREE.MeshBasicMaterial({ color: halCol, transparent: true, opacity: 0.04, side: THREE.BackSide }),
    ));

    // Mastery ring — arc = mastery fraction of full circle
    const ringCol = masteryColor(mastery).multiplyScalar(1.4);
    const ringGeo = new THREE.TorusGeometry(r * 1.45, 0.25, 8, 48, Math.PI * 2 * mastery);
    group.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.9 })));

    // Label sprite
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 72;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 320, 72);
    ctx.font = '600 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#' + col.getHexString();
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    ctx.fillText(node.name.length > 26 ? node.name.slice(0, 26) + '…' : node.name, 160, 46);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
    );
    sprite.scale.set(22, 5.5, 1);
    sprite.position.set(0, -(r + 5), 0);
    group.add(sprite);

    return group;
  }, [getMastery]);

  // ── Live colour updates when mastery changes ─────────────────────────────
  useEffect(() => {
    for (const [nodeId, mat] of nodeMaterialsRef.current) {
      const col = masteryColor(getMastery(nodeId));
      mat.color.copy(col);
      mat.emissive.copy(col);
    }
  }, [masteryParams, getMastery]);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode({ id: node.id, name: node.name, type: 'concept', courseId: skill.skill_id, description: node.description });
    setSelectedNodePosition(node.x != null ? { x: node.x, y: node.y, z: node.z ?? 0 } : null);
    setNodeDetailOpen(true);
    const crumbs = [...breadcrumbs.filter((x) => x.type !== 'concept')];
    crumbs.push({ id: node.id, name: node.name, type: 'concept' });
    setBreadcrumbs(crumbs);
  }, [skill.skill_id, setSelectedNode, setSelectedNodePosition, setNodeDetailOpen, breadcrumbs, setBreadcrumbs]);

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
        nodeRelSize={3.5}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.9}
        linkDirectionalArrowColor={() => 'rgba(167,139,250,0.9)'}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => 'rgba(167,139,250,0.9)'}
        linkDirectionalParticleWidth={0.7}
        linkColor={() => 'rgba(167,139,250,0.5)'}
        linkWidth={0.6}
        linkOpacity={0.7}
        backgroundColor="#020208"
        showNavInfo={false}
        warmupTicks={120}
        cooldownTicks={200}
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.35}
        onEngineStop={() => {
          if (!hasFit.current && fgRef.current) {
            hasFit.current = true;
            setTimeout(() => fgRef.current?.zoomToFit?.(1000, 60), 200);
          }
        }}
      />
    </div>
  );
}
