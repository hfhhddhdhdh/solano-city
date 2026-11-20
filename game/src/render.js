// The renderer: one canvas, one camera, everything drawn in world space and
// then the HUD, the minimap and the menus in screen space. The look is a warm
// sunset city — sand, palm green and coral — drawn from the city data, so the
// map, the minimap and the big map can never disagree.

import { WORLD, PALETTE, FONT, DISPLAY_FONT, WEAPONS } from './config.js';
import { districtAt } from './world.js';
import { missionTarget, MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_HELP = 'help';
export const SCREEN_MAP = 'map';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 720;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = canvas.clientWidth || 1280;
    viewH = canvas.clientHeight || 720;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function cameraFor(state) {
    const p = state.player;
    const zoom = state.zoom || (p.onFoot ? 1 : 0.85);
    return { x: p.x, y: p.y, zoom };
  }

  function drawGround(state, cam) {
    const { world } = state;
    // Base: dry grass and sand.
    ctx.fillStyle = '#b39a68';
    ctx.fillRect(0, 0, viewW, viewH);
    const left = cam.x - viewW / 2 / cam.zoom;
    const top = cam.y - viewH / 2 / cam.zoom;
    const right = cam.x + viewW / 2 / cam.zoom;
    const bottom = cam.y + viewH / 2 / cam.zoom;
    // Water and beach on the west edge.
    ctx.fillStyle = PALETTE.deepWater;
    ctx.fillRect((0 - cam.x) * cam.zoom + viewW / 2, (0 - cam.y) * cam.zoom + viewH / 2, 150 * cam.zoom, WORLD.size * cam.zoom);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect((120 - cam.x) * cam.zoom + viewW / 2, (0 - cam.y) * cam.zoom + viewH / 2, 40 * cam.zoom, WORLD.size * cam.zoom);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect((150 - cam.x) * cam.zoom + viewW / 2, (0 - cam.y) * cam.zoom + viewH / 2, 230 * cam.zoom, WORLD.size * cam.zoom);
    // City ground.
    ctx.fillStyle = '#8fae6d';
    ctx.fillRect((380 - cam.x) * cam.zoom + viewW / 2, (0 - cam.y) * cam.zoom + viewH / 2, (WORLD.size - 380) * cam.zoom, WORLD.size * cam.zoom);
    // Park.
    ctx.fillStyle = PALETTE.parkGrass;
    ctx.fillRect((world.park.x - cam.x) * cam.zoom + viewW / 2, (world.park.y - cam.y) * cam.zoom + viewH / 2, world.park.w * cam.zoom, world.park.h * cam.zoom);
    // Sidewalks, then asphalt.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const p of world.roads) {
      ctx.fillRect((p - WORLD.roadWidth / 2 - 14 - cam.x) * cam.zoom + viewW / 2, (0 - cam.y) * cam.zoom + viewH / 2, (WORLD.roadWidth + 28) * cam.zoom, WORLD.size * cam.zoom);
      ctx.fillRect((0 - cam.x) * cam.zoom + viewW / 2, (p - WORLD.roadWidth / 2 - 14 - cam.y) * cam.zoom + viewH / 2, WORLD.size * cam.zoom, (WORLD.roadWidth + 28) * cam.zoom);
    }
    ctx.fillStyle = PALETTE.asphalt;
    for (const p of world.roads) {
      ctx.fillRect((p - WORLD.roadWidth / 2 - cam.x) * cam.zoom + viewW / 2, (0 - cam.y) * cam.zoom + viewH / 2, WORLD.roadWidth * cam.zoom, WORLD.size * cam.zoom);
      ctx.fillRect((0 - cam.x) * cam.zoom + viewW / 2, (p - WORLD.roadWidth / 2 - cam.y) * cam.zoom + viewH / 2, WORLD.size * cam.zoom, WORLD.roadWidth * cam.zoom);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const p of world.roads) {
      for (let q = 40; q < WORLD.size; q += 90) {
        if (Math.abs(q - p) < 90) continue;
        ctx.fillRect((p - 2 - cam.x) * cam.zoom + viewW / 2, (q - cam.y) * cam.zoom + viewH / 2, 4 * cam.zoom, 34 * cam.zoom);
        ctx.fillRect((q - cam.x) * cam.zoom + viewW / 2, (p - 2 - cam.y) * cam.zoom + viewH / 2, 34 * cam.zoom, 4 * cam.zoom);
      }
    }
    void left; void top; void right; void bottom;
  }

  function toScreen(cam, x, y) {
    return { x: (x - cam.x) * cam.zoom + viewW / 2, y: (y - cam.y) * cam.zoom + viewH / 2 };
  }

  function drawBuildings(state, cam) {
    for (const b of state.world.buildings) {
      const s = toScreen(cam, b.x, b.y);
      const w = b.w * cam.zoom;
      const h = b.h * cam.zoom;
      if (s.x + w < -40 || s.y + h < -40 || s.x > viewW + 40 || s.y > viewH + 40) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(s.x + 5 * cam.zoom, s.y + 6 * cam.zoom, w, h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(s.x, s.y, w, h);
      ctx.fillStyle = b.roof;
      const inset = 5 * cam.zoom;
      ctx.fillRect(s.x + inset, s.y + inset, w - inset * 2, h - inset * 2);
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(s.x + inset, s.y + inset, w - inset * 2, 8 * cam.zoom);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x + inset, s.y + inset, w - inset * 2, h - inset * 2);
    }
    // Trees.
    for (const t of state.world.trees) {
      const s = toScreen(cam, t.x, t.y);
      if (s.x < -30 || s.y < -30 || s.x > viewW + 30 || s.y > viewH + 30) continue;
      ctx.fillStyle = '#4f7a3d';
      ctx.beginPath();
      ctx.arc(s.x, s.y, t.r * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6d9e52';
      ctx.beginPath();
      ctx.arc(s.x - 3 * cam.zoom, s.y - 3 * cam.zoom, t.r * 0.6 * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCarShape(state, car, cam, highlight) {
    const s = toScreen(cam, car.x, car.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(car.angle);
    const l = car.length * cam.zoom;
    const w = car.width * cam.zoom;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-l / 2 + 3, -w / 2 + 4, l, w);
    ctx.fillStyle = car.color;
    roundRect(-l / 2, -w / 2, l, w, 7 * cam.zoom);
    ctx.fill();
    // Windows and roof.
    ctx.fillStyle = 'rgba(180,220,235,0.85)';
    ctx.fillRect(-l * 0.18, -w * 0.38, l * 0.22, w * 0.76);
    ctx.fillStyle = car.color === '#20242e' ? '#e8e8e8' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(l * 0.08, -w * 0.38, l * 0.2, w * 0.76);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(l / 2 - 3 * cam.zoom, -w / 2 + 3 * cam.zoom, 3 * cam.zoom, 5 * cam.zoom);
    ctx.fillRect(l / 2 - 3 * cam.zoom, w / 2 - 8 * cam.zoom, 3 * cam.zoom, 5 * cam.zoom);
    if (car.type === 'police') {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-l * 0.32, -w / 2, l * 0.3, w);
      ctx.fillStyle = '#20242e';
      ctx.font = `bold ${Math.max(8, 9 * cam.zoom)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('SCPD', 0, 3 * cam.zoom);
      if (car.siren) {
        const flash = Math.floor(state.time * 4) % 2 === 0;
        ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
        ctx.beginPath();
        ctx.arc(-l * 0.05, -w * 0.28, 4 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = flash ? '#3b82ff' : '#ff3b30';
        ctx.beginPath();
        ctx.arc(-l * 0.05, w * 0.28, 4 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#20242e';
      ctx.font = `bold ${Math.max(8, 10 * cam.zoom)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3 * cam.zoom);
    }
    if (car.burning) {
      ctx.fillStyle = 'rgba(60,60,60,0.7)';
      ctx.beginPath();
      ctx.arc(0, 0, 14 * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (highlight) {
      ctx.strokeStyle = highlight;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (car.length / 2 + 8) * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPerson(person, cam) {
    const s = toScreen(cam, person.x, person.y);
    if (s.x < -20 || s.y < -20 || s.x > viewW + 20 || s.y > viewH + 20) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 3 * cam.zoom, 10 * cam.zoom, 5 * cam.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(person.angle);
    ctx.fillStyle = person.color;
    ctx.beginPath();
    ctx.arc(0, 0, 11 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath();
    ctx.arc(5 * cam.zoom, 0, 5 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (person.kind === 'enemy') {
      ctx.fillStyle = '#e5534b';
      ctx.fillRect(s.x - 12, s.y - 22 * cam.zoom, 24, 4);
      ctx.fillStyle = '#7ed957';
      ctx.fillRect(s.x - 12, s.y - 22 * cam.zoom, 24 * Math.max(0, person.health / 80), 4);
    }
  }

  function drawMarkers(state, cam) {
    const target = missionTarget(state);
    const p = state.player;
    // Mission / start blip with a bouncing arrow.
    if (target) {
      const s = toScreen(cam, target.x, target.y);
      const bob = Math.sin(state.time * 4) * 6;
      const color = target.kind === 'start' ? '#ffd23d' : '#ff9a3d';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 34 * cam.zoom + bob);
      ctx.lineTo(s.x - 11, s.y - 52 * cam.zoom + bob);
      ctx.lineTo(s.x + 11, s.y - 52 * cam.zoom + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 26 * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
      // Edge arrow when the target is off screen.
      if (s.x < 40 || s.x > viewW - 40 || s.y < 40 || s.y > viewH - 40) {
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const ang = Math.atan2(dy, dx);
        const ax = viewW / 2 + Math.cos(ang) * (Math.min(viewW, viewH) / 2 - 60);
        const ay = viewH / 2 + Math.sin(ang) * (Math.min(viewW, viewH) / 2 - 60);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Sun coins.
    for (const c of state.world.collectibles) {
      if (c.taken) continue;
      const s = toScreen(cam, c.x, c.y);
      if (s.x < -20 || s.y < -20 || s.x > viewW + 20 || s.y > viewH + 20) continue;
      const pulse = 1 + Math.sin(state.time * 3 + c.id) * 0.15;
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9 * cam.zoom * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.font = `bold ${Math.max(9, 11 * cam.zoom)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('S', s.x, s.y + 4 * cam.zoom);
    }
    // Stunt ramps.
    for (const r of state.world.ramps) {
      const s = toScreen(cam, r.x, r.y);
      if (s.x < -40 || s.y < -40 || s.x > viewW + 40 || s.y > viewH + 40) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(r.angle);
      ctx.fillStyle = '#ff9a3d';
      ctx.fillRect(-22 * cam.zoom, -14 * cam.zoom, 44 * cam.zoom, 28 * cam.zoom);
      ctx.fillStyle = '#ffd23d';
      ctx.fillRect(-22 * cam.zoom, -14 * cam.zoom, 44 * cam.zoom, 8 * cam.zoom);
      ctx.restore();
    }
    // Shops.
    for (const shop of state.world.shops) {
      const s = toScreen(cam, shop.x, shop.y);
      if (s.x < -30 || s.y < -30 || s.x > viewW + 30 || s.y > viewH + 30) continue;
      ctx.fillStyle = shop.kind === 'gun' ? '#3ec6d8' : shop.kind === 'food' ? '#7ed957' : '#ff9a3d';
      ctx.font = `bold ${Math.max(11, 15 * cam.zoom)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(shop.kind === 'gun' ? '🔫' : shop.kind === 'food' ? '🍔' : shop.kind === 'spray' ? '🎨' : '👕', s.x, s.y);
    }
  }

  function drawParticles(state, cam) {
    for (const pt of state.particles) {
      const s = toScreen(cam, pt.x, pt.y);
      const life = pt.life / pt.max;
      if (pt.kind === 'explosion') {
        ctx.fillStyle = `rgba(255,${Math.floor(120 + 100 * life)},40,${life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, pt.radius * (1.4 - life * 0.4) * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,240,180,${life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, pt.radius * 0.5 * life * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'blood') {
        ctx.fillStyle = `rgba(180,30,30,${life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'spark') {
        ctx.fillStyle = `rgba(255,220,120,${life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'muzzle') {
        ctx.fillStyle = `rgba(255,230,140,${life * 2})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'skid') {
        ctx.strokeStyle = `rgba(20,20,20,${life * 0.7})`;
        ctx.lineWidth = 4 * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + (pt.vx || 0), s.y + (pt.vy || 0));
        ctx.stroke();
      }
    }
    // Bullet tracers.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    for (const b of state.bullets) {
      const a = toScreen(cam, b.px, b.py);
      const c = toScreen(cam, b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
  }

  function drawPlayer(state, cam) {
    const p = state.player;
    if (p.dead) return;
    if (!p.onFoot) return; // the car is drawn instead
    const s = toScreen(cam, p.x, p.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 4 * cam.zoom, 12 * cam.zoom, 6 * cam.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(p.angle);
    // Body: coral jacket, dark hair, outstretched arm with the weapon.
    ctx.fillStyle = '#ff6b4a';
    ctx.beginPath();
    ctx.arc(0, 0, 12 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath();
    ctx.arc(4 * cam.zoom, 0, 6 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.weapon === 'fists' ? '#ff6b4a' : '#20242e';
    ctx.lineWidth = 4 * cam.zoom;
    ctx.beginPath();
    ctx.moveTo(6 * cam.zoom, 0);
    ctx.lineTo(20 * cam.zoom, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(state) {
    const p = state.player;
    // Objective, top left.
    ctx.textAlign = 'left';
    ctx.font = `600 15px ${FONT}`;
    let objectiveText = state.objective && state.time < state.objective.until ? state.objective.text : null;
    if (!objectiveText && state.mission) objectiveText = state.mission.def.stages[state.mission.stage].text;
    if (!objectiveText) {
      const next = MISSIONS.find((m) => !state.missionsDone.includes(m.id));
      objectiveText = next ? `Next mission: ${next.title} — follow the yellow marker` : 'All missions complete — Solano City is yours';
    }
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    const pillW = Math.min(viewW - 28, 40 + ctx.measureText(objectiveText).width);
    roundRect(14, 14, pillW, 34, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('◆ ' + objectiveText, 26, 36);
    // District + clock under the objective.
    ctx.font = `500 13px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    const district = districtAt(p.x, p.y);
    const hours = Math.floor(state.clock / 60) % 24;
    const mins = Math.floor(state.clock % 60);
    ctx.fillText(`${district}   •   ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}   •   $${p.money.toLocaleString()}`, 26, 62);
    // Wanted stars + money + progress, top right, on one dark pill.
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    roundRect(viewW - 268, 12, 254, 92, 8);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.font = `bold 26px ${FONT}`;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < p.wanted ? '★' : '☆';
    ctx.fillStyle = p.wanted > 0 ? PALETTE.star : 'rgba(255,255,255,0.35)';
    ctx.fillText(stars, viewW - 18, 44);
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = PALETTE.money;
    ctx.fillText(`$${p.money.toLocaleString()}`, viewW - 18, 74);
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Missions ${state.missionsDone.length}/8   •   Coins ${state.coinsCollected}/30   •   Kills ${state.stats.kills}`, viewW - 18, 94);
    // Health / armour bars, bottom right above the weapon.
    const barW = 220;
    const bx = viewW - barW - 18;
    const by = viewH - 96;
    ctx.textAlign = 'left';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    roundRect(bx - 8, by - 8, barW + 16, 66, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('HEALTH', bx, by + 8);
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by + 14, barW, 9);
    ctx.fillStyle = PALETTE.health;
    ctx.fillRect(bx, by + 14, barW * Math.max(0, p.health / 100), 9);
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('ARMOUR', bx, by + 36);
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by + 42, barW, 9);
    ctx.fillStyle = PALETTE.armor;
    ctx.fillRect(bx, by + 42, barW * Math.max(0, p.armor / 100), 9);
    // Weapon, bottom right.
    const def = WEAPONS[p.weapon];
    ctx.textAlign = 'right';
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    const ammoText = def.ammo === Infinity ? '∞' : String(p.ammo[p.weapon] ?? 0);
    ctx.fillText(`${def.name}   ${p.weapon === 'fists' ? '' : ammoText}`, viewW - 18, viewH - 18);
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    const hint = 'E enter car  •  M map  •  H help  •  N mute';
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    const hintW = 24 + ctx.measureText(hint).width;
    roundRect(viewW - 18 - hintW, viewH - 136, hintW, 22, 6);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(hint, viewW - 30, viewH - 120);
    // Banner.
    if (state.banner && state.time < state.banner.until) {
      const b = state.banner;
      ctx.textAlign = 'center';
      ctx.font = `bold 30px ${DISPLAY_FONT}`;
      ctx.fillStyle = b.kind === 'good' ? '#7ed957' : b.kind === 'bad' ? '#ff6b5e' : PALETTE.text;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 8;
      ctx.fillText(b.text, viewW / 2, viewH * 0.3);
      ctx.shadowBlur = 0;
      if (b.sub) {
        ctx.font = `500 16px ${FONT}`;
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(b.sub, viewW / 2, viewH * 0.3 + 28);
      }
    }
    // Busted / arrest progress.
    if (state.bustedTimer > 0.2 && state.screen === SCREEN_PLAY) {
      ctx.textAlign = 'center';
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillStyle = '#ff6b5e';
      ctx.fillText('THE COPS ARE GRABBING YOU — MOVE!', viewW / 2, viewH * 0.42);
    }
  }

  function drawMinimap(state) {
    const size = 168;
    const x0 = 16;
    const y0 = viewH - size - 30;
    const scale = size / WORLD.size;
    ctx.save();
    ctx.fillStyle = PALETTE.minimapBg;
    roundRect(x0 - 4, y0 - 4, size + 8, size + 8, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    // Water + land.
    ctx.fillStyle = '#1d5c80';
    ctx.fillRect(x0, y0, 150 * scale, size);
    ctx.fillStyle = '#2c4a2e';
    ctx.fillRect(x0 + 150 * scale, y0, size - 150 * scale, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (const p of state.world.roads) {
      ctx.beginPath();
      ctx.moveTo(x0 + p * scale, y0);
      ctx.lineTo(x0 + p * scale, y0 + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + p * scale);
      ctx.lineTo(x0 + size, y0 + p * scale);
      ctx.stroke();
    }
    // Shops.
    ctx.fillStyle = '#3ec6d8';
    for (const shop of state.world.shops) {
      ctx.fillRect(x0 + shop.x * scale - 2, y0 + shop.y * scale - 2, 4, 4);
    }
    // Taxi / vigilante targets.
    if (state.taxi) {
      const t = state.taxi.pickedUp ? state.taxi.dest : state.taxi.pickup;
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(x0 + t.x * scale, y0 + t.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.vigilante) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(x0 + state.vigilante.car.x * scale, y0 + state.vigilante.car.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cops.
    ctx.fillStyle = '#3b82ff';
    for (const car of state.cars) {
      if (car.driver === 'cop' && !car.dead) {
        ctx.beginPath();
        ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Mission target.
    const target = missionTarget(state);
    if (target) {
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(x0 + target.x * scale, y0 + target.y * scale, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    roundRect(x0 - 4, y0 - 4, size + 8, size + 8, 10);
    ctx.stroke();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SOLANO CITY', x0, y0 - 8);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(12,14,20,0.88)';
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 14);
    ctx.stroke();
  }

  function drawTitle(state) {
    const cx = viewW / 2;
    ctx.fillStyle = 'rgba(10,12,18,0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `bold ${Math.min(64, viewW / 14)}px ${DISPLAY_FONT}`;
    ctx.fillText('SOLANO CITY', cx, viewH * 0.26);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `500 ${Math.min(20, viewW / 48)}px ${FONT}`;
    ctx.fillText('An open-world crime story in the spirit of GTA — original city, original crew.', cx, viewH * 0.26 + 36);
    ctx.fillStyle = PALETTE.accent2;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('8 STORY MISSIONS  •  STEAL & DRIVE  •  WANTED LEVELS  •  TAXI, VIGILANTE, RACES & 30 SUN COINS', cx, viewH * 0.26 + 66);
    const bw = 340;
    const bx = cx - bw / 2;
    panel(bx, viewH * 0.42, bw, 190);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(state.hasSave ? '▶  CONTINUE  (Enter)' : '▶  NEW GAME  (Enter)', cx, viewH * 0.42 + 44);
    ctx.font = `500 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('WASD move / drive   •   Mouse aim, Click shoot', cx, viewH * 0.42 + 82);
    ctx.fillText('E enter & steal cars   •   Shift run   •   Space handbrake', cx, viewH * 0.42 + 108);
    ctx.fillText('M map   •   H help   •   Esc pause   •   N mute', cx, viewH * 0.42 + 134);
    if (state.hasSave) {
      ctx.fillStyle = PALETTE.money;
      ctx.fillText(`Save: $${state.saveMoney.toLocaleString()}  •  ${state.saveMissions}/8 missions  •  ${state.saveCoins}/30 coins`, cx, viewH * 0.42 + 164);
    }
    ctx.font = `500 13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('Best played with keyboard + mouse. Sound starts on your first key press. No network needed.', cx, viewH - 28);
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    const w = 620;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - 250;
    panel(x, y, w, 500);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 26px ${DISPLAY_FONT}`;
    ctx.fillText('PAUSED', x + 28, y + 46);
    ctx.font = `500 14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Esc resume  •  H help  •  M map  •  R restart mission  •  Q save & quit to title', x + 28, y + 72);
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('STORY', x + 28, y + 108);
    ctx.font = `500 15px ${FONT}`;
    MISSIONS.forEach((m, i) => {
      const done = state.missionsDone.includes(m.id);
      const active = state.mission && state.mission.def.id === m.id;
      ctx.fillStyle = done ? '#7ed957' : active ? '#ffd23d' : PALETTE.text;
      ctx.fillText(`${done ? '✓' : active ? '▶' : '○'}  ${i + 1}. ${m.title} — ${m.giver}  ($${m.reward})`, x + 28, y + 134 + i * 26);
    });
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('PROGRESS', x + 28, y + 356);
    ctx.font = `500 15px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`Money $${state.player.money.toLocaleString()}   •   Sun coins ${state.coinsCollected}/30   •   Stunt jumps ${state.stats.stunts}/6`, x + 28, y + 382);
    ctx.fillText(`Kills ${state.stats.kills}   •   Cars stolen ${state.stats.carsStolen}   •   Taxi fares ${state.stats.taxiFares}   •   Vigilante stops ${state.stats.vigilante}`, x + 28, y + 408);
    ctx.fillText(`Wanted level ${state.player.wanted}★   •   Health ${Math.ceil(state.player.health)}   •   Armour ${Math.ceil(state.player.armor)}`, x + 28, y + 434);
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Progress saves automatically after every mission.', x + 28, y + 470);
  }

  function drawHelp(state) {
    ctx.fillStyle = 'rgba(8,10,16,0.82)';
    ctx.fillRect(0, 0, viewW, viewH);
    const w = 640;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - 260;
    panel(x, y, w, 520);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 26px ${DISPLAY_FONT}`;
    ctx.fillText('HOW TO PLAY', x + 28, y + 46);
    const lines = [
      ['Move / drive', 'WASD or arrows. Shift runs on foot. Space is the handbrake in a car.'],
      ['Steal a car', 'Walk up to any car and press E. Parked cars are free; stealing a driven car raises your wanted level.'],
      ['Fight', 'Aim with the mouse, click to shoot. F punches. 1-5 switch weapons. Buy guns at Lock & Load (blue gun icon).'],
      ['Wanted level', 'Crime raises stars; the SCPD chases you. Hide out of sight and the stars fall, or pay $150 at Spray ’n Go.'],
      ['Missions', 'Follow the yellow marker to the next mission start. The objective is top-left; the minimap is bottom-left.'],
      ['Side jobs', 'Drive a Sun Cab for fares. Stop red suspect cars for vigilante cash. Hit the orange ramps at speed for stunt bonuses.'],
      ['Collectibles', '30 sun coins hide around the city — $50 each. Your health refills at diners ($25) and the safehouse.'],
      ['Save', 'Progress saves after every mission and when you quit to the title. M opens the full map.'],
    ];
    ctx.font = `500 14px ${FONT}`;
    lines.forEach(([title, body], i) => {
      const ly = y + 88 + i * 46;
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText(title, x + 28, ly);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `500 14px ${FONT}`;
      ctx.fillText(body, x + 28, ly + 20);
    });
  }

  function drawBigMap(state) {
    ctx.fillStyle = 'rgba(8,10,16,0.85)';
    ctx.fillRect(0, 0, viewW, viewH);
    const size = Math.min(viewH - 120, viewW - 120);
    const x0 = (viewW - size) / 2;
    const y0 = 60;
    const scale = size / WORLD.size;
    ctx.fillStyle = '#0f2c3f';
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = '#3d6b35';
    ctx.fillRect(x0 + 150 * scale, y0, size - 150 * scale, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    for (const p of state.world.roads) {
      ctx.beginPath(); ctx.moveTo(x0 + p * scale, y0); ctx.lineTo(x0 + p * scale, y0 + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, y0 + p * scale); ctx.lineTo(x0 + size, y0 + p * scale); ctx.stroke();
    }
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    for (const d of [{ n: 'Sunset Beach', x: 60, y: 2400 }, { n: 'Old Town', x: 1100, y: 800 }, { n: 'Downtown', x: 2600, y: 2400 }, { n: 'Harbor Yards', x: 4000, y: 4000 }, { n: 'Marina Bay', x: 1100, y: 4200 }, { n: 'Canal District', x: 4100, y: 800 }]) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(d.n, x0 + d.x * scale, y0 + d.y * scale);
    }
    const target = missionTarget(state);
    if (target) {
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(x0 + target.x * scale, y0 + target.y * scale, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd23d';
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText(target.label || 'Objective', x0 + target.x * scale + 14, y0 + target.y * scale + 5);
    }
    const p = state.player;
    ctx.save();
    ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${DISPLAY_FONT}`;
    ctx.fillText('SOLANO CITY', viewW / 2, 36);
    ctx.font = `500 14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('M or Esc to close  •  Yellow marker: next objective', viewW / 2, viewH - 24);
  }

  function drawEnd(state, kind) {
    ctx.fillStyle = kind === 'wasted' ? 'rgba(60,8,8,0.72)' : 'rgba(8,16,60,0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = kind === 'wasted' ? '#ff6b5e' : '#7db4ff';
    ctx.font = `bold ${Math.min(72, viewW / 12)}px ${DISPLAY_FONT}`;
    ctx.fillText(kind === 'wasted' ? 'WASTED' : 'BUSTED', viewW / 2, viewH * 0.4);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText(kind === 'wasted' ? 'The city chews up the careless. You drop $100 at the hospital and wake up at the safehouse.' : 'The SCPD takes you in. You pay $200 bail and walk out at the safehouse.', viewW / 2, viewH * 0.4 + 40);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText('Press Enter to get back on the streets', viewW / 2, viewH * 0.4 + 80);
    ctx.fillText(`Missions ${state.missionsDone.length}/8   •   $${state.player.money.toLocaleString()}   •   Kills ${state.stats.kills}`, viewW / 2, viewH * 0.4 + 112);
  }

  return {
    resize,
    get viewW() { return viewW; },
    get viewH() { return viewH; },
    screenToWorld(state, sx, sy) {
      const cam = cameraFor(state);
      return { x: (sx - viewW / 2) / cam.zoom + cam.x, y: (sy - viewH / 2) / cam.zoom + cam.y };
    },
    draw(state, screen) {
      const cam = cameraFor(state);
      // Sunset tint that deepens as the in-game clock moves toward evening.
      const evening = 0.5 + 0.5 * Math.sin(((state.clock % 1440) / 1440) * Math.PI * 2 - 1.2);
      ctx.fillStyle = '#ff9a5e';
      ctx.fillRect(0, 0, viewW, viewH);
      drawGround(state, cam);
      drawBuildings(state, cam);
      drawMarkers(state, cam);
      // Cars, sorted so the player's car draws on top.
      const cars = [...state.cars].sort((a, b) => (a === state.player.car ? 1 : 0) - (b === state.player.car ? 1 : 0));
      for (const car of cars) {
        if (car.dead) continue;
        const highlight = state.mission && state.mission.stageState.targetId === car.id ? '#ff3b30'
          : state.vigilante && state.vigilante.car === car ? '#ff3b30'
          : state.mission && state.mission.stageState.carId === car.id ? '#ffd23d' : null;
        drawCarShape(state, car, cam, highlight);
      }
      for (const person of state.people) {
        if (!person.dead) drawPerson(person, cam);
      }
      drawPlayer(state, cam);
      drawParticles(state, cam);
      // Warm evening wash.
      ctx.fillStyle = `rgba(255,120,60,${0.05 + 0.06 * evening})`;
      ctx.fillRect(0, 0, viewW, viewH);
      if (state.shake > 0.2) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        ctx.restore();
      }
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_HELP || screen === SCREEN_MAP) {
        drawHud(state);
        drawMinimap(state);
      }
      if (screen === SCREEN_TITLE) drawTitle(state);
      if (screen === SCREEN_PAUSED) drawPaused(state);
      if (screen === SCREEN_HELP) drawHelp(state);
      if (screen === SCREEN_MAP) drawBigMap(state);
      if (screen === SCREEN_WASTED) drawEnd(state, 'wasted');
      if (screen === SCREEN_BUSTED) drawEnd(state, 'busted');
    },
  };
}
