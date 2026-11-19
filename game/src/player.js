// Milo Reyes on foot: walking, running, health, and getting in and out of cars.
// Drawing is a top-down figure: shadow, body, head, and a facing direction.
import { resolveBuilding, clampToWorld, isRoad, rotPoly } from './world.js';

export const WALK_SPEED = 150;
export const RUN_SPEED = 235;

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0, hp: 100, maxHp: 100,
    onFoot: true, car: null, punchTimer: 0, punchCooldown: 0,
    hurtTimer: 0, moving: false,
  };
}

// Move on foot with WASD/arrows; buildings block, world edges clamp.
export function updatePlayerOnFoot(player, city, input, dt) {
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  player.moving = len > 0;
  if (len > 0) {
    mx /= len; my /= len;
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    player.angle = Math.atan2(my, mx);
    const nx = player.x + mx * speed * dt;
    const ny = player.y + my * speed * dt;
    const rx = resolveBuilding(city, nx, player.y, 12);
    player.x = rx.x;
    const ry = resolveBuilding(city, player.x, ny, 12);
    player.y = ry.y;
    const c = clampToWorld(player.x, player.y, 14);
    player.x = c.x; player.y = c.y;
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
}

export function hurtPlayer(player, amount) {
  if (player.hurtTimer > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.hurtTimer = 0.5;
}

export function healPlayer(player, amount) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
}

export function drawPlayer(ctx, player, night, ox, oy) {
  // Bob and hurt-flash come from the player's own position and timers, never
  // from the wall clock, so a frame is reproducible from the game state.
  const bob = player.moving ? Math.sin(player.x * 0.05 + player.y * 0.05) * 2 : 0;
  const cx = player.x + (ox || 0);
  const cy = player.y + bob * 0.4 + (oy || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(cx, cy + 8, 10, 0, Math.PI * 2); ctx.fill();
  // Body: jacket, arms, head — rotated by hand, no canvas transform.
  const jacket = player.hurtTimer > 0 && Math.floor(player.hurtTimer * 12) % 2 === 0 ? '#ff6b5e' : '#2e86c1';
  rotPoly(ctx, cx, cy, player.angle, [[-7, -9], [9, -9], [9, 9], [-7, 9]], jacket);
  rotPoly(ctx, cx, cy, player.angle, [[-9, -8], [-5, -8], [-5, -2], [-9, -2]], '#222222');
  rotPoly(ctx, cx, cy, player.angle, [[-9, 2], [-5, 2], [-5, 8], [-9, 8]], '#222222');
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath();
  ctx.arc(cx + Math.cos(player.angle) * 11, cy + Math.sin(player.angle) * 11, 6, 0, Math.PI * 2);
  ctx.fill();
  // Punch arc while swinging.
  if (player.punchTimer > 0) {
    ctx.strokeStyle = 'rgba(255,220,120,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, player.angle - 0.7, player.angle + 0.7);
    ctx.stroke();
  }
}

// Is the player standing on a road (used for jaywalking flavour and spawn checks)?
export function playerOnRoad(player) { return isRoad(player.x, player.y); }
