/*
 * Cars and a bus driving along the street lanes a map declares in its 'Traffic' layer:
 *   lane       a rectangle the vehicles drive along; properties dir (1 = right, -1 = left) and
 *              feetY (where the wheels touch the road)
 *   crosswalk  a rectangle; while the player stands on it, vehicles stop before it
 *   bus_stop   a point; the bus pulls in so its middle is at x, opens its doors, then leaves
 *
 * Vehicles are polite: they keep their distance from the one in front, stop for the player
 * anywhere in their lane, and never drive into anyone. Their physics bodies are immovable, so
 * the player can't walk through a car either.
 *
 * vehicles.png frames are 64x32 and all face right: 0-4 cars, 5 bus (doors shut), 6 bus (open).
 */
class Traffic {
  constructor(scene, map) {
    this.scene = scene;
    this.mapW = map.widthInPixels;
    this.group = scene.physics.add.group({ allowGravity: false });
    this.vehicles = [];

    const prop = (o, name, fallback) => {
      const p = (Array.isArray(o.properties) ? o.properties : []).find((pr) => pr.name === name);
      return p ? p.value : fallback;
    };
    const objects = map.getObjectLayer('Traffic').objects;
    this.lanes = objects.filter((o) => o.type === 'lane').map((o) => ({
      name: o.name, top: o.y, bottom: o.y + o.height,
      dir: prop(o, 'dir', 1), feetY: prop(o, 'feetY', o.y + o.height - 4),
      nextCar: 1 + Math.random() * 3,
    }));
    this.crossings = objects.filter((o) => o.type === 'crosswalk')
      .map((o) => ({ x0: o.x, x1: o.x + o.width, y0: o.y, y1: o.y + o.height }));
    this.stops = objects.filter((o) => o.type === 'bus_stop')
      .map((o) => ({ x: o.x, lane: this.lanes.find((l) => l.name === prop(o, 'lane', '')) || this.lanes[0] }));
    this.nextBus = 4;
  }

  spawn(lane, kind) {
    const bus = kind === 'bus';
    const len = bus ? 62 : 44;
    const x = lane.dir > 0 ? -len / 2 - 8 : this.mapW + len / 2 + 8;
    // Don't spawn on top of a vehicle still entering the road.
    if (this.vehicles.some((v) => v.lane === lane && Math.abs(v.sprite.x - x) < len + 24)) return false;

    const frame = bus ? 5 : Math.floor(Math.random() * 5);
    const sprite = this.scene.physics.add.sprite(x, lane.feetY, 'vehicles', frame).setOrigin(0.5, 1);
    sprite.setFlipX(lane.dir < 0);
    this.group.add(sprite);
    // Body: the footprint on the road, not the roof. The offsets are symmetric, so flipping the
    // art for left-bound vehicles doesn't move the body.
    const bw = bus ? 60 : 40, bh = bus ? 12 : 10;
    sprite.body.setSize(bw, bh).setOffset((64 - bw) / 2, 32 - bh - 2);
    sprite.body.setImmovable(true);
    sprite.body.pushable = false;
    sprite.body.allowGravity = false;

    const max = bus ? 42 : 52 + Math.random() * 18;
    this.vehicles.push({ sprite, lane, bus, len, max, speed: max, dwell: 0, served: false });
    return true;
  }

  /** Should vehicle v stop for the player? Anywhere in its lane just ahead, or on a crossing. */
  playerBlocks(v, front, player) {
    if (!player) return 0;
    const px = player.x, py = player.y, dir = v.lane.dir;
    let limit = Infinity;
    if (py > v.lane.top - 2 && py < v.lane.bottom + 10) {
      const ahead = (px - front) * dir;            // distance from our bumper to the player
      if (ahead > -v.len - 8 && ahead < 34) limit = 0;
    }
    for (const c of this.crossings) {
      const onIt = px >= c.x0 && px <= c.x1 && py >= c.y0 && py <= c.y1 + 8;
      if (!onIt) continue;
      const nearEdge = dir > 0 ? c.x0 : c.x1;
      const dist = (nearEdge - front) * dir;
      if (dist > -4 && dist < 24) limit = 0;       // stop just before the stripes
    }
    return limit;
  }

  update(delta, player) {
    const dt = Math.min(delta, 50) / 1000;

    for (const lane of this.lanes) {
      lane.nextCar -= dt;
      if (lane.nextCar <= 0) lane.nextCar = this.spawn(lane, 'car') ? 3 + Math.random() * 4 : 0.5;
    }
    if (this.stops.length) {
      this.nextBus -= dt;
      if (this.nextBus <= 0) this.nextBus = this.spawn(this.stops[0].lane, 'bus') ? 24 + Math.random() * 10 : 1;
    }

    for (const v of this.vehicles) {
      const dir = v.lane.dir, x = v.sprite.x;
      const front = x + (dir * v.len) / 2;
      let target = v.max;

      // Keep a gap to whoever is in front in the same lane.
      for (const o of this.vehicles) {
        if (o === v || o.lane !== v.lane) continue;
        const gap = (o.sprite.x - (dir * o.len) / 2 - front) * dir;
        if (gap < 0 || gap > 60) continue;
        target = Math.min(target, gap < 14 ? 0 : o.speed);
      }

      target = Math.min(target, this.playerBlocks(v, front, player));

      // The bus pulls in at its stop and waits with the doors open.
      if (v.bus && !v.served) {
        const stop = this.stops.find((s) => s.lane === v.lane);
        if (stop) {
          const d = (stop.x - x) * dir;
          if (d <= 0.5) { v.served = true; v.dwell = 3.5; v.sprite.setFrame(6); }
          else if (d < 70) target = Math.min(target, Math.max(10, d * 1.1));
        }
      }
      if (v.dwell > 0) {
        v.dwell -= dt;
        target = 0;
        if (v.dwell <= 0) v.sprite.setFrame(5);
      }

      v.speed = target < v.speed ? Math.max(target, v.speed - 180 * dt) : Math.min(target, v.speed + 45 * dt);
      v.sprite.body.setVelocity(dir * v.speed, 0);
      v.sprite.setDepth(v.sprite.y);
    }

    // Gone off the far end: remove.
    this.vehicles = this.vehicles.filter((v) => {
      const out = v.lane.dir > 0 ? v.sprite.x > this.mapW + 80 : v.sprite.x < -80;
      if (out) v.sprite.destroy();
      return !out;
    });
  }
}

if (typeof module !== 'undefined') module.exports = Traffic;
