class GameScene extends Phaser.Scene {
  /**
   * @param {string} mapKey          map name; its data is assets/maps/<mapKey>.json
   * @param {Array}  characters      everyone in characters.json
   * @param {string} startCharacter  who you start as
   * @param {object} mapJson         the map JSON, so its properties can be read before Phaser parses it
   *
   * The map is drawn from finished images named by the map's properties: mapImage (everything
   * under the characters) and canopyImage (tree tops and lamp heads, drawn over them). The map
   * JSON itself is only data: collision, spawn point, seats, doors and traffic lanes.
   */
  constructor(mapKey, characters = ['Developer'], startCharacter = 'Developer', mapJson = {}) {
    super('GameScene');
    this.mapKey = mapKey;
    this.mapJson = mapJson || {};
    this.characters = characters;
    this.characterName = startCharacter;
  }

  /** A map-level property from the raw map JSON. */
  mapProp(name) {
    const props = Array.isArray(this.mapJson.properties) ? this.mapJson.properties : [];
    const p = props.find((pr) => pr.name === name);
    return p ? p.value : undefined;
  }

  preload() {
    this.load.tilemapTiledJSON('map', `assets/maps/${this.mapKey}.json`);
    const image = (key, prop) => { const url = this.mapProp(prop); if (url) this.load.image(key, url); };
    const sheet = (key, prop, w, h) => { const url = this.mapProp(prop); if (url) this.load.spritesheet(key, url, { frameWidth: w, frameHeight: h }); };
    image('map_base', 'mapImage');
    image('map_canopy', 'canopyImage');
    sheet('seat_overlays', 'seatOverlays', 16, 32); // chair art drawn over someone sitting facing up
    sheet('door', 'doorSheet', 16, 32);             // sliding door: 0 shut, 1 open
    sheet('vehicles', 'vehicleSheet', 64, 32);      // cars and the bus
    // Load every character up front so switching in-game is instant.
    for (const name of this.characters) CharacterAnims.preload(this, name);
  }

  create() {
    const map = this.make.tilemap({ key: 'map' });
    this.map = map;
    this.add.image(0, 0, 'map_base').setOrigin(0, 0);
    // Tree tops and lamp heads: drawn above everyone, so you can walk behind them.
    if (this.textures.exists('map_canopy')) {
      this.add.image(0, 0, 'map_canopy').setOrigin(0, 0).setDepth(GameScene.CANOPY_DEPTH);
    }

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.blockers = this.physics.add.staticGroup();
    const collision = map.getObjectLayer('Collision');
    if (collision) {
      for (const r of collision.objects) {
        const box = this.add.rectangle(r.x + r.width / 2, r.y + r.height / 2, r.width, r.height);
        this.physics.add.existing(box, true);
        this.blockers.add(box);
      }
    }

    // Seats (chairs) listed by the map. Sitting while standing on one snaps you onto the chair,
    // facing its way. Anywhere else you still sit where you stand.
    this.seats = (map.getObjectLayer('Seats') || { objects: [] }).objects.map((o) => {
      const props = Array.isArray(o.properties) ? o.properties : [];
      const get = (n, d) => { const p = props.find((pr) => pr.name === n); return p ? p.value : d; };
      return {
        tx: Math.floor(o.x / 16), ty: Math.floor((o.y - 1) / 16), x: o.x, y: o.y, // the stand-here tile
        facing: get('facing', 'right'),
        sitX: get('sitX', o.x), sitY: get('sitY', o.y),                         // feet once seated
        overlayFrame: get('overlayFrame', -1), overlayX: get('overlayX', 0), overlayY: get('overlayY', 0),
      };
    });
    this.seat = null;          // the seat in use
    this.seatOverlay = null;   // chair image drawn over the character while sitting facing up

    // Doors open by themselves when someone is close.
    this.doors = (map.getObjectLayer('Doors') || { objects: [] }).objects
      .filter(() => this.textures.exists('door'))
      .map((o) => ({ x: o.x, y: o.y, w: o.width, h: o.height,
        sprite: this.add.image(o.x, o.y, 'door', 0).setOrigin(0, 0) }));

    // Street traffic, if the map has lanes.
    this.traffic = map.getObjectLayer('Traffic') && this.textures.exists('vehicles') ? new Traffic(this, map) : null;

    const spawn = this.findSpawn(map);
    this.pathfinder = new Pathfinder(map);
    this.path = [];
    this.spawnPlayer(this.characterName, spawn.x, spawn.y, 'down');
    this.setupCamera(map);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.sitKeys = this.input.keyboard.addKeys('ENTER,SPACE,E');

    // Click to move: plan a route to the clicked tile.
    this.input.on('pointerdown', (pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.path = this.pathfinder.find(
        this.player.tileX, this.player.tileY,
        Math.floor(world.x / 16), Math.floor(world.y / 16));
    });
  }

  spawnPlayer(name, x, y, facing) {
    this.player = new Character(this, x, y, name, {
      facing,
      canWalk: (tx, ty) => this.pathfinder.isWalkable(tx, ty),
    });
    this.playerCollider = this.physics.add.collider(this.player.sprite, this.blockers);
    this.vehicleCollider = this.traffic ? this.physics.add.collider(this.player.sprite, this.traffic.group) : null;
    this.player.sprite.setDepth(this.player.y);
  }

  /** Swap who you're playing, keeping the same spot and facing. */
  switchCharacter(name) {
    if (!this.player || name === this.characterName) return;
    if (!this.textures.exists(CharacterAnims.textureKey(name, 'idle'))) return;
    // Swap standing up: this puts the body back on the floor and clears any chair overlay.
    const seat = this.seat;
    if (this.player.seated) this.standUp();
    const { x, y, facing } = this.player;
    const following = this.cameras.main._follow === this.player.sprite;

    this.playerCollider.destroy();
    if (this.vehicleCollider) this.vehicleCollider.destroy();
    this.player.destroy();
    this.path = [];
    this.characterName = name;
    this.spawnPlayer(name, x, y, facing);
    if (following) this.cameras.main.startFollow(this.player.sprite, true);
    // Someone who was in a chair sits the new character straight back down in it.
    if (seat) this.sitOn(seat);
    if (this.onCharacterChanged) this.onCharacterChanged(name);
  }

  /** Sit on a listed seat, posed for the chair's direction, with the chair over you if facing up. */
  sitOn(seat) {
    this.seat = seat;
    this.player.sitAt(seat.sitX, seat.sitY, seat.facing);
    this.player.sprite.setDepth(this.player.y); // depth follows the feet; the chair goes just above
    if (seat.overlayFrame >= 0 && this.textures.exists('seat_overlays')) {
      this.seatOverlay = this.add.image(seat.overlayX, seat.overlayY, 'seat_overlays', seat.overlayFrame)
        .setOrigin(0, 0)
        .setDepth(this.player.sprite.depth + 1);
    }
  }

  /**
   * The seat to use when sitting: the one under you, else the nearest one within a tile
   * (diagonals included), preferring the one you face. Without this you had to stand on the
   * chair's exact tile; one step short, you sat on the floor beside an empty chair.
   */
  seatNear() {
    const { tileX: px, tileY: py, facing } = this.player;
    const ahead = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[facing] || [0, 0];
    let best = null, bestScore = Infinity;
    for (const s of this.seats) {
      const dx = s.tx - px, dy = s.ty - py;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) continue;
      // 0 = under you, 1 = straight ahead, 2 = beside you, 3 = diagonal
      const score = dx === 0 && dy === 0 ? 0 : dx === ahead[0] && dy === ahead[1] ? 1 : dx === 0 || dy === 0 ? 2 : 3;
      if (score < bestScore) { best = s; bestScore = score; }
    }
    return best;
  }

  /** Stand up. From a seat, step back onto the tile it was used from. */
  standUp() {
    if (this.seatOverlay) { this.seatOverlay.destroy(); this.seatOverlay = null; }
    if (this.seat) this.player.stand(this.seat.x, this.seat.y);
    else this.player.stand();
    this.seat = null;
  }

  /** The map says which camera it wants (the two maps need different ones). Default: fit. */
  setupCamera(map) {
    const cam = this.cameras.main;
    // When a map has no properties Phaser gives back an empty OBJECT, not an array, so
    // don't assume .find() is available.
    const props = Array.isArray(map.properties) ? map.properties : [];
    const prop = props.find((p) => p.name === 'camera');
    const mode = prop ? prop.value : 'fit';

    if (mode === 'follow') {
      const zoom = 2;
      cam.setZoom(zoom);
      // Where the map is smaller than the view, widen the bounds equally on both sides so the
      // map sits centred instead of pinned to the top-left (office_v3 is 272px tall; the view at
      // 2x is 320).
      const mw = map.widthInPixels, mh = map.heightInPixels;
      const bw = Math.max(mw, cam.width / zoom), bh = Math.max(mh, cam.height / zoom);
      cam.setBounds((mw - bw) / 2, (mh - bh) / 2, bw, bh);
      cam.startFollow(this.player.sprite, true);
      return;
    }

    const zoom = Math.floor(Math.min(cam.width / map.widthInPixels, cam.height / map.heightInPixels));
    if (zoom >= 1) {
      // Don't set bounds here: they clamp the scroll, fight centerOn, and pin the map top-left.
      cam.setZoom(zoom);
      cam.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
    } else {
      cam.setZoom(1);
      cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      cam.startFollow(this.player.sprite, true);
    }
  }

  findSpawn(map) {
    const spawns = map.getObjectLayer('Spawns');
    const point = spawns && spawns.objects.find((o) => o.type === 'spawn');
    if (point) return { x: point.x, y: point.y };

    // No spawn point declared, so choose the most OPEN walkable tile rather than the first
    // one found. Scanning from a corner drops the player in whatever nook comes first; on
    // office_v2 that was a one-tile gap at the edge of the map.
    const rects = (map.getObjectLayer('Collision') || { objects: [] }).objects;
    const isBlocked = (tx, ty) => {
      const px = tx * 16 + 8, py = ty * 16 + 8;
      return rects.some((r) => px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height);
    };

    let best = null;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (isBlocked(x, y)) continue;
        // Count open tiles in the surrounding 5x5.
        let open = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
            if (!isBlocked(nx, ny)) open++;
          }
        }
        // Small tie-breaker toward the middle of the map.
        const centrality = -(Math.abs(x - map.width / 2) + Math.abs(y - map.height / 2)) / 100;
        const score = open + centrality;
        if (!best || score > best.score) best = { score, x: x * 16 + 8, y: y * 16 + Character.FEET_Y };
      }
    }
    return best || { x: 24, y: 24 };
  }

  update(_time, delta) {
    if (!this.player) return;

    // Things that move on their own, whatever the player is doing.
    if (this.traffic) this.traffic.update(delta, this.player);
    for (const d of this.doors) {
      const near = Math.abs(this.player.x - (d.x + d.w / 2)) < 28 &&
        this.player.y > d.y - 4 && this.player.y < d.y + d.h + 12;
      d.sprite.setFrame(near ? 1 : 0);
    }
    // Sort by feet: whoever stands lower on screen is drawn in front (player vs vehicles).
    this.player.sprite.setDepth(this.player.y);

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    const keyed = left || right || up || down;

    // Enter / Space / E toggles sitting, in whichever of the four directions you face (on a
    // listed seat, the chair decides the direction instead).
    const justDown = Phaser.Input.Keyboard.JustDown;
    if (Object.values(this.sitKeys).some((k) => justDown(k))) {
      if (this.player.seated) {
        this.standUp();
      } else {
        this.path = [];
        const seat = this.seatNear();
        if (seat) this.sitOn(seat);
        else this.player.sit(this.player.facing);
      }
      return;
    }

    // Pressing a direction while seated stands you up, so you can never get stuck sitting.
    if (this.player.seated) {
      if (!keyed) return;
      this.standUp();
    }

    if (keyed) {
      this.path = []; // any key press cancels a click-to-move route
      this.player.setIntent((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
    } else if (this.path.length) {
      // Steer at the next waypoint through the same setIntent call the keyboard uses.
      // Aim the feet at the middle of the tile, not its bottom edge, so the 8px feet body has
      // 4px to spare on each side. Aiming at the edge put the body right on the row boundary,
      // and a half-pixel overshoot snagged on blocked cells below (stuck at office_v3 (5,11),
      // unable to turn into the break room).
      const next = this.path[0];
      const dx = next.x * 16 + 8 - this.player.x;
      const dy = next.y * 16 + Character.FEET_Y - this.player.y;
      if (Math.hypot(dx, dy) < 2) this.path.shift();
      else this.player.setIntent(dx, dy);
    } else {
      this.player.setIntent(0, 0);
    }

    this.player.update();
  }
}

// Above every feet-sorted sprite (those use their y, which stays under a few thousand).
GameScene.CANOPY_DEPTH = 100000;
