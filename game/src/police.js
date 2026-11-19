// Wanted level and the Solmar PD: stars rise with crime, police cars spawn and
// chase, foot cops join at high heat, and the heat cools when the player stays
// clean and out of sight.
import { createCar, drawCar } from './vehicles.js';
import { streetCenter, WORLD_SIZE, PITCH } from './world.js';
import { pick } from './rng.js';

export const MAX_WANTED = 5;

export function createPolice() {
  return { cars: [], cops: [], wanted: 0, heat: 0, calmTimer: 0, spawnTimer: 0 };
}

export function addWanted(police, stars) {
  police.wanted = Math.min(MAX_WANTED, police.wanted + stars);
  police.heat = 1;
  police.calmTimer = 0;
}

export function setWanted(police, stars) {
  police.wanted = Math.max(0, Math.min(MAX_WANTED, stars));
  police.heat = stars > 0 ? 1 : 0;
  police.calmTimer = 0;
}

// How many police cars the current heat calls for.
export function wantedCarCount(wanted) {
  return wanted === 0 ? 0 : wanted <= 1 ? 1 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : wanted <= 4 ? 4 : 6;
}

function spawnPoliceCar(police, player, rng) {
  const side = Math.floor(rng() * 4);
  const dist = 420 + rng() * 260;
  let x = player.x;
  let y = player.y;
  if (side === 0) x += dist;
  else if (side === 1) x -= dist;
  else if (side === 2) y += dist;
  else y -= dist;
  x = Math.max(60, Math.min(WORLD_SIZE - 60, x));
  y = Math.max(60, Math.min(WORLD_SIZE - 60, y));
  const car = createCar(x, y, Math.atan2(player.y - y, player.x - x), '#ffffff', { police: true });
  car.speed = 200;
  car.cruise = 260;
  police.cars.push(car);
}

export function updatePolice(police, player, playerCar, rng, dt) {
  const target = playerCar || player;
  if (police.wanted > 0) {
    police.calmTimer += dt;
    // Staying clean and far from the law cools the heat down.
    if (police.calmTimer > 24) {
      police.wanted -= 1;
      police.calmTimer = 0;
      police.heat = police.wanted > 0 ? 1 : 0;
    }
    police.spawnTimer -= dt;
    const want = wantedCarCount(police.wanted);
    if (police.cars.length < want && police.spawnTimer <= 0) {
      spawnPoliceCar(police, target, rng);
      police.spawnTimer = 2.5;
    }
  } else if (police.cars.length > 0) {
    // Heat gone: cruisers peel off and drive away.
    for (const car of police.cars) car.speed = Math.max(60, car.speed - 60 * dt);
    if (police.calmTimer > 6) police.cars.length = 0;
    police.calmTimer += dt;
  }
  // Chase: steer toward the player, ram on contact, brake when overshooting.
  for (const car of police.cars) {
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-1, Math.min(1, diff * 2.2));
    const targetSpeed = dist > 260 ? 320 : dist > 90 ? 250 : 150;
    car.speed += (targetSpeed - car.speed) * dt * 0.8;
    car.angle += turn * 3.0 * dt * Math.sign(car.speed || 1);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = Math.max(30, Math.min(WORLD_SIZE - 30, car.x));
    car.y = Math.max(30, Math.min(WORLD_SIZE - 30, car.y));
    car.siren += dt;
    // Ram: shove the player's car and hurt the player on foot.
    if (dist < 46) {
      if (playerCar) {
        playerCar.speed *= 0.82;
        playerCar.x += (dx / dist) * -6;
        playerCar.y += (dy / dist) * -6;
      } else if (player.hurtTimer <= 0) {
        player.hp = Math.max(0, player.hp - 12);
        player.hurtTimer = 0.6;
      }
    }
  }
  // Foot cops appear at 3+ stars and chase on foot.
  const wantCops = police.wanted >= 3 ? police.wanted - 2 : 0;
  while (police.cops.length < wantCops) {
    police.cops.push({
      x: target.x + (rng() < 0.5 ? -1 : 1) * (300 + rng() * 150),
      y: target.y + (rng() < 0.5 ? -1 : 1) * (300 + rng() * 150),
      angle: 0, speed: 165, shootTimer: 1 + rng(),
    });
  }
  if (police.cops.length > wantCops) police.cops.length = wantCops;
  for (const cop of police.cops) {
    const dx = target.x - cop.x;
    const dy = target.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    if (dist > 120) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
    }
    cop.shootTimer -= dt;
    if (cop.shootTimer <= 0 && dist < 420 && !playerCar) {
      cop.shootTimer = 1.4;
      if (player.hurtTimer <= 0 && rng() < 0.45) {
        player.hp = Math.max(0, player.hp - 8);
        player.hurtTimer = 0.4;
      }
    }
  }
}

export function drawPolice(ctx, police, cam, viewW, viewH, night, ox, oy) {
  for (const car of police.cars) {
    if (Math.abs(car.x - cam.x) > viewW / 2 + 80 || Math.abs(car.y - cam.y) > viewH / 2 + 80) continue;
    drawCar(ctx, car, night, ox, oy);
  }
  for (const cop of police.cops) {
    if (Math.abs(cop.x - cam.x) > viewW / 2 + 40 || Math.abs(cop.y - cam.y) > viewH / 2 + 40) continue;
    const px = cop.x + (ox || 0);
    const py = cop.y + (oy || 0);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(px, py + 7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c2f6e';
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9c07a';
    ctx.beginPath(); ctx.arc(px + Math.cos(cop.angle) * 3, py + Math.sin(cop.angle) * 3, 4, 0, Math.PI * 2); ctx.fill();
  }
}
