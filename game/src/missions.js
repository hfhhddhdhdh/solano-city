// Missions and side jobs. Eight story missions in order, each a list of stages:
// go somewhere, go somewhere fast, wipe out a crew, chase a car down, or win a
// race. Side jobs run alongside: taxi fares, vigilante takedowns, stunt jumps
// and 30 hidden sun coins. The mission state lives on `state.mission`.

import { MISSION_REWARDS } from './config.js';
import { nearestRoadPoint, findPath, roadOrientation } from './world.js';
import { createCar, randomRoadPoint } from './vehicles.js';
import { createEnemy } from './entities.js';
import { addWanted } from './combat.js';

export const MISSIONS = [
  {
    id: 'welcome', title: 'New in Town', giver: 'Rosa Delgado', reward: MISSION_REWARDS.intro,
    briefing: 'You just rolled into Solano City with $250 and a borrowed jacket. Rosa runs the Sunset Diner — go meet her. She has work.',
    start: { x: 2830, y: 1230 },
    stages: [
      { kind: 'goto', text: 'Meet Rosa at the Sunset Diner', x: 2830, y: 1230, radius: 70 },
      { kind: 'goto', text: 'Drive to your safehouse in Old Town', x: 830, y: 1630, radius: 80 },
    ],
  },
  {
    id: 'getaway', title: 'The Getaway', giver: 'Rosa Delgado', reward: MISSION_REWARDS.getaway,
    briefing: 'Rosa needs a fast car, no questions. Steal the Comet GT parked by the marina, then lose the cops and bring it to the safehouse.',
    start: { x: 1230, y: 3630 },
    stages: [
      { kind: 'steal', text: 'Steal the Comet GT by the marina', x: 1230, y: 3630, radius: 60, carType: 'sports' },
      { kind: 'timedGoto', text: 'Lose the cops — reach the safehouse', x: 830, y: 1630, radius: 90, time: 100 },
    ],
  },
  {
    id: 'package', title: 'Special Delivery', giver: 'Eddie Voss', reward: MISSION_REWARDS.package,
    briefing: 'Eddie has a package at the Harbor Yards that has to be in Marina Bay in 80 seconds. Drive like the rent is due — it is.',
    start: { x: 4030, y: 3630 },
    stages: [
      { kind: 'goto', text: 'Pick up the package at the Harbor Yards', x: 4030, y: 3630, radius: 70 },
      { kind: 'timedGoto', text: 'Deliver the package to Marina Bay', x: 830, y: 4030, radius: 80, time: 80 },
    ],
  },
  {
    id: 'taxi', title: 'Cab Fare', giver: 'Rosa Delgado', reward: MISSION_REWARDS.taxi,
    briefing: 'A Sun Cab is waiting by the diner. Pick up the fare outside the arena and get them to the airport hotel before the meter runs out.',
    start: { x: 2830, y: 1230 },
    stages: [
      { kind: 'goto', text: 'Get in the Sun Cab by the diner', x: 2800, y: 1200, radius: 60, needCar: 'taxi' },
      { kind: 'goto', text: 'Pick up the fare at the arena', x: 2400, y: 2800, radius: 70 },
      { kind: 'timedGoto', text: 'Drop the fare at the Bay Hotel', x: 1200, y: 4000, radius: 80, time: 70 },
    ],
  },
  {
    id: 'heist', title: 'The Harbor Job', giver: 'Eddie Voss', reward: MISSION_REWARDS.heist,
    briefing: 'A warehouse in the Harbor Yards is holding a case of cash for the Voss crew. Clear the guards, grab the case, and bring it home. The cops will not like it.',
    start: { x: 4030, y: 3630 },
    stages: [
      { kind: 'goto', text: 'Reach the warehouse', x: 4030, y: 3630, radius: 90 },
      { kind: 'kill', text: 'Clear the warehouse guards (0/5)', cx: 4030, cy: 3630, count: 5 },
      { kind: 'goto', text: 'Grab the case and escape to the safehouse', x: 830, y: 1630, radius: 90, wantedOnEnter: 3 },
    ],
  },
  {
    id: 'shootout', title: 'Rooftop War', giver: 'Marcus Hale', reward: MISSION_REWARDS.shootout,
    briefing: 'Hale’s rivals took the downtown block and they are not giving it back. Take the block. Bring a gun — the diner sells them, or take one off a guard.',
    start: { x: 2400, y: 2000 },
    stages: [
      { kind: 'kill', text: 'Take the downtown block (0/8)', cx: 2400, cy: 2000, count: 8 },
      { kind: 'goto', text: 'Meet Marcus at the park', x: 2200, y: 2200, radius: 80 },
    ],
  },
  {
    id: 'race', title: 'Sunset Grand Prix', giver: 'Lena Cross', reward: MISSION_REWARDS.race,
    briefing: 'Lena runs the street races. Five checkpoints around the city, three rivals, one winner. Finish first and the pot is yours.',
    start: { x: 2000, y: 1200 },
    stages: [
      { kind: 'race', text: 'Race! Hit every checkpoint', checkpoints: [
        { x: 3600, y: 800 }, { x: 4400, y: 2400 }, { x: 3600, y: 4000 },
        { x: 1200, y: 4000 }, { x: 800, y: 1200 },
      ] },
    ],
  },
  {
    id: 'finale', title: 'King of Solano', giver: 'Rosa Delgado', reward: MISSION_REWARDS.finale,
    briefing: 'Viktor Kane, the man who runs this city’s underworld, is fleeing in his black Bison. Run him off the road, finish his crew, and Solano City is yours.',
    start: { x: 2000, y: 2800 },
    stages: [
      { kind: 'chase', text: 'Run Viktor Kane off the road', cx: 2000, cy: 2800 },
      { kind: 'kill', text: 'Finish Kane’s crew (0/4)', cx: 2000, cy: 2800, count: 4 },
      { kind: 'goto', text: 'Return to the safehouse a legend', x: 830, y: 1630, radius: 90 },
    ],
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function nextMissionId(state) {
  for (const m of MISSIONS) {
    if (!state.missionsDone.includes(m.id)) return m.id;
  }
  return null;
}

export function startMission(state, id) {
  const def = missionById(id);
  if (!def) return false;
  state.mission = { def, stage: 0, stageState: {}, startedAt: state.time, killsAtStart: state.stats.kills };
  state.missionKills = 0;
  showObjective(state, def.stages[0].text);
  state.sound.pickup();
  return true;
}

export function showObjective(state, text) {
  state.objective = { text, until: state.time + 6 };
}

function failMission(state, reason) {
  state.mission = null;
  state.banner = { text: 'MISSION FAILED', sub: reason, until: state.time + 3, kind: 'bad' };
  state.sound.missionFail();
}

function completeMission(state) {
  const def = state.mission.def;
  state.missionsDone.push(def.id);
  state.player.money += def.reward;
  state.stats.missions += 1;
  state.mission = null;
  state.banner = { text: 'MISSION PASSED', sub: `${def.title}  +$${def.reward}`, until: state.time + 3.5, kind: 'good' };
  state.sound.missionDone();
  state.save();
}

function stageTarget(state, stage) {
  if (stage.kind === 'race') {
    const cp = stage.checkpoints[state.mission.stageState.checkpoint || 0];
    return cp ? { x: cp.x, y: cp.y } : null;
  }
  if (stage.kind === 'kill' || stage.kind === 'chase') return { x: stage.cx, y: stage.cy };
  return { x: stage.x, y: stage.y };
}

export function missionTarget(state) {
  if (!state.mission) {
    const next = nextMissionId(state);
    if (!next) return null;
    const def = missionById(next);
    return { x: def.start.x, y: def.start.y, kind: 'start', label: def.title };
  }
  const stage = state.mission.def.stages[state.mission.stage];
  const t = stageTarget(state, stage);
  return t ? { ...t, kind: 'mission', label: stage.text } : null;
}

function enterStage(state, stage) {
  const s = state.mission.stageState;
  s.entered = true;
  if (stage.wantedOnEnter) addWanted(state, stage.wantedOnEnter);
  if (stage.kind === 'kill') {
    state.missionKills = 0;
    for (let i = 0; i < stage.count; i += 1) {
      const angle = (i / stage.count) * Math.PI * 2;
      const x = stage.cx + Math.cos(angle) * 170;
      const y = stage.cy + Math.sin(angle) * 170;
      const spot = nearestRoadPoint(state.world, x, y);
      state.people.push(createEnemy(spot.x, spot.y, { guard: { x: stage.cx, y: stage.cy }, health: 80 }));
    }
  }
  if (stage.kind === 'chase') {
    const spot = nearestRoadPoint(state.world, stage.cx, stage.cy);
    const target = createCar('muscle', spot.x, spot.y, 0, 'target');
    target.color = '#14141a';
    target.hp = 220;
    target.maxHp = 220;
    target.route = [randomRoadPoint(state.world, state.rng, spot.x, spot.y, 1500)];
    target.routeIndex = 0;
    state.cars.push(target);
    s.targetId = target.id;
    state.banner = { text: 'CHASE!', sub: 'Run Kane off the road — ram him or shoot his car', until: state.time + 3, kind: 'bad' };
  }
  if (stage.kind === 'race') {
    s.checkpoint = 0;
    s.racers = [];
    for (let i = 0; i < 3; i += 1) {
      // Rivals start on the grid behind the player, not on top of them.
      const spot = nearestRoadPoint(state.world, 2000, 1300 + i * 70);
      const racer = createCar(['sports', 'muscle', 'coupe'][i], spot.x, spot.y + i * 40, 0, 'racer');
      racer.checkpoint = 0;
      racer.route = findPath(state.world, spot.x, spot.y, stage.checkpoints[0].x, stage.checkpoints[0].y);
      racer.routeIndex = 0;
      state.cars.push(racer);
      s.racers.push(racer.id);
    }
  }
  if (stage.kind === 'steal') {
    const spot = nearestRoadPoint(state.world, stage.x, stage.y);
    const along = roadOrientation(state.world, spot.x, spot.y) === 'h' ? 0 : Math.PI / 2;
    const car = createCar(stage.carType || 'sports', spot.x, spot.y, along, 'parked');
    state.cars.push(car);
    s.carId = car.id;
  }
  if (stage.kind === 'goto' && stage.needCar === 'taxi') {
    const spot = nearestRoadPoint(state.world, stage.x, stage.y);
    const along = roadOrientation(state.world, spot.x, spot.y) === 'h' ? 0 : Math.PI / 2;
    const car = createCar('taxi', spot.x, spot.y, along, 'parked');
    state.cars.push(car);
  }
  if (stage.kind === 'timedGoto') s.timeLeft = stage.time;
  showObjective(state, stage.text);
}

function advanceStage(state) {
  state.mission.stage += 1;
  state.mission.stageState = {};
  state.missionKills = 0;
  const def = state.mission.def;
  if (state.mission.stage >= def.stages.length) {
    completeMission(state);
    return;
  }
  showObjective(state, def.stages[state.mission.stage].text);
  state.sound.pickup();
}

export function updateMission(state, dt) {
  if (!state.mission) return;
  const m = state.mission;
  const stage = m.def.stages[m.stage];
  const s = m.stageState;
  if (!s.entered) enterStage(state, stage);
  const player = state.player;

  if (stage.kind === 'goto' || stage.kind === 'timedGoto') {
    if (stage.needCar && !(player.car && player.car.type === stage.needCar)) {
      // Still need to arrive in the right car; the marker waits.
    }
    const d = Math.hypot(player.x - stage.x, player.y - stage.y);
    if (d < stage.radius && (!stage.needCar || (player.car && player.car.type === stage.needCar))) advanceStage(state);
    if (stage.kind === 'timedGoto') {
      s.timeLeft -= dt;
      if (s.timeLeft <= 0) failMission(state, 'Out of time');
    }
  } else if (stage.kind === 'steal') {
    const car = state.cars.find((c) => c.id === s.carId);
    if (player.car === car) {
      addWanted(state, 2);
      advanceStage(state);
    }
  } else if (stage.kind === 'kill') {
    const done = state.missionKills || 0;
    stage.text = stage.text.replace(/\(\d+\/\d+\)/, `(${Math.min(done, stage.count)}/${stage.count})`);
    if (done >= stage.count) advanceStage(state);
  } else if (stage.kind === 'chase') {
    const target = state.cars.find((c) => c.id === s.targetId);
    if (!target || target.dead) {
      // Kane's crew arrives to finish the job.
      for (let i = 0; i < 4; i += 1) {
        const spot = nearestRoadPoint(state.world, player.x + (Math.random() - 0.5) * 500, player.y + (Math.random() - 0.5) * 500);
        state.people.push(createEnemy(spot.x, spot.y, { health: 90 }));
      }
      advanceStage(state);
      return;
    }
    // The target flees along the roads, re-picking a destination when it arrives.
    if (!target.route || target.routeIndex >= target.route.length) {
      const dest = randomRoadPoint(state.world, state.rng, target.x, target.y, 1400);
      target.route = findPath(state.world, target.x, target.y, dest.x, dest.y);
      target.routeIndex = 0;
    }
    const { trafficDrive } = state.vehicles;
    const drive = trafficDrive(target, dt);
    const { stepCar } = state.vehicles;
    stepCar(state.world, target, Math.max(0.7, drive.throttle), drive.steer, false, dt);
  } else if (stage.kind === 'race') {
    const cp = stage.checkpoints[s.checkpoint];
    if (cp && Math.hypot(player.x - cp.x, player.y - cp.y) < 90) {
      s.checkpoint += 1;
      state.sound.pickup();
      if (s.checkpoint >= stage.checkpoints.length) {
        // Place by how many racers finished first.
        const finished = (s.racers || []).filter((id) => {
          const r = state.cars.find((c) => c.id === id);
          return r && (r.checkpoint || 0) >= stage.checkpoints.length;
        }).length;
        const place = finished + 1;
        state.banner = { text: place === 1 ? '1ST PLACE!' : `${place}TH PLACE`, sub: place === 1 ? 'Sunset Grand Prix — you win the pot' : 'The pot goes to someone faster', until: state.time + 3, kind: place === 1 ? 'good' : 'bad' };
        if (place === 1) { state.player.money += 400; }
        advanceStage(state);
      } else {
        showObjective(state, `Checkpoint ${s.checkpoint + 1} of ${stage.checkpoints.length}`);
      }
    }
    // Racers chase the checkpoints too.
    for (const id of s.racers || []) {
      const racer = state.cars.find((c) => c.id === id);
      if (!racer || racer.dead) continue;
      const target = stage.checkpoints[racer.checkpoint || 0];
      if (!target) continue;
      if (Math.hypot(racer.x - target.x, racer.y - target.y) < 90) {
        racer.checkpoint += 1;
        const next = stage.checkpoints[racer.checkpoint];
        if (next) {
          racer.route = findPath(state.world, racer.x, racer.y, next.x, next.y);
          racer.routeIndex = 0;
        }
        continue;
      }
      if (!racer.route || racer.routeIndex >= racer.route.length) {
        racer.route = findPath(state.world, racer.x, racer.y, target.x, target.y);
        racer.routeIndex = 0;
      }
      const { trafficDrive, stepCar } = state.vehicles;
      const drive = trafficDrive(racer, dt);
      stepCar(state.world, racer, Math.max(0.75, drive.throttle), drive.steer, false, dt);
    }
  } else if (stage.kind === 'survive') {
    s.timeLeft = (s.timeLeft ?? stage.time) - dt;
    if (s.timeLeft <= 0) advanceStage(state);
  }
}

/** Start the next mission when the player reaches its yellow start blip. */
export function updateMissionStart(state) {
  if (state.mission) return;
  const next = nextMissionId(state);
  if (!next) return;
  const def = missionById(next);
  const d = Math.hypot(state.player.x - def.start.x, state.player.y - def.start.y);
  if (d < 80) startMission(state, next);
}

// ---- Side jobs -----------------------------------------------------------

/** Taxi fares: in a Sun Cab, a passenger marker appears; deliver them for cash. */
export function updateTaxiJob(state, dt) {
  const player = state.player;
  if (state.taxi) {
    const job = state.taxi;
    const target = job.pickedUp ? job.dest : job.pickup;
    const d = Math.hypot(player.x - target.x, player.y - target.y);
    if (d < 70) {
      if (!job.pickedUp) {
        job.pickedUp = true;
        state.banner = { text: 'Passenger aboard', sub: 'Drive them to the marker', until: state.time + 2, kind: 'good' };
        state.sound.pickup();
      } else {
        const fare = 120 + Math.round(job.distance / 40);
        state.player.money += fare;
        state.stats.taxiFares += 1;
        state.banner = { text: `Fare complete  +$${fare}`, sub: '', until: state.time + 2, kind: 'good' };
        state.sound.missionDone();
        state.taxi = null;
        state.taxiTimer = 12;
      }
    }
    return;
  }
  if (!(player.car && player.car.type === 'taxi')) return;
  state.taxiTimer = (state.taxiTimer ?? 6) - dt;
  if (state.taxiTimer > 0) return;
  const pickup = randomRoadPoint(state.world, state.rng, player.x, player.y, 500);
  const dest = randomRoadPoint(state.world, state.rng, pickup.x, pickup.y, 900);
  state.taxi = { pickup, dest, pickedUp: false, distance: Math.hypot(dest.x - pickup.x, dest.y - pickup.y) };
  state.banner = { text: 'Taxi fare available', sub: 'Pick up the passenger at the yellow marker', until: state.time + 3, kind: 'good' };
}

/** Vigilante: a fleeing suspect car appears; stop it for a reward. */
export function updateVigilante(state, dt) {
  if (state.player.wanted > 0) return;
  state.vigilanteTimer = (state.vigilanteTimer ?? 45) - dt;
  if (state.vigilante && state.vigilante.car.dead) {
    state.player.money += 300;
    state.stats.vigilante += 1;
    state.banner = { text: 'Suspect stopped  +$300', sub: 'SCPD thanks you, citizen', until: state.time + 2.5, kind: 'good' };
    state.sound.missionDone();
    state.vigilante = null;
    state.vigilanteTimer = 60;
    return;
  }
  if (state.vigilante) {
    const car = state.vigilante.car;
    if (Math.hypot(car.x - state.player.x, car.y - state.player.y) > 3000) { state.vigilante = null; state.vigilanteTimer = 40; }
    return;
  }
  if (state.vigilanteTimer > 0) return;
  const spot = randomRoadPoint(state.world, state.rng, state.player.x, state.player.y, 700);
  const car = createCar('muscle', spot.x, spot.y, 0, 'suspect');
  car.color = '#8a1f1f';
  car.route = [randomRoadPoint(state.world, state.rng, spot.x, spot.y, 1600)];
  car.routeIndex = 0;
  state.cars.push(car);
  state.vigilante = { car };
  state.banner = { text: 'Vigilante call', sub: 'A suspect is fleeing — stop their car', until: state.time + 3, kind: 'bad' };
  state.sound.wantedUp();
}
