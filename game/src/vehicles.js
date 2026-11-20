// Cars: arcade physics, traffic that drives the road grid, and the player
// getting in and out. A car is a rectangle with a heading, a speed and health;
// steering bites harder at low speed and the handbrake breaks the rear loose.

import { CAR_TYPES, CAR_COLORS } from './config.js';
import { nearestRoadPoint, resolveBuildingCollision, findPath } from './world.js';

let nextCarId = 1;

export function createCar(type, x, y, angle, driver = 'traffic') {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    id: nextCarId,
    type,
    name: spec.name,
    x, y, angle,
    speed: 0,
    length: spec.length,
    width: spec.width,
    accel: spec.accel,
    topSpeed: spec.topSpeed,
    grip: spec.grip,
    hp: spec.hp,
    maxHp: spec.hp,
    color: type === 'police' ? '#20242e' : CAR_COLORS[(nextCarId * 7) % CAR_COLORS.length],
    driver,
    dead: false,
    burning: false,
    smoke: 0,
    route: null, // traffic: waypoints along the roads
    routeIndex: 0,
    cruise: 150 + Math.random() * 90,
    stuck: 0,
    siren: type === 'police',
    path: null, // police: waypoints toward the player
    pathIndex: 0,
    repath: 0,
  };
}

/** One physics step for a driven car. throttle -1..1, steer -1..1. */
export function stepCar(world, car, throttle, steer, handbrake, dt) {
  const spec = CAR_TYPES[car.type];
  const forward = throttle;
  if (forward > 0) car.speed += car.accel * forward * dt;
  else if (forward < 0) {
    if (car.speed > 20) car.speed += car.accel * 1.6 * forward * dt; // brake
    else car.speed += car.accel * 0.55 * forward * dt; // reverse
  }
  // Drag and rolling resistance.
  car.speed -= car.speed * (handbrake ? 1.9 : 0.55) * dt;
  car.speed -= Math.sign(car.speed) * 22 * dt;
  if (Math.abs(car.speed) < 4 && forward === 0) car.speed = 0;
  const maxReverse = -spec.topSpeed * 0.45;
  car.speed = Math.max(maxReverse, Math.min(spec.topSpeed, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 180);
  const turn = steer * car.grip * speedFactor * (handbrake ? 1.5 : 1) * dt * (car.speed < 0 ? -1 : 1);
  car.angle += turn;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const speedBefore = car.speed;
  car.x = nx;
  car.y = ny;
  car.crashTimer = Math.max(0, (car.crashTimer || 0) - dt);
  const hitWall = resolveBuildingCollision(world, car, car.length * 0.42);
  if (hitWall) {
    if (Math.abs(speedBefore) > 140 && car.crashTimer <= 0) {
      car.hp -= Math.abs(speedBefore) * 0.05;
      car.speed *= 0.35;
      car.crashTimer = 0.8;
      return 'crash';
    }
    car.speed *= 0.6;
  }
  if (car.hp <= 0 && !car.burning) {
    car.burning = true;
    car.smoke = 2.5;
  }
  if (car.burning) car.smoke = Math.max(0, car.smoke - dt);
  return hitWall ? 'bump' : null;
}

/** Circle-vs-rectangle push-apart between two cars. Returns the impact speed. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = (a.length + b.length) / 2 - 8;
  if (dist >= min || dist === 0) return 0;
  const push = (min - dist) / 2;
  const ux = dx / dist;
  const uy = dy / dist;
  a.x -= ux * push;
  a.y -= uy * push;
  b.x += ux * push;
  b.y += uy * push;
  const impact = Math.abs(a.speed - b.speed);
  const exchange = (a.speed + b.speed) / 2;
  a.speed = exchange * 0.6;
  b.speed = exchange * 0.6;
  return impact;
}

/** Pick a random road point a good distance from (x, y). */
export function randomRoadPoint(world, rng, x, y, minDist = 700) {
  for (let tries = 0; tries < 40; tries += 1) {
    const p = nearestRoadPoint(world, rng.range(300, 4600), rng.range(300, 4600));
    if (Math.hypot(p.x - x, p.y - y) >= minDist) return p;
  }
  return nearestRoadPoint(world, 2400, 2400);
}

/** Spawn a traffic car on a road near the player, already moving. */
export function spawnTrafficCar(world, rng, px, py) {
  const types = ['sedan', 'sedan', 'coupe', 'muscle', 'van', 'taxi', 'sports', 'truck'];
  const point = randomRoadPoint(world, rng, px, py, 500);
  // A car on a vertical road drives north/south; on a horizontal road, east/west.
  const onVerticalRoad = Math.abs(point.x - Math.round(point.x / 400) * 400) < 1;
  const car = createCar(rng.pick(types), point.x, point.y, onVerticalRoad ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI), 'traffic');
  car.speed = car.cruise;
  const dest = randomRoadPoint(world, rng, point.x, point.y, 1200);
  car.route = findPath(world, point.x, point.y, dest.x, dest.y);
  car.routeIndex = 0;
  return car;
}

/** Steer a traffic car along its route; returns throttle/steer for stepCar. */
export function trafficDrive(car, dt) {
  if (!car.route || car.routeIndex >= car.route.length) return { throttle: 0, steer: 0 };
  const target = car.route[car.routeIndex];
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 46) {
    car.routeIndex += 1;
    return { throttle: 0.4, steer: 0 };
  }
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const throttle = Math.abs(diff) > 1.1 ? 0 : Math.min(1, car.cruise / 300);
  return { throttle, steer };
}

/** Steer a police car toward a point (direct chase, or along roads when far). */
export function policeDrive(world, car, tx, ty, dt) {
  car.repath -= dt;
  const dist = Math.hypot(tx - car.x, ty - car.y);
  if (dist > 900 && car.repath <= 0) {
    car.path = findPath(world, car.x, car.y, tx, ty);
    car.pathIndex = 0;
    car.repath = 2.5;
  }
  let target = { x: tx, y: ty };
  if (car.path && car.pathIndex < car.path.length) {
    target = car.path[car.pathIndex];
    if (Math.hypot(target.x - car.x, target.y - car.y) < 60) car.pathIndex += 1;
  }
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  return { throttle: dist > 120 ? 1 : 0.6, steer };
}
