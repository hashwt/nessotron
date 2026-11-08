'use strict';
/*
 * Draws ORIGINAL characters (Student, Teacher, Doctor) in exactly the same sheet format as
 * the staged LimeZu characters, so the game loads them with no code changes:
 *
 *   <Name>_idle.png       64x32   4 frames 16x32         right, up, left, down
 *   <Name>_idle_anim.png 384x32  24 frames 16x32  6/dir  right, up, left, down
 *   <Name>_run.png       384x32  24 frames 16x32  6/dir  right, up, left, down
 *   <Name>_sit.png       384x32  12 frames 32x32  6/dir  right, left
 *   <Name>_sit2.png      384x32  12 frames 32x32  6/dir  right, left (typing)
 *   <Name>_sit3.png      192x32  12 frames 16x32  facing the viewer, 2 loops of 6
 *
 * Feet sit on the bottom rows of the frame (sprite origin is (0.5, 1)), left is always an
 * exact mirror of right, and run bobs up 1px on frames 1 and 4, like the pack's sheets.
 *
 * The art is pixel templates: one character per pixel, mapped through a per-character
 * palette. A frame is head (rows 9-22) + body (rows 23-28) + legs (rows 29-31).
 *
 * Usage: node tools/make_characters.js            (writes into public/assets/characters/)
 */

const fs = require('fs');
const path = require('path');
const png = require('./png.js');

const OUT = 'public/assets/characters';
const FW = 16, FH = 32;
const HEAD_Y = 9, BODY_Y = 23, LEGS_Y = 29;

// ============================================================ palettes
// o outline · e eye · s/S skin + shade · b blush · h/H/d hair light/mid/dark
// c/C main garment light/dark · k inner shirt · t accent (tie) · a/A bag · g/G gear
// p/P lower garment (pants, skirt, coat hem) · l/L legs · f shoes

const BASE = { o: '#383650', e: '#2a2838' };

const CHARACTERS = {
  Student: {
    hair: 'messy', body: 'student',
    pal: {
      h: '#8a5a3c', H: '#6b432c', d: '#4e3020',
      s: '#ffd2b5', S: '#f0b293', b: '#f39a8a',
      c: '#4a5a9c', C: '#34407a', k: '#eef0f5', t: '#d14b4b',
      a: '#e2843a', A: '#b8622a',
      p: '#6c7080', P: '#545766', l: '#6c7080', L: '#545766', f: '#4a3a32',
    },
  },
  Teacher: {
    hair: 'bun', body: 'teacher',
    pal: {
      h: '#6a4434', H: '#4f3226', d: '#36221a',
      s: '#e8b48e', S: '#d39a74', b: '#e0846e',
      c: '#a8435b', C: '#7f3145', k: '#f3e6cf', g: '#6e6488',
      p: '#4a4c63', P: '#3a3b4f', l: '#e8b48e', L: '#d39a74', f: '#2e2a33',
    },
  },
  Doctor: {
    hair: 'neat', body: 'doctor',
    pal: {
      h: '#4a4a58', H: '#33333e', d: '#22222a',
      s: '#b97f5a', S: '#9f6847', b: '#c46f55',
      c: '#f4f5f8', C: '#c8ccd8', k: '#3fa7a0', g: '#3a3f4f', G: '#9aa3b5',
      p: '#dfe2ea', P: '#b6bbc9', l: '#3fa7a0', L: '#2f8580', f: '#3a3a45',
    },
  },
};

// ============================================================ heads (rows 9-22)
// Each style has down (front), up (back) and right (side). Left = mirror of right.

const HEADS = {
  messy: {
    down: [
      '....o.oooo.o....',
      '...ohohhhhoho...',
      '..ohhhhhhhhhhho.',
      '.ohhhhhhhhhhhhHo',
      'ohhhhhhhhhhhhHHo',
      'oHhhhhhhhhhhHHHo',
      'oHHhHhhHHhHHHHHo',
      'oHHsHssHsssHsHHo',
      'oHsssssssssssHHo',
      'oHssssssssssssHo',
      'oHssessssssessHo',
      'oHssessssssessHo',
      '.oSsbssssssbsSo.',
      '..ooSSSSSSSSoo..',
    ],
    up: [
      '....o.oooo.o....',
      '...ohohhhhoho...',
      '..ohhhhhhhhhhho.',
      '.ohhhhhhhhhhhhho',
      'ohhhhhhhhhhhhhHo',
      'oHhhhhhhhhhhhhHo',
      'oHHhhhhhhhhhhHHo',
      'oHHHhhhhhhhhHHHo',
      'oHHHHhHhhHhHHHHo',
      'oHHHHHHHHHHHHHHo',
      'oHdHHHHHHHHHHdHo',
      'oHdHHdHHHHdHHdHo',
      '.odSSSSSSSSSSdo.',
      '..ooSSSSSSSSoo..',
    ],
    right: [
      '.....o.oooo.o...',
      '....ohohhhhoho..',
      '..oohhhhhhhhhhho',
      '.ohhhhhhhhhhhhho',
      'ohhhhhhhhhhhhhHo',
      'oHhhhhhhhhhHhHHo',
      'oHHHhhhhHhHHHHHo',
      'oHHHHHHHsssssHHo',
      'oHHHHHHSssssssso',
      'oHHdHHHSssssesso',
      'oHHdHHHSssssesso',
      'oHdHHHHSsssbssso',
      '.odHHHHSSssssSo.',
      '..ooddoSSSSSSo..',
    ],
  },
  bun: {
    down: [
      '.....oooooo.....',
      '....ohhhhhHo....',
      '..oooHhhhHHooo..',
      '.ohhhhhhhhhhhHHo',
      'ohhhhhhhhhhhhHHo',
      'ohhhhhhhhhhhHHHo',
      'oHhhhhhHhhhHHHHo',
      'oHHHHHssssHHHHHo',
      'oHHHsssssssssHHo',
      'oHHssssssssssHHo',
      'oHHgeggssggegHHo',
      'oHHsessssssesHHo',
      'oHdSbssssssbSdHo',
      'oHdoSSSSSSSSodHo',
    ],
    up: [
      '.....oooooo.....',
      '....ohhhhhHo....',
      '..ooHhhhhHHHoo..',
      '.ohhhhhhhhhhhhHo',
      'ohhhhhhhhhhhhhHo',
      'ohhhhhhhhhhhhHHo',
      'oHhhhhhhhhhhhHHo',
      'oHHhhhhhhhhhHHHo',
      'oHHHhhhhhhhHHHHo',
      'oHHHHHhhhHHHHHHo',
      'oHHHHHHHHHHHHHHo',
      'oHdHHHHHHHHHHdHo',
      'oHddHHHHHHHHddHo',
      'oHddddddddddddHo',
    ],
    right: [
      '...oooo.........',
      '..ohhHHooooo....',
      '..oHHoohhhhhoo..',
      '...ohhhhhhhhhho.',
      '..ohhhhhhhhhhhHo',
      '.ohhhhhhhhhhhHHo',
      'oHhhhhhhhhhHHHHo',
      'oHHHHHHHHsssssHo',
      'oHHHHHHHSssssss' + 'o',
      'oHHHHHHHSsssssso',
      'oHHdHHHHSsggegso',
      'oHHdHHHHSssseSso',
      'oHddHHHHSSssssSo',
      'oHdddHHHoSSSSSo.',
    ],
  },
  neat: {
    down: [
      '....oooooooo....',
      '..oohhhhhhhhoo..',
      '.ohhhhhhhhhhhhho',
      '.ohhhhhhhhhhhhHo',
      'ohhhhhhhhhhhhhHo',
      'oHhhhhhhhhHHHHHo',
      'oHHhhhhhHHHHHHHo',
      'oHHHHHHsssssssHo',
      'oHHsssssssssssHo',
      'oHssssssssssssHo',
      'oHssessssssessHo',
      'oHssessssssessHo',
      '.oSsbssssssbsSo.',
      '..ooSSSSSSSSoo..',
    ],
    up: [
      '....oooooooo....',
      '..oohhhhhhhhoo..',
      '.ohhhhhhhhhhhhho',
      '.ohhhhhhhhhhhhHo',
      'ohhhhhhhhhhhhhHo',
      'oHhhhhhhhhhhhHHo',
      'oHHhhhhhhhhhHHHo',
      'oHHHhhhhhhhHHHHo',
      'oHHHHHHHHHHHHHHo',
      'oHHHHHHHHHHHHHHo',
      'oHHHHHHHHHHHHHHo',
      'oHdHHHHHHHHHHdHo',
      '.odSSSSSSSSSSdo.',
      '..ooSSSSSSSSoo..',
    ],
    right: [
      '.....oooooooo...',
      '...oohhhhhhhhoo.',
      '..ohhhhhhhhhhhho',
      '.ohhhhhhhhhhhhho',
      '.ohhhhhhhhhhhhHo',
      'oHhhhhhhhhhhHHHo',
      'oHHHhhhhhHHHHHHo',
      'oHHHHHHHssssssHo',
      'oHHHHHHSssssssso',
      'oHHdHHHSssssesso',
      'oHHdHHHSssssesso',
      'oHdHHHHSsssbssso',
      '.odHHHHSSssssSo.',
      '..ooddoSSSSSSo..',
    ],
  },
};

// ============================================================ bodies (rows 23-28)

const BODIES = {
  student: {
    down: [
      '...oakkttkkao...',
      '..oacCcttcCcao..',
      '.osacCccccCcaso.',
      '.oSaccccccccaSo.',
      '..ooppppppppoo..',
      '...oppppPpppo...',
    ],
    up: [
      '...oaaaaaaaao...',
      '..ocaAaaaaAaco..',
      '.oscaAaaaaAacso.',
      '.oScaAAAAAAacSo.',
      '..ooaaaaaaaaoo..',
      '...oppppppppo...',
    ],
    right: [
      '....oaokkto.....',
      '...oAaocCcto....',
      '...oAaocccso....',
      '...oAaoccCSo....',
      '....ooopppPo....',
      '.....opppPo.....',
    ],
  },
  teacher: {
    down: [
      '.dooCkkkkkkCood.',
      '.doCcckkkkccCod.',
      '.oscCckkkkcCcso.',
      '.oScCcccccccCSo.',
      '..oppppppppppo..',
      '.oPPppppppppPPo.',
    ],
    up: [
      '..oCddddddddCo..',
      '.oCcddddddddcCo.',
      '.oscCcddddcCcso.',
      '.oScCcccccccCSo.',
      '..oppppppppppo..',
      '.oPPppppppppPPo.',
    ],
    right: [
      '...odoCkko......',
      '...odoCcCko.....',
      '....oCcccso.....',
      '....oCcccSo.....',
      '....oppppppo....',
      '...oPpppppPo....',
    ],
  },
  doctor: {
    down: [
      '..oCcgkkkkgcCo..',
      '.oCccgkkkkgccCo.',
      '.oscCcgkkgcCcso.',
      '.oScCccgGcccCSo.',
      '..oCccccccccCo..',
      '..oCcccoocccCo..',
    ],
    up: [
      '..oCccccccccCo..',
      '.oCcccccccccCco.',
      '.oscCcccccccCso.',
      '.oScCcccccccCSo.',
      '..oCcccCccccCo..',
      '..oCccccocccCo..',
    ],
    right: [
      '....oCcgko......',
      '....oCccgko.....',
      '....oCcccso.....',
      '....oCcgGSo.....',
      '....oCccccCo....',
      '....oCcccCo.....',
    ],
  },
};

// ============================================================ legs (rows 29-31)

const LEGS = {
  front: {
    stand: ['...ollLooLllo...', '...offo..offo...', '....oo....oo....'],
    stepA: ['...offo.oLllo...', '....oo..offfo...', '.........ooo....'],
  },
  side: {
    stand: ['.....ollLo......', '.....offffo.....', '......oooo......'],
    stride: ['....olo..oLlo...', '...ofo....offo..', '...oo......ooo..'],
    pass: ['.....ollLo......', '.....offfo......', '......ooo.......'],
  },
};

// Seated legs, side view (rows 27-30), drawn under the side torso's first 4 rows.
const SIT_SIDE_LEGS = [
  '....opppppppo...',
  '....oLlllllLo...',
  '..........olo...',
  '..........offo..',
];
const SIT_FRONT_LEGS = [
  '...oppppppppo...',
  '...olllooLllo...',
  '...offo..offo...',
  '....oo....oo....',
];

// ============================================================ drawing

function hexToBGRA(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, 255];
}

class Sheet {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4, 0);
  }

  /** Stamp a template with its top-left at (x, y). '.' is transparent. */
  stamp(rows, x, y, pal, { mirror = false, frameW = FW, frameX = 0 } = {}) {
    rows.forEach((row, r) => {
      if (row.length !== FW) throw new Error(`template row is ${row.length} wide, not ${FW}: "${row}"`);
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        const col = pal[ch];
        if (!col) throw new Error(`no colour for '${ch}'`);
        let px = x + c;
        if (mirror) px = frameX + (frameW - 1 - (px - frameX));
        const py = y + r;
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
        const d = (py * this.w + px) * 4;
        const [b, g, rr, a] = hexToBGRA(col);
        this.buf[d] = b; this.buf[d + 1] = g; this.buf[d + 2] = rr; this.buf[d + 3] = a;
      }
    });
  }

  save(file) {
    fs.writeFileSync(file, png.encodeBGRA(this.buf, this.w, this.h));
  }
}

/** Swap the eye colour for skin shade: a one-frame blink. */
const blink = (rows) => rows.map((r) => r.replace(/e/g, 'S'));
/** Mirror a 16-wide template left/right. */
const flip = (rows) => rows.map((r) => [...r].reverse().join(''));

/**
 * Draw one 16x32 standing figure into `sheet` at frame origin fx.
 * dir: 'down' | 'up' | 'right' | 'left'. Options shift the head (breathing), shift the
 * whole figure (run bob), swap legs, and blink.
 */
function drawStanding(sheet, fx, ch, dir, { legs, headDy = 0, bob = 0, blinking = false } = {}) {
  const view = dir === 'left' ? 'right' : dir;
  const mirror = dir === 'left';
  let head = HEADS[ch.hair][view];
  if (blinking) head = blink(head);
  const body = BODIES[ch.body][view];
  const legRows = legs || (view === 'right' ? LEGS.side.stand : LEGS.front.stand);
  const pal = ch.palette;
  const opts = { mirror, frameX: fx };
  sheet.stamp(legRows, fx, LEGS_Y - bob, pal, opts);
  sheet.stamp(body, fx, BODY_Y - bob, pal, opts);
  sheet.stamp(head, fx, HEAD_Y - bob + headDy, pal, opts); // head last: it overlaps the collar
}

const DIRS4 = ['right', 'up', 'left', 'down'];

function makeIdle(ch) {
  const s = new Sheet(FW * 4, FH);
  DIRS4.forEach((dir, i) => drawStanding(s, i * FW, ch, dir));
  return s;
}

function makeIdleAnim(ch) {
  // Breathe: the head dips 1px on frames 2-3. Blink on frame 5.
  const s = new Sheet(FW * 24, FH);
  DIRS4.forEach((dir, d) => {
    for (let f = 0; f < 6; f++) {
      drawStanding(s, (d * 6 + f) * FW, ch, dir, { headDy: f === 2 || f === 3 ? 1 : 0, blinking: f === 5 });
    }
  });
  return s;
}

function makeRun(ch) {
  // Six-frame cycle with a 1px bob on frames 1 and 4, like the pack's run sheets.
  const s = new Sheet(FW * 24, FH);
  const bob = [0, 1, 0, 0, 1, 0];
  const front = [LEGS.front.stepA, LEGS.front.stepA, LEGS.front.stand,
    flip(LEGS.front.stepA), flip(LEGS.front.stepA), LEGS.front.stand];
  const side = [LEGS.side.stride, LEGS.side.pass, LEGS.side.stand,
    LEGS.side.stride, LEGS.side.pass, LEGS.side.stand];
  DIRS4.forEach((dir, d) => {
    const legs = dir === 'right' || dir === 'left' ? side : front;
    for (let f = 0; f < 6; f++) drawStanding(s, (d * 6 + f) * FW, ch, dir, { legs: legs[f], bob: bob[f] });
  });
  return s;
}

/**
 * Seated side view in a 32x32 frame. Facing right, the figure occupies x 6-21; the left
 * frames are exact mirrors of the whole 32px frame (so x 10-25), as in the pack.
 * `handX` lets sit2 animate typing.
 */
function drawSeatedSide(sheet, fx, ch, mirror, { lift = 0, handX = 0, blinking = false, frameW = 32, ox = 6 } = {}) {
  const pal = ch.palette;
  const opts = { mirror, frameX: fx, frameW };
  const x = fx + ox;
  const torso = BODIES[ch.body].right.slice(0, 4).map((row) => row.split(''));
  if (handX) {
    // Slide the hand (row 2 of the torso) forward to reach the keyboard.
    const r = torso[2];
    const hi = r.lastIndexOf('s');
    r[hi + handX] = 's';
    r[hi + handX + 1] = 'o';
    if (r[hi + 1] === 'o' && handX > 0) r[hi + 1] = 's';
  }
  let head = HEADS[ch.hair].right;
  if (blinking) head = blink(head);
  sheet.stamp(SIT_SIDE_LEGS, x, BODY_Y + 4, pal, opts);
  sheet.stamp(torso.map((r) => r.join('')), x, BODY_Y - lift, pal, opts);
  sheet.stamp(head, x, HEAD_Y - lift, pal, opts);
}

function makeSit(ch, typing) {
  const s = new Sheet(32 * 12, FH);
  const lift = [0, 0, 1, 1, 0, 0];
  const hand = typing ? [1, 2, 1, 2, 1, 2] : [1, 1, 1, 1, 1, 1];
  for (let side = 0; side < 2; side++) {
    for (let f = 0; f < 6; f++) {
      drawSeatedSide(s, (side * 6 + f) * 32, ch, side === 1,
        { lift: lift[f], handX: hand[f], blinking: !typing && f === 5 });
    }
  }
  return s;
}

function makeSit3(ch) {
  // Seated FACING THE VIEWER, as in the pack's sit3: 12 frames of 16x32, two 6-frame loops.
  // Frames 0-5 breathe (1px rise on 2-3) and blink on 5; frames 6-11 are their exact mirrors,
  // the pack's "head turned the other way" loop. Feet end on row 30.
  const s = new Sheet(FW * 12, FH);
  const pal = ch.palette;
  for (let k = 0; k < 12; k++) {
    const f = k % 6, fx = k * FW;
    const opts = { mirror: k >= 6, frameX: fx };
    const lift = f === 2 || f === 3 ? 1 : 0;
    let head = HEADS[ch.hair].down;
    if (f === 5) head = blink(head);
    s.stamp(SIT_FRONT_LEGS, fx, BODY_Y + 4, pal, opts);
    s.stamp(BODIES[ch.body].down.slice(0, 4), fx, BODY_Y - lift, pal, opts);
    s.stamp(head, fx, HEAD_Y - lift, pal, opts);
  }
  return s;
}

// ============================================================ main

fs.mkdirSync(OUT, { recursive: true });
for (const [name, def] of Object.entries(CHARACTERS)) {
  const ch = { ...def, palette: { ...BASE, ...def.pal } };
  const sheets = {
    idle: makeIdle(ch),
    idle_anim: makeIdleAnim(ch),
    run: makeRun(ch),
    sit: makeSit(ch, false),
    sit2: makeSit(ch, true),
    sit3: makeSit3(ch),
  };
  for (const [sheet, img] of Object.entries(sheets)) img.save(path.join(OUT, `${name}_${sheet}.png`));
  console.log(`${name}: ${Object.keys(sheets).join(', ')}`);
}

// Register them in characters.json next to the staged pack characters.
const manifestPath = path.join(OUT, 'characters.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const name of Object.keys(CHARACTERS)) {
    if (!manifest.characters.includes(name)) manifest.characters.push(name);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log(`characters.json: ${manifest.characters.join(', ')}`);
}
