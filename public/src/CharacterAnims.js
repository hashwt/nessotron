/*
 * Animation layout for the LimeZu character sheets.
 *
 * All of this was measured from the actual PNGs, not taken from filenames. The sheets do
 * NOT share one geometry, and a wrong guess just plays nonsense frames without an error:
 *
 *   idle / idle_anim / run   16x32 frames, 4 directions: right, up, left, down
 *   sit / sit2               32x32 frames, 2 directions: right, left
 *
 * Sitting is side-on at a desk, so it has no up/down art and its frames are twice as wide.
 * Sliced at 16px, the face straddles two cells (skin at x~13, then x~1), which is the tell.
 *
 * How the 4-way order was established: idle frames 0 and 2 are exact mirrors of each other
 * (zero pixel difference), so they are the two side views. Frame 1 has no bright skin in the
 * head rows (back of the head = up), frame 3 has the most (face = down), and frame 0's skin
 * centroid is right of centre (8.66 vs 7.5), so it faces right. For sit, frames 0-5 face
 * right and 6-11 are their mirrors.
 *
 *   sit3                   16x32 frames, sitting FACING THE VIEWER (down). 12 frames = two
 *                          6-frame loops, head turned one way and then the other. Measured:
 *                          every frame's art spans x 0-15, so frames are 16 wide, not 32, and
 *                          the feet are on row 30.
 *
 *                          It is NOT used for sitting facing down: the head is turned to one
 *                          side, and on long-haired characters (the Receptionist) the hair then hides the
 *                          face, so she reads as sitting with her back to you.
 *
 *   sit_up / sit_down      16x32, sitting seen from behind / facing the viewer. Not files: built
 *                          in the browser from each character's own standing back / front idle
 *                          frames (see seatPose): head and body unchanged, legs replaced by the
 *                          lap on the seat. Same convention as the pack's sit3: the head stays at
 *                          its standing height and the figure ends on row 30.
 *
 * So every character sits in all four directions: right/left 'sit', down 'sit_down', up 'sit_up'.
 *
 * Deliberately NOT registered because its layout hasn't been confirmed:
 *   phone (144x32) has 9 frames, which splits into neither 4 nor 2 directions
 */
const CharacterAnims = {
  DIRS4: ['right', 'up', 'left', 'down'],
  DIRS2: ['right', 'left'],

  SHEETS: {
    idle:      { w: 16, dirs: 4, framesPerDir: 1, rate: 1,  repeat: -1 },
    idle_anim: { w: 16, dirs: 4, framesPerDir: 6, rate: 6,  repeat: -1 },
    run:       { w: 16, dirs: 4, framesPerDir: 6, rate: 10, repeat: -1 },
    sit:       { w: 32, dirs: 2, framesPerDir: 6, rate: 6,  repeat: -1 },
    sit2:      { w: 32, dirs: 2, framesPerDir: 6, rate: 6,  repeat: -1 },
    sit3:      { w: 16, dirs: ['down'], framesPerDir: 6, rate: 4, repeat: -1 },
    // Not files: built from idle_anim's 'up' / 'down' frames when the character is registered.
    sit_up:    { w: 16, dirs: ['up'], framesPerDir: 6, rate: 6, repeat: -1, derivedFrom: 'idle_anim' },
    sit_down:  { w: 16, dirs: ['down'], framesPerDir: 6, rate: 6, repeat: -1, derivedFrom: 'idle_anim' },
  },

  // Size of a walking frame. Some sheets are wider (see SHEETS[].w), but the physics body is
  // always measured against this.
  FRAME_W: 16,
  FRAME_H: 32,

  /** The directions a sheet has, in frame order. `dirs` is a count (4 or 2) or an explicit list. */
  dirsFor(sheet) {
    const d = this.SHEETS[sheet].dirs;
    return Array.isArray(d) ? d : d === 2 ? this.DIRS2 : this.DIRS4;
  },

  /** The sitting pose for a facing: side-on, facing the viewer, or seen from behind. */
  sitPose(facing) {
    return facing === 'down' ? 'sit_down' : facing === 'up' ? 'sit_up' : 'sit';
  },

  textureKey(name, sheet) {
    return `char-${name}-${sheet}`;
  },

  animKey(name, sheet, dir) {
    return `${name}-${sheet}-${dir}`;
  },

  /** Map a facing onto one the sheet has, falling back to its first direction. */
  resolveDir(sheet, dir) {
    const dirs = this.dirsFor(sheet);
    return dirs.includes(dir) ? dir : dirs[0];
  },

  preload(scene, name) {
    for (const [sheet, cfg] of Object.entries(this.SHEETS)) {
      if (cfg.derivedFrom) continue; // made in register(), not loaded
      scene.load.spritesheet(this.textureKey(name, sheet), `assets/characters/${name}_${sheet}.png`, {
        frameWidth: cfg.w,
        frameHeight: this.FRAME_H,
      });
    }
  },

  register(scene, name) {
    for (const [sheet, cfg] of Object.entries(this.SHEETS)) {
      const texture = this.textureKey(name, sheet);
      if (cfg.derivedFrom && !scene.textures.exists(texture)) this.buildSeated(scene, name, sheet);
      if (!scene.textures.exists(texture)) continue;

      this.dirsFor(sheet).forEach((dir, d) => {
        const key = this.animKey(name, sheet, dir);
        if (scene.anims.exists(key)) return;
        const first = d * cfg.framesPerDir;
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(texture, { start: first, end: first + cfg.framesPerDir - 1 }),
          frameRate: cfg.rate,
          repeat: cfg.repeat,
        });
      });
    }
  },

  /** Build <name>'s sit_up or sit_down texture from the matching idle_anim frames. */
  buildSeated(scene, name, sheet) {
    const cfg = this.SHEETS[sheet];
    const srcKey = this.textureKey(name, cfg.derivedFrom);
    if (!scene.textures.exists(srcKey) || typeof document === 'undefined') return;
    const W = this.FRAME_W, H = this.FRAME_H, n = cfg.framesPerDir;
    const first = this.DIRS4.indexOf(cfg.dirs[0]) * this.SHEETS[cfg.derivedFrom].framesPerDir;
    const canvas = document.createElement('canvas');
    canvas.width = W * n;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene.textures.get(srcKey).getSourceImage(), first * W, 0, W * n, H, 0, 0, W * n, H);
    const img = ctx.getImageData(0, 0, W * n, H);
    for (let f = 0; f < n; f++) this.seatPose(img.data, W * n, f * W);
    ctx.putImageData(img, 0, 0);
    const tex = scene.textures.addCanvas(this.textureKey(name, sheet), canvas);
    for (let f = 0; f < n; f++) tex.add(f, 0, f * W, 0, W, H);
  },

  /**
   * Turn one standing frame, back or front view (16x32 at column fx of a 4-byte-per-pixel buffer
   * of width `stride` pixels), into the same person seated. Rows 0-27 (head, body, arms, hips)
   * stay; the legs below go; the hip row is repeated twice as the lap on the seat and closed off
   * with an outline row, so the figure ends on row 30 like the pack's sit3. Works on RGBA or BGRA
   * alike: it only copies whole pixels.
   */
  seatPose(data, stride, fx) {
    const HIP = 27, W = this.FRAME_W, H = this.FRAME_H;
    const at = (x, y) => (y * stride + fx + x) * 4;
    let minX = -1, maxX = -1;
    for (let x = 0; x < W; x++) if (data[at(x, HIP) + 3]) { if (minX < 0) minX = x; maxX = x; }
    for (let y = HIP + 1; y < H; y++) for (let x = 0; x < W; x++) data[at(x, y) + 3] = 0;
    if (minX < 0) return;
    for (const y of [HIP + 1, HIP + 2]) {
      for (let x = minX; x <= maxX; x++) {
        // Fill any gap between the legs with the pixel beside it so the hips read as one block.
        let sx = x;
        while (sx > minX && !data[at(sx, HIP) + 3]) sx--;
        for (let k = 0; k < 4; k++) data[at(x, y) + k] = data[at(sx, HIP) + k];
      }
    }
    const o = at(minX, HIP); // the edge pixel of the hip row is the outline colour
    for (let x = minX + 1; x < maxX; x++) for (let k = 0; k < 4; k++) data[at(x, HIP + 3) + k] = data[o + k];
  },
};

if (typeof module !== 'undefined') module.exports = CharacterAnims;
