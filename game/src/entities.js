// The people of Solano City: pedestrians who stroll the sidewalks and flee
// gunfire, police cruisers that hunt the player by wanted level, and the armed
// crews the missions send after you. All of them share the `people` list;
// cars live in `state.cars` and are driven by vehicles.js.

import { PLAYER, WANTED } from './config.js';
import { isOnRoad, nearestRoadPoint, resolveBuildingCollision, findPath } from './world.js';
import { createCar, policeDrive, stepCar, randomRoadPoint, collideCars } from './vehicles.js';
import { hurtPlayer, addWanted } from './combat.js';

const PED_COLORS = ['#e8d8b0', '#c98a6b', '#8a6bc9', '#6bc98a', '#c9c96b', '#e8e8e8', '#d98a4f', '#7a9ac9'];
const PED_NAMES = ['Maya', 'Luis', 'Tina', 'Omar', 'Grace', 'Dante', 'Rosa', 'Felix', 'Ivy', 'Marco', 'Nina', 'Cole'];

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    health: PLAYER.health, armor: 0, money: 250,
    wanted: 0, lastSeen: -100, hiddenTimer: 0,
    weapon: 'fists', ammo: { pistol: 0, smg: 0, shotgun: 0, rifle: 0 },
    onFoot: true, car: null, dead: false,
    punchCooldown: 0, shootCooldown: 0, moving: false,
  };
}

export function createPed(world, rng, px, py) {
  const point = nearestRoadPoint(world, rng.range(400, 4400), rng.range(400, 4400));
  return {
    kind: 'ped',
    name: rng.pick(PED_NAMES),
    x: point.x + rng.range(-90, 90),
    y: point.y + rng.range(-90, 90),
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 52),
    health: 50,
    color: rng.pick(PED_COLORS),
    dead: false,
    fleeing: false,
    fleeUntil: 0,
    target: null,
    wanderTimer: rng.range(0, 4),
    alerted: false,
  };
}

export function createEnemy(x, y, opts = {}) {
  return {
    kind: 'enemy',
    name: opts.name || 'Crew gunman',
    x, y,
    angle: opts.angle || 0,
    speed: 95,
    health: opts.health || 80,
    color: '#3a3a3a',
    dead: false,
    fleeing: false,
    target: null,
    shootCooldown: Math.random(),
    alerted: true,
    guard: opts.guard || null, // {x, y} spot to hold
    weapon: opts.weapon || 'pistol',
  };
}

/** Pedestrians stroll between sidewalk points and run from danger. */
export function updatePed(ped, state, dt) {
  if (ped.dead) return;
  const player = state.player;
  const danger = state.gunfireAt && state.time - state.gunfireAt < 2;
  if (ped.fleeing && state.time < ped.fleeUntil) {
    const dx = ped.x - player.x;
    const dy = ped.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy, dx);
    ped.x += Math.cos(ped.angle) * ped.speed * 2.6 * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * 2.6 * dt;
    resolveBuildingCollision(state.world, ped, 12);
    return;
  }
  ped.fleeing = false;
  if (danger && Math.hypot(ped.x - player.x, ped.y - player.y) < 420) {
    ped.fleeing = true;
    ped.fleeUntil = state.time + 5;
    return;
  }
  ped.wanderTimer -= dt;
  if (!ped.target || ped.wanderTimer <= 0) {
    const near = nearestRoadPoint(state.world, ped.x, ped.y);
    ped.target = {
      x: near.x + (Math.random() - 0.5) * 260,
      y: near.y + (Math.random() - 0.5) * 260,
    };
    ped.wanderTimer = 4 + Math.random() * 5;
  }
  const dx = ped.target.x - ped.x;
  const dy = ped.target.y - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) { ped.target = null; return; }
  ped.angle = Math.atan2(dy, dx);
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  resolveBuildingCollision(state.world, ped, 12);
}

/** A mission enemy: holds a guard spot, or hunts the player and shoots. */
export function updateEnemy(enemy, state, dt) {
  if (enemy.dead) return;
  const player = state.player;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (enemy.guard && dist > 420) {
    const gx = enemy.guard.x - enemy.x;
    const gy = enemy.guard.y - enemy.y;
    const gd = Math.hypot(gx, gy);
    if (gd > 20) {
      enemy.angle = Math.atan2(gy, gx);
      enemy.x += Math.cos(enemy.angle) * enemy.speed * dt;
      enemy.y += Math.sin(enemy.angle) * enemy.speed * dt;
    }
    return;
  }
  if (dist > 300) {
    enemy.angle = Math.atan2(dy, dx);
    enemy.x += Math.cos(enemy.angle) * enemy.speed * dt;
    enemy.y += Math.sin(enemy.angle) * enemy.speed * dt;
    resolveBuildingCollision(state.world, enemy, 12);
  } else {
    enemy.angle = Math.atan2(dy, dx);
    enemy.shootCooldown -= dt;
    if (enemy.shootCooldown <= 0 && dist < 420 && !player.dead) {
      enemy.shootCooldown = 0.9 + Math.random() * 0.7;
      const aim = enemy.angle + (Math.random() - 0.5) * 0.22;
      const { fireWeapon } = state.combat;
      const bullets = fireWeapon(enemy.weapon, enemy.x, enemy.y, aim, 'enemy');
      for (const b of bullets) { b.ownerRef = enemy; state.bullets.push(b); }
      state.particles.push({ kind: 'muzzle', x: enemy.x + Math.cos(aim) * 22, y: enemy.y + Math.sin(aim) * 22, life: 0.08, max: 0.08, vx: 0, vy: 0 });
    }
  }
}

/** How many cruisers the wanted level asks for, and how fast they arrive. */
export function wantedCopTarget(wanted) {
  return [0, 1, 2, 3, 4, 6][wanted] || 0;
}

/** Spawn cruisers at road points away from the player, up to the wanted target. */
export function updatePolice(state, dt) {
  const player = state.player;
  const target = wantedCopTarget(player.wanted);
  const cops = state.cars.filter((c) => c.driver === 'cop' && !c.dead);
  if (cops.length < target && player.wanted > 0) {
    state.copSpawnTimer -= dt;
    if (state.copSpawnTimer <= 0) {
      state.copSpawnTimer = Math.max(1.2, 4 - player.wanted * 0.5);
      const point = randomRoadPoint(state.world, state.rng, player.x, player.y, 650);
      const cop = createCar('police', point.x, point.y, Math.atan2(player.y - point.y, player.x - point.x), 'cop');
      cop.speed = 260;
      state.cars.push(cop);
    }
  }
  // A cop that catches the player on foot starts an arrest; in a car it rams.
  for (const cop of cops) {
    const dist = Math.hypot(player.x - cop.x, player.y - cop.y);
    if (dist < 520) {
      player.lastSeen = state.time;
      player.hiddenTimer = 0;
    }
    if (player.onFoot && !player.dead && dist < 46 && Math.abs(cop.speed) < 90) {
      state.bustedTimer += dt;
      if (state.bustedTimer > 1.4) {
        state.screen = 'busted';
        state.sound.missionFail();
        state.sound.stopSiren();
        state.sound.stopEngine();
      }
    } else {
      state.bustedTimer = Math.max(0, state.bustedTimer - dt * 2);
    }
    if (dist < 90 && !player.onFoot && player.car && Math.abs(cop.speed) > 150) {
      hurtPlayer(state, WANTED.copRamDamage * dt * 2);
    }
  }
  // Wanted decays once no cop has seen the player for a while.
  if (player.wanted > 0 && state.time - player.lastSeen > WANTED.decayDelay) {
    player.hiddenTimer += dt;
    if (player.hiddenTimer > WANTED.decayInterval) {
      player.hiddenTimer = 0;
      player.wanted -= 1;
      if (player.wanted === 0) state.sound.stopSiren();
    }
  }
  // Drive every cop toward the player.
  for (const cop of cops) {
    const drive = policeDrive(state.world, cop, player.x, player.y, dt);
    stepCar(state.world, cop, drive.throttle, drive.steer, false, dt);
  }
}

/** Keep the streets busy: top the traffic and pedestrians back up near the player. */
export function updatePopulation(state, dt) {
  const player = state.player;
  const traffic = state.cars.filter((c) => c.driver === 'traffic' && !c.dead);
  const peds = state.people.filter((p) => p.kind === 'ped' && !p.dead);
  if (traffic.length < 14) {
    const { spawnTrafficCar } = state.vehicles;
    const car = spawnTrafficCar(state.world, state.rng, player.x, player.y);
    // Never spawn on top of another car: that is how intersection pile-ups start.
    const crowded = state.cars.some((c) => !c.dead && Math.hypot(c.x - car.x, c.y - car.y) < 130);
    if (!crowded) state.cars.push(car);
  }
  if (peds.length < 16) {
    state.people.push(createPed(state.world, state.rng, player.x, player.y));
  }
  // Remove anything that wandered far away.
  state.cars = state.cars.filter((c) => c.driver !== 'traffic' || Math.hypot(c.x - player.x, c.y - player.y) < 2600);
  state.people = state.people.filter((p) => p.kind !== 'ped' || Math.hypot(p.x - player.x, p.y - player.y) < 2200);
}
