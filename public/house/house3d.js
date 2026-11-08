// Turns a plan JSON into a detailed Three.js model: textured walls with framed windows and doors,
// pitched or parapet roofs, porch, plinth, floors, stairs, and a landscaped lot with street.
// Plan coordinates: x across the lot, y back from the street (street at y = 0).
// World coordinates: X = x - lotWidth/2, Z = lotDepth/2 - y (the street is toward +Z), Y up.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { textures, metersUV, faceUV } from './textures.js';

export const FLOOR_HEIGHT = 3;
const BASE = 0.3; // ground floor sits on a plinth this high
const EXT_T = 0.25; // exterior wall thickness
const OUTER_T = 0.17; // outer finish layer of exterior walls
const INT_T = 0.1;
const EPS = 0.01;

const STYLES = {
  modern: { wall: 'stucco', roofTex: 'metalRoof', trim: '#2e3135', pitch: 0.35, mullions: false, porch: 'canopy', big: true, band: false, door: 'modernDoor', fence: '#4a3b2e' },
  minimalist: { wall: 'concrete', roofTex: 'metalRoof', trim: '#1f2124', pitch: 0.3, mullions: false, porch: 'canopy', big: true, band: false, door: 'modernDoor', fence: '#3d3d3d' },
  farmhouse: { wall: 'siding', roofTex: 'metalRoof', trim: '#f7f5f0', pitch: 0.8, mullions: true, porch: 'porch', big: false, band: true, door: 'panelDoor', fence: '#f4f2ec' },
  traditional: { wall: 'brick', roofTex: 'shingles', trim: '#f4f2ec', pitch: 0.6, mullions: true, porch: 'porch', big: false, band: true, door: 'panelDoor', fence: '#f4f2ec' },
};

const FLOOR_TEX = {
  living: 'woodFloor', dining: 'woodFloor', bedroom: 'woodFloor', office: 'woodFloor', hallway: 'woodFloor', stairs: 'woodFloor',
  kitchen: 'tileFloor', bathroom: 'tileFloor', laundry: 'tileFloor', garage: 'paving',
};
const NO_WINDOWS = new Set(['garage', 'stairs', 'hallway', 'laundry']);

const key = (n) => Math.round(n * 100) / 100;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Plan analysis
// ---------------------------------------------------------------------------

// Split every room edge into wall segments. Each lists the 1 (exterior) or 2 (interior) rooms on it.
function wallSegments(rooms) {
  const lines = new Map();
  const add = (orient, c, a, b, room, side) => {
    const k = `${orient}:${key(c)}`;
    if (!lines.has(k)) lines.set(k, { orient, c: key(c), edges: [] });
    lines.get(k).edges.push({ a: key(a), b: key(b), room, side });
  };
  for (const r of rooms) {
    add('h', r.y, r.x, r.x + r.w, r, 'front');
    add('h', r.y + r.d, r.x, r.x + r.w, r, 'back');
    add('v', r.x, r.y, r.y + r.d, r, 'left');
    add('v', r.x + r.w, r.y, r.y + r.d, r, 'right');
  }
  const segments = [];
  for (const { orient, c, edges } of lines.values()) {
    const points = [...new Set(edges.flatMap((e) => [e.a, e.b]))].sort((p, q) => p - q);
    let current = null;
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const q = points[i + 1];
      const mid = (p + q) / 2;
      const on = edges.filter((e) => e.a <= mid && mid <= e.b);
      if (!on.length) {
        current = null;
        continue;
      }
      const id = on.map((e) => e.room.id).sort().join('|');
      if (current && current.id === id && Math.abs(current.b - p) < EPS) current.b = q;
      else {
        current = { orient, c, a: p, b: q, id, rooms: on.map((e) => e.room), side: on[0].side };
        segments.push(current);
      }
    }
  }
  return segments;
}

const inRect = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d;

// Cover the footprint (cells inside `rooms` but not under `above`) with as few large rectangles as
// possible. Rectangles may overlap; overlapping pitched roofs then meet in natural valleys.
function coverRects(rooms, above = []) {
  if (!rooms.length) return [];
  // Grid lines from both this floor and the floor above, so no cell straddles an upper-room edge.
  const all = [...rooms, ...above];
  const minX = Math.min(...rooms.map((r) => r.x)), maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const minY = Math.min(...rooms.map((r) => r.y)), maxY = Math.max(...rooms.map((r) => r.y + r.d));
  const clampX = (v) => key(Math.min(maxX, Math.max(minX, v)));
  const clampY = (v) => key(Math.min(maxY, Math.max(minY, v)));
  const xs = [...new Set(all.flatMap((r) => [clampX(r.x), clampX(r.x + r.w)]))].sort((a, b) => a - b);
  const ys = [...new Set(all.flatMap((r) => [clampY(r.y), clampY(r.y + r.d)]))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const inside = [];
  const remaining = [];
  for (let i = 0; i < nx; i++) {
    inside.push([]);
    remaining.push([]);
    for (let j = 0; j < ny; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const yes = rooms.some((r) => inRect(r, cx, cy)) && !above.some((r) => inRect(r, cx, cy));
      inside[i].push(yes);
      remaining[i].push(yes);
    }
  }
  const area = (i, j) => (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  const prefix = (fn) => {
    const P = Array.from({ length: nx + 1 }, () => new Float64Array(ny + 1));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) P[i + 1][j + 1] = fn(i, j) + P[i][j + 1] + P[i + 1][j] - P[i][j];
    return (i0, i1, j0, j1) => P[i1 + 1][j1 + 1] - P[i0][j1 + 1] - P[i1 + 1][j0] + P[i0][j0];
  };
  const insideCount = prefix((i, j) => (inside[i][j] ? 1 : 0));
  const rects = [];
  while (rects.length < 10) {
    const gainSum = prefix((i, j) => (remaining[i][j] ? area(i, j) : 0));
    if (gainSum(0, nx - 1, 0, ny - 1) < EPS) break;
    let best = null;
    for (let i0 = 0; i0 < nx; i0++) for (let i1 = i0; i1 < nx; i1++) for (let j0 = 0; j0 < ny; j0++) for (let j1 = j0; j1 < ny; j1++) {
      if (insideCount(i0, i1, j0, j1) !== (i1 - i0 + 1) * (j1 - j0 + 1)) break; // growing j1 only adds cells
      const gain = gainSum(i0, i1, j0, j1);
      const total = (xs[i1 + 1] - xs[i0]) * (ys[j1 + 1] - ys[j0]);
      if (gain > EPS && (!best || gain > best.gain + EPS || (Math.abs(gain - best.gain) <= EPS && total > best.total))) {
        best = { i0, i1, j0, j1, gain, total };
      }
    }
    if (!best) break;
    for (let i = best.i0; i <= best.i1; i++) for (let j = best.j0; j <= best.j1; j++) remaining[i][j] = false;
    rects.push({ x0: xs[best.i0], x1: xs[best.i1 + 1], y0: ys[best.j0], y1: ys[best.j1 + 1] });
  }
  return rects;
}

// Openings along a wall segment: {start, end, bottom, top, kind}.
function openingsFor(seg, level, frontDoorSeg, st) {
  const len = seg.b - seg.a;
  const mid = (seg.a + seg.b) / 2;
  const list = [];
  const fits = (o) => o.start >= seg.a + 0.35 && o.end <= seg.b - 0.35;

  if (seg.rooms.length === 2) {
    if (len >= 0.9) {
      const w = Math.min(0.9, len - 0.1);
      list.push({ start: mid - w / 2, end: mid + w / 2, bottom: 0, top: 2.1, kind: 'doorway' });
    }
    return list;
  }
  if (seg.rooms.length !== 1) return list;
  const room = seg.rooms[0];

  if (seg === frontDoorSeg) {
    const dw = st.big ? 1.1 : 1.0;
    list.push({ start: mid - dw / 2, end: mid + dw / 2, bottom: 0, top: 2.3, kind: 'door' });
    if (len >= 4.4) {
      const ww = st.big ? Math.min(1.8, (len - dw) / 2 - 1.0) : 1.2;
      const b = st.big ? 0.4 : 0.9;
      for (const c of [seg.a + (mid - dw / 2 - seg.a) / 2, mid + dw / 2 + (seg.b - mid - dw / 2) / 2]) {
        const o = { start: c - ww / 2, end: c + ww / 2, bottom: b, top: 2.2, kind: 'window' };
        if (ww > 0.6 && fits(o)) list.push(o);
      }
    }
    return list;
  }
  if (room.type === 'garage' && level === 0 && seg.side === 'front' && len >= 3) {
    const w = len >= 6 ? Math.min(4.9, len - 0.8) : Math.min(2.7, len - 0.6);
    list.push({ start: mid - w / 2, end: mid + w / 2, bottom: 0, top: 2.25, kind: 'garage' });
    return list;
  }
  if (NO_WINDOWS.has(room.type) || len < 1.6) return list;

  let w, bottom, top, spacing;
  if (room.type === 'bathroom') [w, bottom, top, spacing] = [0.7, 1.5, 2.15, 99];
  else if (st.big && (room.type === 'living' || room.type === 'dining')) [w, bottom, top, spacing] = [2.4, 0.15, 2.45, 3.2];
  else if (st.big) [w, bottom, top, spacing] = [1.6, 0.7, 2.3, 3.2];
  else [w, bottom, top, spacing] = [room.type === 'living' ? 1.3 : 1.0, 0.9, 2.2, 2.6];

  const count = Math.max(1, Math.floor(len / spacing));
  w = Math.min(w, len / count - 0.9);
  if (w < 0.5) return list;
  for (let i = 0; i < count; i++) {
    const c = seg.a + (len * (i + 0.5)) / count;
    const o = { start: c - w / 2, end: c + w / 2, bottom, top, kind: 'window' };
    if (fits(o)) list.push(o);
  }
  return list;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildHouse(plan, req) {
  const st = STYLES[plan.style] || STYLES.modern;
  const lotW = req.lotWidth;
  const lotD = req.lotDepth;
  const X = (x) => x - lotW / 2;
  const Z = (y) => lotD / 2 - y;
  const H = FLOOR_HEIGHT;
  const rand = rng([...(plan.name || 'house')].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));

  const root = new THREE.Group();
  const house = new THREE.Group();
  house.position.y = BASE;
  const upperGroup = new THREE.Group();
  const roofGroup = new THREE.Group();
  house.add(upperGroup, roofGroup);
  root.add(house);

  // --- Materials -----------------------------------------------------------
  const trimColor = plan.trimColor || st.trim;
  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...opts });
  const wallTex = textures[st.wall]();
  const M = {
    wall: std({ map: wallTex, color: plan.wallColor || '#f2efe9' }),
    wallInside: std({ color: '#f4f1ec', roughness: 0.95 }),
    intWall: std({ color: '#f7f5f1', roughness: 0.95 }),
    trim: std({ color: trimColor, roughness: 0.6 }),
    roof: std({ map: textures[st.roofTex](), color: plan.roofColor || '#3b3b3b', roughness: st.roofTex === 'metalRoof' ? 0.45 : 0.9, metalness: st.roofTex === 'metalRoof' ? 0.35 : 0, side: THREE.DoubleSide }),
    roofPlain: std({ color: plan.roofColor || '#3b3b3b', roughness: 0.8 }),
    membrane: std({ map: textures.membrane(), color: '#9b9d9f' }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#2a3a45', roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 }),
    door: std({ map: textures[st.door](), roughness: 0.6 }),
    garage: std({ map: textures.garageDoor(), color: st.big ? '#d9dadc' : '#f3f1ec', roughness: 0.5 }),
    handle: std({ color: '#c9c3b6', metalness: 0.9, roughness: 0.3 }),
    plinth: std({ map: textures.stone(), color: st.big ? '#8f8f8f' : '#a39b90' }),
    paving: std({ map: textures.paving() }),
    grass: std({ map: textures.grass(), roughness: 1 }),
    asphalt: std({ map: textures.asphalt(), roughness: 0.95 }),
    curb: std({ color: '#b9b6b0' }),
    stair: std({ color: '#7d6a58', roughness: 0.7 }),
    slab: std({ color: '#d9d5cf' }),
    soffit: std({ color: '#e8e4dc', side: THREE.DoubleSide }),
    gable: std({ map: wallTex, color: plan.wallColor || '#f2efe9', side: THREE.DoubleSide }),
    fence: std({ color: st.fence, roughness: 0.8 }),
    trunk: std({ color: '#5b4330', roughness: 1 }),
    line: std({ color: '#f1f1f1' }),
  };
  const leafMats = ['#4f7a3a', '#5d8a42', '#46703a', '#6a9446'].map((c) => std({ color: c, roughness: 1, flatShading: true }));
  const floorMats = {};
  const floorMat = (type) => {
    const t = FLOOR_TEX[type] || 'woodFloor';
    return (floorMats[t] ||= std({ map: textures[t](), roughness: 0.7 }));
  };

  const mesh = (geom, mat, parent, shadows = true) => {
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // `uv` = [u meters, v meters] to tile a texture on the box's main faces.
  const box = (w, h, d, mat, x, y, z, parent, uv = null) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uv) metersUV(g, uv[0], uv[1]);
    const m = mesh(g, mat, parent);
    m.position.set(x, y, z);
    return m;
  };
  const plane = (w, d, mat, x, y, z, parent) => {
    const g = metersUV(new THREE.PlaneGeometry(w, d), w, d);
    g.rotateX(-Math.PI / 2);
    const m = mesh(g, mat, parent, false);
    m.position.set(x, y, z);
    return m;
  };

  // Wall from `from` to `to` (local x), height h, with openings cut out. Extruded along local +z.
  const wallGeometry = (from, to, h, openings, depth) => {
    const s = new THREE.Shape();
    s.moveTo(from, 0);
    for (const o of openings.filter((o) => o.bottom <= EPS)) {
      s.lineTo(o.start, 0);
      s.lineTo(o.start, o.top);
      s.lineTo(o.end, o.top);
      s.lineTo(o.end, 0);
    }
    s.lineTo(to, 0);
    s.lineTo(to, h);
    s.lineTo(from, h);
    s.lineTo(from, 0);
    for (const o of openings.filter((o) => o.bottom > EPS)) {
      const p = new THREE.Path();
      p.moveTo(o.start, o.bottom);
      p.lineTo(o.end, o.bottom);
      p.lineTo(o.end, o.top);
      p.lineTo(o.start, o.top);
      p.lineTo(o.start, o.bottom);
      s.holes.push(p);
    }
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
  };

  // A group whose local x runs along the wall (plan coordinate), y up from the floor, z through the wall.
  const segmentFrame = (seg, y0, parent) => {
    const g = new THREE.Group();
    if (seg.orient === 'h') g.position.set(-lotW / 2, y0, Z(seg.c));
    else {
      g.position.set(X(seg.c), y0, lotD / 2);
      g.rotation.y = Math.PI / 2; // local x → world -Z (= +y in plan), local z → world +X
    }
    parent.add(g);
    return g;
  };

  // --- Details -------------------------------------------------------------
  const addWindow = (g, o, out) => {
    const w = o.end - o.start;
    const h = o.top - o.bottom;
    const cx = (o.start + o.end) / 2;
    const cy = (o.bottom + o.top) / 2;
    const z = out * (EXT_T / 2 - 0.08);
    const f = 0.07;
    box(w, f, 0.1, M.trim, cx, o.top - f / 2, z, g);
    box(w, f, 0.1, M.trim, cx, o.bottom + f / 2, z, g);
    box(f, h, 0.1, M.trim, o.start + f / 2, cy, z, g);
    box(f, h, 0.1, M.trim, o.end - f / 2, cy, z, g);
    box(w - 2 * f, h - 2 * f, 0.02, M.glass, cx, cy, z, g);
    if (st.mullions) {
      box(0.04, h - 2 * f, 0.05, M.trim, cx, cy, z + out * 0.02, g);
      box(w - 2 * f, 0.04, 0.05, M.trim, cx, o.bottom + h * 0.55, z + out * 0.02, g);
    } else if (w > 1.9) {
      const n = Math.round(w / 1.2);
      for (let i = 1; i < n; i++) box(0.05, h - 2 * f, 0.08, M.trim, o.start + (w * i) / n, cy, z, g);
    }
    if (o.bottom > 0.3) box(w + 0.14, 0.05, 0.16, st.big ? M.trim : M.curb, cx, o.bottom - 0.025, out * (EXT_T / 2 + 0.03), g);
    if (!st.big) {
      // Head trim above the window
      box(w + 0.16, 0.09, 0.05, M.trim, cx, o.top + 0.06, out * (EXT_T / 2 + 0.02), g);
    }
  };

  const addCasing = (g, o, out) => {
    const z = out * (EXT_T / 2 + 0.015);
    box(0.1, o.top + 0.1, 0.04, M.trim, o.start - 0.05, (o.top + 0.1) / 2, z, g);
    box(0.1, o.top + 0.1, 0.04, M.trim, o.end + 0.05, (o.top + 0.1) / 2, z, g);
    box(o.end - o.start + 0.3, 0.1, 0.04, M.trim, (o.start + o.end) / 2, o.top + 0.05, z, g);
  };

  const addFrontDoor = (g, o, out, seg) => {
    const w = o.end - o.start;
    const cx = (o.start + o.end) / 2;
    box(w, o.top, 0.06, M.door, cx, o.top / 2, out * (EXT_T / 2 - 0.1), g);
    box(0.04, 0.3, 0.06, M.handle, o.end - 0.12, 1.05, out * (EXT_T / 2 - 0.05), g);
    addCasing(g, o, out);
    const len = seg.b - seg.a;

    if (st.porch === 'canopy') {
      box(w + 1.8, 0.14, 1.5, M.trim, cx, o.top + 0.4, out * (EXT_T / 2 + 0.75), g);
      box(w + 1.2, BASE, 1.4, M.paving, cx, -BASE / 2, out * (EXT_T / 2 + 0.7), g, [w + 1.2, 1.4]);
      box(w + 1.2, BASE / 2, 0.35, M.paving, cx, -BASE * 0.75, out * (EXT_T / 2 + 1.575), g, [w + 1.2, 0.35]);
      return { depth: 1.75 };
    }
    // Covered porch with posts and a shed roof.
    const pw = Math.min(len - 0.2, Math.max(3.2, w + 2.6));
    const pd = 2.0;
    const zc = out * (EXT_T / 2 + pd / 2);
    box(pw, BASE, pd, M.stair, cx, -BASE / 2, zc, g);
    const sw = Math.min(1.8, w + 0.8);
    box(sw, BASE / 2, 0.35, M.paving, cx, -BASE * 0.75, out * (EXT_T / 2 + pd + 0.175), g, [sw, 0.35]);
    for (const sx of [-1, 1]) box(0.16, 2.6, 0.16, M.trim, cx + sx * (pw / 2 - 0.12), 1.3, out * (EXT_T / 2 + pd - 0.12), g);
    box(pw, 0.22, 0.16, M.trim, cx, 2.55, out * (EXT_T / 2 + pd - 0.12), g);
    const roofDepth = pd + 0.4;
    const drop = 0.45;
    const roof = box(pw + 0.4, 0.1, Math.hypot(roofDepth, drop), M.roofPlain, cx, 2.75 + drop / 2 - 0.05, out * (EXT_T / 2 + roofDepth / 2), g);
    roof.rotation.x = out * Math.atan2(drop, roofDepth);
    return { depth: pd + 0.75 };
  };

  const addGarageDoor = (g, o, out) => {
    const w = o.end - o.start;
    const cx = (o.start + o.end) / 2;
    box(w, o.top, 0.06, M.garage, cx, o.top / 2, out * (EXT_T / 2 - 0.1), g);
    addCasing(g, o, out);
    const L = 1.2;
    const ramp = box(w + 0.3, 0.1, Math.hypot(L, BASE), M.paving, cx, -BASE / 2 - 0.05, out * (EXT_T / 2 + L / 2), g, [w + 0.3, L]);
    ramp.rotation.x = out * Math.atan2(BASE, L);
  };

  // --- Floors, walls, openings ---------------------------------------------
  const floors = plan.floors;
  let frontDoor = null; // world position for the front path
  let garageRoom = null;

  floors.forEach((floor, fi) => {
    const parent = fi === 0 ? house : upperGroup;
    const y0 = fi * H;
    const rooms = floor.rooms;
    const below = fi > 0 ? floors[fi - 1].rooms : [];

    for (const r of rooms) {
      const cx = X(r.x + r.w / 2);
      const cz = Z(r.y + r.d / 2);
      const openStair = r.type === 'stairs' && below.some((b) => b.type === 'stairs' && inRect(b, r.x + r.w / 2, r.y + r.d / 2));
      if (!openStair) {
        box(r.w, 0.2, r.d, M.slab, cx, y0 - 0.1, cz, parent);
        plane(r.w, r.d, floorMat(r.type), cx, y0 + 0.005, cz, parent);
      }
      if (r.type === 'garage' && fi === 0) garageRoom = r;

      // A straight flight of stairs if the floor above has stairs here.
      const next = floors[fi + 1];
      if (r.type === 'stairs' && next && next.rooms.some((u) => u.type === 'stairs' && inRect(u, r.x + r.w / 2, r.y + r.d / 2))) {
        const alongX = r.w >= r.d;
        const run = (alongX ? r.w : r.d) - 0.6;
        const width = Math.min(1.1, (alongX ? r.d : r.w) - 0.2);
        const n = 16;
        for (let k = 0; k < n; k++) {
          const h = ((k + 1) * H) / n;
          const t = 0.3 + (run * (k + 0.5)) / n;
          const px = alongX ? X(r.x + t) : X(r.x + 0.1 + width / 2);
          const pz = alongX ? Z(r.y + 0.1 + width / 2) : Z(r.y + t);
          box(alongX ? run / n : width, h, alongX ? width : run / n, M.stair, px, y0 + h / 2, pz, parent);
        }
      }

      const el = document.createElement('div');
      el.className = 'room-label';
      el.textContent = r.name;
      const label = new CSS2DObject(el);
      label.position.set(cx, y0 + 0.6, cz);
      parent.add(label);
    }

    const segments = wallSegments(rooms);
    let frontDoorSeg = null;
    if (fi === 0) {
      const ext = segments.filter((g) => g.rooms.length === 1 && g.side === 'front');
      const pool = ext.filter((g) => g.rooms[0].type === 'living');
      const fallback = ext.filter((g) => g.rooms[0].type !== 'garage');
      frontDoorSeg = (pool.length ? pool : fallback).sort((p, q) => q.b - q.a - (p.b - p.a))[0] || null;
    }
    const above = floors[fi + 1] ? floors[fi + 1].rooms : [];

    for (const seg of segments) {
      const exterior = seg.rooms.length === 1;
      const openings = openingsFor(seg, fi, frontDoorSeg, st).sort((p, q) => p.start - q.start);
      const g = segmentFrame(seg, y0, parent);

      if (!exterior) {
        const geom = wallGeometry(seg.a, seg.b, H, openings, INT_T);
        geom.translate(0, 0, -INT_T / 2);
        mesh(geom, M.intWall, g);
        continue;
      }

      const out = seg.side === 'front' || seg.side === 'right' ? 1 : -1;
      const e = EXT_T / 2; // run past the ends so corners close
      const outer = wallGeometry(seg.a - e, seg.b + e, H, openings, OUTER_T);
      outer.translate(0, 0, out > 0 ? EXT_T / 2 - OUTER_T : -EXT_T / 2);
      mesh(outer, M.wall, g);
      const inner = wallGeometry(seg.a, seg.b, H, openings, EXT_T - OUTER_T);
      inner.translate(0, 0, out > 0 ? -EXT_T / 2 : EXT_T / 2 - (EXT_T - OUTER_T));
      mesh(inner, M.wallInside, g);

      for (const o of openings) {
        if (o.kind === 'window') addWindow(g, o, out);
        if (o.kind === 'door') {
          addFrontDoor(g, o, out, seg);
          const midPlan = (o.start + o.end) / 2;
          frontDoor = { x: X(midPlan), z: Z(seg.c) };
        }
        if (o.kind === 'garage') addGarageDoor(g, o, out);
      }

      // Plinth along the base of the ground floor (broken by the garage door).
      if (fi === 0) {
        const gap = openings.find((o) => o.kind === 'garage');
        const runs = gap ? [[seg.a - e, gap.start], [gap.end, seg.b + e]] : [[seg.a - e, seg.b + e]];
        for (const [p, q] of runs) {
          if (q - p > EPS) box(q - p, BASE + 0.2, EXT_T + 0.06, M.plinth, (p + q) / 2, (0.2 - BASE) / 2, 0, g, [q - p, BASE + 0.2]);
        }
        // Shrubs along the street-facing walls, clear of doors.
        if (seg.side === 'front' && seg.rooms[0].type !== 'garage') {
          for (let x = seg.a + 0.6; x < seg.b - 0.4; x += 1.1) {
            if (openings.some((o) => o.bottom <= EPS && x > o.start - 1.6 && x < o.end + 1.6)) continue;
            const s = 0.35 + rand() * 0.2;
            const shrub = mesh(new THREE.IcosahedronGeometry(s, 1), leafMats[Math.floor(rand() * 4)], g);
            shrub.position.set(x, -BASE + s * 0.7, out * (EXT_T / 2 + 0.55));
            shrub.scale.y = 0.8;
          }
        }
      }
      // Trim band between storeys.
      if (fi > 0 && st.band) box(seg.b - seg.a + 2 * e + 0.04, 0.2, EXT_T + 0.05, M.trim, (seg.a + seg.b) / 2, 0, 0, g);

      // Parapet for flat roofs over rooms that are open to the sky.
      const room = seg.rooms[0];
      const covered = above.some((u) => inRect(u, room.x + room.w / 2, room.y + room.d / 2));
      if (plan.roof === 'flat' && !covered) {
        const pg = segmentFrame(seg, y0 + H, roofGroup);
        const pw = seg.b - seg.a + 2 * e;
        // (parapet wall + coping)
        const pGeom = wallGeometry(seg.a - e, seg.b + e, 0.7, [], OUTER_T);
        pGeom.translate(0, 0, out > 0 ? EXT_T / 2 - OUTER_T : -EXT_T / 2);
        mesh(pGeom, M.wall, pg);
        box(pw + 0.04, 0.07, EXT_T + 0.08, M.trim, (seg.a + seg.b) / 2, 0.735, 0, pg);
      }
    }
  });

  // --- Roofs ---------------------------------------------------------------
  floors.forEach((floor, fi) => {
    const eaveY = (fi + 1) * H;
    const above = floors[fi + 1] ? floors[fi + 1].rooms : [];
    if (plan.roof === 'flat') {
      for (const r of floor.rooms) {
        if (above.some((u) => inRect(u, r.x + r.w / 2, r.y + r.d / 2))) continue;
        box(r.w + 0.02, 0.3, r.d + 0.02, M.slab, X(r.x + r.w / 2), eaveY + 0.15, Z(r.y + r.d / 2), roofGroup);
        plane(r.w, r.d, M.membrane, X(r.x + r.w / 2), eaveY + 0.31, Z(r.y + r.d / 2), roofGroup);
      }
      return;
    }
    for (const rect of coverRects(floor.rooms, above)) addPitchedRoof(rect, eaveY);
  });

  function addPitchedRoof(rect, eaveY) {
    const ov = 0.5;
    const pitch = st.pitch;
    const wx0 = X(rect.x0), wx1 = X(rect.x1), wz0 = Z(rect.y1), wz1 = Z(rect.y0);
    const xa = wx0 - ov, xb = wx1 + ov, za = wz0 - ov, zb = wz1 + ov;
    const w = xb - xa;
    const d = zb - za;
    const alongX = w >= d;
    const short = Math.min(w, d);
    const yLow = eaveY - ov * pitch;
    const yRidge = yLow + (short / 2) * pitch;
    const inset = plan.roof === 'hip' ? short / 2 : 0;
    const xc = (xa + xb) / 2;
    const zc = (za + zb) / 2;

    const A = [xa, yLow, za], B = [xb, yLow, za], C = [xb, yLow, zb], D = [xa, yLow, zb];
    const R1 = alongX ? [xa + inset, yRidge, zc] : [xc, yRidge, za + inset];
    const R2 = alongX ? [xb - inset, yRidge, zc] : [xc, yRidge, zb - inset];
    const tris = alongX
      ? [A, B, R2, A, R2, R1, C, D, R1, C, R1, R2, B, C, R2, D, A, R1]
      : [B, C, R2, B, R2, R1, D, A, R1, D, R1, R2, A, B, R1, C, D, R2];
    // For gables, the end triangles are walls, not roof: draw only the two slopes as roof.
    const roofTris = plan.roof === 'gable' ? tris.slice(0, 12) : tris;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(roofTris.flat(), 3));
    faceUV(geom);
    geom.computeVertexNormals();
    // Lift the roof slightly so it sits on the walls with visible thickness.
    const roofMesh = mesh(geom, M.roof, roofGroup);
    roofMesh.position.y = 0.12;
    mesh(geom.clone(), M.soffit, roofGroup); // underside, so the roof reads as having thickness

    // Fascia boards along the eaves: the long sides, plus the ends on a hip roof.
    const fasciaH = 0.22;
    const longSides = alongX ? [[xa, xb, za, 'x'], [xa, xb, zb, 'x']] : [[za, zb, xa, 'z'], [za, zb, xb, 'z']];
    const endSides = alongX ? [[za, zb, xa, 'z'], [za, zb, xb, 'z']] : [[xa, xb, za, 'x'], [xa, xb, zb, 'x']];
    const eaves = plan.roof === 'hip' ? [...longSides, ...endSides] : longSides;
    for (const [p, q, c, axis] of eaves) {
      if (axis === 'x') box(q - p, fasciaH, 0.05, M.trim, (p + q) / 2, yLow + 0.12 - fasciaH / 2 + 0.04, c, roofGroup);
      else box(0.05, fasciaH, q - p, M.trim, c, yLow + 0.12 - fasciaH / 2 + 0.04, (p + q) / 2, roofGroup);
    }

    if (plan.roof === 'gable') {
      // Gable end walls (in the wall finish) and rake boards along the sloped edges.
      // Gable triangles sit on the outer face of the end walls.
      const t = EXT_T / 2;
      const [gx0, gx1, gz0, gz1] = [wx0 - t, wx1 + t, wz0 - t, wz1 + t];
      const apexY = yRidge + 0.1;
      const ends = alongX
        ? [[[gx0, eaveY, gz0], [gx0, eaveY, gz1], [gx0, apexY, zc]], [[gx1, eaveY, gz1], [gx1, eaveY, gz0], [gx1, apexY, zc]]]
        : [[[gx0, eaveY, gz0], [gx1, eaveY, gz0], [xc, apexY, gz0]], [[gx1, eaveY, gz1], [gx0, eaveY, gz1], [xc, apexY, gz1]]];
      for (const tri of ends) {
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
        faceUV(tg);
        tg.computeVertexNormals();
        mesh(tg, M.gable, roofGroup);
      }
      const rakeLen = Math.hypot(short / 2, (short / 2) * pitch);
      const angle = Math.atan(pitch);
      for (const endAt of alongX ? [xa, xb] : [za, zb]) {
        for (const sgn of [-1, 1]) {
          const midOff = (sgn * short) / 4;
          const midY = yLow + (short / 4) * pitch + 0.12;
          const b = box(alongX ? 0.06 : rakeLen, 0.22, alongX ? rakeLen : 0.06, M.trim, alongX ? endAt : xc + midOff, midY, alongX ? zc + midOff : endAt, roofGroup);
          if (alongX) b.rotation.x = sgn * angle;
          else b.rotation.z = -sgn * angle;
        }
      }
    }
  }

  // --- Site ----------------------------------------------------------------
  const site = new THREE.Group();
  root.add(site);
  const big = 400;
  plane(big, big, M.grass, 0, 0, 0, site);
  const sidewalkD = 1.8;
  const roadD = 9;
  const zSidewalk = lotD / 2 + sidewalkD / 2;
  const zRoad = lotD / 2 + sidewalkD + 0.25 + roadD / 2;
  box(big, 0.12, sidewalkD, M.paving, 0, 0.06, zSidewalk, site, [big, sidewalkD]);
  box(big, 0.16, 0.25, M.curb, 0, 0.04, lotD / 2 + sidewalkD + 0.125, site);
  plane(big, roadD, M.asphalt, 0, 0.01, zRoad, site);
  for (let x = -big / 2; x < big / 2; x += 6) plane(3, 0.15, M.line, x, 0.02, zRoad, site);

  // Driveway from the garage door to the street, and a path to the front door.
  if (garageRoom) {
    const w = garageRoom.w - 0.4;
    const zStart = Z(garageRoom.y) + EXT_T / 2 + 1.2;
    const zEnd = lotD / 2 + sidewalkD;
    box(w, 0.06, zEnd - zStart, M.paving, X(garageRoom.x + garageRoom.w / 2), 0.03, (zStart + zEnd) / 2, site, [w, zEnd - zStart]);
  }
  if (frontDoor) {
    const zStart = frontDoor.z + (st.porch === 'porch' ? 2.6 : 1.9);
    const zEnd = lotD / 2;
    if (zEnd > zStart) box(1.2, 0.05, zEnd - zStart, M.paving, frontDoor.x, 0.025, (zStart + zEnd) / 2, site, [1.2, zEnd - zStart]);
  }

  // Fence along the sides and back of the lot.
  const fenceRun = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.floor(len / 0.16));
    const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.4, 0.03), M.fence, n);
    const m4 = new THREE.Matrix4();
    const ang = Math.atan2(z2 - z1, x2 - x1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      m4.compose(new THREE.Vector3(x1 + (x2 - x1) * t, 0.7, z1 + (z2 - z1) * t), q, new THREE.Vector3(1, 1, 1));
      boards.setMatrixAt(i, m4);
    }
    boards.castShadow = true;
    boards.receiveShadow = true;
    site.add(boards);
  };
  const fenceFront = Math.min(lotD / 2 - 2, Z(req.setback + 1));
  fenceRun(X(0), fenceFront, X(0), Z(lotD));
  fenceRun(X(lotW), fenceFront, X(lotW), Z(lotD));
  fenceRun(X(0), Z(lotD), X(lotW), Z(lotD));

  // Trees: in the back yard, at the front corners if there is space, and on the neighbouring lots.
  const allRooms = floors.flatMap((f) => f.rooms);
  const maxY = Math.max(...allRooms.map((r) => r.y + r.d));
  const minY = Math.min(...allRooms.map((r) => r.y));
  const spots = [];
  if (lotD - maxY > 4.5) for (const fx of [0.22, 0.75]) spots.push([lotW * fx, (maxY + lotD) / 2 + (rand() - 0.5)]);
  if (minY > 3.5) {
    for (const x of [1.6, lotW - 1.6]) {
      const clearDrive = !garageRoom || x < garageRoom.x - 1.5 || x > garageRoom.x + garageRoom.w + 1.5;
      const clearPath = !frontDoor || Math.abs(X(x) - frontDoor.x) > 2.5;
      if (clearDrive && clearPath) spots.push([x, minY / 2]);
    }
  }
  spots.push([-5, lotD * 0.45], [lotW + 5, lotD * 0.6], [-7, lotD * 0.8], [lotW + 6, lotD * 0.2]);
  for (const [x, y] of spots) addTree(X(x), Z(y), 0.8 + rand() * 0.5);

  function addTree(x, z, s) {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.4 * s, 8), M.trunk, t);
    trunk.position.y = 1.2 * s;
    const blobs = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < blobs; i++) {
      const r = (1.1 + rand() * 0.8) * s;
      const leaf = mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[Math.floor(rand() * 4)], t);
      leaf.position.set((rand() - 0.5) * 1.6 * s, (2.8 + rand() * 1.6) * s, (rand() - 0.5) * 1.6 * s);
    }
    t.position.set(x, 0, z);
    t.rotation.y = rand() * Math.PI * 2;
    site.add(t);
  }

  // Bounds of the house for framing the camera.
  const minX = Math.min(...allRooms.map((r) => r.x));
  const maxX = Math.max(...allRooms.map((r) => r.x + r.w));
  const center = new THREE.Vector3(X((minX + maxX) / 2), BASE + (floors.length * H) / 2, Z((minY + maxY) / 2));
  const size = Math.max(maxX - minX, maxY - minY, floors.length * H);

  return { root, roofGroup, upperGroup, center, size };
}
