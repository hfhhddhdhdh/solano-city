// Solano City — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, help, map, wasted and busted.
// ?seed=N fixes the city. ?shot=start|play|chase|end stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady.

import { STEP, PLAYER, WEAPONS, CAR_TYPES } from './config.js';
import { createRandom } from './random.js';
import { createWorld, nearestRoadPoint, resolveBuildingCollision, findPath, roadOrientation } from './world.js';
import { createInput } from './input.js';
import { createSound } from './audio.js';
import * as vehicles from './vehicles.js';
import * as combat from './combat.js';
import * as entities from './entities.js';
import { createCar, stepCar, collideCars, spawnTrafficCar, trafficDrive } from './vehicles.js';
import { createPlayer, createPed, updatePed, updateEnemy, updatePolice, updatePopulation } from './entities.js';
import { fireWeapon, updateBullets, hurtPerson, damageCar, hurtPlayer, addWanted, updateParticles } from './combat.js';
import { startMission, updateMission, updateMissionStart, updateTaxiJob, updateVigilante, missionTarget } from './missions.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_WASTED, SCREEN_BUSTED, SCREEN_HELP, SCREEN_MAP } from './render.js';
import { stageShot, autopilotDrive } from './shots.js';
import { saveGame, loadGame, applySave } from './save.js';

const MAX_FRAME = 0.25;
const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1337;

function createGame() {
  const rng = createRandom(seed);
  const world = createWorld(rng);
  const player = createPlayer(world.spawn.x, world.spawn.y);
  const state = {
    world, rng, player,
    cars: [], people: [], bullets: [], particles: [],
    time: 0, clock: 540, // 09:00
    screen: SCREEN_TITLE,
    banner: null, objective: null,
    mission: null, missionsDone: [], missionKills: 0,
    coinsCollected: 0,
    stats: { kills: 0, missions: 0, carsStolen: 0, taxiFares: 0, vigilante: 0, stunts: 0 },
    taxi: null, taxiTimer: 6, vigilante: null, vigilanteTimer: 45,
    copSpawnTimer: 2, bustedTimer: 0,
    gunfireAt: -100, lastCrimeAt: -100,
    shake: 0, zoom: 1, god: false,
    hasSave: false, saveMoney: 0, saveMissions: 0, saveCoins: 0,
    autopilot: null, autopilotPath: null, autopilotPathIndex: 0,
    sound: null, vehicles, combat,
    save() { saveGame(state); },
  };
  state.sound = createSound();
  const saved = loadGame();
  if (saved) {
    state.hasSave = true;
    state.saveMoney = saved.money ?? 0;
    state.saveMissions = (saved.missionsDone || []).length;
    state.saveCoins = (saved.coins || []).length;
  }
  return state;
}

function populate(state) {
  // Parked cars around the spawn and the mission spots.
  const spots = [
    ['sedan', 900, 1560], ['coupe', 1200, 800], ['sports', 1230, 3630],
    ['taxi', 2800, 1200], ['muscle', 2000, 2800], ['van', 3600, 800],
    ['sedan', 2400, 2000], ['truck', 4000, 3600], ['coupe', 800, 4000],
    ['sports', 3600, 4000], ['sedan', 1600, 3200], ['muscle', 2800, 2800],
  ];
  for (const [type, x, y] of spots) {
    const point = nearestRoadPoint(state.world, x, y);
    // Park facing along the road, never into the block behind it.
    const along = roadOrientation(state.world, point.x, point.y) === 'h' ? 0 : Math.PI / 2;
    state.cars.push(createCar(type, point.x, point.y, along, 'parked'));
  }
  for (let i = 0; i < 12; i += 1) {
    state.cars.push(spawnTrafficCar(state.world, state.rng, state.player.x, state.player.y));
  }
  for (let i = 0; i < 16; i += 1) {
    state.people.push(createPed(state.world, state.rng, state.player.x, state.player.y));
  }
}

function resetGame(state) {
  const fresh = createGame();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
  state.sound = createSound();
  populate(state);
}

const state = createGame();
populate(state);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function enterCar(car, opts = {}) {
  const p = state.player;
  if (!car || car.dead) return;
  if (car.driver === 'traffic') {
    // Pull the driver out: they flee, and stealing a driven car is a crime.
    const driver = createPed(state.world, state.rng, car.x, car.y);
    driver.x = car.x + 40;
    driver.y = car.y + 20;
    driver.fleeing = true;
    driver.fleeUntil = state.time + 8;
    state.people.push(driver);
    state.stats.carsStolen += 1;
    addWanted(state, 1);
    state.sound.horn();
  } else if (car.driver === 'cop') {
    state.stats.carsStolen += 1;
    addWanted(state, 2);
  } else if (opts.stolen) {
    state.stats.carsStolen += 1;
  }
  p.car = car;
  car.driver = 'player';
  p.onFoot = false;
  p.x = car.x;
  p.y = car.y;
  state.sound.engine(0, true);
}

function exitCar() {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.driver = 'parked';
  car.speed *= 0.4;
  p.car = null;
  p.onFoot = true;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
  resolveBuildingCollision(state.world, p, PLAYER.radius);
  state.sound.stopEngine();
}

function nearestCar(maxDist) {
  const p = state.player;
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.dead || car.driver === 'player') continue;
    if (car.driver === 'racer' || car.driver === 'target' || car.driver === 'suspect') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function nearestShop(maxDist) {
  const p = state.player;
  let best = null;
  let bestD = maxDist;
  for (const shop of state.world.shops) {
    const d = Math.hypot(shop.x - p.x, shop.y - p.y);
    if (d < bestD) { bestD = d; best = shop; }
  }
  return best;
}

function shopAction(shop) {
  const p = state.player;
  if (shop.kind === 'gun') {
    for (const name of ['pistol', 'smg', 'shotgun', 'rifle']) {
      const def = WEAPONS[name];
      if ((p.ammo[name] || 0) <= 0 && p.money >= def.price) {
        p.money -= def.price;
        p.ammo[name] = def.ammo;
        p.weapon = name;
        state.banner = { text: `${def.name} bought`, sub: `-$${def.price} — press ${WEAPON_ORDER.indexOf(name) + 1} to equip`, until: state.time + 2.5, kind: 'good' };
        state.sound.pickup();
        return;
      }
    }
    if (p.money >= 100 && p.weapon !== 'fists') {
      p.money -= 100;
      p.ammo[p.weapon] += WEAPONS[p.weapon].ammo;
      state.banner = { text: 'Ammo restocked', sub: '-$100', until: state.time + 2, kind: 'good' };
      state.sound.pickup();
    } else {
      state.banner = { text: 'Lock & Load', sub: 'You own every gun — or you are short on cash', until: state.time + 2, kind: 'bad' };
    }
  } else if (shop.kind === 'food') {
    if (p.money >= 25 && p.health < 100) {
      p.money -= 25;
      p.health = 100;
      state.banner = { text: 'Full health', sub: 'Sunset Diner — best burger in Solano  -$25', until: state.time + 2, kind: 'good' };
      state.sound.pickup();
    } else {
      state.banner = { text: 'Sunset Diner', sub: p.health >= 100 ? 'You are already full' : 'A meal costs $25', until: state.time + 2, kind: 'bad' };
    }
  } else if (shop.kind === 'spray') {
    if (p.money >= 150 && p.car) {
      p.money -= 150;
      p.wanted = 0;
      p.car.color = ['#d94f3d', '#3d7bd9', '#e8c33a', '#7a4fd9', '#3aa655'][Math.floor(Math.random() * 5)];
      state.sound.stopSiren();
      state.banner = { text: 'Fresh paint', sub: 'The cops lost you  -$150', until: state.time + 2.5, kind: 'good' };
      state.sound.pickup();
    } else {
      state.banner = { text: "Spray 'n Go", sub: p.car ? 'A respray costs $150' : 'Bring a car to respray', until: state.time + 2, kind: 'bad' };
    }
  } else if (shop.kind === 'clothes') {
    if (p.money >= 60 && p.armor < 100) {
      p.money -= 60;
      p.armor = Math.min(100, p.armor + 25);
      state.banner = { text: 'Fresh threads', sub: 'Armour +25  -$60', until: state.time + 2, kind: 'good' };
      state.sound.pickup();
    } else {
      state.banner = { text: 'Palm Threads', sub: 'A vest costs $60', until: state.time + 2, kind: 'bad' };
    }
  }
}

function playerShoot(aimAngle) {
  const p = state.player;
  const def = WEAPONS[p.weapon];
  if (p.shootCooldown > 0) return;
  if (p.weapon !== 'fists' && (p.ammo[p.weapon] || 0) <= 0) {
    p.shootCooldown = 0.3;
    state.banner = { text: 'Out of ammo', sub: 'Buy more at Lock & Load', until: state.time + 1.5, kind: 'bad' };
    return;
  }
  p.shootCooldown = def.rate;
  if (p.weapon !== 'fists') p.ammo[p.weapon] -= 1;
  const origin = p.car ? { x: p.car.x, y: p.car.y } : { x: p.x, y: p.y };
  const bullets = fireWeapon(p.weapon, origin.x, origin.y, aimAngle, 'player');
  for (const b of bullets) { b.ownerRef = p; b.ownerCar = p.car; state.bullets.push(b); }
  state.particles.push({ kind: 'muzzle', x: origin.x + Math.cos(aimAngle) * 24, y: origin.y + Math.sin(aimAngle) * 24, life: 0.08, max: 0.08, vx: 0, vy: 0 });
  state.sound.shoot(p.weapon);
  state.gunfireAt = state.time;
  if (state.time - state.lastCrimeAt > 8) {
    state.lastCrimeAt = state.time;
    addWanted(state, 1);
  }
}

function playerPunch() {
  const p = state.player;
  if (p.punchCooldown > 0 || p.car) return;
  p.punchCooldown = PLAYER.punchCooldown;
  state.sound.punch();
  let hit = null;
  let bestD = PLAYER.punchRange;
  for (const person of state.people) {
    if (person.dead) continue;
    const d = Math.hypot(person.x - p.x, person.y - p.y);
    if (d < bestD) { bestD = d; hit = person; }
  }
  if (hit) hurtPerson(state, hit, PLAYER.punchDamage, 'player');
}

function respawn(kind) {
  const p = state.player;
  p.money = Math.max(0, p.money - (kind === 'wasted' ? 100 : 200));
  p.health = 100;
  p.armor = 0;
  p.wanted = 0;
  p.dead = false;
  p.onFoot = true;
  p.car = null;
  p.x = state.world.safehouse.x;
  p.y = state.world.safehouse.y;
  state.cars = state.cars.filter((c) => c.driver !== 'cop');
  state.people = state.people.filter((person) => person.kind !== 'enemy');
  state.mission = null;
  state.taxi = null;
  state.vigilante = null;
  state.bustedTimer = 0;
  state.sound.stopSiren();
  state.sound.stopEngine();
  state.screen = SCREEN_PLAY;
  saveGame(state);
}

function updatePlayer(dt) {
  const p = state.player;
  if (p.dead) return;
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  const mouseWorld = renderer.screenToWorld(state, input.mouseX, input.mouseY);
  const aimAngle = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);

  let drive = null;
  if (state.autopilot === 'drive') drive = autopilotDrive(game, dt);

  if (p.car) {
    const car = p.car;
    let throttle = 0;
    let steer = 0;
    let handbrake = false;
    if (drive) {
      throttle = drive.throttle;
      steer = drive.steer;
    } else {
      throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      steer = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      handbrake = input.down('Space');
    }
    const result = stepCar(state.world, car, throttle, steer, handbrake, dt);
    if (result === 'crash') { state.sound.crash(); state.shake = Math.max(state.shake, 6); hurtPlayer(state, 4); }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    state.sound.engine(Math.abs(car.speed) / car.topSpeed, true);
    // Skid marks at speed with the handbrake.
    if (handbrake && Math.abs(car.speed) > 200 && Math.random() < 0.5) {
      state.particles.push({ kind: 'skid', x: car.x, y: car.y, life: 0.5, max: 0.5, vx: -Math.cos(car.angle) * 20, vy: -Math.sin(car.angle) * 20 });
    }
    // Drive-by shooting.
    const wantShoot = drive ? false : (WEAPONS[p.weapon].auto ? input.mouseDown : input.wasClicked());
    if (wantShoot) playerShoot(aimAngle);
    if (input.wasPressed('KeyE')) exitCar();
    // Stunt ramps.
    for (const ramp of state.world.ramps) {
      if ((ramp.usedUntil || 0) > state.time) continue;
      if (Math.hypot(car.x - ramp.x, car.y - ramp.y) < 46 && Math.abs(car.speed) > 380) {
        ramp.usedUntil = state.time + 30;
        state.stats.stunts += 1;
        p.money += 100;
        state.banner = { text: 'STUNT JUMP!', sub: `Airtime bonus  +$100  (${state.stats.stunts}/6)`, until: state.time + 2.5, kind: 'good' };
        state.sound.pickup();
      }
    }
  } else {
    let mx = 0;
    let my = 0;
    if (drive) {
      mx = drive.moveX || 0;
      my = drive.moveY || 0;
    } else {
      const v = input.moveVector();
      mx = v.x;
      my = v.y;
    }
    const len = Math.hypot(mx, my);
    p.moving = len > 0;
    if (len > 0) {
      const run = input.down('ShiftLeft') || input.down('ShiftRight');
      const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      p.angle = aimAngle;
      resolveBuildingCollision(state.world, p, PLAYER.radius);
    } else {
      p.angle = aimAngle;
    }
    // Do not walk through cars.
    for (const car of state.cars) {
      if (car.dead) continue;
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const across = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
      if (Math.abs(along) < car.length / 2 + 12 && Math.abs(across) < car.width / 2 + 12) {
        const push = across > 0 ? 1 : -1;
        p.x += -Math.sin(car.angle) * push * 30 * dt * 10;
        p.y += Math.cos(car.angle) * push * 30 * dt * 10;
      }
    }
    if (input.wasPressed('KeyE')) {
      const car = nearestCar(78);
      if (car) enterCar(car);
      else {
        const shop = nearestShop(90);
        if (shop) shopAction(shop);
      }
    }
    if (input.wasPressed('KeyF')) playerPunch();
    const wantShoot = WEAPONS[p.weapon].auto ? input.mouseDown : input.wasClicked();
    if (wantShoot) playerShoot(aimAngle);
  }

  // Weapon switching.
  for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
    if (input.wasPressed(`Digit${i + 1}`)) {
      const name = WEAPON_ORDER[i];
      if (name === 'fists' || (state.player.ammo[name] || 0) > 0 || name === state.player.weapon) {
        state.player.weapon = name;
        state.sound.pickup();
      }
    }
  }
  // Safehouse healing.
  const sh = state.world.safehouse;
  if (Math.hypot(p.x - sh.x, p.y - sh.y) < 90) {
    p.health = Math.min(100, p.health + 12 * dt);
  }
}

function updateTraffic(dt) {
  for (const car of state.cars) {
    if (car.dead || car.driver !== 'traffic') continue;
    // A car that has been crawling for a while is stuck in a jam: give it a
    // fresh destination instead of letting it push the car in front forever.
    if (Math.abs(car.speed) < 30) car.stuck = (car.stuck || 0) + dt;
    else car.stuck = 0;
    if (!car.route || car.routeIndex >= car.route.length || car.stuck > 1.5) {
      const dest = vehicles.randomRoadPoint(state.world, state.rng, car.x, car.y, 1200);
      car.route = findPath(state.world, car.x, car.y, dest.x, dest.y);
      car.routeIndex = 0;
      car.stuck = 0;
    }
    const drive = trafficDrive(car, dt);
    stepCar(state.world, car, drive.throttle, drive.steer, false, dt);
  }
  // Car-car collisions.
  const cars = state.cars.filter((c) => !c.dead);
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const impact = collideCars(cars[i], cars[j]);
      if (impact > 140) {
        state.sound.crash();
        state.shake = Math.max(state.shake, 4);
        for (const car of [cars[i], cars[j]]) {
          car.hp -= impact * 0.08;
          if (car.hp <= 0 && !car.dead) combat.explodeCar(state, car);
        }
        // Ramming a mission target or a vigilante suspect damages it.
        const playerCar = state.player.car;
        if (playerCar && (cars[i] === playerCar || cars[j] === playerCar)) {
          const other = cars[i] === playerCar ? cars[j] : cars[i];
          if (other.driver === 'target' || other.driver === 'suspect') {
            damageCar(state, other, impact * 0.25, 'player');
          }
          if (other.driver === 'cop') addWanted(state, 0);
        }
      }
    }
  }
  // The player's car running over pedestrians.
  const p = state.player;
  if (p.car && Math.abs(p.car.speed) > 120) {
    for (const person of state.people) {
      if (person.dead || person.kind !== 'ped') continue;
      if (Math.hypot(person.x - p.car.x, person.y - p.car.y) < 34) {
        hurtPerson(state, person, 200, 'player');
        state.sound.crash();
        state.shake = Math.max(state.shake, 5);
      }
    }
  }
}

function updatePickups() {
  const p = state.player;
  for (const coin of state.world.collectibles) {
    if (coin.taken) continue;
    if (Math.hypot(p.x - coin.x, p.y - coin.y) < 34) {
      coin.taken = true;
      state.coinsCollected += 1;
      p.money += 50;
      state.sound.coin();
      state.banner = { text: 'Sun coin found', sub: `+$50  (${state.coinsCollected}/30)`, until: state.time + 1.8, kind: 'good' };
    }
  }
}

function simulate(dt) {
  state.time += dt;
  state.clock = (state.clock + dt) % 1440;
  state.shake = Math.max(0, state.shake - dt * 22);
  state.zoom += ((state.player.onFoot ? 1 : 0.82) - state.zoom) * Math.min(1, dt * 3);

  updatePlayer(dt);
  updateTraffic(dt);
  updatePolice(state, dt);
  updatePopulation(state, dt);
  for (const person of state.people) {
    if (person.kind === 'ped') updatePed(person, state, dt);
    else if (person.kind === 'enemy') updateEnemy(person, state, dt);
  }
  // The vigilante suspect flees along the roads.
  if (state.vigilante) {
    const car = state.vigilante.car;
    if (!car.dead) {
      if (!car.route || car.routeIndex >= car.route.length) {
        const dest = vehicles.randomRoadPoint(state.world, state.rng, car.x, car.y, 1600);
        car.route = findPath(state.world, car.x, car.y, dest.x, dest.y);
        car.routeIndex = 0;
      }
      const drive = trafficDrive(car, dt);
      stepCar(state.world, car, Math.max(0.8, drive.throttle), drive.steer, false, dt);
    }
  }
  updateBullets(state, state.bullets, dt);
  updateParticles(state, dt);
  updateMission(state, dt);
  updateMissionStart(state);
  updateTaxiJob(state, dt);
  updateVigilante(state, dt);
  updatePickups();
  if (state.player.car && state.player.car.burning && state.player.car.smoke <= 0) {
    combat.explodeCar(state, state.player.car);
  }
  for (const car of state.cars) {
    if (car.burning && car.smoke <= 0 && !car.dead) combat.explodeCar(state, car);
  }
  // Engine hum stops when the player is not driving.
  if (!state.player.car) state.sound.stopEngine();
}

function handleScreenKeys() {
  if (input.wasPressed('KeyN')) {
    state.sound.toggleMute();
    return;
  }
  if (state.screen === SCREEN_TITLE) {
    if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) {
      state.sound.unlock();
      if (state.hasSave) {
        const saved = loadGame();
        applySave(state, saved);
      }
      state.screen = SCREEN_PLAY;
      setStatus('Solano City: follow the yellow marker to your first mission.');
    }
    if (input.wasPressed('KeyX')) {
      // Fresh start: wipe the save and start over.
      try { window.localStorage.removeItem('solano-city.save.v1'); } catch { /* off */ }
      state.hasSave = false;
      state.screen = SCREEN_PLAY;
    }
    return;
  }
  if (state.screen === SCREEN_WASTED || state.screen === SCREEN_BUSTED) {
    if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) respawn(state.screen === SCREEN_WASTED ? 'wasted' : 'busted');
    return;
  }
  if (input.wasPressed('Escape')) {
    if (state.screen === SCREEN_PLAY) state.screen = SCREEN_PAUSED;
    else if (state.screen === SCREEN_PAUSED) state.screen = SCREEN_PLAY;
    else if (state.screen === SCREEN_HELP || state.screen === SCREEN_MAP) state.screen = SCREEN_PLAY;
    return;
  }
  if (state.screen === SCREEN_PAUSED) {
    if (input.wasPressed('KeyH')) state.screen = SCREEN_HELP;
    if (input.wasPressed('KeyM')) state.screen = SCREEN_MAP;
    if (input.wasPressed('KeyR')) { state.mission = null; state.screen = SCREEN_PLAY; }
    if (input.wasPressed('KeyQ')) {
      saveGame(state);
      state.screen = SCREEN_TITLE;
    }
    return;
  }
  if (state.screen === SCREEN_HELP || state.screen === SCREEN_MAP) {
    if (input.wasPressed('KeyH') || input.wasPressed('KeyM')) state.screen = SCREEN_PLAY;
    return;
  }
  if (state.screen === SCREEN_PLAY) {
    if (input.wasPressed('KeyH')) state.screen = SCREEN_HELP;
    if (input.wasPressed('KeyM')) state.screen = SCREEN_MAP;
  }
}

const game = {
  state,
  get autopilot() { return state.autopilot; },
  set autopilot(v) { state.autopilot = v; },
  get autopilotPath() { return state.autopilotPath; },
  set autopilotPath(v) { state.autopilotPath = v; },
  get autopilotPathIndex() { return state.autopilotPathIndex; },
  set autopilotPathIndex(v) { state.autopilotPathIndex = v; },
  missionTarget() { return missionTarget(state); },
  startMission(id) { return startMission(state, id); },
  spawnParkedCar(type, x, y) {
    const point = nearestRoadPoint(state.world, x, y);
    const along = roadOrientation(state.world, point.x, point.y) === 'h' ? 0 : Math.PI / 2;
    const car = createCar(type, point.x, point.y, along, 'parked');
    state.cars.push(car);
    return car;
  },
  enterCar(car, opts) { enterCar(car, opts); },
  reset() { resetGame(state); },
  stepFixed(dt) { simulate(dt); },
};

function runShot(name) {
  const scene = stageShot(name, game);
  state.screen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw(state, state.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    handleScreenKeys();
    if (state.screen === SCREEN_PLAY) {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        simulate(STEP);
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
    } else if (state.screen === SCREEN_TITLE) {
      // The city lives behind the title: traffic and pedestrians keep moving.
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        state.time += STEP;
        updateTraffic(STEP);
        updatePopulation(state, STEP);
        for (const person of state.people) {
          if (person.kind === 'ped') updatePed(person, state, STEP);
        }
        updateParticles(state, STEP);
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
    }
    if (state.screen === SCREEN_PLAY || state.screen === SCREEN_TITLE) {
      setStatus(state.screen === SCREEN_TITLE ? 'Solano City' : `Solano City — ${state.missionsDone.length}/8 missions, $${state.player.money}`);
    }
    renderer.draw(state, state.screen);
    input.endFrame();
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// A tiny read-only hook for automated checks (the parent's play-tests and
// screenshots): window.__solano.state exposes the live game state.
window.__solano = game;
