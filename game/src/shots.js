// Screenshot scenes behind ?shot=chase|street|mission|night. Each one plays the
// real rules forward from a fresh game for a fixed number of steps, steered by a
// simple autopilot (drive toward the mission marker, walk toward the target,
// shoot the nearest rival), so the frame is what real play looks like and the
// same seed always gives the same frame.
import { streetCenter, WORLD_SIZE } from './world.js';
import { updatePlayerOnFoot } from './player.js';
import { createCar, updatePlayerCar } from './vehicles.js';
import { updateTrafficCar, updatePedestrian } from './traffic.js';
import { setWanted, updatePolice } from './police.js';
import { spawnEnemies, playerShoot, updateCombat } from './combat.js';
import { MISSIONS } from './missions.js';

const STEP = 1 / 60;

function driveInput(game, target) {
  const car = game.player.car;
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return {
    up: true, down: false,
    left: diff < -0.12, right: diff > 0.12,
    run: false,
  };
}

function walkInput(game, target) {
  const p = game.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  return {
    up: dy < -24, down: dy > 24,
    left: dx < -24, right: dx > 24,
    run: true,
  };
}

function simulate(game, seconds, inputFn) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    const input = inputFn();
    game.time += STEP;
    game.timeOfDay = (game.timeOfDay + STEP) % 300;
    if (game.player.onFoot) updatePlayerOnFoot(game.player, game.city, input, STEP);
    else if (game.player.car) {
      updatePlayerCar(game.player.car, game.city, input, STEP);
      game.player.x = game.player.car.x;
      game.player.y = game.player.car.y;
      game.player.angle = game.player.car.angle;
    }
    for (const car of game.trafficCars) updateTrafficCar(car, game.rng, STEP);
    for (const ped of game.peds) updatePedestrian(ped, game.city, game.trafficCars, game.rng, STEP);
    updatePolice(game.police, game.player, game.player.car, game.rng, STEP);
    updateCombat(game.combat, game, STEP);
  }
  game.camera.x = Math.max(640, Math.min(WORLD_SIZE - 640, game.player.x));
  game.camera.y = Math.max(400, Math.min(WORLD_SIZE - 400, game.player.y));
}

function putPlayerInCar(game, x, y, angle) {
  const car = createCar(x, y, angle, '#d94f3d', {});
  game.player.car = car;
  game.player.onFoot = false;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
}

function stageChase(game) {
  // Cover: the player mid-getaway in a stolen car, three stars, police closing in.
  // The getaway runs east along Palm Row (row 3) straight toward the crew garage,
  // so the car stays on the road and the cruisers pile in behind it.
  game.missionState.index = 1;
  game.missionState.stage = 'go';
  game.money = 400;
  putPlayerInCar(game, streetCenter(2), streetCenter(3), 0);
  setWanted(game.police, 3);
  for (let i = 0; i < 3; i += 1) {
    const cop = createCar(game.player.x - 260 - i * 90, game.player.y + (i - 1) * 60, 0, '#ffffff', { police: true });
    cop.speed = 240;
    game.police.cars.push(cop);
  }
  simulate(game, 5, () => driveInput(game, MISSIONS[1].target));
}

function stageStreet(game) {
  // On foot at a busy downtown crossing: traffic, pedestrians, towers around.
  game.missionState.index = 0;
  game.player.x = streetCenter(5) + 30;
  game.player.y = streetCenter(5) - 30;
  game.player.angle = Math.PI / 4;
  game.money = 150;
  simulate(game, 6, () => walkInput(game, MISSIONS[0].target));
}

function stageMission(game) {
  // The street fight: Milo on foot at the plaza, Sharks closing in, shots fired.
  game.missionState.index = 3;
  game.missionState.stage = 'go';
  game.missionState.combatSpawned = true;
  game.missionState.enemiesLeft = 99;
  game.money = 800;
  const plaza = MISSIONS[3].target;
  game.player.x = plaza.x - 120;
  game.player.y = plaza.y + 60;
  game.player.angle = 0;
  spawnEnemies(game.combat, game.rng, plaza.x, plaza.y, 5);
  setWanted(game.police, 1);
  let shootTimer = 0;
  simulate(game, 5, () => {
    shootTimer -= STEP;
    if (shootTimer <= 0 && game.combat.enemies.length > 0) {
      shootTimer = 0.6;
      const e = game.combat.enemies[0];
      const ang = Math.atan2(e.y - game.player.y, e.x - game.player.x);
      game.player.angle = ang;
      playerShoot(game.combat, game.player.x, game.player.y, ang);
    }
    return walkInput(game, plaza);
  });
}

function stageNight(game) {
  // Night on the coast road: headlights, two stars, a cruiser in the mirror.
  game.missionState.index = 4;
  game.missionState.stage = 'go';
  game.money = 1300;
  game.timeOfDay = 262; // about 23:45 — deep night in Solmar
  putPlayerInCar(game, streetCenter(2), streetCenter(9), 0);
  setWanted(game.police, 2);
  const cop = createCar(game.player.x - 300, game.player.y + 10, 0, '#ffffff', { police: true });
  cop.speed = 250;
  game.police.cars.push(cop);
  // Chase east along the whole coast road — the target sits past the end of it,
  // so the car never turns back onto the beach.
  simulate(game, 5, () => driveInput(game, { x: WORLD_SIZE - 60, y: streetCenter(9) }));
}

/** Stage the named scene on a fresh game and freeze it for the screenshot. */
export function stageShot(name, game) {
  if (name === 'street') stageStreet(game);
  else if (name === 'mission') stageMission(game);
  else if (name === 'night') stageNight(game);
  else stageChase(game);
  game.night = game.timeOfDay > 235;
  game.camera.x = Math.max(640, Math.min(WORLD_SIZE - 640, game.player.x));
  game.camera.y = Math.max(400, Math.min(WORLD_SIZE - 400, game.player.y));
}
