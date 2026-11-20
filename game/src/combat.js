// Combat: bullets, explosions, and who gets hurt. Shooting is hitscan with a
// spread and a short tracer; explosions are radial damage with a shockwave.
// Everything here works on plain positions, so on-foot and in-car fighting
// share the same code.

import { WEAPONS } from './config.js';
import { pointInBuilding } from './world.js';

let nextBulletId = 1;

export function createBullet(x, y, angle, speed, range, damage, owner, kind) {
  return {
    id: nextBulletId,
    x, y, angle, speed, range, damage, owner, kind,
    travelled: 0, dead: false,
    px: x, py: y,
  };
}

/** Fire one shot of a weapon from (x, y) toward angle; returns the bullets made. */
export function fireWeapon(weaponName, x, y, angle, owner) {
  const def = WEAPONS[weaponName];
  if (!def) return [];
  const pellets = def.pellets || 1;
  const bullets = [];
  for (let i = 0; i < pellets; i += 1) {
    const spread = (Math.random() - 0.5) * 2 * def.spread;
    bullets.push(createBullet(
      x + Math.cos(angle) * 20,
      y + Math.sin(angle) * 20,
      angle + spread,
      1400,
      def.range,
      def.damage,
      owner,
      weaponName,
    ));
  }
  return bullets;
}

/** Move bullets, test them against people and cars, and spawn tracers. */
export function updateBullets(state, bullets, dt) {
  const { world } = state;
  for (const b of bullets) {
    if (b.dead) continue;
    b.px = b.x;
    b.py = b.y;
    const step = b.speed * dt;
    b.x += Math.cos(b.angle) * step;
    b.y += Math.sin(b.angle) * step;
    b.travelled += step;
    if (b.travelled >= b.range) { b.dead = true; continue; }
    if (pointInBuilding(world, b.x, b.y)) { b.dead = true; spawnSpark(state, b.x, b.y); continue; }
    // People.
    for (const person of state.people) {
      if (person.dead || person === b.ownerRef) continue;
      if (Math.hypot(person.x - b.x, person.y - b.y) < 15) {
        b.dead = true;
        hurtPerson(state, person, b.damage, b.owner);
        break;
      }
    }
    if (b.dead) continue;
    // Cars (not the shooter's own car).
    for (const car of state.cars) {
      if (car.dead || car === b.ownerCar) continue;
      const dx = b.x - car.x;
      const dy = b.y - car.y;
      const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const across = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
      if (Math.abs(along) < car.length / 2 && Math.abs(across) < car.width / 2) {
        b.dead = true;
        damageCar(state, car, b.damage, b.owner);
        break;
      }
    }
  }
  state.bullets = bullets.filter((b) => !b.dead);
}

export function spawnSpark(state, x, y) {
  state.particles.push({ kind: 'spark', x, y, life: 0.25, max: 0.25, vx: 0, vy: 0 });
}

export function hurtPerson(state, person, damage, owner) {
  if (person.dead) return;
  person.health -= damage;
  state.particles.push({ kind: 'blood', x: person.x, y: person.y, life: 0.4, max: 0.4, vx: 0, vy: 0 });
  if (person.health <= 0) {
    person.dead = true;
    person.deathTime = state.time;
    if (person.kind === 'enemy') {
      state.stats.kills += 1;
      state.player.money += 40;
      state.banner = { text: 'Target down  +$40', sub: '', until: state.time + 1.6, kind: 'good' };
    } else if (person.kind === 'ped') {
      state.stats.kills += 1;
      state.sound.wantedUp();
      addWanted(state, 1);
    } else if (person.kind === 'cop') {
      state.stats.kills += 1;
      addWanted(state, 2);
    }
    if (owner === 'player' && person.kind === 'enemy') state.missionKills = (state.missionKills || 0) + 1;
  } else if (person.kind === 'ped') {
    person.fleeing = true;
    person.fleeUntil = state.time + 6;
  } else if (person.kind === 'enemy' || person.kind === 'cop') {
    person.alerted = true;
  }
}

export function damageCar(state, car, damage, owner) {
  if (car.dead) return;
  car.hp -= damage;
  state.particles.push({ kind: 'spark', x: car.x, y: car.y, life: 0.2, max: 0.2, vx: 0, vy: 0 });
  if (car.hp <= 0 && !car.dead) {
    explodeCar(state, car);
  }
  if (owner === 'player' && car.driver === 'cop') addWanted(state, 1);
}

export function explodeCar(state, car) {
  car.dead = true;
  car.burning = false;
  state.particles.push({ kind: 'explosion', x: car.x, y: car.y, life: 0.7, max: 0.7, vx: 0, vy: 0, radius: 90 });
  state.sound.explosion();
  state.shake = Math.max(state.shake, 10);
  // Radial damage.
  for (const person of state.people) {
    if (person.dead) continue;
    const d = Math.hypot(person.x - car.x, person.y - car.y);
    if (d < 110) hurtPerson(state, person, 90 - d * 0.6, 'explosion');
  }
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 120) damageCar(state, other, 60, 'explosion');
  }
  if (state.player.car === car) {
    state.player.car = null;
    state.player.onFoot = true;
    state.player.x = car.x + 40;
    state.player.y = car.y;
    hurtPlayer(state, 35);
  }
}

export function hurtPlayer(state, damage) {
  const p = state.player;
  if (p.dead || state.god) return;
  let remaining = damage;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, remaining);
    p.armor -= absorbed;
    remaining -= absorbed;
  }
  p.health -= remaining;
  state.shake = Math.max(state.shake, 5);
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    state.screen = 'wasted';
    state.sound.missionFail();
    state.sound.stopSiren();
    state.sound.stopEngine();
  }
}

export function addWanted(state, stars) {
  const before = state.player.wanted;
  state.player.wanted = Math.min(5, state.player.wanted + stars);
  state.player.lastSeen = state.time;
  if (state.player.wanted > before) state.sound.wantedUp();
  if (state.player.wanted > 0) state.sound.startSiren();
}

export function updateParticles(state, dt) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}
