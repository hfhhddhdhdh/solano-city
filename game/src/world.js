// Solano City: the static open world. A road grid with named districts, a beach and
// water on the west edge, a park at the centre, blocks full of buildings, shops with
// doors on the street, stunt ramps, and 30 hidden sun coins to collect.
// Geometry helpers (road tests, building collision, grid pathfinding) live here so
// traffic, police and the autopilot all drive the same streets.

import { WORLD, DISTRICTS, COLLECTIBLE_COUNT, STUNT_COUNT } from './config.js';

const ROOF_COLORS = ['#b5543f', '#8a6d4b', '#5d7a8c', '#7a5d8c', '#4f7a5d', '#a8894f', '#6b5a7a', '#c27a4f'];
const WALL_COLORS = ['#c9b18c', '#b8a58e', '#9fb4c0', '#c0a89f', '#a8b89a', '#d0c0a0'];

export function roadLines() {
  const lines = [];
  for (let p = WORLD.firstRoad; p <= WORLD.lastRoad; p += WORLD.roadSpacing) lines.push(p);
  return lines;
}

/** True when the point is on asphalt (a road), including the beach promenade. */
export function isOnRoad(world, x, y) {
  const half = WORLD.roadWidth / 2;
  for (const p of world.roads) {
    if (Math.abs(x - p) <= half && y >= 0 && y <= WORLD.size) return true;
    if (Math.abs(y - p) <= half && x >= 0 && x <= WORLD.size) return true;
  }
  return false;
}

/** Whether the nearest road to (x, y) runs vertically ('v') or horizontally ('h'). */
export function roadOrientation(world, x, y) {
  let bestV = Infinity;
  let bestH = Infinity;
  for (const p of world.roads) {
    bestV = Math.min(bestV, Math.abs(x - p));
    bestH = Math.min(bestH, Math.abs(y - p));
  }
  return bestV <= bestH ? 'v' : 'h';
}

/** The nearest point on a road centre line, for spawning cars and snapping routes. */
export function nearestRoadPoint(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const p of world.roads) {
    const d1 = Math.abs(x - p);
    if (d1 < bestD) { bestD = d1; best = { x: p, y }; }
    const d2 = Math.abs(y - p);
    if (d2 < bestD) { bestD = d2; best = { x, y: p }; }
  }
  return best;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solano City';
}

/** Push a circle out of every building it overlaps; returns true when it hit one. */
export function resolveBuildingCollision(world, pos, radius) {
  let hit = false;
  for (const b of world.buildings) {
    const cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.y = cy + (dy / d) * radius;
      } else {
        pos.x = b.x - radius;
      }
    }
  }
  // The sea is not walkable or drivable.
  if (pos.x < 150 + radius) { pos.x = 150 + radius; hit = true; }
  if (pos.x > WORLD.size - radius) { pos.x = WORLD.size - radius; hit = true; }
  if (pos.y < radius) { pos.y = radius; hit = true; }
  if (pos.y > WORLD.size - radius) { pos.y = WORLD.size - radius; hit = true; }
  return hit;
}

export function pointInBuilding(world, x, y) {
  for (const b of world.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/** Breadth-first route along the road grid, returned as waypoints. */
export function findPath(world, sx, sy, tx, ty) {
  const roads = world.roads;
  const nearest = (v) => roads.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const start = { i: roads.indexOf(nearest(sx)), j: roads.indexOf(nearest(sy)) };
  const goal = { i: roads.indexOf(nearest(tx)), j: roads.indexOf(nearest(ty)) };
  const key = (i, j) => `${i},${j}`;
  const prev = new Map();
  const queue = [start];
  prev.set(key(start.i, start.j), null);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.i === goal.i && cur.j === goal.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = cur.i + di;
      const nj = cur.j + dj;
      if (ni < 0 || nj < 0 || ni >= roads.length || nj >= roads.length) continue;
      if (prev.has(key(ni, nj))) continue;
      prev.set(key(ni, nj), cur);
      queue.push({ i: ni, j: nj });
    }
  }
  if (!prev.has(key(goal.i, goal.j))) return [{ x: tx, y: ty }];
  const nodes = [];
  let cur = goal;
  while (cur) { nodes.unshift(cur); cur = prev.get(key(cur.i, cur.j)); }
  const points = nodes.map((n) => ({ x: roads[n.i], y: roads[n.j] }));
  points.push({ x: tx, y: ty });
  return points;
}

export function createWorld(rng) {
  const roads = roadLines();
  const buildings = [];
  const trees = [];
  const lamps = [];
  // The park block: the block between roads 2000 and 2400 on both axes.
  const park = { x: 2040, y: 2040, w: 320, h: 320 };
  const half = WORLD.roadWidth / 2;
  for (let bx = 0; bx < roads.length - 1; bx += 1) {
    for (let by = 0; by < roads.length - 1; by += 1) {
      const x0 = roads[bx] + half + 14;
      const y0 = roads[by] + half + 14;
      const x1 = roads[bx + 1] - half - 14;
      const y1 = roads[by + 1] - half - 14;
      if (x0 < 380) continue; // beach strip: no buildings west of the promenade
      const inPark = x0 >= park.x - 40 && x1 <= park.x + park.w + 40 && y0 >= park.y - 40 && y1 <= park.y + park.h + 40;
      if (inPark) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: rng.range(park.x + 20, park.x + park.w - 20), y: rng.range(park.y + 20, park.y + park.h - 20), r: rng.range(9, 16) });
        }
        continue;
      }
      const downtown = x0 > 1900 && x0 < 3400 && y0 > 1500 && y0 < 3200;
      const count = downtown ? rng.int(2, 4) : rng.int(1, 3);
      for (let n = 0; n < count; n += 1) {
        const w = rng.range(70, 130);
        const h = rng.range(70, 130);
        const x = rng.range(x0, Math.max(x0 + 1, x1 - w));
        const y = rng.range(y0, Math.max(y0 + 1, y1 - h));
        const tall = downtown && rng.chance(0.35);
        buildings.push({
          x, y, w, h,
          roof: rng.pick(ROOF_COLORS),
          wall: rng.pick(WALL_COLORS),
          tall,
          district: districtAt(x + w / 2, y + h / 2),
        });
      }
      if (rng.chance(0.5)) {
        trees.push({ x: rng.range(x0, x1), y: rng.range(y0, y1), r: rng.range(8, 13) });
      }
    }
  }
  for (const p of roads) {
    for (let q = 200; q <= WORLD.size; q += 400) {
      lamps.push({ x: p + WORLD.roadWidth / 2 + 6, y: q });
      lamps.push({ x: q, y: p + WORLD.roadWidth / 2 + 6 });
    }
  }

  const doorOnRoad = (x, y) => nearestRoadPoint({ roads }, x, y);
  const shops = [
    { kind: 'gun', name: 'Lock & Load', x: 1230, y: 830, door: doorOnRoad(1230, 830), blurb: 'Guns, ammo, armour' },
    { kind: 'food', name: 'Sunset Diner', x: 2830, y: 1230, door: doorOnRoad(2830, 1230), blurb: 'Eat: full health $25' },
    { kind: 'spray', name: "Spray 'n Go", x: 3630, y: 2830, door: doorOnRoad(3630, 2830), blurb: 'New paint, lose the cops $150' },
    { kind: 'clothes', name: 'Palm Threads', x: 1630, y: 3230, door: doorOnRoad(1630, 3230), blurb: 'Fresh threads $60' },
    { kind: 'gun', name: 'Harbor Arms', x: 4030, y: 4030, door: doorOnRoad(4030, 4030), blurb: 'Guns, ammo, armour' },
    { kind: 'food', name: 'Marina Cafe', x: 830, y: 4030, door: doorOnRoad(830, 4030), blurb: 'Eat: full health $25' },
  ];
  const safehouse = { x: 830, y: 1630, door: doorOnRoad(830, 1630), name: 'Rooftop Safehouse' };
  const spawn = { x: 830, y: 1560 };

  const collectibles = [];
  const used = new Set();
  for (let i = 0; i < COLLECTIBLE_COUNT; i += 1) {
    let x;
    let y;
    let guard = 0;
    do {
      const rx = rng.pick(roads);
      const ry = rng.pick(roads);
      x = rx + rng.range(-140, 140);
      y = ry + rng.range(-140, 140);
      guard += 1;
    } while ((pointInBuilding({ buildings }, x, y) || used.has(`${Math.round(x / 50)},${Math.round(y / 50)}`) || x < 380) && guard < 60);
    used.add(`${Math.round(x / 50)},${Math.round(y / 50)}`);
    collectibles.push({ id: i, x, y, taken: false });
  }

  const ramps = [];
  for (let i = 0; i < STUNT_COUNT; i += 1) {
    const rx = rng.pick(roads);
    const ry = rng.pick(roads);
    ramps.push({ id: i, x: rx, y: ry, angle: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), used: false });
  }

  return {
    size: WORLD.size, roads, buildings, trees, lamps, shops, safehouse, spawn,
    collectibles, ramps, park,
    beach: { waterX: 150, sandX: 380 },
  };
}
