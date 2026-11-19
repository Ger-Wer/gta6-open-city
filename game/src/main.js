// Boot and the one loop: input every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. Screens: title, play, paused,
// game over. ?seed=N fixes the city; ?shot=chase|street|mission|night stages a
// screenshot scene instead of running the loop.
import { buildCity, drawCity, hitBuilding, streetCenter, WORLD_SIZE } from './world.js';
import { createPlayer, updatePlayerOnFoot, drawPlayer } from './player.js';
import { createCar, spawnParkedCars, updatePlayerCar, collideCars, nearestStealableCar, drawCar } from './vehicles.js';
import { createTraffic, createPedestrians, updateTrafficCar, updatePedestrian, drawTraffic } from './traffic.js';
import { createPolice, addWanted, setWanted, updatePolice, drawPolice } from './police.js';
import { createMissionState, currentMission, updateMissions, MISSIONS } from './missions.js';
import { createCombat, spawnEnemies, playerShoot, playerPunch, updateCombat, drawCombat } from './combat.js';
import { createHud, updateHud, showToast } from './hud.js';
import { createAudio, ensureAudio, setMuted, playShoot, playPunch, playCash, playCrash, playSteal, updateEngineSound } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';
import { makeRng } from './rng.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const DAY_LENGTH = 300; // seconds of play from 09:00 to 02:00

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261119;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const saved = loadSave();

function announce(message) { statusEl.textContent = message; }

function createGame() {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const startX = streetCenter(5);
  const startY = streetCenter(5);
  const player = createPlayer(startX, startY);
  const game = {
    rng, city, player,
    time: 0, timeOfDay: 0,
    money: saved ? saved.money : 0,
    score: 0,
    missionsDone: saved ? saved.missionsDone : 0,
    bestScore: saved ? saved.bestScore : 0,
    parkedCars: spawnParkedCars(city, rng, 14),
    trafficCars: createTraffic(rng, 16),
    peds: createPedestrians(rng, 34),
    police: createPolice(),
    combat: createCombat(),
    missionState: createMissionState(saved ? saved.missionsDone : 0),
    camera: { x: startX, y: startY },
    night: false,
    over: false,
    overReason: '',
    muted: false,
  };
  game.enemies = game.combat.enemies;
  game.addWanted = (stars) => addWanted(game.police, stars);
  game.toast = (text) => showToast(game.hud, text);
  game.saveProgress = () => {
    writeSave({ money: game.money, missionsDone: game.missionsDone, bestScore: Math.max(game.bestScore, game.score) });
  };
  game.hitBuildingAt = (x, y, r) => !!hitBuilding(game.city, x, y, r);
  game.hud = createHud();
  game.audio = createAudio();
  return game;
}

const game = createGame();
window.__game = game; // debug handle: lets a screenshot run read camera/player state
const input = {
  up: false, down: false, left: false, right: false, run: false,
  mouseX: 0, mouseY: 0, shootQueued: false, punchQueued: false, enterQueued: false,
};
let screen = 'title';
let accumulator = 0;
let last = performance.now();

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
}
window.addEventListener('resize', resize);
resize();

function isNight(game) {
  const totalMin = 9 * 60 + Math.floor((game.timeOfDay / DAY_LENGTH) * (17 * 60));
  const hh = Math.floor(totalMin / 60) % 24;
  return hh >= 20 || hh < 6;
}

function showScreen(name) {
  document.getElementById('titleScreen').classList.toggle('hidden', name !== 'title');
  document.getElementById('pauseScreen').classList.toggle('hidden', name !== 'paused');
  document.getElementById('overScreen').classList.toggle('hidden', name !== 'over');
}

function startGame() {
  ensureAudio(game.audio);
  screen = 'play';
  showScreen('play');
  const brief = currentMission(game.missionState);
  announce(brief ? 'Playing. ' + brief.title : 'Playing. Free roam in Solmar.');
}

function endGame(reason) {
  game.over = true;
  game.overReason = reason;
  screen = 'over';
  document.getElementById('overReason').textContent = reason;
  document.getElementById('overStats').textContent =
    'Money $' + game.money + '  ·  Missions done ' + game.missionsDone + ' of ' + MISSIONS.length + '  ·  Score ' + game.score;
  game.saveProgress();
  showScreen('over');
  announce('Game over. ' + reason);
}

function tryEnterCar() {
  const player = game.player;
  if (player.car) {
    // Get out: step aside from the car.
    const car = player.car;
    player.car = null;
    player.onFoot = true;
    player.x = car.x - Math.cos(car.angle) * 30;
    player.y = car.y - Math.sin(car.angle) * 30;
    player.angle = car.angle;
    return;
  }
  const car = nearestStealableCar(player, game.parkedCars.concat(game.trafficCars), 56);
  if (!car) return;
  playSteal(game.audio);
  const wasTraffic = car.traffic;
  car.parked = false;
  car.traffic = false;
  car.driver = true;
  game.parkedCars = game.parkedCars.filter((c) => c !== car);
  game.trafficCars = game.trafficCars.filter((c) => c !== car);
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
  game.toast(wasTraffic ? 'Carjacked! The Solmar PD is coming.' : 'Car taken. Drive it like you own it.');
  addWanted(game.police, wasTraffic ? 2 : 1);
  announce('Driving. Wanted level ' + game.police.wanted + '.');
}

function tryPunch() {
  const player = game.player;
  if (!player.onFoot || player.punchCooldown > 0) return;
  player.punchTimer = 0.25;
  player.punchCooldown = 0.45;
  playPunch(game.audio);
  if (playerPunch(game.combat, player)) {
    addWanted(game.police, 1);
  }
}

function tryShoot() {
  const player = game.player;
  if (!player.onFoot) return;
  const rect = canvas.getBoundingClientRect();
  const sx = (input.mouseX - rect.left) * (canvas.width / rect.width) - canvas.width / 2;
  const sy = (input.mouseY - rect.top) * (canvas.height / rect.height) - canvas.height / 2;
  const angle = Math.atan2(sy, sx);
  player.angle = angle;
  playerShoot(game.combat, player.x, player.y, angle);
  playShoot(game.audio);
  addWanted(game.police, 1);
}

function step(dt) {
  const player = game.player;
  game.time += dt;
  game.timeOfDay = (game.timeOfDay + dt) % DAY_LENGTH;
  game.night = isNight(game);
  // Combat mission: rivals arrive once, at the plaza.
  const mission = currentMission(game.missionState);
  if (mission && mission.kind === 'combat' && !game.missionState.combatSpawned) {
    game.missionState.combatSpawned = true;
    game.missionState.enemiesLeft = 99;
    spawnEnemies(game.combat, game.rng, mission.target.x, mission.target.y, 5);
    game.toast('Sharks on the corner! Clear them out!');
  }
  if (mission && mission.kind === 'combat' && game.missionState.combatSpawned && game.combat.enemies.length === 0) {
    game.missionState.enemiesLeft = 0;
  }
  // Player: on foot or driving.
  if (player.onFoot) {
    updatePlayerOnFoot(player, game.city, input, dt);
  } else if (player.car) {
    const result = updatePlayerCar(player.car, game.city, input, dt);
    if (result === 'crash') playCrash(game.audio);
    player.x = player.car.x;
    player.y = player.car.y;
    player.angle = player.car.angle;
  }
  if (input.enterQueued) { input.enterQueued = false; tryEnterCar(); }
  if (input.punchQueued) { input.punchQueued = false; tryPunch(); }
  if (input.shootQueued) { input.shootQueued = false; tryShoot(); }
  // Traffic and pedestrians.
  for (const car of game.trafficCars) updateTrafficCar(car, game.rng, dt);
  for (const ped of game.peds) updatePedestrian(ped, game.city, game.trafficCars.concat(game.parkedCars, game.police.cars), game.rng, dt);
  // Car bumps: player car vs traffic and police.
  const allCars = game.trafficCars.concat(game.police.cars, game.parkedCars);
  if (player.car) {
    for (const other of allCars) {
      if (collideCars(player.car, other) && Math.abs(player.car.speed) > 120) playCrash(game.audio);
    }
  }
  for (const car of game.police.cars) {
    for (const other of game.trafficCars) collideCars(car, other);
  }
  // Pedestrian hit by the player's car: a crime, and the law notices.
  if (player.car) {
    for (const ped of game.peds) {
      if (Math.hypot(ped.x - player.x, ped.y - player.y) < 26 && Math.abs(player.car.speed) > 40) {
        ped.x += (game.rng() - 0.5) * 600;
        ped.y += (game.rng() - 0.5) * 600;
        addWanted(game.police, 1);
        game.toast('You hit a pedestrian! Wanted up.');
      }
    }
  }
  updatePolice(game.police, player, player.car, game.rng, dt);
  updateCombat(game.combat, game, dt);
  const event = updateMissions(game.missionState, game, dt);
  if (event === 'done' || event === 'picked') playCash(game.audio);
  if (event === 'finished') {
    game.toast('THE BIG SCORE — Solmar is yours, Milo!');
    playCash(game.audio);
  }
  // Camera follows the player, clamped to the city.
  const viewW = canvas.width;
  const viewH = canvas.height;
  game.camera.x = Math.max(viewW / 2, Math.min(WORLD_SIZE - viewW / 2, player.x));
  game.camera.y = Math.max(viewH / 2, Math.min(WORLD_SIZE - viewH / 2, player.y));
  updateEngineSound(game.audio, player.car ? player.car.speed : 0, game.police.wanted, game.time);
  updateHud(game.hud, game, dt);
  if (player.hp <= 0 && !game.over) endGame('Milo went down in the streets of Solmar.');
}

function drawMarker(ctx, game) {
  const mission = currentMission(game.missionState);
  if (!mission || game.missionState.stage === 'finished') return;
  const marker = mission.kind === 'heist' && game.missionState.stage === 'go'
    ? { x: streetCenter(4), y: streetCenter(4) } : mission.target;
  const cam = game.camera;
  const viewW = canvas.width;
  const viewH = canvas.height;
  const sx = marker.x - (cam.x - viewW / 2);
  const sy = marker.y - (cam.y - viewH / 2);
  const onScreen = sx > 40 && sx < viewW - 40 && sy > 40 && sy < viewH - 40;
  const pulse = 26 + Math.sin(game.time * 5) * 6;
  if (onScreen) {
    ctx.strokeStyle = 'rgba(255,210,62,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,62,0.25)';
    ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, Math.PI * 2); ctx.fill();
    // Down arrow above the marker.
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(sx, sy - pulse - 26);
    ctx.lineTo(sx - 10, sy - pulse - 8);
    ctx.lineTo(sx + 10, sy - pulse - 8);
    ctx.closePath(); ctx.fill();
  } else {
    // Edge arrow pointing toward the off-screen marker (hand-rotated triangle:
    // the screenshot browser ignores canvas transforms).
    const cx = Math.max(40, Math.min(viewW - 40, sx));
    const cy = Math.max(40, Math.min(viewH - 40, sy));
    const ang = Math.atan2(sy - viewH / 2, sx - viewW / 2);
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const tip = [cx + 18 * cos, cy + 18 * sin];
    const b1 = [cx - 8 * cos - (-12) * sin, cy - 8 * sin + (-12) * cos];
    const b2 = [cx - 8 * cos - 12 * sin, cy - 8 * sin + 12 * cos];
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(b1[0], b1[1]);
    ctx.lineTo(b2[0], b2[1]);
    ctx.closePath();
    ctx.fill();
  }
}

function render() {
  const cam = game.camera;
  const viewW = canvas.width;
  const viewH = canvas.height;
  // Absolute screen coordinates only: the screenshot browser ignores canvas
  // transforms, so the camera offset is added by hand in every draw call.
  const ox = -cam.x + viewW / 2;
  const oy = -cam.y + viewH / 2;
  ctx.fillStyle = '#0e1420';
  ctx.fillRect(0, 0, viewW, viewH);
  drawCity(ctx, game.city, cam, viewW, viewH, game.night);
  drawTraffic(ctx, game.trafficCars, game.peds, cam, viewW, viewH, game.night, ox, oy);
  for (const car of game.parkedCars) {
    if (Math.abs(car.x - cam.x) > viewW / 2 + 80 || Math.abs(car.y - cam.y) > viewH / 2 + 80) continue;
    drawCar(ctx, car, game.night, ox, oy);
  }
  drawPolice(ctx, game.police, cam, viewW, viewH, game.night, ox, oy);
  drawCombat(ctx, game.combat, cam, viewW, viewH, ox, oy);
  if (game.player.onFoot) drawPlayer(ctx, game.player, game.night, ox, oy);
  else if (game.player.car) drawCar(ctx, game.player.car, game.night, ox, oy);
  drawMarker(ctx, game);
  if (game.night) {
    ctx.fillStyle = 'rgba(8,12,40,0.42)';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (screen === 'play') {
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
      if (screen !== 'play') { accumulator = 0; break; }
    }
  } else {
    accumulator = 0;
    if (screen === 'title') {
      // Title backdrop: the city idles behind the menu.
      game.time += 1 / 60;
      game.timeOfDay = (game.timeOfDay + 1 / 60) % DAY_LENGTH;
      game.night = isNight(game);
      for (const car of game.trafficCars) updateTrafficCar(car, game.rng, 1 / 60);
      updateHud(game.hud, game, 1 / 60);
    }
  }
  render();
}

// Input: keyboard, mouse, and the menu buttons.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};
window.addEventListener('keydown', (event) => {
  const mapped = KEYMAP[event.code];
  if (mapped) { input[mapped] = true; event.preventDefault(); return; }
  if (event.code === 'KeyE' && !event.repeat) input.enterQueued = true;
  if (event.code === 'KeyF' && !event.repeat) input.punchQueued = true;
  if (event.code === 'KeyM' && !event.repeat) {
    game.muted = !game.muted;
    setMuted(game.audio, game.muted);
  }
  if (event.code === 'KeyP' || event.code === 'Escape') {
    if (screen === 'play') { screen = 'paused'; showScreen('paused'); announce('Paused.'); }
    else if (screen === 'paused') { screen = 'play'; showScreen('play'); announce('Playing.'); }
  }
  if ((event.code === 'Enter' || event.code === 'Space') && (screen === 'title' || screen === 'over')) {
    if (screen === 'over') { location.reload(); return; }
    startGame();
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  const mapped = KEYMAP[event.code];
  if (mapped) input[mapped] = false;
});
window.addEventListener('blur', () => {
  input.up = input.down = input.left = input.right = input.run = false;
});
canvas.addEventListener('pointerdown', (event) => {
  ensureAudio(game.audio);
  input.mouseX = event.clientX;
  input.mouseY = event.clientY;
  if (screen === 'play') input.shootQueued = true;
});
canvas.addEventListener('pointermove', (event) => {
  input.mouseX = event.clientX;
  input.mouseY = event.clientY;
});
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', () => { screen = 'play'; showScreen('play'); });
document.getElementById('restartBtn').addEventListener('click', () => location.reload());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') { screen = 'paused'; showScreen('paused'); }
});
if (saved && saved.missionsDone > 0) {
  document.getElementById('continueNote').textContent =
    'Welcome back — ' + saved.missionsDone + ' of ' + MISSIONS.length + ' jobs done, $' + saved.money + ' in the pocket.';
}

if (shot) {
  // Screenshot mode: stage the scene, paint it, freeze it, signal readiness.
  stageShot(shot, game);
  updateHud(game.hud, game, 0);
  showScreen('play');
  let painted = 0;
  function paint() {
    render();
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  showScreen('title');
  announce('Solmar Streets. Press Enter or click Start Engine.');
  requestAnimationFrame(frame);
}

// Self-test (?selftest=1): drives the whole interactive path synchronously at
// load — start, walk, steal a car, drive, get out, shoot, punch, finish a
// mission — and reports the outcome in window.__selftest for a headless check.
if (params.get('selftest')) {
  const results = { errors: [] };
  window.addEventListener('error', (e) => results.errors.push(String(e.message)));
  try {
    startGame();
    input.up = true; input.right = true;
    for (let i = 0; i < 120; i += 1) step(STEP);
    results.walked = Math.round(Math.hypot(game.player.x - streetCenter(5), game.player.y - streetCenter(5)));
    const car = game.parkedCars[0];
    game.player.x = car.x + 20; game.player.y = car.y;
    input.enterQueued = true;
    step(STEP);
    results.inCar = !game.player.onFoot;
    results.wantedAfterSteal = game.police.wanted;
    const sx = game.player.x;
    const sy = game.player.y;
    input.up = true; input.right = false;
    for (let i = 0; i < 120; i += 1) step(STEP);
    results.drove = Math.round(Math.abs(game.player.car ? game.player.car.speed : 0));
    results.droveDist = Math.round(Math.hypot(game.player.x - sx, game.player.y - sy));
    input.enterQueued = true;
    step(STEP);
    results.onFootAgain = game.player.onFoot;
    input.mouseX = 700; input.mouseY = 300;
    input.shootQueued = true;
    step(STEP);
    results.bullets = game.combat.bullets.length;
    input.punchQueued = true;
    step(STEP);
    results.punched = game.player.punchTimer > 0;
    const m = currentMission(game.missionState);
    game.player.x = m.target.x; game.player.y = m.target.y;
    step(STEP);
    results.missionDone = game.missionsDone;
    results.money = game.money;
    results.screen = screen;
  } catch (err) {
    results.errors.push(String((err && err.message) || err));
  }
  window.__selftest = results;
  document.title = 'SELFTEST ' + JSON.stringify(results);
}
