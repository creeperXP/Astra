/**
 * ThreeScenePopup — full-screen Three.js visualization popup.
 * Scene template is chosen from keywords in the concept name / viz description.
 *
 * Templates:
 *   GRADIENT – keywords: gradient, descent, optimize, loss, convex, minimize, hill
 *   TREE     – keywords: tree, bst, binary, branch, node, heap
 *   NETWORK  – keywords: graph, network, edge, vertex, connected, path
 *   ARRAY    – keywords: array, list, index, element, string, sequence, queue, stack
 *   SORT     – keywords: sort, algorithm, bubble, merge, quick, search
 *   DEFAULT  – orbiting spheres (fallback)
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { motion } from 'framer-motion';

interface ThreeScenePopupProps {
  nodeName: string;
  description?: string;
  vizDescription?: string;
  onClose: () => void;
}

// ── Template selector ─────────────────────────────────────────────────────────
type Template = 'gradient' | 'tree' | 'network' | 'array' | 'sort' | 'default';

function pickTemplate(name: string, desc: string): Template {
  const text = `${name} ${desc}`.toLowerCase();
  if (/\b(gradient|descent|optim|loss|convex|minim|hill|backprop|learning.?rate|epoch)\b/.test(text)) return 'gradient';
  if (/\b(tree|bst|binary|branch|heap|trie|avl)\b/.test(text))    return 'tree';
  if (/\b(graph|network|edge|vertex|connected|path|dijkstra|bfs|dfs)\b/.test(text)) return 'network';
  if (/\b(sort|bubble|merge|quick|insertion|selection|algorithm)\b/.test(text))     return 'sort';
  if (/\b(array|list|index|element|string|sequence|queue|stack|deque)\b/.test(text)) return 'array';
  return 'default';
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function makeRenderer(canvas: HTMLCanvasElement) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  r.setSize(canvas.clientWidth, canvas.clientHeight);
  r.setClearColor(0x020208, 1);
  return r;
}

function addStars(scene: THREE.Scene) {
  const geo = new THREE.BufferGeometry();
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 400;
    pos[i*3+1] = (Math.random() - 0.5) * 400;
    pos[i*3+2] = (Math.random() - 0.5) * 400;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc7d2fe, size: 0.4, sizeAttenuation: true })));
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0x334466, 5));
  const dl = new THREE.DirectionalLight(0x8899ff, 3);
  dl.position.set(30, 60, 30);
  scene.add(dl);
  scene.add(new THREE.PointLight(0x5533ff, 3, 200));
}

function makeSphere(r: number, color: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.5 });
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), mat);
}

function makeLine(a: THREE.Vector3, b: THREE.Vector3, color = 0x4a5568): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
}

// ── Template: TREE ────────────────────────────────────────────────────────────
function buildTree(scene: THREE.Scene): () => void {
  const colors  = [0x60a5fa, 0x34d399, 0xa78bfa, 0xfbbf24, 0xf472b6, 0x6ee7b7, 0x93c5fd];
  const nodeGap = { x: 9, y: 7 };
  const depth   = 3;
  const spheres: THREE.Mesh[] = [];

  function addNode(d: number, col: number, row: number): THREE.Vector3 {
    const x = (col - (2 ** d - 1) / 2 + 0.5) * nodeGap.x * (1 / (d + 1) + 0.5);
    const y = 12 - d * nodeGap.y;
    const z = 0;
    const s = makeSphere(d === 0 ? 1.6 : 1.2, colors[d % colors.length]);
    s.position.set(x, y, z);
    scene.add(s);
    spheres.push(s);
    return new THREE.Vector3(x, y, z);
  }

  const positions: THREE.Vector3[][] = [];
  for (let d = 0; d <= depth; d++) {
    positions[d] = [];
    for (let c = 0; c < 2 ** d; c++) {
      positions[d].push(addNode(d, colors[d % colors.length], c));
    }
  }

  // Connect parent → children
  for (let d = 0; d < depth; d++) {
    for (let c = 0; c < 2 ** d; c++) {
      const parent = positions[d][c];
      const lChild = positions[d + 1][c * 2];
      const rChild = positions[d + 1][c * 2 + 1];
      scene.add(makeLine(parent, lChild, 0x4f6bff));
      scene.add(makeLine(parent, rChild, 0x4f6bff));
    }
  }

  let t = 0;
  return () => {
    t += 0.008;
    spheres.forEach((s, i) => {
      const mat = s.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.25 + 0.2 * Math.abs(Math.sin(t * 1.5 + i * 0.7));
      s.rotation.y += 0.01;
    });
  };
}

// ── Template: NETWORK / GRAPH ─────────────────────────────────────────────────
function buildNetwork(scene: THREE.Scene): () => void {
  const nodeCount = 9;
  const palette   = [0x60a5fa, 0xa78bfa, 0x34d399, 0xfb923c, 0xf472b6];
  const positions = Array.from({ length: nodeCount }, (_, i) => {
    const angle = (i / nodeCount) * Math.PI * 2;
    const r = 10 + (i % 3) * 4;
    return new THREE.Vector3(Math.cos(angle) * r, (Math.random() - 0.5) * 8, Math.sin(angle) * r);
  });

  const spheres = positions.map((p, i) => {
    const s = makeSphere(1.3, palette[i % palette.length]);
    s.position.copy(p);
    scene.add(s);
    return s;
  });

  // Random edges (no duplicates)
  const edgeSet = new Set<string>();
  for (let a = 0; a < nodeCount; a++) {
    const connections = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < connections; k++) {
      const b = (a + 1 + Math.floor(Math.random() * (nodeCount - 2))) % nodeCount;
      const key = [Math.min(a, b), Math.max(a, b)].join('-');
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        scene.add(makeLine(positions[a], positions[b], 0x4f6bff));
      }
    }
  }

  let t = 0;
  return () => {
    t += 0.005;
    spheres.forEach((s, i) => {
      s.position.y = positions[i].y + Math.sin(t * 1.2 + i) * 0.8;
      (s.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + 0.25 * Math.abs(Math.sin(t + i));
    });
  };
}

// ── Template: ARRAY / LIST / STACK / QUEUE ────────────────────────────────────
function buildArray(scene: THREE.Scene): () => void {
  const count   = 8;
  const palette = [0x60a5fa, 0xa78bfa, 0x34d399, 0xfbbf24, 0xf472b6, 0x6ee7b7, 0x93c5fd, 0xfca5a5];
  const boxes: THREE.Mesh[] = [];
  const basePositions: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 3.5;
    const geo = new THREE.BoxGeometry(2.8, 2.8, 2.8);
    const mat = new THREE.MeshStandardMaterial({
      color: palette[i], emissive: palette[i], emissiveIntensity: 0.28,
      roughness: 0.25, metalness: 0.45,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, 0);
    scene.add(mesh);
    boxes.push(mesh);
    basePositions.push(new THREE.Vector3(x, 0, 0));
  }

  // Edge lines between adjacent
  for (let i = 0; i < count - 1; i++) {
    scene.add(makeLine(basePositions[i], basePositions[i + 1], 0x4f6bff));
  }

  let t = 0;
  return () => {
    t += 0.008;
    boxes.forEach((b, i) => {
      b.position.y = Math.sin(t * 1.3 + i * 0.7) * 0.9;
      b.rotation.y += 0.012;
      (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + 0.2 * Math.abs(Math.sin(t * 2 + i));
    });
  };
}

// ── Template: SORT ────────────────────────────────────────────────────────────
function buildSort(scene: THREE.Scene): () => void {
  const count = 10;
  const heights = Array.from({ length: count }, (_, i) => 1 + (i % 7) * 1.4);
  const palette = [0x60a5fa, 0xa78bfa, 0x34d399, 0xfbbf24, 0xf472b6, 0x6ee7b7, 0x93c5fd, 0xfca5a5, 0x86efac, 0xfde68a];
  const bars: THREE.Mesh[] = [];

  for (let i = 0; i < count; i++) {
    const h   = heights[i];
    const geo = new THREE.BoxGeometry(1.8, h, 1.8);
    const mat = new THREE.MeshStandardMaterial({
      color: palette[i], emissive: palette[i], emissiveIntensity: 0.3,
      roughness: 0.2, metalness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((i - (count - 1) / 2) * 2.4, h / 2 - 5, 0);
    scene.add(mesh);
    bars.push(mesh);
  }

  // Animate a bubble-sort pass
  let sortStep = 0;
  let frameCounter = 0;
  const order = Array.from({ length: count }, (_, i) => i);

  return () => {
    frameCounter++;
    if (frameCounter % 40 === 0 && sortStep < count * count) {
      const i = sortStep % (count - 1);
      const a = order[i], b = order[i + 1];
      if (heights[a] > heights[b]) {
        [order[i], order[i + 1]] = [order[i + 1], order[i]];
        const ax = bars[a].position.x;
        bars[a].position.x = bars[b].position.x;
        bars[b].position.x = ax;
      }
      sortStep++;
      if (sortStep >= count * count) {
        // Reset for continuous animation
        sortStep = 0;
        for (let j = count - 1; j > 0; j--) order[j] = count - 1 - j;
      }
    }

    bars.forEach((bar, i) => {
      bar.rotation.y += 0.008;
      (bar.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.2 + 0.15 * Math.abs(Math.sin(frameCounter * 0.05 + i));
    });
  };
}

// ── Template: GRADIENT DESCENT (ball rolling down a 3D loss surface) ─────────
function buildGradientDescent(scene: THREE.Scene): () => void {
  // Paraboloid loss surface: y = x² + z² scaled down
  const GRID = 48;
  const RANGE = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const colorLow  = new THREE.Color(0x4ade80);  // green = low loss
  const colorHigh = new THREE.Color(0xf87171);  // red   = high loss
  const vCount = (GRID + 1) * (GRID + 1);

  for (let zi = 0; zi <= GRID; zi++) {
    for (let xi = 0; xi <= GRID; xi++) {
      const x = (xi / GRID - 0.5) * RANGE * 2;
      const z = (zi / GRID - 0.5) * RANGE * 2;
      const y = (x * x + z * z) * 0.15 - 8;
      positions.push(x, y, z);
      const t = Math.min(1, (x * x + z * z) / (RANGE * RANGE));
      const c = colorLow.clone().lerp(colorHigh, t);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let zi = 0; zi < GRID; zi++) {
    for (let xi = 0; xi < GRID; xi++) {
      const a = zi * (GRID + 1) + xi;
      indices.push(a, a + 1, a + GRID + 1);
      indices.push(a + 1, a + GRID + 2, a + GRID + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.1, transparent: true, opacity: 0.88 });
  scene.add(new THREE.Mesh(geo, mat));

  // Grid wireframe overlay
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x334455, wireframe: true, transparent: true, opacity: 0.15 });
  scene.add(new THREE.Mesh(geo.clone(), wireMat));

  // Gradient descent path — discrete steps spiralling toward the minimum
  const STEPS = 40;
  const stepSpheres: THREE.Mesh[] = [];
  const pathPoints: THREE.Vector3[] = [];
  let px = RANGE * 0.85, pz = RANGE * 0.78;
  for (let s = 0; s < STEPS; s++) {
    const lr = 0.35 * Math.pow(0.88, s);   // decaying learning rate
    px -= lr * 2 * px;
    pz -= lr * 2 * pz;
    const py = (px * px + pz * pz) * 0.15 - 8 + 0.55;
    const pt = new THREE.Vector3(px, py, pz);
    pathPoints.push(pt);
    const col = s === STEPS - 1 ? 0xfbbf24 : 0x818cf8;
    const sp = makeSphere(s === STEPS - 1 ? 0.55 : 0.22, col);
    sp.position.copy(pt);
    scene.add(sp);
    stepSpheres.push(sp);
  }

  // Path line
  const pathGeo = new THREE.BufferGeometry().setFromPoints(pathPoints);
  scene.add(new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.7 })));

  // Animated ball on the surface
  const ball = makeSphere(0.7, 0xfbbf24);
  scene.add(ball);
  // Loss annotations
  const annotationSpheres = [0, Math.floor(STEPS * 0.3), Math.floor(STEPS * 0.6), STEPS - 1].map((i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.55, 20),
      new THREE.MeshBasicMaterial({ color: i === STEPS - 1 ? 0xfbbf24 : 0x6366f1, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
    );
    ring.position.copy(pathPoints[i]);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    return ring;
  });

  // Count-up variable references
  const _vCount = vCount; void _vCount;

  let t = 0;
  return () => {
    t += 0.008;
    // Animate ball along the path with looping
    const progress = (Math.sin(t * 0.4) * 0.5 + 0.5);   // 0 → 1 → 0
    const rawIdx = progress * (STEPS - 1);
    const idxA = Math.floor(rawIdx), idxB = Math.min(STEPS - 1, idxA + 1);
    const alpha = rawIdx - idxA;
    const bPos = pathPoints[idxA].clone().lerp(pathPoints[idxB], alpha);
    ball.position.copy(bPos);
    ball.position.y += 0.55;
    (ball.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + 0.3 * Math.abs(Math.sin(t * 4));

    // Pulse annotation rings
    annotationSpheres.forEach((r, i) => {
      r.scale.setScalar(1 + 0.15 * Math.sin(t * 2 + i));
    });

    // Gentle shimmer on step dots
    stepSpheres.forEach((s, i) => {
      (s.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + 0.15 * Math.sin(t * 3 + i * 0.4);
    });
  };
}

// ── Template: DEFAULT (orbiting spheres) ─────────────────────────────────────
function buildDefault(scene: THREE.Scene): () => void {
  const palette = [0xa78bfa, 0x60a5fa, 0x34d399, 0xfb923c, 0xf472b6];
  const orbs = Array.from({ length: 5 }, (_, i) => {
    const s = makeSphere(1.4 + (i % 2) * 0.5, palette[i]);
    scene.add(s);
    return { mesh: s, radius: 8 + i * 3.5, speed: 0.004 + i * 0.002, phase: (i / 5) * Math.PI * 2 };
  });
  // Center glow
  const center = makeSphere(2.5, 0x818cf8);
  scene.add(center);

  let t = 0;
  return () => {
    t += 0.01;
    orbs.forEach(({ mesh, radius, speed, phase }) => {
      mesh.position.x = Math.cos(t * speed * 100 + phase) * radius;
      mesh.position.y = Math.sin(t * speed * 80 + phase) * radius * 0.4;
      mesh.position.z = Math.sin(t * speed * 100 + phase) * radius * 0.6;
      mesh.rotation.y += 0.02;
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + 0.2 * Math.abs(Math.sin(t * 3));
    });
    center.rotation.y += 0.015;
    (center.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + 0.2 * Math.abs(Math.sin(t * 2));
  };
}

// ── Main popup component ──────────────────────────────────────────────────────
export function ThreeScenePopup({ nodeName, description = '', vizDescription = '', onClose }: ThreeScenePopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeRenderer(canvas);
    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 8, 35);
    camera.lookAt(0, 0, 0);

    addStars(scene);
    addLights(scene);

    const template = pickTemplate(nodeName, `${description} ${vizDescription}`);
    const animFn   = (() => {
      if (template === 'gradient') return buildGradientDescent(scene);
      if (template === 'tree')     return buildTree(scene);
      if (template === 'network')  return buildNetwork(scene);
      if (template === 'array')    return buildArray(scene);
      if (template === 'sort')     return buildSort(scene);
      return buildDefault(scene);
    })();

    let raf: number;
    let t = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.005;
      animFn();
      camera.position.x = Math.sin(t * 0.4) * 5;
      camera.position.y = 8 + Math.cos(t * 0.3) * 2;
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
  }, [nodeName, description, vizDescription]);

  const templateLabel: Record<string, string> = {
    gradient: 'Gradient Descent', tree: 'Binary Tree', network: 'Graph / Network',
    array: 'Array / List', sort: 'Sorting Algorithm', default: 'Concept Orbit',
  };
  const tpl = pickTemplate(nodeName, `${description} ${vizDescription}`);

  return createPortal(
    <motion.div className="three-scene-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <canvas ref={canvasRef} className="three-scene-canvas"/>

      {/* Header */}
      <div className="three-scene-hud">
        <div>
          <p className="three-scene-name">{nodeName}</p>
          <p className="three-scene-template">🎲 {templateLabel[tpl]} visualization</p>
        </div>
        <button className="three-scene-close" onClick={onClose}>✕ Close</button>
      </div>

      {/* Description overlay */}
      {vizDescription && (
        <div className="three-scene-desc">
          <p>{vizDescription}</p>
        </div>
      )}
    </motion.div>,
    document.body
  );
}
