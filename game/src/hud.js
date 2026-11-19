// HUD: every number and word the player sees lives in DOM elements over the
// canvas — never canvas fillText, which the screenshot browser cannot draw.
// The minimap is its own small canvas: streets, the player, the mission marker.
import { WORLD_SIZE, PITCH, ROAD } from './world.js';
import { missionBrief, missionMarkerPos } from './missions.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = {
    money: el('money'),
    stars: el('starRow'),
    healthFill: el('healthFill'),
    clock: el('clock'),
    speed: el('speed'),
    toast: el('toast'),
    missionTitle: el('missionTitle'),
    missionText: el('missionText'),
    minimap: el('minimap'),
    lastMoney: -1,
    lastStars: -1,
    lastHp: -1,
    lastSpeed: -1,
    lastClock: '',
    lastBrief: '',
    toastTimer: 0,
  };
  hud.mm = hud.minimap.getContext('2d');
  return hud;
}

function starRow(wanted) {
  let out = '';
  for (let i = 0; i < 5; i += 1) {
    out += i < wanted ? '<span>★</span>' : '<span class="off">★</span>';
  }
  return out;
}

export function updateHud(hud, game, dt) {
  if (game.money !== hud.lastMoney) {
    hud.money.textContent = '$' + game.money.toLocaleString('en-US');
    hud.lastMoney = game.money;
  }
  if (game.police.wanted !== hud.lastStars) {
    hud.stars.innerHTML = starRow(game.police.wanted);
    hud.lastStars = game.police.wanted;
  }
  const hpPct = Math.round((game.player.hp / game.player.maxHp) * 100);
  if (hpPct !== hud.lastHp) {
    hud.healthFill.style.width = hpPct + '%';
    hud.lastHp = hpPct;
  }
  const speedKmh = Math.round(Math.abs((game.player.car ? game.player.car.speed : game.player.speed)) * 0.55);
  if (speedKmh !== hud.lastSpeed) {
    hud.speed.textContent = game.player.car ? speedKmh + ' km/h — driving' : speedKmh + ' km/h — on foot';
    hud.lastSpeed = speedKmh;
  }
  // Clock: the day runs 09:00 to 02:00 over five minutes of play.
  const totalMin = 9 * 60 + Math.floor((game.timeOfDay / 300) * (17 * 60));
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  const clockText = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  if (clockText !== hud.lastClock) {
    hud.clock.textContent = clockText;
    hud.lastClock = clockText;
  }
  const brief = missionBrief(game.missionState);
  const briefKey = brief.title + '|' + brief.brief;
  if (briefKey !== hud.lastBrief) {
    hud.missionTitle.textContent = brief.title;
    hud.missionText.textContent = brief.brief;
    hud.lastBrief = briefKey;
  }
  if (hud.toastTimer > 0) {
    hud.toastTimer -= dt;
    if (hud.toastTimer <= 0) hud.toast.textContent = '';
  }
  drawMinimap(hud, game);
}

export function showToast(hud, text) {
  hud.toast.textContent = text;
  hud.toastTimer = 3.5;
}

function drawMinimap(hud, game) {
  const ctx = hud.mm;
  const S = 150;
  const scale = S / WORLD_SIZE;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(0, 0, S, S);
  // Streets.
  ctx.fillStyle = '#5a6068';
  for (let i = 0; i <= 10; i += 1) {
    const c = (i * PITCH + ROAD / 2) * scale;
    ctx.fillRect(c - 1, 0, 2, S);
    ctx.fillRect(0, c - 1, S, 2);
  }
  // Beach.
  ctx.fillStyle = '#2e86c1';
  ctx.fillRect(0, S - 8, S, 8);
  // Mission marker: pulsing yellow diamond.
  const marker = missionMarkerPos(game.missionState);
  if (marker) {
    const mx = marker.x * scale;
    const my = marker.y * scale;
    const pulse = 4 + Math.sin(game.time * 4) * 1.5;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(mx, my - pulse - 2);
    ctx.lineTo(mx + pulse, my);
    ctx.lineTo(mx, my + pulse + 2);
    ctx.lineTo(mx - pulse, my);
    ctx.closePath();
    ctx.fill();
  }
  // Police cars as blue dots.
  ctx.fillStyle = '#4d8dff';
  for (const car of game.police.cars) {
    ctx.fillRect(car.x * scale - 1.5, car.y * scale - 1.5, 3, 3);
  }
  // Enemies as red dots.
  ctx.fillStyle = '#ff5a4e';
  for (const e of game.combat.enemies) {
    ctx.fillRect(e.x * scale - 1.5, e.y * scale - 1.5, 3, 3);
  }
  // Player: white arrow pointing where they face (hand-rotated triangle:
  // the screenshot browser ignores canvas transforms).
  const p = game.player;
  const px = p.x * scale;
  const py = p.y * scale;
  const cos = Math.cos(p.angle);
  const sin = Math.sin(p.angle);
  const tip = [px + 6 * cos, py + 6 * sin];
  const b1 = [px - 4 * cos - (-4) * sin, py - 4 * sin + (-4) * cos];
  const b2 = [px - 4 * cos - 4 * sin, py - 4 * sin + 4 * cos];
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(b1[0], b1[1]);
  ctx.lineTo(b2[0], b2[1]);
  ctx.closePath();
  ctx.fill();
}
