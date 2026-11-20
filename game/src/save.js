// Saving: the whole campaign fits in one localStorage row — money, missions,
// coins, stats, weapons and where the player stands. Saving is automatic after
// every mission and when quitting to the title; loading never throws.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: state.player.money,
      health: state.player.health,
      armor: state.player.armor,
      weapon: state.player.weapon,
      ammo: state.player.ammo,
      missionsDone: state.missionsDone,
      coins: state.world.collectibles.filter((c) => c.taken).map((c) => c.id),
      stats: state.stats,
      clock: state.clock,
      x: state.player.x,
      y: state.player.y,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
}

export function applySave(state, data) {
  if (!data) return;
  state.player.money = data.money ?? 250;
  state.player.health = data.health ?? 100;
  state.player.armor = data.armor ?? 0;
  state.player.weapon = data.weapon || 'fists';
  state.player.ammo = { pistol: 0, smg: 0, shotgun: 0, rifle: 0, ...(data.ammo || {}) };
  state.missionsDone = Array.isArray(data.missionsDone) ? data.missionsDone : [];
  state.stats = { kills: 0, missions: 0, carsStolen: 0, taxiFares: 0, vigilante: 0, stunts: 0, ...(data.stats || {}) };
  state.clock = data.clock ?? 540;
  for (const id of data.coins || []) {
    const coin = state.world.collectibles.find((c) => c.id === id);
    if (coin) coin.taken = true;
  }
  state.coinsCollected = state.world.collectibles.filter((c) => c.taken).length;
  if (typeof data.x === 'number' && typeof data.y === 'number') {
    state.player.x = data.x;
    state.player.y = data.y;
  }
}
