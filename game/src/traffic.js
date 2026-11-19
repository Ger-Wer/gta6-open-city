// Traffic and pedestrians: cars cruise the street grid and turn at intersections,
// pedestrians stroll the sidewalks and scatter when a car barrels at them.
import { streetCenter, PITCH, WORLD_SIZE, isRoad, resolveBuilding } from './world.js';
import { createCar, CAR_COLORS, drawCar } from './vehicles.js';
import { makeRng, pick, range, rangeInt } from './rng.js';

const PED_COLORS = ['#e87ab0', '#7ab0e8', '#e8d44d', '#9b7ae8', '#e8e8e8', '#5ec9a7'];

export function createTraffic(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const horizontal = rng() < 0.5;
    const line = rangeInt(rng, 0, 9);
    const pos = range(rng, 80, WORLD_SIZE - 80);
    const dir = rng() < 0.5 ? 1 : -1;
    const x = horizontal ? pos : streetCenter(line) + (dir > 0 ? 12 : -12);
    const y = horizontal ? streetCenter(line) + (dir > 0 ? 12 : -12) : pos;
    const angle = horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = createCar(x, y, angle, pick(rng, CAR_COLORS), { traffic: true });
    car.speed = range(rng, 70, 130) * 1;
    car.cruise = car.speed;
    car.horizontal = horizontal;
    cars.push(car);
  }
  return cars;
}

export function createPedestrians(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const x = range(rng, 60, WORLD_SIZE - 60);
    const y = range(rng, 60, WORLD_SIZE - 60);
    peds.push({
      x, y, angle: range(rng, 0, Math.PI * 2), speed: range(rng, 28, 52),
      color: pick(rng, PED_COLORS), panic: 0, walkPhase: range(rng, 0, Math.PI * 2),
      targetX: x, targetY: y,
    });
  }
  return peds;
}

function snapToLane(car) {
  if (car.horizontal) {
    const cy = streetCenter(Math.round((car.y - 24) / PITCH));
    car.y += (cy + (Math.cos(car.angle) > 0 ? 12 : -12) - car.y) * 0.02;
  } else {
    const cx = streetCenter(Math.round((car.x - 24) / PITCH));
    car.x += (cx + (Math.sin(car.angle) > 0 ? 12 : -12) - car.x) * 0.02;
  }
}

// One traffic car: cruise along its street, pick a random turn at intersections.
export function updateTrafficCar(car, rng, dt) {
  const nearIntersection = Math.abs(((car.horizontal ? car.x : car.y) % PITCH) - 24) < 14;
  if (nearIntersection && rng() < 0.02) {
    const turn = rng() < 0.5 ? -1 : 1;
    car.horizontal = !car.horizontal;
    const dir = turn;
    car.angle = car.horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  car.speed += (car.cruise - car.speed) * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  snapToLane(car);
  if (car.x < 30) { car.x = 30; car.angle = 0; car.horizontal = true; }
  if (car.x > WORLD_SIZE - 30) { car.x = WORLD_SIZE - 30; car.angle = Math.PI; car.horizontal = true; }
  if (car.y < 30) { car.y = 30; car.angle = Math.PI / 2; car.horizontal = false; }
  if (car.y > WORLD_SIZE - 30) { car.y = WORLD_SIZE - 30; car.angle = -Math.PI / 2; car.horizontal = false; }
}

export function updatePedestrian(ped, city, cars, rng, dt) {
  // Panic: run away from the nearest fast car.
  let threat = null;
  let threatD = 90;
  for (const car of cars) {
    const d = Math.hypot(car.x - ped.x, car.y - ped.y);
    if (d < threatD && Math.abs(car.speed) > 60) { threatD = d; threat = car; }
  }
  if (threat) {
    ped.panic = 1.2;
    ped.angle = Math.atan2(ped.y - threat.y, ped.x - threat.x);
  } else if (ped.panic > 0) {
    ped.panic -= dt;
  }
  if (ped.panic <= 0 && Math.hypot(ped.targetX - ped.x, ped.targetY - ped.y) < 12) {
    // Pick a new stroll target on a nearby sidewalk (just off a road).
    const horizontal = rng() < 0.5;
    const line = streetCenter(rangeInt(rng, 0, 9));
    ped.targetX = horizontal ? ped.x + (rng() < 0.5 ? -1 : 1) * 180 : line + 34;
    ped.targetY = horizontal ? line + 34 : ped.y + (rng() < 0.5 ? -1 : 1) * 180;
    ped.targetX = Math.max(40, Math.min(WORLD_SIZE - 40, ped.targetX));
    ped.targetY = Math.max(40, Math.min(WORLD_SIZE - 40, ped.targetY));
  }
  const tx = ped.panic > 0 ? ped.x + Math.cos(ped.angle) * 60 : ped.targetX;
  const ty = ped.panic > 0 ? ped.y + Math.sin(ped.angle) * 60 : ped.targetY;
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d > 2) {
    ped.angle = Math.atan2(dy, dx);
    const speed = ped.panic > 0 ? ped.speed * 3 : ped.speed;
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const res = resolveBuilding(city, nx, ny, 8);
    ped.x = res.x; ped.y = res.y;
    ped.walkPhase += dt * 8;
  }
}

export function drawTraffic(ctx, cars, peds, cam, viewW, viewH, night, ox, oy) {
  for (const car of cars) {
    if (Math.abs(car.x - cam.x) > viewW / 2 + 80 || Math.abs(car.y - cam.y) > viewH / 2 + 80) continue;
    drawCar(ctx, car, night, ox, oy);
  }
  for (const ped of peds) {
    if (Math.abs(ped.x - cam.x) > viewW / 2 + 40 || Math.abs(ped.y - cam.y) > viewH / 2 + 40) continue;
    const px = ped.x + (ox || 0);
    const py = ped.y + (oy || 0);
    const bob = Math.sin(ped.walkPhase) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(px, py + 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(px, py + bob * 0.3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(px + Math.cos(ped.angle) * 3, py + Math.sin(ped.angle) * 3, 4, 0, Math.PI * 2); ctx.fill();
  }
}
