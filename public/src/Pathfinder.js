/*
 * A* search over the map's walkable tiles.
 *
 * Keyboard play doesn't need it, but click-to-move and NPCs do. A path is just a list of tile
 * waypoints that a Character steers toward with setIntent, the same call the keyboard uses,
 * so there's still only one movement implementation.
 */
class Pathfinder {
  /** @param {Phaser.Tilemaps.Tilemap} map a map with a 'Collision' object layer */
  constructor(map, tileSize = 16) {
    this.w = map.width;
    this.h = map.height;
    this.tile = tileSize;
    this.blocked = new Uint8Array(this.w * this.h);

    // The Collision layer is the only source of truth. Don't also treat "no Floor tile" as a
    // wall: office_v2 keeps most of its floor in object layers (only 134 of its 272 cells are
    // Floor tiles), so that rule would wall off most of a walkable map. The map builders
    // already fold inside/outside into Collision.
    const collision = map.getObjectLayer('Collision');
    if (!collision) return;
    for (const r of collision.objects) {
      const x0 = Math.floor(r.x / tileSize), x1 = Math.floor((r.x + r.width) / tileSize);
      const y0 = Math.floor(r.y / tileSize), y1 = Math.floor((r.y + r.height) / tileSize);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.blocked[y * this.w + x] = 1;
        }
      }
    }
  }

  isWalkable(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && !this.blocked[ty * this.w + tx];
  }

  /** @returns {Array<{x, y}>} tile waypoints after the start, up to and including the goal; [] if unreachable. */
  find(sx, sy, gx, gy) {
    if (!this.isWalkable(sx, sy) || !this.isWalkable(gx, gy)) return [];
    const W = this.w;
    const start = sy * W + sx;
    const goal = gy * W + gx;
    if (start === goal) return [];

    const heuristic = (i) => Math.abs((i % W) - gx) + Math.abs(Math.floor(i / W) - gy);
    const open = [start];
    const cameFrom = new Map();
    const g = new Map([[start, 0]]);
    const f = new Map([[start, heuristic(start)]]);
    const INF = 1e9;

    while (open.length) {
      // The maps are small, so a linear scan for the lowest f beats maintaining a heap.
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if ((f.get(open[i]) ?? INF) < (f.get(open[best]) ?? INF)) best = i;
      }
      const cur = open.splice(best, 1)[0];

      if (cur === goal) {
        const path = [];
        for (let n = cur; n !== start; n = cameFrom.get(n)) path.push({ x: n % W, y: Math.floor(n / W) });
        return path.reverse();
      }

      const cx = cur % W, cy = Math.floor(cur / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.isWalkable(nx, ny)) continue;
        const n = ny * W + nx;
        const cost = (g.get(cur) ?? INF) + 1;
        if (cost < (g.get(n) ?? INF)) {
          cameFrom.set(n, cur);
          g.set(n, cost);
          f.set(n, cost + heuristic(n));
          if (!open.includes(n)) open.push(n);
        }
      }
    }
    return [];
  }
}

if (typeof module !== 'undefined') module.exports = Pathfinder;
