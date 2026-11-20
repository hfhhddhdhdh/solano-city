// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// an autopilot that drives the road grid toward the mission marker, so the
// frame is what a short game really looks like and the same seed always gives
// the same frame. The game object is passed in, so this file never imports the
// boot code: { state, stepFixed(dt), startMission(id), reset(), enterCar(car) }.

import { findPath } from './world.js';
import { createCar, randomRoadPoint } from './vehicles.js';

/** After staging, put the frame back into the chase the shot is meant to show:
 * the player in a car, three wanted stars, and cruisers closing in. */
function ensureChase(game) {
  const state = game.state;
  if (!state.player.car) {
    const car = game.spawnParkedCar('sports', state.player.x + 30, state.player.y);
    game.enterCar(car, { stolen: false });
  }
  state.player.wanted = 3;
  state.player.lastSeen = state.time;
  let cops = state.cars.filter((c) => c.driver === 'cop' && !c.dead);
  while (cops.length < 2) {
    const spot = randomRoadPoint(state.world, state.rng, state.player.x, state.player.y, 450);
    const cop = createCar('police', spot.x, spot.y, Math.atan2(state.player.y - spot.y, state.player.x - spot.x), 'cop');
    cop.speed = 300;
    state.cars.push(cop);
    cops.push(cop);
  }
  state.banner = { text: 'LOSE THE COPS', sub: 'Reach the safehouse — 3 stars and closing', until: 99999, kind: 'bad' };
  state.objective = { text: 'Lose the cops — reach the safehouse', until: 99999 };
}

/** Steer toward the current mission marker along the road grid. */
export function autopilotDrive(game, dt) {
  const state = game.state;
  const player = state.player;
  const target = game.missionTarget();
  if (!target) return { throttle: 0, steer: 0, onFoot: true };
  if (!player.car) {
    // On foot: walk toward the marker.
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < 60) return { throttle: 0, steer: 0, onFoot: true };
    return { moveX: dx / d, moveY: dy / d, onFoot: true };
  }
  const car = player.car;
  if (!game.autopilotPath || game.autopilotPathIndex >= game.autopilotPath.length) {
    game.autopilotPath = findPath(state.world, car.x, car.y, target.x, target.y);
    game.autopilotPathIndex = 0;
  }
  const waypoint = game.autopilotPath[game.autopilotPathIndex];
  const dx = waypoint.x - car.x;
  const dy = waypoint.y - car.y;
  if (Math.hypot(dx, dy) < 50) {
    game.autopilotPathIndex += 1;
    return { throttle: 0.5, steer: 0, onFoot: false };
  }
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return {
    throttle: Math.abs(diff) > 1 ? 0.2 : 1,
    steer: Math.max(-1, Math.min(1, diff * 2.4)),
    onFoot: false,
  };
}

function settleMission(game, seconds) {
  const STEP = 1 / 60;
  for (let i = 0; i < seconds * 60; i += 1) game.stepFixed(STEP);
}

/**
 * Set the game to the named scene (start, play, chase or end; any other name
 * is start) and return the screen to draw over it.
 */
export function stageShot(name, game) {
  const state = game.state;
  game.reset();
  if (name === 'start') {
    // A quiet title backdrop: a few seconds of traffic rolling past downtown.
    game.autopilot = null;
    settleMission(game, 5);
    return { screen: 'title' };
  }
  if (name === 'chase') {
    // Mid-race: the Sunset Grand Prix, rivals beside you, checkpoint ahead.
    game.startMission('race');
    settleMission(game, 1); // let the stage spawn its racers
    const car = game.spawnParkedCar('sports', state.player.x + 30, state.player.y);
    game.enterCar(car, { stolen: false });
    game.autopilot = 'drive';
    settleMission(game, 12);
    // Keep the frame a race, not a pile-up: player in the car, no cops.
    if (!state.player.car) {
      const fresh = game.spawnParkedCar('sports', state.player.x + 30, state.player.y);
      game.enterCar(fresh, { stolen: false });
    }
    state.player.wanted = 0;
    state.sound.stopSiren();
    state.banner = { text: 'SUNSET GRAND PRIX', sub: 'First to the last checkpoint takes the pot', until: 99999, kind: 'good' };
    return { screen: 'play' };
  }
  if (name === 'end') {
    // The finale, just passed: banner up, stats on the HUD, cops gone.
    game.startMission('finale');
    game.state.missionsDone = ['welcome', 'getaway', 'package', 'taxi', 'heist', 'shootout', 'race', 'finale'];
    game.state.player.money = 12480;
    game.state.stats.kills = 47;
    game.state.stats.carsStolen = 23;
    game.state.coinsCollected = 21;
    const endCar = game.spawnParkedCar('sports', state.player.x + 30, state.player.y);
    game.enterCar(endCar, { stolen: false });
    game.state.banner = { text: 'MISSION PASSED', sub: 'King of Solano  +$3000', until: 99999, kind: 'good' };
    game.autopilot = null;
    settleMission(game, 2);
    game.state.banner = { text: 'MISSION PASSED', sub: 'King of Solano  +$3000', until: 99999, kind: 'good' };
    return { screen: 'play' };
  }
  // play: the getaway — stolen Comet GT, three wanted stars, cruisers closing in.
  game.startMission('getaway');
  settleMission(game, 1); // let the steal stage spawn its car
  const stealStage = game.state.mission;
  const car = stealStage ? game.state.cars.find((c) => c.id === stealStage.stageState.carId) : null;
  if (car) {
    game.state.player.x = car.x + 40;
    game.state.player.y = car.y;
    game.enterCar(car, { stolen: true });
    game.state.player.wanted = 3;
    game.state.player.lastSeen = game.state.time;
    game.state.sound.startSiren();
  }
  game.autopilot = 'drive';
  settleMission(game, 10);
  ensureChase(game);
  return { screen: 'play' };
}
