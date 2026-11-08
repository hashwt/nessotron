// Deterministic checks for a house plan. The AI proposes plans; this code decides if they pass.
// Units are meters. Plan coordinates: x across the lot width, y from the street (y = 0) to the back.

const FLOOR_HEIGHT = 3;

// Minimum floor area (m²) and shortest side (m) per room type.
const MIN_SIZE = {
  living: { area: 14, side: 3.0 },
  kitchen: { area: 7, side: 2.4 },
  dining: { area: 8, side: 2.6 },
  bedroom: { area: 9, side: 2.7 },
  bathroom: { area: 3.5, side: 1.5 },
  office: { area: 6, side: 2.2 },
  laundry: { area: 3, side: 1.5 },
  hallway: { area: 2, side: 1.0 },
  stairs: { area: 4, side: 1.0 },
  garage: { area: 18, side: 3.0 },
};

// Rough build cost per m² by style (USD). Garages cost half. Adjust these for your market.
const COST_PER_M2 = { modern: 2200, farmhouse: 1900, traditional: 1800, minimalist: 2000 };

const EPS = 0.01;

function area(r) {
  return r.w * r.d;
}

function overlapLen(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function overlapArea(a, b) {
  return overlapLen(a.x, a.x + a.w, b.x, b.x + b.w) * overlapLen(a.y, a.y + a.d, b.y, b.y + b.d);
}

// Length of wall two rooms share (0 if they only touch at a corner or not at all).
function sharedWall(a, b) {
  if (Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS) {
    return overlapLen(a.y, a.y + a.d, b.y, b.y + b.d);
  }
  if (Math.abs(a.y + a.d - b.y) < EPS || Math.abs(b.y + b.d - a.y) < EPS) {
    return overlapLen(a.x, a.x + a.w, b.x, b.x + b.w);
  }
  return 0;
}

function estimateCost(plan) {
  const rate = COST_PER_M2[plan.style] || 2000;
  let total = 0;
  for (const floor of plan.floors) {
    for (const r of floor.rooms) total += area(r) * rate * (r.type === 'garage' ? 0.5 : 1);
  }
  return Math.round(total / 1000) * 1000;
}

function countType(plan, type) {
  return plan.floors.reduce((n, f) => n + f.rooms.filter((r) => r.type === type).length, 0);
}

// Returns a list of problems in plain English. An empty list means the plan passes.
function validatePlan(plan, req) {
  const problems = [];
  const s = req.setback;
  const maxX = req.lotWidth - s;
  const maxY = req.lotDepth - s;

  if (!plan.floors.length) problems.push('Plan has no floors.');
  if (plan.floors.length > req.maxFloors) {
    problems.push(`Plan has ${plan.floors.length} floors; the customer allows at most ${req.maxFloors}.`);
  }

  const ids = new Set();
  plan.floors.forEach((floor, fi) => {
    if (floor.level !== fi) problems.push(`Floor ${fi} must have level ${fi} (got ${floor.level}).`);
    const rooms = floor.rooms;
    if (!rooms.length) problems.push(`Floor ${fi} has no rooms.`);

    for (const r of rooms) {
      if (ids.has(r.id)) problems.push(`Room id "${r.id}" is used twice.`);
      ids.add(r.id);

      const min = MIN_SIZE[r.type];
      if (min && (area(r) < min.area - EPS || Math.min(r.w, r.d) < min.side - EPS)) {
        problems.push(
          `${r.name} (${r.type}) is ${r.w}×${r.d} m; needs at least ${min.area} m² and ${min.side} m on its shortest side.`
        );
      }
      if (r.w <= 0 || r.d <= 0) problems.push(`${r.name} has a zero or negative size.`);
      if (r.x < s - EPS || r.y < s - EPS || r.x + r.w > maxX + EPS || r.y + r.d > maxY + EPS) {
        problems.push(
          `${r.name} is outside the buildable area (x ${s}–${maxX}, y ${s}–${maxY}); it spans x ${r.x}–${r.x + r.w}, y ${r.y}–${r.y + r.d}.`
        );
      }
      if (r.type === 'garage' && fi > 0) problems.push(`${r.name}: a garage must be on the ground floor.`);
    }

    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (overlapArea(rooms[i], rooms[j]) > EPS) {
          problems.push(`${rooms[i].name} overlaps ${rooms[j].name} on floor ${fi}.`);
        }
      }
    }

    // Every room on a floor must be reachable through shared walls (doors are placed on them).
    if (rooms.length > 1) {
      const seen = new Set([0]);
      const queue = [0];
      while (queue.length) {
        const i = queue.shift();
        rooms.forEach((other, j) => {
          if (!seen.has(j) && sharedWall(rooms[i], other) >= 0.9) {
            seen.add(j);
            queue.push(j);
          }
        });
      }
      const cut = rooms.filter((_, i) => !seen.has(i)).map((r) => r.name);
      if (cut.length) {
        problems.push(
          `On floor ${fi}, ${cut.join(', ')} cannot be reached from ${rooms[0].name}. Rooms connect only through shared walls at least 0.9 m long.`
        );
      }
    }

    // Upper-floor rooms must sit on top of the floor below.
    if (fi > 0) {
      const below = plan.floors[fi - 1].rooms;
      for (const r of rooms) {
        const supported = below.reduce((sum, b) => sum + overlapArea(r, b), 0);
        if (supported < area(r) - 0.05) problems.push(`${r.name} on floor ${fi} overhangs the floor below.`);
      }
    }
  });

  if (plan.floors.length > 1) {
    plan.floors.forEach((floor, fi) => {
      if (!floor.rooms.some((r) => r.type === 'stairs')) {
        problems.push(`Floor ${fi} needs a room of type "stairs", since the house has more than one floor.`);
      }
    });
  }

  const beds = countType(plan, 'bedroom');
  const baths = countType(plan, 'bathroom');
  if (beds < req.bedrooms) problems.push(`Plan has ${beds} bedrooms; customer wants ${req.bedrooms}.`);
  if (baths < req.bathrooms) problems.push(`Plan has ${baths} bathrooms; customer wants ${req.bathrooms}.`);
  if (req.garage && countType(plan, 'garage') === 0) problems.push('Customer wants a garage; the plan has none.');
  if (countType(plan, 'kitchen') === 0) problems.push('Plan has no kitchen.');
  if (countType(plan, 'living') === 0) problems.push('Plan has no living room.');

  const cost = estimateCost(plan);
  if (cost > req.budget) {
    problems.push(`Estimated cost $${cost.toLocaleString()} is over the $${req.budget.toLocaleString()} budget.`);
  }

  return { problems, cost };
}

module.exports = { validatePlan, estimateCost, FLOOR_HEIGHT, MIN_SIZE, COST_PER_M2 };
