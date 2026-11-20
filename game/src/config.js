// Solano City — every tuning number, colour and name in one place.
// The city is a fixed 4800 x 4800 world: a road grid, a beach on the west edge,
// a park in the middle, and named districts. The renderer scales the camera to
// the window, so no rule below depends on the screen size.

export const WORLD = { size: 4800, roadSpacing: 400, roadWidth: 76, firstRoad: 400, lastRoad: 4400 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'solano-city.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const DISPLAY_FONT = 'Georgia, "Iowan Old Style", Palatino, serif';

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  health: 100,
  armor: 0,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.32,
};

export const WANTED = {
  decayDelay: 9, // seconds unseen before stars start falling
  decayInterval: 6, // seconds per star lost while hidden
  maxStars: 5,
  copSpeed: 300,
  copRamDamage: 6,
};

export const CAR_TYPES = {
  sedan:   { name: 'Solano Sedan',   length: 62, width: 30, accel: 320, topSpeed: 430, grip: 3.4, hp: 100, price: 0 },
  sports:  { name: 'Comet GT',      length: 60, width: 30, accel: 460, topSpeed: 560, grip: 4.2, hp: 80,  price: 0 },
  muscle:  { name: 'Bison Muscle',  length: 64, width: 31, accel: 400, topSpeed: 500, grip: 3.6, hp: 110, price: 0 },
  taxi:    { name: 'Sun Cab',       length: 62, width: 30, accel: 330, topSpeed: 440, grip: 3.4, hp: 100, price: 0 },
  van:     { name: 'Cargo Van',     length: 72, width: 32, accel: 260, topSpeed: 380, grip: 3.0, hp: 140, price: 0 },
  truck:   { name: 'Hauler Truck',  length: 86, width: 34, accel: 220, topSpeed: 350, grip: 2.8, hp: 180, price: 0 },
  police:  { name: 'SCPD Cruiser',  length: 62, width: 30, accel: 420, topSpeed: 520, grip: 4.0, hp: 120, price: 0 },
  coupe:   { name: 'Marina Coupe',  length: 58, width: 29, accel: 380, topSpeed: 490, grip: 3.8, hp: 85,  price: 0 },
};

export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8c33a', '#e8e8e8', '#2f2f33', '#7a4fd9', '#3aa655', '#e07b2e', '#c23a6e', '#4fc3d9'];

export const WEAPONS = {
  fists:   { name: 'Fists',    damage: 12, rate: 0.32, range: 40,  spread: 0,    auto: false, ammo: Infinity, price: 0 },
  pistol:  { name: 'P9 Pistol', damage: 22, rate: 0.24, range: 420, spread: 0.05, auto: false, ammo: 120, price: 250 },
  smg:     { name: 'VK-9 SMG',  damage: 14, rate: 0.09, range: 380, spread: 0.11, auto: true,  ammo: 240, price: 900 },
  shotgun: { name: 'Street Sweeper', damage: 16, rate: 0.7, range: 260, spread: 0.22, auto: false, ammo: 40, price: 1200, pellets: 6 },
  rifle:   { name: 'AR-77 Rifle', damage: 38, rate: 0.13, range: 620, spread: 0.03, auto: true, ammo: 180, price: 2200 },
};

export const DISTRICTS = [
  { name: 'Sunset Beach', x0: 0,    y0: 0,    x1: 420,  y1: 4800 },
  { name: 'Marina Bay',   x0: 420,  y0: 3600, x1: 2000, y1: 4800 },
  { name: 'Old Town',     x0: 420,  y0: 0,    x1: 2000, y1: 1600 },
  { name: 'Downtown',     x0: 2000, y0: 1600, x1: 3600, y1: 3200 },
  { name: 'Canal District', x0: 3600, y0: 0,  x1: 4800, y1: 1600 },
  { name: 'Harbor Yards', x0: 3600, y0: 3200, x1: 4800, y1: 4800 },
  { name: 'Palm Heights', x0: 2000, y0: 3200, x1: 3600, y1: 4800 },
  { name: 'Palm Heights', x0: 2000, y0: 0,    x1: 3600, y1: 1600 },
];

export const PALETTE = {
  water: '#2e7fa8',
  deepWater: '#1d5c80',
  sand: '#e3c98f',
  grass: '#79a95c',
  parkGrass: '#6d9e52',
  asphalt: '#3d4149',
  asphaltEdge: '#33363e',
  roadLine: '#d8c95a',
  sidewalk: '#a89a80',
  curb: '#8a7d68',
  buildingRoof: '#b5543f',
  panel: '#14161c',
  panelEdge: '#2c3140',
  text: '#f2ead8',
  muted: '#9aa3b2',
  accent: '#ff9a3d',
  accent2: '#3ec6d8',
  money: '#7ed957',
  health: '#e5534b',
  armor: '#4f8fd9',
  star: '#ffd23d',
  minimapBg: '#10131acc',
};

export const MISSION_REWARDS = { intro: 200, getaway: 500, package: 600, taxi: 350, heist: 1500, shootout: 900, race: 800, finale: 3000 };

export const COLLECTIBLE_COUNT = 30;
export const STUNT_COUNT = 6;
