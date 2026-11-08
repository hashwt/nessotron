/*
 * Someone in the office: the player now, AI agents later.
 *
 * setIntent(dx, dy) is the single way to move a character. The keyboard calls it today, and
 * an NPC walking pathfinder waypoints will call the same method. Keeping one movement code
 * path means the player and NPCs can't drift apart in how they collide or animate.
 */
class Character {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x    world pixels
   * @param {number} y    world pixels; this is where the character's FEET go
   * @param {string} name a staged character, e.g. 'Developer'
   * @param {object} opts speed, facing, bodyWidth, bodyHeight, canWalk(tileX, tileY)
   */
  constructor(scene, x, y, name = 'Developer', opts = {}) {
    this.scene = scene;
    this.name = name;
    this.speed = opts.speed || 60;
    this.facing = opts.facing || 'down';
    this.seated = false;
    // (tileX, tileY) => boolean. Used by the doorway assist in update().
    this.canWalk = opts.canWalk || null;

    CharacterAnims.register(scene, name);

    this.sprite = scene.physics.add.sprite(x, y, CharacterAnims.textureKey(name, 'idle'));
    // The art is 16x32 with the body in the bottom half, so anchor at the feet.
    this.sprite.setOrigin(0.5, 1);

    // Keep the physics body small and at the feet. Heads and shoulders can then overlap a
    // desk without blocking; with furniture this dense, a full-size body can't fit through
    // doorways.
    const bw = opts.bodyWidth || 10;
    const bh = opts.bodyHeight || 8;
    this.bodyW = bw;
    this.bodyH = bh;
    this.sprite.body.setSize(bw, bh);
    this.sprite.body.setOffset((CharacterAnims.FRAME_W - bw) / 2, CharacterAnims.FRAME_H - bh);
    this.sprite.setCollideWorldBounds(true);

    this.intent = { x: 0, y: 0 };
    this.play('idle_anim');
  }

  /** Direction to move in, normalised. Pass (0, 0) to stop. */
  setIntent(dx, dy) {
    const len = Math.hypot(dx, dy);
    this.intent = len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
  }

  /**
   * Sit down where you stand, keeping the way you face: right/left side-on, down facing the
   * viewer, up seen from behind. `variant` forces a sheet instead (e.g. 'sit2', typing).
   */
  sit(dir = this.facing, variant = CharacterAnims.sitPose(dir)) {
    this.seated = true;
    this.facing = CharacterAnims.resolveDir(variant, dir);
    this.setIntent(0, 0);
    this.sprite.body.setVelocity(0, 0);
    this.play(variant);
  }

  /**
   * Sit on a chair: feet at (x, y), posed for the way the chair faces.
   *   left / right  'sit' (side-on, at a desk)
   *   down          'sit_down' (facing the viewer)
   *   up            'sit_up' (seen from behind); for desk chairs the scene also draws the chair
   *                 back over the body, as LimeZu's own designs do
   * The physics body is switched off while seated. A seated pose can overlap the chair's blocked
   * cell, and the arcade collider would otherwise shove the character out of the chair.
   */
  sitAt(x, y, facing) {
    const pose = CharacterAnims.sitPose(facing);
    this.sprite.body.setVelocity(0, 0);
    this.sprite.body.reset(x, y);
    this.sprite.body.enable = false;
    this.seated = true;
    this.facing = CharacterAnims.resolveDir(pose, facing);
    this.setIntent(0, 0);
    this.play(pose);
  }

  /** Stand up, optionally stepping back to (x, y), the tile the seat was used from. */
  stand(x, y) {
    if (!this.seated) return;
    this.seated = false;
    this.sprite.body.enable = true;
    if (x !== undefined) this.sprite.body.reset(x, y);
    this.play('idle_anim');
  }

  play(sheet) {
    const dir = CharacterAnims.resolveDir(sheet, this.facing);
    const key = CharacterAnims.animKey(this.name, sheet, dir);
    if (this.scene.anims.exists(key)) this.sprite.play(key, true);
    this.currentSheet = sheet;
    // The body offset is measured from the frame's left edge, and sitting frames are 32px wide
    // where walking frames are 16. Without re-centring, sitting moved the feet body 8px left,
    // enough to push a character off a seat at the edge of the map.
    const fw = (CharacterAnims.SHEETS[sheet] || {}).w || CharacterAnims.FRAME_W;
    this.sprite.body.setOffset((fw - this.bodyW) / 2, CharacterAnims.FRAME_H - this.bodyH);
  }

  destroy() {
    this.sprite.destroy();
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get tileX() { return Math.floor(this.sprite.x / 16); }
  // The sprite's y is the bottom edge of the feet, so step back 1px to stay in the tile.
  get tileY() { return Math.floor((this.sprite.y - 1) / 16); }

  update() {
    if (this.seated) return;

    const TILE = 16;
    let vx = this.intent.x * this.speed;
    let vy = this.intent.y * this.speed;

    // Doorway assist. Doorways are one tile wide and the body is 10px inside a 16px tile, so
    // getting through by hand needs near-perfect alignment. Players bump the frame and think
    // the room is sealed. So, when moving along exactly one axis, check the tile ahead: if
    // it's open, ease into the middle of this lane; if it's blocked but a neighbouring lane
    // is open, ease toward that lane. Diagonal movement is left alone, so walking around an
    // open room feels the same as before.
    const canWalk = this.canWalk;
    if (canWalk && vy !== 0 && vx === 0) {
      const tx = this.tileX;
      const ahead = this.tileY + (vy > 0 ? 1 : -1);
      const lane = canWalk(tx, ahead) ? tx
        : canWalk(tx - 1, ahead) ? tx - 1
        : canWalk(tx + 1, ahead) ? tx + 1
        : null;
      if (lane !== null) {
        const off = lane * TILE + TILE / 2 - this.sprite.x;
        if (Math.abs(off) > 0.5) vx = Math.sign(off) * Math.min(this.speed, Math.abs(off) * 8);
      }
    } else if (canWalk && vx !== 0 && vy === 0) {
      const ty = this.tileY;
      const ahead = this.tileX + (vx > 0 ? 1 : -1);
      const lane = canWalk(ahead, ty) ? ty
        : canWalk(ahead, ty - 1) ? ty - 1
        : canWalk(ahead, ty + 1) ? ty + 1
        : null;
      if (lane !== null) {
        // Feet rest at FEET_Y within the tile (see below), not on its bottom edge.
        const off = lane * TILE + Character.FEET_Y - this.sprite.y;
        if (Math.abs(off) > 0.5) vy = Math.sign(off) * Math.min(this.speed, Math.abs(off) * 8);
      }
    }
    this.sprite.body.setVelocity(vx, vy);

    const moving = this.intent.x !== 0 || this.intent.y !== 0;
    if (moving) {
      // Pick the dominant axis, so a diagonal shows one stable direction instead of flickering.
      this.facing = Math.abs(this.intent.x) >= Math.abs(this.intent.y)
        ? (this.intent.x > 0 ? 'right' : 'left')
        : (this.intent.y > 0 ? 'down' : 'up');
    }
    const sheet = moving ? 'run' : 'idle_anim';
    const key = CharacterAnims.animKey(this.name, sheet, this.facing);
    if (this.sprite.anims.currentAnim?.key !== key) this.play(sheet);
  }
}

// Where in a tile the feet rest, in px from its top. The feet body is 8px tall, so 12 centres it
// in the tile with 4px to spare above and below. Resting on the tile's bottom edge (16) left the
// body touching the next row, where any overshoot hit a blocked cell.
Character.FEET_Y = 12;

if (typeof module !== 'undefined') module.exports = Character;
