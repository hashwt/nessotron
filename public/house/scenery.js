// Random but sensible surroundings for the house: neighbours, landscape, weather and season.
// Everything is placed outside the lot and off the road, sized relative to the lot, and seeded so the
// same design always gets the same scenery (until the viewer rerolls it).
import * as THREE from 'three';
import { textures, metersUV } from './textures.js';

export const THEMES = {
  suburb: 'Suburb',
  lakeside: 'Lakeside',
  mountains: 'Mountains',
  forest: 'Forest',
  countryside: 'Countryside',
  coastal: 'Coast',
};

const TIMES = {
  day: { name: 'midday', sky: ['#6f9fd1', '#b7d0e6', '#e9eef0'], fog: '#dfe6ea', sun: ['#fff4e3', 2.6, [-25, 35, 28]], hemi: ['#dbe8ff', '#6b7a55', 0.35], lamp: 0.15 },
  golden: { name: 'golden hour', sky: ['#4f73a8', '#e9b98a', '#f7d9b3'], fog: '#efd3b4', sun: ['#ffbf7a', 2.4, [-45, 14, 22]], hemi: ['#ffd9b0', '#5b5a45', 0.3], lamp: 1.2 },
  overcast: { name: 'overcast', sky: ['#8f9aa3', '#bfc7cc', '#d9dde0'], fog: '#d3d8db', sun: ['#ffffff', 1.0, [-10, 40, 15]], hemi: ['#e6ecf0', '#7d8570', 0.95], lamp: 0.3 },
};

// Which weather and seasons make sense where (repeats = more likely).
const RULES = {
  suburb: { times: ['day', 'day', 'golden', 'overcast'], seasons: ['summer', 'autumn', 'spring'], fog: [80, 420] },
  lakeside: { times: ['day', 'golden', 'golden', 'overcast'], seasons: ['summer', 'autumn', 'spring'], fog: [150, 1100] },
  mountains: { times: ['day', 'golden', 'overcast'], seasons: ['summer', 'autumn'], fog: [220, 1500] },
  forest: { times: ['day', 'golden', 'overcast'], seasons: ['summer', 'autumn', 'spring'], fog: [60, 340] },
  countryside: { times: ['day', 'golden', 'golden'], seasons: ['summer', 'autumn', 'spring'], fog: [140, 1000] },
  coastal: { times: ['day', 'day', 'golden'], seasons: ['summer'], fog: [150, 1100] },
};

const LEAVES = {
  summer: ['#4f7a3a', '#5d8a42', '#46703a', '#6a9446'],
  autumn: ['#c9772e', '#d99a2b', '#b5502a', '#9a7b2c', '#5d8a42'],
  spring: ['#7fae4f', '#93c160', '#6a9a45', '#f2b6c6', '#a7cf6e'],
  coastal: ['#5f8f4a', '#6f9a52', '#7aa35a'],
};
const GRASS_TINT = { summer: '#ffffff', autumn: '#e6dcae', spring: '#f2fff0' };

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Choose theme, time of day and season. `choice` is a theme key or 'random'.
export function pickScenery(seed, choice = 'random') {
  const r = rng(seed);
  const keys = Object.keys(THEMES);
  const theme = THEMES[choice] ? choice : keys[Math.floor(r() * keys.length)];
  const rule = RULES[theme];
  const time = rule.times[Math.floor(r() * rule.times.length)];
  const season = rule.seasons[Math.floor(r() * rule.seasons.length)];
  const t = TIMES[time];
  const fogScale = time === 'overcast' ? 0.7 : 1;
  const leaf = theme === 'coastal' ? LEAVES.coastal : LEAVES[season];
  return {
    theme,
    time,
    season,
    seed,
    leaf,
    label: `${THEMES[theme]} · ${t.name}${rule.seasons.length > 1 ? ' · ' + season : ''}`,
    light: {
      sky: t.sky,
      fog: { color: t.fog, near: rule.fog[0] * fogScale, far: rule.fog[1] * fogScale },
      sun: { color: t.sun[0], intensity: t.sun[1], position: t.sun[2] },
      hemi: { sky: t.hemi[0], ground: t.hemi[1], intensity: t.hemi[2] },
    },
  };
}

// ---------------------------------------------------------------------------

// `camera` = the default viewpoint {x, z}; nothing tall is placed there so the first view is clear.
export function buildScenery(look, site, camera = null) {
  const rand = rng(look.seed * 7 + 3);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + rand() * (b - a);
  const group = new THREE.Group();
  const { lotW, lotD } = site;
  const hasFarWalk = look.theme === 'suburb';
  const farFront = site.roadFarZ + (hasFarWalk ? 1.8 : 0.3); // where land starts across the road

  // --- Materials (cached by color) -------------------------------------------
  const mats = new Map();
  const mat = (color, extra = {}) => {
    const k = color + Object.entries(extra).map(([key, v]) => `${key}:${v && v.isTexture ? v.uuid : v}`).join(',');
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }));
    return mats.get(k);
  };
  const flat = (color) => mat(color, { flatShading: true, roughness: 1 });
  const glass = mat('#2a3a45', { roughness: 0.08, metalness: 0.3 });
  const leafMats = look.leaf.map((c) => flat(c));

  const mesh = (geom, material, parent = group, shadow = true) => {
    const m = new THREE.Mesh(geom, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w, h, d, material, x, y, z, parent = group, shadow = true) => {
    const m = mesh(new THREE.BoxGeometry(w, h, d), material, parent, shadow);
    m.position.set(x, y, z);
    return m;
  };
  const ground = (w, d, material, x, y, z, rotY = 0) => {
    const g = metersUV(new THREE.PlaneGeometry(w, d), w, d);
    g.rotateX(-Math.PI / 2);
    const m = mesh(g, material, group, false);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    return m;
  };
  const near = (x, z) => Math.hypot(x, z) < 70; // only nearby things cast shadows

  // --- Keep-out zones --------------------------------------------------------
  const reserved = [];
  const reserve = (x0, x1, z0, z1) => reserved.push({ x0, x1, z0, z1 });
  const free = (x, z, r = 1) => {
    if (x > -lotW / 2 - r - 0.6 && x < lotW / 2 + r + 0.6 && z > -lotD / 2 - r - 0.6 && z < lotD / 2 + r) return false; // the lot
    if (z > lotD / 2 - r && z < farFront + r) return false; // sidewalk + road
    return !reserved.some((q) => x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r);
  };
  if (camera) reserve(camera.x - 6, camera.x + 6, camera.z - 6, camera.z + 6);
  const scatter = (count, sample, place, r = 1.5) => {
    const placed = [];
    for (let tries = 0; placed.length < count && tries < count * 8; tries++) {
      const [x, z] = sample();
      if (!free(x, z, r) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < r * 2)) continue;
      placed.push([x, z]);
      place(x, z);
    }
  };
  // Sample a point in a ring around the lot (outside it, within `reach` meters).
  const around = (reach, front = true) => () => {
    const x = between(-lotW / 2 - reach, lotW / 2 + reach);
    const z = between(-lotD / 2 - reach, front ? farFront + reach * 0.7 : lotD / 2);
    return [x, z];
  };

  // --- Ground ---------------------------------------------------------------
  const big = 4000; // ground reaches past the fog, so there is never a visible edge
  const tint = look.theme === 'mountains' || look.theme === 'forest' ? '#dbe8d2' : GRASS_TINT[look.season];
  // Polygon offset pushes the grass back in the depth buffer, so the road, fields, sand and water
  // lying on top of it always win instead of flickering.
  ground(big, big, mat(tint, { map: textures.grass(), roughness: 1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }), 0, 0, 0);
  if (hasFarWalk) {
    const m = mat('#ffffff', { map: textures.paving() });
    const g = metersUV(new THREE.BoxGeometry(big, 0.12, 1.8), big, 1.8);
    const walk = mesh(g, m, group, false);
    walk.position.set(0, 0.06, site.roadFarZ + 0.9);
    box(big, 0.16, 0.25, mat('#b9b6b0'), 0, 0.04, site.roadFarZ - 0.125, group, false);
  }

  // --- Building blocks -------------------------------------------------------
  function deciduous(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.4 * s, 7), mat('#5b4330'), t, near(x, z));
    trunk.position.y = 1.2 * s;
    const blobs = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < blobs; i++) {
      const r = (1.1 + rand() * 0.8) * s;
      const leaf = mesh(new THREE.IcosahedronGeometry(r, 1), pick(leafMats), t, near(x, z));
      leaf.position.set((rand() - 0.5) * 1.6 * s, (2.8 + rand() * 1.6) * s, (rand() - 0.5) * 1.6 * s);
    }
    t.position.set(x, 0, z);
    t.rotation.y = rand() * 6.28;
    group.add(t);
  }

  function pine(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.6 * s, 6), mat('#4e3a2a'), t, near(x, z));
    trunk.position.y = 0.8 * s;
    const greens = ['#2f5a34', '#3b6b3d', '#28503a', '#355f3a'];
    for (let i = 0; i < 3; i++) {
      const r = (1.9 - i * 0.5) * s;
      const h = (2.6 - i * 0.4) * s;
      const cone = mesh(new THREE.ConeGeometry(r, h, 7), flat(pick(greens)), t, near(x, z));
      cone.position.y = (1.6 + i * 1.3) * s + h / 2;
    }
    t.position.set(x, 0, z);
    t.rotation.y = rand() * 6.28;
    group.add(t);
  }

  function palm(x, z, s = 1) {
    const t = new THREE.Group();
    const lean = (rand() - 0.5) * 0.5;
    const segs = 7;
    let px = 0;
    let py = 0;
    for (let i = 0; i < segs; i++) {
      const seg = mesh(new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 0.9 * s, 7), mat('#8a7158'), t, near(x, z));
      px += lean * 0.25 * s * (i / segs);
      seg.position.set(px, py + 0.45 * s, 0);
      seg.rotation.z = -lean * 0.4;
      py += 0.85 * s;
    }
    const fronds = 8;
    for (let i = 0; i < fronds; i++) {
      const f = new THREE.Group();
      const leaf = mesh(new THREE.BoxGeometry(2.6 * s, 0.05, 0.5 * s), flat(pick(['#4f8a3a', '#5e9a44', '#447a33'])), f, near(x, z));
      leaf.position.x = 1.3 * s;
      f.rotation.y = (i / fronds) * Math.PI * 2;
      f.rotation.z = -0.35 - rand() * 0.25;
      f.position.set(px, py, 0);
      t.add(f);
    }
    t.position.set(x, 0, z);
    group.add(t);
  }

  function rock(x, z, s = 1, color = '#8a8580') {
    const r = mesh(new THREE.DodecahedronGeometry(s, 0), flat(color), group, near(x, z));
    r.position.set(x, s * 0.35, z);
    r.scale.set(1 + rand() * 0.6, 0.55 + rand() * 0.4, 1 + rand() * 0.5);
    r.rotation.y = rand() * 6.28;
  }

  function bush(x, z, s = 1) {
    const b = mesh(new THREE.IcosahedronGeometry(0.6 * s, 1), pick(leafMats), group, near(x, z));
    b.position.set(x, 0.4 * s, z);
    b.scale.y = 0.75;
  }

  // A tree that suits the setting.
  function tree(x, z, s = 1) {
    switch (look.theme) {
      case 'coastal': return palm(x, z, s * 1.1);
      case 'mountains': return pine(x, z, s * 1.2);
      case 'forest': return rand() < 0.45 ? pine(x, z, s * 1.3) : deciduous(x, z, s * 1.2);
      case 'lakeside': return rand() < 0.5 ? pine(x, z, s * 1.1) : deciduous(x, z, s);
      default: return deciduous(x, z, s);
    }
  }

  // Simple neighbour house: front face at z = 0, body toward -z. Rotate π to face the other way.
  function neighbourHouse(w, d, floors, wall, roof, roofType, trim) {
    const g = new THREE.Group();
    const h = floors * 3 + 0.3;
    const body = mesh(metersUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d), h), mat(wall, { map: textures.stucco() }), g);
    body.position.set(0, h / 2, -d / 2);
    if (roofType === 'flat') {
      box(w + 0.3, 0.5, d + 0.3, mat(trim), 0, h + 0.25, -d / 2, g);
    } else if (roofType === 'hip') {
      const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
      geo.rotateY(Math.PI / 4);
      const m = mesh(geo, flat(roof), g);
      m.scale.set(w + 0.8, Math.min(w, d) * 0.3, d + 0.8);
      m.position.set(0, h + (Math.min(w, d) * 0.3) / 2, -d / 2);
    } else {
      const s = new THREE.Shape();
      const half = d / 2 + 0.4;
      s.moveTo(-half, 0);
      s.lineTo(half, 0);
      s.lineTo(0, d * 0.32);
      s.lineTo(-half, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: w + 0.6, bevelEnabled: false });
      geo.translate(0, 0, -(w + 0.6) / 2);
      geo.rotateY(Math.PI / 2);
      const m = mesh(geo, flat(roof), g);
      m.position.set(0, h, -d / 2);
    }
    // Front windows and a door.
    const perFloor = Math.max(1, Math.floor(w / 2.8));
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < perFloor; i++) {
        const x = -w / 2 + (w * (i + 0.5)) / perFloor;
        if (f === 0 && i === Math.floor(perFloor / 2)) {
          box(1.0, 2.1, 0.08, mat('#6b4a2f'), x, 1.35, 0.03, g, false);
          continue;
        }
        box(1.3, 1.5, 0.05, mat(trim), x, f * 3 + 1.8, 0.02, g, false);
        box(1.1, 1.3, 0.06, glass, x, f * 3 + 1.8, 0.03, g, false);
      }
    }
    box(w + 0.1, 0.3, d + 0.1, mat('#8f8a84'), 0, 0.15, -d / 2, g, false); // plinth
    return g;
  }

  function car(color) {
    const g = new THREE.Group();
    const paint = mat(color, { metalness: 0.6, roughness: 0.35 });
    box(4.3, 0.75, 1.8, paint, 0, 0.6, 0, g);
    box(2.3, 0.65, 1.62, glass, -0.2, 1.28, 0, g);
    box(2.1, 0.08, 1.5, paint, -0.2, 1.62, 0, g);
    for (const [wx, wz] of [[1.35, 0.85], [-1.35, 0.85], [1.35, -0.85], [-1.35, -0.85]]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), mat('#1d1d1d'), g);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
    }
    for (const wz of [0.6, -0.6]) box(0.05, 0.14, 0.32, mat('#fff7d6', { emissive: '#fff2c0', emissiveIntensity: 0.3 }), 2.16, 0.7, wz, g, false);
    return g;
  }
  const carColors = ['#b7bcc2', '#1f2a36', '#8c1d1d', '#e9e9e6', '#2d4f6b', '#3a3a3a', '#6f7d5a'];

  function streetLamp(x, z, dir) {
    const g = new THREE.Group();
    const metal = mat('#3a3d40', { metalness: 0.5, roughness: 0.5 });
    const pole = mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), metal, g);
    pole.position.y = 3;
    box(0.08, 0.08, 1.4, metal, 0, 5.95, dir * 0.7, g);
    box(0.35, 0.15, 0.6, metal, 0, 5.85, dir * 1.35, g);
    box(0.3, 0.04, 0.5, mat('#fff3c4', { emissive: '#ffe9a8', emissiveIntensity: TIMES[look.time].lamp }), 0, 5.76, dir * 1.35, g, false);
    g.position.set(x, 0, z);
    group.add(g);
  }

  function lamps(spacing) {
    const skip = site.garage ? [site.garage.x0 - 1, site.garage.x1 + 1] : [0, 0];
    for (let x = -260; x <= 260; x += spacing) {
      const lx = x + spacing * 0.31;
      if (lx > skip[0] && lx < skip[1]) continue;
      if (site.frontDoor && Math.abs(lx - site.frontDoor.x) < 1.5) continue;
      streetLamp(lx, lotD / 2 + 1.5, 1);
      if (hasFarWalk) streetLamp(lx + spacing / 2, site.roadFarZ + 0.5, -1);
    }
  }

  function parkedCars(n) {
    for (let i = 0; i < n; i++) {
      const c = car(pick(carColors));
      c.position.set(between(-60, 60), 0, site.roadFarZ - 1.3); // parked along the far curb
      c.rotation.y = rand() < 0.5 ? 0 : Math.PI;
      group.add(c);
    }
  }

  function mailbox() {
    if (!site.frontDoor) return;
    let x = site.frontDoor.x + 1.4;
    if (site.garage && x > site.garage.x0 - 0.8 && x < site.garage.x1 + 0.8) x = site.frontDoor.x - 1.4;
    const post = box(0.1, 1.1, 0.1, mat('#5b4330'), x, 0.55, lotD / 2 - 0.35);
    post.castShadow = true;
    box(0.25, 0.25, 0.5, mat('#2f3a45', { metalness: 0.4, roughness: 0.5 }), x, 1.15, lotD / 2 - 0.35);
  }

  function noisy(geo, amount, seed) {
    const p = geo.attributes.position;
    const h = (a, b, c) => {
      let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177) + seed;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296 - 0.5;
    };
    geo.computeBoundingBox();
    const minY = geo.boundingBox.min.y;
    const maxY = geo.boundingBox.max.y;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 - (y - minY) / (maxY - minY || 1); // less noise near the top
      const n = h(Math.round(x * 10), Math.round(y * 10), Math.round(z * 10));
      const m = h(Math.round(z * 10), Math.round(x * 10), Math.round(y * 10));
      p.setXYZ(i, x * (1 + n * amount * k), y + m * amount * (maxY - minY) * 0.3 * k, z * (1 + n * amount * k));
    }
    geo.computeVertexNormals();
    return geo;
  }

  function mountain(x, z, R, H) {
    const rockC = pick(['#7d8590', '#86817a', '#6f7a82']);
    const m = mesh(noisy(new THREE.ConeGeometry(R, H, 11, 5), 0.35, Math.floor(rand() * 1e6)), flat(rockC), group, false);
    m.position.set(x, H / 2 - 2, z);
    m.rotation.y = rand() * 6.28;
    if (look.season !== 'summer' || H > 110) {
      const cap = mesh(new THREE.ConeGeometry(R * 0.3, H * 0.3, 11, 1), flat('#f4f6f8'), group, false);
      cap.position.set(x, H - 2 - H * 0.15 + 0.5, z);
      cap.scale.set(1.08, 1, 1.08);
    }
  }

  function hill(x, z, sx, sy, sz, color) {
    const m = mesh(new THREE.SphereGeometry(1, 18, 10), flat(color), group, false);
    m.scale.set(sx, sy, sz);
    m.position.set(x, -sy * 0.15, z);
  }

  function water(zNear, color) {
    const depth = 800;
    const w = mesh(new THREE.PlaneGeometry(big, depth), mat(color, { roughness: 0.06, metalness: 0.55 }), group, false);
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, 0.05, zNear - depth / 2);
    const foam = mesh(new THREE.PlaneGeometry(big, 0.6), mat('#eef4f5', { roughness: 0.6 }), group, false);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.06, zNear - 0.3);
  }

  function field(cx, cz, w, d, color, rotate) {
    ground(w, d, mat(color, { map: textures.crops(), roughness: 1 }), cx, 0.01, cz, rotate ? Math.PI / 2 : 0);
  }

  // --- The lot's own planting (always inside the yard, clear of paths) -------
  function plantLot() {
    const yardBack = site.house.z0 - -lotD / 2; // depth of the back yard
    if (yardBack > 4.5) for (const fx of [0.22, 0.75]) tree(-lotW / 2 + lotW * fx, (site.house.z0 - lotD / 2) / 2, 0.85 + rand() * 0.4);
    const yardFront = lotD / 2 - site.house.z1;
    if (yardFront > 3.5) {
      for (const x of [-lotW / 2 + 1.6, lotW / 2 - 1.6]) {
        const clearDrive = !site.garage || x < site.garage.x0 - 1.5 || x > site.garage.x1 + 1.5;
        const clearPath = !site.frontDoor || Math.abs(x - site.frontDoor.x) > 2.5;
        if (clearDrive && clearPath) tree(x, (site.house.z1 + lotD / 2) / 2, 0.75 + rand() * 0.3);
      }
    }
  }

  // Driveway car (most homes with a garage have one parked out front).
  function drivewayCar() {
    if (!site.garage || rand() < 0.3) return;
    const len = lotD / 2 + 1.8 - (site.garage.frontZ + 1.4);
    if (len < 5.5) return;
    const c = car(pick(carColors));
    c.rotation.y = Math.PI / 2;
    c.position.set((site.garage.x0 + site.garage.x1) / 2, 0.03, site.garage.frontZ + 1.4 + 2.6);
    group.add(c);
  }

  // Neighbouring lots on both sides and across the street.
  function neighbours(style) {
    const S = Math.max(lotW, 12);
    const ours = (k) => k * S;
    const sides = [-2, -1, 1, 2];
    const across = [-2, -1, 0, 1, 2];
    const walls = {
      suburb: ['#e9e4da', '#d8dfe3', '#efe3cf', '#c9d3c3', '#e5d6d6', '#f2efe6', '#b9c4cc'],
      coastal: ['#e8f1f2', '#f3e3c3', '#cfe3e8', '#f2d7d0', '#ffffff'],
      lakeside: ['#8a6a4f', '#a07a58', '#e9e4da', '#6f5a45'],
    }[style] || ['#e9e4da'];
    const roofs = ['#3b3d40', '#4a4643', '#5a4a3f', '#2f3a45'];

    const place = (xc, front, facing) => {
      const maxW = Math.abs(xc) < 1 ? S * 0.7 : 2 * (Math.abs(xc) - lotW / 2 - 1.5);
      const w = Math.max(5.5, Math.min(S * 0.62, 14, maxW));
      const d = Math.max(7, Math.min(lotD * 0.35, 13));
      // Leave the default viewpoint clear.
      const bz0 = facing > 0 ? front - d : front;
      const bz1 = facing > 0 ? front : front + d;
      if (camera && camera.x > xc - w / 2 - 8 && camera.x < xc + w / 2 + 8 && camera.z > bz0 - 8 && camera.z < bz1 + 8) return;
      const roofType = style === 'coastal' ? pick(['flat', 'hip']) : pick(['gable', 'gable', 'hip']);
      const g = neighbourHouse(w, d, pick([1, 2, 2]), pick(walls), pick(roofs), roofType, '#f2f0ea');
      g.position.set(xc, 0, front);
      g.rotation.y = facing < 0 ? Math.PI : 0;
      group.add(g);
      const z0 = facing > 0 ? front - d : front;
      const z1 = facing > 0 ? front : front + d;
      reserve(xc - w / 2 - 1, xc + w / 2 + 1, z0 - 1, z1 + 1);
      // Their driveway to the street.
      const dz0 = facing > 0 ? front : hasFarWalk ? site.roadFarZ + 1.8 : site.roadFarZ;
      const dz1 = facing > 0 ? lotD / 2 + 1.8 : front;
      if (dz1 - dz0 > 1) ground(3, dz1 - dz0, mat('#ffffff', { map: textures.paving() }), xc + w / 4, 0.04, (dz0 + dz1) / 2);
    };
    for (const k of sides) place(ours(k), lotD / 2 - between(3, 7), 1);
    if (style === 'suburb') for (const k of across) place(ours(k) + S * 0.15, farFront + between(3, 7), -1);
  }

  // --- Themes ----------------------------------------------------------------
  plantLot();
  const T = look.theme;

  if (T === 'suburb') {
    neighbours('suburb');
    lamps(34);
    drivewayCar();
    parkedCars(rand() < 0.6 ? 1 : 2);
    mailbox();
    scatter(26, around(60), (x, z) => deciduous(x, z, 0.8 + rand() * 0.5), 2);
    scatter(20, around(40), (x, z) => bush(x, z, 0.8 + rand() * 0.6), 1);
  }

  if (T === 'lakeside') {
    const shore = -lotD / 2 - 7;
    ground(big, 6.5, mat('#ffffff', { map: textures.sand(), roughness: 1 }), 0, 0.012, shore + 3.25);
    water(shore, '#3d7f9e');
    reserve(-big, big, shore - 900, shore + 1);
    // Dock and a small boat behind the house.
    const wood = mat('#8a6a4f');
    box(1.6, 0.12, 10, wood, 0, 0.45, shore - 4.5);
    for (const dx of [-0.7, 0.7]) for (let k = 0; k < 4; k++) box(0.14, 1.2, 0.14, wood, dx, 0.1, shore - 1 - k * 3);
    const boat = new THREE.Group();
    box(3.2, 0.45, 1.3, mat('#f2f0ea'), 0, 0.3, 0, boat);
    box(2.6, 0.1, 1.0, wood, 0, 0.5, 0, boat, false);
    boat.position.set(2.1, 0, shore - 7);
    boat.rotation.y = 0.15;
    group.add(boat);
    neighbours('lakeside');
    drivewayCar();
    mailbox();
    for (let i = 0; i < 10; i++) hill(between(-600, 600), shore - between(450, 650), between(90, 170), between(14, 26), between(40, 70), pick(['#4f6e45', '#587a4b', '#46653f']));
    scatter(40, around(55, true), (x, z) => tree(x, z, 0.9 + rand() * 0.5), 2);
  }

  if (T === 'mountains') {
    for (let i = 0; i < 18; i++) {
      const H = between(110, 230);
      mountain(-900 + i * 105 + between(-30, 30), -lotD / 2 - between(550, 850), H * between(1.3, 1.8), H);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const H = between(80, 150);
      mountain(side * between(500, 750), between(-450, 50), H * between(1.4, 1.9), H);
    }
    drivewayCar();
    mailbox();
    scatter(80, around(80), (x, z) => pine(x, z, 0.9 + rand() * 0.7), 2.2);
    scatter(14, around(40), (x, z) => rock(x, z, 0.5 + rand() * 0.9), 1.5);
  }

  if (T === 'forest') {
    for (let i = 0; i < 6; i++) hill(between(-500, 500), -lotD / 2 - between(300, 420), between(100, 170), between(20, 34), between(50, 80), pick(['#3f5f3a', '#4a6a41']));
    drivewayCar();
    mailbox();
    scatter(150, around(75), (x, z) => tree(x, z, 0.9 + rand() * 0.6), 2.2);
    scatter(30, around(40), (x, z) => bush(x, z, 0.8 + rand() * 0.6), 1);
  }

  if (T === 'countryside') {
    const crops = {
      summer: ['#e3c46a', '#8fb85a', '#7fa84a', '#c9b06a'],
      autumn: ['#c9a86a', '#9a7a55', '#b8955a', '#d9b56a'],
      spring: ['#a9c97a', '#e8d84a', '#9a7a55', '#93c160'],
    }[look.season];
    // A patchwork of fields on a grid, skipping any cell that touches the lot or the road.
    const patches = [];
    const cell = 62;
    const size = 58;
    for (let gx = -4; gx <= 4; gx++) {
      for (let gz = -5; gz <= 3; gz++) {
        const cx = gx * cell;
        const cz = gz * cell + farFront + cell / 2 + 3; // grid aligned to the far side of the road
        const x0 = cx - size / 2, x1 = cx + size / 2, z0 = cz - size / 2, z1 = cz + size / 2;
        const hitsLot = x1 > -lotW / 2 - 4 && x0 < lotW / 2 + 4 && z1 > -lotD / 2 - 4 && z0 < lotD / 2;
        const hitsRoad = z1 > lotD / 2 - 1 && z0 < farFront + 2;
        if (!hitsLot && !hitsRoad) patches.push([cx, cz, size, size]);
      }
    }
    for (const [cx, cz, w, d] of patches) {
      field(cx, cz, w, d, pick(crops), rand() < 0.5);
      // Hedgerow along one edge of the field.
      for (let x = cx - w / 2; x < cx + w / 2; x += 3) if (rand() < 0.7) bush(x, cz - d / 2 - 1, 1 + rand() * 0.6);
    }
    // Barn and silo out in the fields.
    const bx = pick([-1, 1]) * between(28, 45);
    const bz = -lotD / 2 - between(40, 60);
    const barn = new THREE.Group();
    box(10, 5.5, 14, mat('#9e3b2e'), 0, 2.75, 0, barn);
    const s = new THREE.Shape();
    s.moveTo(-5.6, 0);
    s.lineTo(5.6, 0);
    s.lineTo(0, 4);
    s.lineTo(-5.6, 0);
    const rg = new THREE.ExtrudeGeometry(s, { depth: 14.6, bevelEnabled: false });
    rg.translate(0, 0, -7.3);
    mesh(rg, flat('#3f3a36'), barn).position.y = 5.5;
    box(3.6, 4, 0.1, mat('#f2efe6'), 0, 2, 7.03, barn);
    box(3.2, 3.6, 0.12, mat('#9e3b2e'), 0, 2, 7.05, barn);
    const silo = mesh(new THREE.CylinderGeometry(2.2, 2.2, 12, 16), mat('#c9c9c4', { metalness: 0.4, roughness: 0.5 }), barn);
    silo.position.set(7.8, 6, -3);
    const dome = mesh(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#b0b0aa', { metalness: 0.5 }), barn);
    dome.position.set(7.8, 12, -3);
    barn.position.set(bx, 0, bz);
    barn.rotation.y = between(-0.4, 0.4) + Math.PI;
    group.add(barn);
    for (let i = 0; i < 7; i++) {
      const hb = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14), mat('#d8b865'), group);
      hb.rotation.z = Math.PI / 2;
      hb.rotation.y = rand() * 3;
      hb.position.set(bx + between(-25, 25), 0.75, bz + between(12, 30));
    }
    for (let i = 0; i < 10; i++) hill(between(-700, 700), -lotD / 2 - between(450, 700), between(110, 200), between(14, 28), between(50, 90), pick(['#6f9a4f', '#7aa356', '#86ab5c']));
    drivewayCar();
    mailbox();
    scatter(18, around(70), (x, z) => deciduous(x, z, 0.9 + rand() * 0.5), 3);
  }

  if (T === 'coastal') {
    const beach = -lotD / 2 - 2;
    const sea = beach - 34;
    ground(big, beach - sea, mat('#ffffff', { map: textures.sand(), roughness: 1 }), 0, 0.012, (beach + sea) / 2);
    water(sea, '#2f86a8');
    reserve(-big, big, sea - 900, sea + 1);
    for (let i = 0; i < 14; i++) {
      const d = mesh(new THREE.SphereGeometry(1, 14, 8), flat('#d8c39a'), group, false);
      d.scale.set(between(5, 10), between(0.8, 1.6), between(3, 5));
      d.position.set(between(-80, 80), 0, between(beach - 4, beach - 18));
      for (let k = 0; k < 6; k++) {
        const g = mesh(new THREE.ConeGeometry(0.08, 0.7, 4), flat('#9aa86a'), group, false);
        g.position.set(d.position.x + between(-3, 3), d.scale.y * 0.8, d.position.z + between(-1.5, 1.5));
      }
    }
    // Boardwalk from the back fence to the beach.
    box(1.4, 0.1, 14, mat('#a08466'), 0, 0.25, beach - 6);
    neighbours('coastal');
    drivewayCar();
    mailbox();
    scatter(20, around(45), (x, z) => palm(x, z, 0.9 + rand() * 0.4), 2.5);
  }

  return group;
}
