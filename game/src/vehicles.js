// Cars: the player's ride, parked cars and carjacking. Driving is simple arcade
// physics — throttle, brake/reverse, steering that bites harder at low speed —
// with building collisions and car-to-car bumps.
import { resolveBuilding, clampToWorld, streetCenter, PITCH, WORLD_SIZE, rotPoly } from './world.js';
import { makeRng, pick, range } from './rng.js';

export const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8b04b', '#7a4fd0', '#4fd07a', '#d9d9d9', '#222831', '#e87ab0', '#3db8c9'];

export function createCar(x, y, angle, color, opts) {
  const o = opts || {};
  return {
    x, y, angle, speed: 0, color: color || '#d94f3d',
    length: 44, width: 22, hp: 100,
    parked: !!o.parked, traffic: !!o.traffic, police: !!o.police,
    driver: o.driver !== undefined ? o.driver : true,
    siren: 0, brakeLight: false,
  };
}

export function spawnParkedCars(city, rng, count) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard < count * 40) {
    guard += 1;
    const along = Math.floor(rng() * 10);
    const across = Math.floor(rng() * 10);
    const horizontal = rng() < 0.5;
    const x = horizontal ? range(rng, 120, WORLD_SIZE - 120) : streetCenter(across) + (rng() < 0.5 ? -16 : 16);
    const y = horizontal ? streetCenter(along) + (rng() < 0.5 ? -16 : 16) : range(rng, 120, WORLD_SIZE - 120);
    const angle = horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    if (cars.some((c) => Math.hypot(c.x - x, c.y - y) < 70)) continue;
    cars.push(createCar(x, y, angle, pick(rng, CAR_COLORS), { parked: true, driver: false }));
  }
  return cars;
}

// Drive the player's car one step; returns 'crash' when it smacks a building hard.
export function updatePlayerCar(car, city, input, dt) {
  const accel = input.up ? 420 : input.down ? -300 : 0;
  const maxFwd = 340;
  const maxRev = 130;
  car.speed += accel * dt;
  car.speed *= Math.pow(0.4, dt); // rolling drag
  if (car.speed > maxFwd) car.speed = maxFwd;
  if (car.speed < -maxRev) car.speed = -maxRev;
  const steer = ((input.left ? -1 : 0) + (input.right ? 1 : 0)) * (car.speed >= 0 ? 1 : -1);
  const steerPower = 2.6 * Math.min(1, Math.abs(car.speed) / 90 + 0.25);
  car.angle += steer * steerPower * dt * Math.sign(car.speed || 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = car.speed;
  const res = resolveBuilding(city, nx, ny, 20);
  if (res.hit) {
    if (Math.abs(before) > 140) { car.speed *= -0.25; return 'crash'; }
    car.speed *= 0.4;
  }
  car.x = res.x; car.y = res.y;
  const c = clampToWorld(car.x, car.y, 24);
  car.x = c.x; car.y = c.y;
  car.brakeLight = !!input.down;
  return null;
}

// Simple circle bump between two cars: push apart and trade a little speed.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = 34;
  if (d === 0 || d >= min) return false;
  const push = (min - d) / 2;
  const ux = dx / d;
  const uy = dy / d;
  a.x -= ux * push; a.y -= uy * push;
  b.x += ux * push; b.y += uy * push;
  const tmp = a.speed;
  a.speed = b.speed * 0.5;
  b.speed = tmp * 0.5;
  return true;
}

// Nearest car the player could steal, within reach and roughly in front of them.
export function nearestStealableCar(player, cars, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.police) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function drawCar(ctx, car, night, ox, oy) {
  const cx = car.x + (ox || 0);
  const cy = car.y + (oy || 0);
  // Shadow, then the body as a rotated polygon (no canvas transforms: the
  // screenshot browser ignores them).
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(cx, cy + 3, 16, 0, Math.PI * 2); ctx.fill();
  rotPoly(ctx, cx, cy, car.angle, [[-22, -11], [22, -11], [22, 11], [-22, 11]], car.color);
  // Cabin and windshield.
  rotPoly(ctx, cx, cy, car.angle, [[-6, -9], [8, -9], [8, 9], [-6, 9]], night ? '#9fd8ff' : '#20242c');
  rotPoly(ctx, cx, cy, car.angle, [[8, -9], [11, -9], [11, 9], [8, 9]], 'rgba(255,255,255,0.55)');
  // Headlights and tail lights.
  const hl = night ? '#fff6c0' : '#ffe9a8';
  rotPoly(ctx, cx, cy, car.angle, [[20, -9], [23, -9], [23, -5], [20, -5]], hl);
  rotPoly(ctx, cx, cy, car.angle, [[20, 5], [23, 5], [23, 9], [20, 9]], hl);
  const tl = car.brakeLight ? '#ff2e1f' : '#a3160f';
  rotPoly(ctx, cx, cy, car.angle, [[-23, -9], [-20, -9], [-20, -5], [-23, -5]], tl);
  rotPoly(ctx, cx, cy, car.angle, [[-23, 5], [-20, 5], [-20, 9], [-23, 9]], tl);
  if (car.police) {
    rotPoly(ctx, cx, cy, car.angle, [[-2, -11], [8, -11], [8, 11], [-2, 11]], '#ffffff');
    rotPoly(ctx, cx, cy, car.angle, [[2, -11], [8, -11], [8, 11], [2, 11]], '#1c4fd7');
    // Light bar flashes red/blue, driven by the car's own siren clock.
    const red = Math.floor((car.siren || 0) * 4) % 2 === 0;
    rotPoly(ctx, cx, cy, car.angle, [[-4, -12], [4, -12], [4, -7], [-4, -7]], red ? '#ff2020' : '#2050ff');
    rotPoly(ctx, cx, cy, car.angle, [[-4, 7], [4, 7], [4, 12], [-4, 12]], red ? '#2050ff' : '#ff2020');
  }
  if (night && car.speed !== 0) {
    ctx.fillStyle = 'rgba(255,244,180,0.10)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(car.angle) * 60, cy + Math.sin(car.angle) * 60, 46, 0, Math.PI * 2);
    ctx.fill();
  }
}
