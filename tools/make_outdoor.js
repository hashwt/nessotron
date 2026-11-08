'use strict';
/*
 * Draws the ORIGINAL outdoor art for Sunnyside HQ: ground tiles, street furniture, the lounge's
 * outer wall and door, and the vehicles. Nothing here comes from a pack; every pixel is placed
 * by the code below, in the same 16px top-down style as the office (and with the office's dark
 * navy outline colour, so the two sit together).
 *
 * Writes into public/assets/outdoor/:
 *   outdoor.png    16x16 tileset, 16 columns. Tile names -> indices are in outdoor.json.
 *   door.png       32x32: two 16x32 frames of the sliding glass door, 0 = closed, 1 = open.
 *   vehicles.png   448x32: seven 64x32 frames, all facing RIGHT (the game mirrors them):
 *                  0-4 cars (red, blue, taxi, white, green), 5 bus doors shut, 6 bus doors open.
 *
 * Usage: node tools/make_outdoor.js
 */

const fs = require('fs');
const path = require('path');
const png = require('./png.js');

const OUT = 'public/assets/outdoor';
const T = 16;

// ============================================================ colours

const C = {
  outline: '#3a3a50',      // the office pack's outline colour
  wallFill: '#fdfdfd',     // the office's wall-cap white
  grass: '#7cb15a', grassDark: '#6a9e4d', grassLight: '#90c46a', tuft: '#5b8c43',
  flowerA: '#f2e27a', flowerB: '#f29ab0',
  pave: '#cdc8c0', paveJoint: '#b4aea6', paveLight: '#dbd7d0',
  curbTop: '#ebe8e2', curbFace: '#a29c94', curbShadow: '#474952',
  asphalt: '#5d5f68', asphaltDark: '#555760', asphaltLight: '#666871',
  white: '#eceae4', yellow: '#e8c547',
  leafDark: '#3e7744', leaf: '#4e9250', leafLight: '#6cae5c', leafHi: '#8cc874',
  trunk: '#7a5236', trunkDark: '#5a3c28', shadow: '#5a8a43',
  metal: '#4a4d5c', metalLight: '#6e7286', lampGlow: '#fff4b8',
  glass: '#a9d8ea', glassHi: '#dcf2fa', glassDark: '#86bfd6',
  roof: '#4a6fa5', roofLight: '#6a8fc4',
  wood: '#b67d4a', woodDark: '#8a5a34', woodLight: '#cf9862',
  signBlue: '#3a6fc0', poster: '#f0b04a', posterB: '#e0605a',
  binBody: '#6f8a6a', binDark: '#56704f',
  threshold: '#8f93a3', thresholdLight: '#b6bac7',
  tyre: '#2b2b36', hub: '#8a8d9a',
  carGlass: '#3e5272', carGlassHi: '#7d9cc6', headlight: '#fff4b8', taillight: '#e2534d',
};

function rgba(hex, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, a]; // BGRA
}

/** A tiny BGRA canvas with the few primitives pixel art needs. */
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.buf = Buffer.alloc(w * h * 4, 0); }
  px(x, y, hex, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !hex) return;
    const d = (y * this.w + x) * 4;
    const [b, g, r] = rgba(hex);
    if (a === 255 || this.buf[d + 3] === 0) {
      this.buf[d] = b; this.buf[d + 1] = g; this.buf[d + 2] = r; this.buf[d + 3] = a;
    } else { // blend over what is there
      const ia = 255 - a;
      this.buf[d] = Math.round((b * a + this.buf[d] * ia) / 255);
      this.buf[d + 1] = Math.round((g * a + this.buf[d + 1] * ia) / 255);
      this.buf[d + 2] = Math.round((r * a + this.buf[d + 2] * ia) / 255);
    }
  }
  rect(x, y, w, h, hex, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, hex, a); }
  hline(x, y, w, hex) { this.rect(x, y, w, 1, hex); }
  vline(x, y, h, hex) { this.rect(x, y, 1, h, hex); }
  /** Filled rect with a 1px outline and the corners knocked off (rounded look). */
  box(x, y, w, h, fill, outline = C.outline) {
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
    this.hline(x + 1, y, w - 2, outline); this.hline(x + 1, y + h - 1, w - 2, outline);
    this.vline(x, y + 1, h - 2, outline); this.vline(x + w - 1, y + 1, h - 2, outline);
  }
  /** Filled ellipse inside the box (x, y, w, h). */
  ellipse(x, y, w, h, hex, a) {
    const cx = x + (w - 1) / 2, cy = y + (h - 1) / 2, rx = w / 2, ry = h / 2;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (x + i - cx) / rx, dy = (y + j - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x + i, y + j, hex, a);
    }
  }
  /** Copy another canvas in, optionally mirrored left-right. */
  blit(src, dx, dy, mirror = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const s = (y * src.w + (mirror ? src.w - 1 - x : x)) * 4;
      if (!src.buf[s + 3]) continue;
      const tx = dx + x, ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      src.buf.copy(this.buf, (ty * this.w + tx) * 4, s, s + 4);
    }
  }
  save(file) { fs.writeFileSync(file, png.encodeBGRA(this.buf, this.w, this.h)); }
}

/** Deterministic noise, so every run draws the same pixels. */
function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ============================================================ ground tiles

function grass(c, seed, { tufts = 3, flowers = 0 } = {}) {
  const r = rand(seed);
  c.rect(0, 0, T, T, C.grass);
  for (let i = 0; i < 18; i++) c.px(r() * T, r() * T, r() < 0.5 ? C.grassDark : C.grassLight);
  for (let i = 0; i < tufts; i++) {
    const x = 1 + Math.floor(r() * 13), y = 2 + Math.floor(r() * 12);
    c.px(x, y, C.tuft); c.px(x + 1, y - 1, C.tuft); c.px(x + 2, y, C.tuft);
  }
  for (let i = 0; i < flowers; i++) {
    const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
    const col = i % 2 ? C.flowerA : C.flowerB;
    c.px(x, y - 1, col); c.px(x - 1, y, col); c.px(x + 1, y, col); c.px(x, y + 1, col); c.px(x, y, C.flowerA);
  }
}

/** Paving: four 8x8 slabs with joints, lit along each slab's top edge. */
function paving(c) {
  c.rect(0, 0, T, T, C.pave);
  for (const y of [0, 8]) { c.hline(0, y, T, C.paveJoint); c.hline(0, y + 1, T, C.paveLight); }
  for (const x of [0, 8]) c.vline(x, 0, T, C.paveJoint);
}

function asphalt(c, seed) {
  const r = rand(seed);
  c.rect(0, 0, T, T, C.asphalt);
  for (let i = 0; i < 22; i++) c.px(r() * T, r() * T, r() < 0.5 ? C.asphaltDark : C.asphaltLight);
}

// ============================================================ tileset

const tiles = [];          // { name, canvas }
const names = {};
function tile(name, draw) {
  const c = new Canvas(T, T);
  draw(c);
  names[name] = tiles.length;
  tiles.push(c);
}

// Ground
tile('grass', (c) => grass(c, 11, { tufts: 2 }));
tile('grass2', (c) => grass(c, 23, { tufts: 4 }));
tile('grass_flowers', (c) => grass(c, 37, { tufts: 1, flowers: 3 }));
tile('pave', (c) => paving(c));
tile('curb_north', (c) => {            // sidewalk whose bottom edge is the curb down to the road
  paving(c);
  c.hline(0, 12, T, C.curbTop);
  c.rect(0, 13, T, 2, C.curbFace);
  c.hline(0, 15, T, C.curbShadow);
});
tile('curb_south', (c) => {            // sidewalk whose top edge is the curb up from the road
  paving(c);
  c.hline(0, 0, T, C.curbShadow);
  c.hline(0, 1, T, C.curbFace);
  c.hline(0, 2, T, C.curbTop);
});
tile('road', (c) => asphalt(c, 5));
tile('road2', (c) => asphalt(c, 9));
tile('road_dash', (c) => {             // centre line: 8px dash, 8px gap, on the bottom 2 rows
  asphalt(c, 13);
  c.rect(0, 14, 8, 2, C.white);
});
tile('road_bus_line', (c) => {         // yellow bus-bay line along the curb
  asphalt(c, 17);
  c.rect(0, 1, T, 2, C.yellow);
});
tile('road_bus_text', (c) => {         // "BUS" painted in the bay, plus the centre dash
  asphalt(c, 19);
  c.rect(0, 14, 8, 2, C.white);
  const glyphs = {
    B: ['11.', '1.1', '11.', '1.1', '11.'],
    U: ['1.1', '1.1', '1.1', '1.1', '111'],
    S: ['.11', '1..', '.1.', '..1', '11.'],
  };
  ['B', 'U', 'S'].forEach((g, i) => glyphs[g].forEach((row, y) => {
    for (let x = 0; x < 3; x++) if (row[x] === '1') c.px(2 + i * 4 + x, 5 + y, C.yellow);
  }));
});
tile('crosswalk', (c) => {             // zebra blocks; two side by side make the crossing
  asphalt(c, 29);
  c.rect(2, 1, 12, 5, C.white);
  c.rect(2, 9, 12, 5, C.white);
});

// The lounge's outer wall. The lounge floor ends at the tile's right edge, so the wall is a
// 7px strip on x 9-15 in the office's own style: outline, white cap fill, outline.
const wallStrip = (c, y0, y1) => {
  c.rect(9, y0, 1, y1 - y0, C.outline);
  c.rect(10, y0, 5, y1 - y0, C.wallFill);
  c.rect(15, y0, 1, y1 - y0, C.outline);
};
tile('wall_top', (c) => {              // meets the lounge's top wall: outline row 0, cap rows 1-5
  wallStrip(c, 0, T);
  c.hline(9, 0, 7, C.outline);
  c.rect(15, 1, 1, 5, C.wallFill);     // open into the cap so the two walls join
});
tile('wall_mid', (c) => wallStrip(c, 0, T));
tile('wall_bottom', (c) => {           // meets the lounge's bottom wall (outline 0, fill 1-4, outline 5)
  wallStrip(c, 0, 6);
  c.rect(15, 1, 1, 4, C.wallFill);
  c.hline(9, 5, 7, C.outline);
});
tile('wall_end_above_door', (c) => { wallStrip(c, 0, T); c.hline(9, 15, 7, C.outline); });
tile('wall_end_below_door', (c) => { wallStrip(c, 0, T); c.hline(9, 0, 7, C.outline); });

// Props (drawn over the ground; the build marks their cells as blocked where they stand)
tile('bush', (c) => {
  c.ellipse(1, 9, 14, 6, C.shadow);
  c.ellipse(1, 2, 14, 12, C.outline);
  c.ellipse(2, 3, 12, 10, C.leaf);
  c.ellipse(3, 3, 7, 5, C.leafLight);
  c.px(5, 4, C.leafHi); c.px(10, 9, C.leafDark); c.px(4, 10, C.leafDark);
});

// Tree, 32x32 as four tiles: canopy on top (drawn ABOVE the player), trunk below.
{
  const t = new Canvas(32, 32);
  t.ellipse(6, 26, 20, 6, C.shadow);
  t.rect(13, 20, 6, 9, C.outline);
  t.rect(14, 20, 4, 8, C.trunk);
  t.vline(14, 20, 8, C.trunkDark);
  t.ellipse(2, 1, 28, 24, C.outline);
  t.ellipse(3, 2, 26, 22, C.leafDark);
  t.ellipse(4, 2, 23, 18, C.leaf);
  t.ellipse(7, 3, 14, 10, C.leafLight);
  t.ellipse(9, 4, 6, 4, C.leafHi);
  const r = rand(77);
  for (let i = 0; i < 26; i++) {
    const x = 5 + r() * 22, y = 4 + r() * 16;
    t.px(x, y, r() < 0.5 ? C.leafDark : C.leafLight);
  }
  for (const [n, sx, sy] of [['tree_tl', 0, 0], ['tree_tr', 16, 0], ['tree_bl', 0, 16], ['tree_br', 16, 16]]) {
    tile(n, (c) => c.blit(crop(t, sx, sy), 0, 0));
  }
}

// Street lamp, 16x32: head on top (above the player), pole and base below.
{
  const t = new Canvas(16, 32);
  t.ellipse(4, 28, 8, 3, C.shadow);
  t.rect(6, 6, 4, 24, C.outline);
  t.rect(7, 6, 2, 23, C.metal);
  t.vline(7, 6, 23, C.metalLight);
  t.rect(5, 26, 6, 4, C.outline);
  t.rect(6, 26, 4, 3, C.metal);
  t.box(2, 1, 12, 6, C.metal);
  t.hline(4, 6, 8, C.lampGlow);
  t.hline(5, 7, 6, C.lampGlow);
  tile('lamp_top', (c) => c.blit(crop(t, 0, 0), 0, 0));
  tile('lamp_bottom', (c) => c.blit(crop(t, 0, 16), 0, 0));
}

// Bus-stop sign, 16x32: round blue sign with a white bus on top, pole below.
{
  const t = new Canvas(16, 32);
  t.ellipse(5, 28, 6, 3, C.shadow);
  t.rect(7, 12, 2, 18, C.outline);
  t.vline(7, 12, 17, C.metalLight);
  t.ellipse(1, 0, 14, 13, C.outline);
  t.ellipse(2, 1, 12, 11, C.signBlue);
  t.rect(4, 4, 8, 4, C.white);          // a tiny bus
  t.hline(5, 5, 6, C.signBlue);
  t.px(5, 8, C.white); t.px(10, 8, C.white);
  tile('sign_top', (c) => c.blit(crop(t, 0, 0), 0, 0));
  tile('sign_bottom', (c) => c.blit(crop(t, 0, 16), 0, 0));
}

tile('bin', (c) => {
  c.ellipse(3, 12, 10, 3, C.shadow);
  c.box(3, 4, 10, 10, C.binBody);
  c.vline(5, 5, 8, C.binDark); c.vline(8, 5, 8, C.binDark);
  c.box(2, 2, 12, 3, C.metal);
});

// Bus shelter, 64x32 as two rows of four tiles. Top row: roof and glass back panel. Bottom
// row: the bench (three seats, walkable so you can sit) and a side panel with an advert.
{
  const t = new Canvas(64, 32);
  // back panel (glass) between two posts
  t.rect(1, 4, 62, 12, C.outline);
  t.rect(2, 5, 60, 10, C.glass);
  for (let x = 4; x < 60; x += 9) { t.vline(x, 6, 7, C.glassHi); t.vline(x + 1, 6, 3, C.glassHi); }
  t.hline(2, 14, 60, C.glassDark);
  // roof
  t.rect(0, 0, 64, 5, C.outline);
  t.rect(1, 1, 62, 3, C.roof);
  t.hline(1, 1, 62, C.roofLight);
  // posts
  t.rect(1, 4, 2, 26, C.outline); t.rect(61, 4, 2, 26, C.outline);
  t.vline(1, 5, 24, C.metalLight); t.vline(62, 5, 24, C.metalLight);
  // bench (x 4-47) seen from the front: backrest, seat, legs
  t.rect(4, 15, 44, 4, C.outline);
  t.rect(5, 16, 42, 2, C.wood);
  t.rect(4, 20, 44, 4, C.outline);
  t.rect(5, 21, 42, 2, C.woodLight);
  t.hline(5, 22, 42, C.wood);
  for (const lx of [6, 25, 44]) t.rect(lx, 24, 2, 5, C.outline);
  // side panel with a poster (x 50-60)
  t.rect(49, 5, 12, 25, C.outline);
  t.rect(50, 6, 10, 23, C.glass);
  t.rect(51, 8, 8, 17, C.poster);
  t.rect(52, 10, 6, 6, C.posterB);
  t.hline(52, 19, 6, C.white); t.hline(52, 21, 4, C.white);
  for (let i = 0; i < 4; i++) {
    tile(`shelter_top${i}`, (c) => c.blit(crop(t, i * 16, 0), 0, 0));
    tile(`shelter_bottom${i}`, (c) => c.blit(crop(t, i * 16, 16), 0, 0));
  }
}

function crop(src, sx, sy, w = T, h = T) {
  const c = new Canvas(w, h);
  for (let y = 0; y < h; y++) src.buf.copy(c.buf, y * w * 4, ((sy + y) * src.w + sx) * 4, ((sy + y) * src.w + sx + w) * 4);
  return c;
}

// ============================================================ door (2 frames of 16x32)

function drawDoor(open) {
  const c = new Canvas(16, 32);
  // threshold in the wall gap
  c.rect(9, 0, 7, 32, C.threshold);
  c.vline(12, 0, 32, C.thresholdLight);
  // door posts at both ends, continuing the wall outline
  c.hline(9, 0, 7, C.outline); c.hline(9, 31, 7, C.outline);
  if (!open) {
    for (const [y0, y1] of [[1, 15], [16, 31]]) {           // two glass leaves meeting in the middle
      c.rect(9, y0, 7, y1 - y0, C.outline);
      c.rect(10, y0 + 1, 5, y1 - y0 - 2, C.glass);
      c.vline(11, y0 + 2, y1 - y0 - 6, C.glassHi);
    }
  } else {                                                    // leaves slid into the wall pockets
    for (const [y0, y1] of [[1, 4], [28, 31]]) {
      c.rect(9, y0, 7, y1 - y0, C.outline);
      c.rect(10, y0, 5, y1 - y0, C.glass);
    }
  }
  return c;
}

// ============================================================ vehicles (64x32, facing right)

function drawCar(body, { taxi = false } = {}) {
  const c = new Canvas(64, 32);
  const dark = shade(body, -0.22), light = shade(body, 0.18);
  c.ellipse(8, 25, 48, 6, '#000000', 70);                     // shadow on the road
  // lower body (the side we see)
  c.box(10, 14, 44, 13, body);
  c.hline(11, 25, 42, dark);
  c.hline(11, 20, 42, dark);                                  // door seam / trim line
  // cabin: roof and windows, set back from the bonnet
  c.box(16, 5, 28, 11, light);
  c.rect(17, 10, 26, 5, C.carGlass);
  c.hline(17, 10, 26, C.carGlassHi);
  c.vline(29, 10, 5, light);                                  // pillar between the windows
  c.rect(43, 8, 3, 7, C.carGlass);                            // windscreen edge, front is right
  c.px(43, 8, C.carGlassHi);
  // lights
  c.rect(52, 16, 2, 3, C.headlight);
  c.rect(10, 16, 1, 3, C.taillight);
  // wheels
  for (const wx of [15, 41]) {
    c.ellipse(wx, 22, 9, 9, C.outline);
    c.ellipse(wx + 1, 23, 7, 7, C.tyre);
    c.rect(wx + 3, 25, 3, 3, C.hub);
  }
  if (taxi) {
    c.box(26, 2, 10, 4, C.yellow);
    c.hline(28, 3, 6, C.outline);
  }
  return c;
}

function drawBus(doorsOpen) {
  const c = new Canvas(64, 32);
  const body = '#3f8f72', dark = '#2f6f58', light = '#5aae8c';
  c.ellipse(2, 26, 60, 6, '#000000', 70);
  c.box(1, 1, 62, 27, body);
  c.rect(2, 2, 60, 3, light);                                 // roof
  c.rect(2, 7, 46, 8, C.outline);                             // window band
  for (let x = 3; x < 47; x += 9) {
    c.rect(x, 8, 8, 6, C.carGlass);
    c.hline(x, 8, 8, C.carGlassHi);
  }
  c.rect(57, 6, 5, 9, C.carGlass);                            // windscreen (front is right)
  c.vline(58, 7, 7, C.carGlassHi);
  c.rect(2, 17, 60, 2, C.white);                              // stripe
  c.hline(2, 25, 60, dark);
  // door (x 49-55)
  c.rect(49, 6, 7, 20, C.outline);
  if (doorsOpen) {
    c.rect(50, 7, 5, 18, '#23232e');
    c.vline(50, 7, 18, C.carGlass);
  } else {
    c.rect(50, 7, 2, 18, C.carGlass); c.rect(53, 7, 2, 18, C.carGlass);
    c.vline(50, 8, 6, C.carGlassHi); c.vline(53, 8, 6, C.carGlassHi);
  }
  c.rect(61, 19, 2, 3, C.headlight);
  c.rect(1, 19, 1, 3, C.taillight);
  for (const wx of [8, 40]) {
    c.ellipse(wx, 22, 10, 10, C.outline);
    c.ellipse(wx + 1, 23, 8, 8, C.tyre);
    c.rect(wx + 4, 26, 3, 3, C.hub);
  }
  return c;
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = f(n >> 16), g = f((n >> 8) & 0xff), b = f(n & 0xff);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ============================================================ write

fs.mkdirSync(OUT, { recursive: true });

const COLS = 16;
const rows = Math.ceil(tiles.length / COLS);
const sheet = new Canvas(COLS * T, rows * T);
tiles.forEach((t, i) => sheet.blit(t, (i % COLS) * T, Math.floor(i / COLS) * T));
sheet.save(path.join(OUT, 'outdoor.png'));
fs.writeFileSync(path.join(OUT, 'outdoor.json'), JSON.stringify({
  tilewidth: T, tileheight: T, columns: COLS, tilecount: COLS * rows,
  imagewidth: COLS * T, imageheight: rows * T, tiles: names,
}, null, 1));

const door = new Canvas(32, 32);
door.blit(drawDoor(false), 0, 0);
door.blit(drawDoor(true), 16, 0);
door.save(path.join(OUT, 'door.png'));

const vehicles = new Canvas(64 * 7, 32);
['#d0504a', '#4a7fd0', '#e8c040', '#e6e6ee', '#5aa05a'].forEach((col, i) =>
  vehicles.blit(drawCar(col, { taxi: i === 2 }), i * 64, 0));
vehicles.blit(drawBus(false), 5 * 64, 0);
vehicles.blit(drawBus(true), 6 * 64, 0);
vehicles.save(path.join(OUT, 'vehicles.png'));

console.log(`outdoor.png: ${tiles.length} tiles (${COLS}x${rows}); door.png: 2 frames; vehicles.png: 7 frames`);
