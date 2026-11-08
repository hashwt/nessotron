// Procedural material textures drawn on canvases (no image files needed).
// Tiled textures expect UVs in meters; `tile` is how many meters one copy of the texture covers.
// Textures meant to be tinted (walls, roofs) are drawn in near-white grays so material.color sets the hue.
import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(name, w, h, tileW, tileH, draw) {
  if (cache.has(name)) return cache.get(name);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  let seed = 7;
  for (const ch of name) seed = seed * 31 + ch.charCodeAt(0);
  draw(g, w, h, rng(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tileW, 1 / tileH);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(name, tex);
  return tex;
}

function speckle(g, w, h, r, count, color, size = 2) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = color(r);
    const s = 1 + r() * size;
    g.fillRect(r() * w, r() * h, s, s);
  }
}

const gray = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

export const textures = {
  stucco: () =>
    make('stucco', 512, 512, 2, 2, (g, w, h, r) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 9000, (r) => gray(0, 0.02 + r() * 0.05), 2);
      speckle(g, w, h, r, 3000, (r) => gray(255, 0.5), 2);
    }),

  concrete: () =>
    make('concrete', 512, 256, 2.4, 1.2, (g, w, h, r) => {
      g.fillStyle = '#f6f6f6';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 7000, (r) => gray(0, 0.02 + r() * 0.05), 2);
      for (let i = 0; i < 25; i++) {
        g.fillStyle = gray(0, 0.01 + r() * 0.015);
        g.beginPath();
        g.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = gray(0, 0.18);
      g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
      g.fillStyle = gray(0, 0.35);
      for (const fx of [0.17, 0.5, 0.83]) for (const fy of [0.25, 0.75]) {
        g.beginPath();
        g.arc(fx * w, fy * h, 3, 0, Math.PI * 2);
        g.fill();
      }
    }),

  siding: () =>
    make('siding', 256, 512, 1, 2, (g, w, h, r) => {
      const boards = 10; // 0.2 m lap boards
      const bh = h / boards;
      for (let i = 0; i < boards; i++) {
        const y = i * bh;
        const grad = g.createLinearGradient(0, y, 0, y + bh);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.85, '#f1f1f1');
        grad.addColorStop(1, '#d9d9d9');
        g.fillStyle = grad;
        g.fillRect(0, y, w, bh);
        g.fillStyle = gray(0, 0.3);
        g.fillRect(0, y + bh - 3, w, 3);
      }
      speckle(g, w, h, r, 2500, (r) => gray(0, 0.03), 2);
    }),

  brick: () =>
    make('brick', 512, 256, 1.2, 0.6, (g, w, h, r) => {
      g.fillStyle = '#f2f2f2';
      g.fillRect(0, 0, w, h);
      const rows = 8;
      const cols = 5;
      const bh = h / rows;
      const bw = w / cols;
      const m = 4; // mortar in px
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let c = -1; c <= cols; c++) {
          const v = 150 + Math.floor(r() * 70);
          g.fillStyle = gray(v);
          g.fillRect(c * bw + off + m / 2, row * bh + m / 2, bw - m, bh - m);
        }
      }
      speckle(g, w, h, r, 6000, (r) => gray(0, 0.05 + r() * 0.08), 2);
    }),

  stone: () =>
    make('stone', 512, 256, 1.6, 0.8, (g, w, h, r) => {
      g.fillStyle = '#d8d8d8';
      g.fillRect(0, 0, w, h);
      let y = 0;
      while (y < h) {
        const rh = 40 + r() * 50;
        let x = -r() * 60;
        while (x < w) {
          const sw = 60 + r() * 110;
          g.fillStyle = gray(130 + Math.floor(r() * 90));
          g.fillRect(x + 3, y + 3, sw - 6, rh - 6);
          x += sw;
        }
        y += rh;
      }
      speckle(g, w, h, r, 5000, (r) => gray(0, 0.08), 2);
    }),

  shingles: () =>
    make('shingles', 512, 512, 1, 1, (g, w, h, r) => {
      g.fillStyle = '#5a5a5a';
      g.fillRect(0, 0, w, h);
      const rows = 5;
      const rh = h / rows;
      const tw = w / 3;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? tw / 2 : 0;
        for (let c = -1; c <= 3; c++) {
          const v = 150 + Math.floor(r() * 80);
          const grad = g.createLinearGradient(0, row * rh, 0, (row + 1) * rh);
          grad.addColorStop(0, gray(v - 40));
          grad.addColorStop(1, gray(v));
          g.fillStyle = grad;
          g.fillRect(c * tw + off + 2, row * rh, tw - 4, rh - 4);
        }
      }
      speckle(g, w, h, r, 14000, (r) => gray(r() > 0.5 ? 0 : 255, 0.12), 2);
    }),

  metalRoof: () =>
    make('metal', 128, 128, 0.5, 1, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#9a9a9a');
      grad.addColorStop(0.04, '#ffffff');
      grad.addColorStop(0.09, '#c4c4c4');
      grad.addColorStop(0.5, '#e6e6e6');
      grad.addColorStop(1, '#dcdcdc');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }),

  membrane: () =>
    make('membrane', 256, 256, 2, 2, (g, w, h, r) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 4000, (r) => gray(0, 0.06 + r() * 0.06), 2);
    }),

  grass: () =>
    make('grass', 512, 512, 3, 3, (g, w, h, r) => {
      g.fillStyle = '#6c934c';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(${60 + r() * 40},${110 + r() * 50},${40 + r() * 30},0.25)`;
        g.beginPath();
        g.arc(r() * w, r() * h, 20 + r() * 70, 0, Math.PI * 2);
        g.fill();
      }
      speckle(g, w, h, r, 30000, (r) => `rgba(${50 + r() * 70},${100 + r() * 80},${30 + r() * 40},0.7)`, 2);
    }),

  asphalt: () =>
    make('asphalt', 512, 512, 4, 4, (g, w, h, r) => {
      g.fillStyle = '#4b4e52';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 30000, (r) => gray(r() > 0.5 ? 30 : 120, 0.5), 2);
    }),

  paving: () =>
    make('paving', 256, 256, 1.5, 1.5, (g, w, h, r) => {
      g.fillStyle = '#d4d0c8';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 6000, (r) => gray(r() > 0.5 ? 80 : 255, 0.15), 2);
      g.fillStyle = gray(0, 0.25);
      g.fillRect(0, 0, w, 2);
      g.fillRect(0, 0, 2, h);
    }),

  woodFloor: () =>
    make('woodfloor', 512, 512, 2, 2, (g, w, h, r) => {
      const rows = 11; // ~0.18 m planks
      const ph = h / rows;
      for (let i = 0; i < rows; i++) {
        let x = -r() * 200;
        while (x < w) {
          const len = 150 + r() * 250;
          g.fillStyle = `rgb(${150 + r() * 40},${105 + r() * 30},${65 + r() * 20})`;
          g.fillRect(x, i * ph, len, ph);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x, i * ph, 2, ph);
          x += len;
        }
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(0, i * ph, w, 2);
      }
      for (let i = 0; i < 400; i++) {
        g.strokeStyle = 'rgba(60,30,10,0.08)';
        g.beginPath();
        const y = r() * h;
        g.moveTo(r() * w, y);
        g.lineTo(r() * w, y + (r() - 0.5) * 4);
        g.stroke();
      }
    }),

  tileFloor: () =>
    make('tilefloor', 256, 256, 1.2, 1.2, (g, w, h, r) => {
      g.fillStyle = '#bdbab4';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const v = 225 + Math.floor(r() * 20);
        g.fillStyle = gray(v);
        g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
      }
      speckle(g, w, h, r, 2000, (r) => gray(0, 0.04), 2);
    }),

  sand: () =>
    make('sand', 512, 512, 4, 4, (g, w, h, r) => {
      g.fillStyle = '#d8c19a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 50; i++) {
        g.fillStyle = `rgba(${170 + r() * 50},${140 + r() * 40},${100 + r() * 30},0.18)`;
        g.beginPath();
        g.ellipse(r() * w, r() * h, 40 + r() * 90, 10 + r() * 25, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      speckle(g, w, h, r, 25000, (r) => `rgba(${120 + r() * 120},${100 + r() * 90},${70 + r() * 60},0.5)`, 2);
    }),

  // Crop rows, drawn in grays so the field color comes from material.color.
  crops: () =>
    make('crops', 256, 256, 4, 4, (g, w, h, r) => {
      g.fillStyle = '#d9d9d9';
      g.fillRect(0, 0, w, h);
      const rows = 16;
      for (let i = 0; i < rows; i++) {
        g.fillStyle = gray(140 + Math.floor(r() * 30));
        g.fillRect(0, (i * h) / rows, w, h / rows / 2.2);
      }
      speckle(g, w, h, r, 6000, (r) => gray(r() > 0.5 ? 60 : 255, 0.15), 2);
    }),

  garageDoor: () =>
    make('garagedoor', 512, 256, 1, 1, (g, w, h) => {
      g.fillStyle = '#ececec';
      g.fillRect(0, 0, w, h);
      const panels = 4;
      for (let i = 0; i < panels; i++) {
        const y = (i * h) / panels;
        const grad = g.createLinearGradient(0, y, 0, y + h / panels);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#d6d6d6');
        g.fillStyle = grad;
        g.fillRect(0, y, w, h / panels);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, y, w, 3);
      }
      g.strokeStyle = 'rgba(0,0,0,0.06)';
      for (let x = 0; x < w; x += 6) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
    }),

  panelDoor: () =>
    make('paneldoor', 256, 512, 1, 1, (g, w, h, r) => {
      g.fillStyle = '#7b4a2a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) {
        g.strokeStyle = `rgba(40,20,5,${0.05 + r() * 0.08})`;
        g.beginPath();
        const x = r() * w;
        g.moveTo(x, 0);
        g.lineTo(x + (r() - 0.5) * 6, h);
        g.stroke();
      }
      const panel = (x, y, pw, ph) => {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x, y, pw, ph);
        g.fillStyle = 'rgba(255,220,180,0.12)';
        g.fillRect(x + 6, y + 6, pw - 12, ph - 12);
      };
      panel(30, 40, 85, 180);
      panel(141, 40, 85, 180);
      panel(30, 270, 85, 200);
      panel(141, 270, 85, 200);
    }),

  modernDoor: () =>
    make('moderndoor', 256, 512, 1, 1, (g, w, h, r) => {
      g.fillStyle = '#2b2d30';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) {
        g.fillStyle = `rgba(255,255,255,${r() * 0.03})`;
        g.fillRect(0, r() * h, w, 1);
      }
      g.fillStyle = '#6f8796';
      g.fillRect(40, 40, 40, h - 80);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(44, 44, 8, h - 88);
    }),
};

// Rescale a geometry's UVs so textures tile in meters (for planes and boxes sized in meters).
export function metersUV(geometry, w, h) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  uv.needsUpdate = true;
  return geometry;
}

// Planar UVs per triangle, in meters, aligned to each face's slope. For roofs and gable ends.
export function faceUV(geometry) {
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    if (Math.abs(n.y) > 0.999) u.set(1, 0, 0);
    else u.crossVectors(up, n).normalize();
    v.crossVectors(n, u).normalize();
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      uvs[(i + k) * 2] = p.dot(u);
      uvs[(i + k) * 2 + 1] = p.dot(v);
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}
