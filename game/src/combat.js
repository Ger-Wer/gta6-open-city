// Combat: fists and gunfire. The player punches nearby rivals and shoots toward
// the mouse; rival gang members (Los Tiburones) spawn for fight missions and
// shoot back. Bullets are simple fast dots with a short life.
import { makeRng, range } from './rng.js';

export const BULLET_SPEED = 620;
export const BULLET_RANGE = 520;

export function createCombat() {
  return { bullets: [], enemies: [], muzzle: 0 };
}

// Spawn rival gang members around a point for the street-fight mission.
export function spawnEnemies(combat, rng, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.6;
    combat.enemies.push({
      x: x + Math.cos(angle) * (90 + rng() * 90),
      y: y + Math.sin(angle) * (90 + rng() * 90),
      angle, hp: 40, speed: 95, shootTimer: 0.8 + rng() * 1.2,
      hurtTimer: 0, walkPhase: rng() * 6,
    });
  }
}

export function playerShoot(combat, fromX, fromY, angle) {
  combat.bullets.push({
    x: fromX + Math.cos(angle) * 22,
    y: fromY + Math.sin(angle) * 22,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: BULLET_RANGE / BULLET_SPEED,
    friendly: true,
  });
  combat.muzzle = 0.08;
}

export function enemyShoot(combat, fromX, fromY, angle) {
  combat.bullets.push({
    x: fromX + Math.cos(angle) * 22,
    y: fromY + Math.sin(angle) * 22,
    vx: Math.cos(angle) * (BULLET_SPEED * 0.8),
    vy: Math.sin(angle) * (BULLET_SPEED * 0.8),
    life: BULLET_RANGE / BULLET_SPEED,
    friendly: false,
  });
}

// A punch hits every enemy within reach in front of the player.
export function playerPunch(combat, player) {
  let hitAny = false;
  for (const enemy of combat.enemies) {
    const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (d > 46) continue;
    const ang = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    let diff = ang - player.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 1.1) continue;
    enemy.hp -= 20;
    enemy.hurtTimer = 0.3;
    enemy.x += Math.cos(ang) * 14;
    enemy.y += Math.sin(ang) * 14;
    hitAny = true;
  }
  return hitAny;
}

export function updateCombat(combat, game, dt) {
  const player = game.player;
  const rng = game.rng;
  if (combat.muzzle > 0) combat.muzzle -= dt;
  // Bullets fly, hit buildings, enemies, or the player.
  for (let i = combat.bullets.length - 1; i >= 0; i -= 1) {
    const b = combat.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && game.city && game.hitBuildingAt(b.x, b.y, 2)) dead = true;
    if (!dead && b.friendly) {
      for (let e = combat.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = combat.enemies[e];
        if (Math.hypot(enemy.x - b.x, enemy.y - b.y) < 14) {
          enemy.hp -= 25;
          enemy.hurtTimer = 0.25;
          dead = true;
          break;
        }
      }
    }
    if (!dead && !b.friendly && !player.car) {
      if (Math.hypot(player.x - b.x, player.y - b.y) < 13) {
        if (player.hurtTimer <= 0) {
          player.hp = Math.max(0, player.hp - 7);
          player.hurtTimer = 0.35;
        }
        dead = true;
      }
    }
    if (dead) combat.bullets.splice(i, 1);
  }
  // Enemies: chase the player, keep some distance, and shoot.
  for (let i = combat.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = combat.enemies[i];
    if (enemy.hp <= 0) {
      combat.enemies.splice(i, 1);
      game.score += 50;
      game.toast('+50 — Shark down');
      continue;
    }
    if (enemy.hurtTimer > 0) enemy.hurtTimer -= dt;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.angle = Math.atan2(dy, dx);
    if (dist > 150) {
      enemy.x += Math.cos(enemy.angle) * enemy.speed * dt;
      enemy.y += Math.sin(enemy.angle) * enemy.speed * dt;
    } else if (dist < 90) {
      enemy.x -= Math.cos(enemy.angle) * enemy.speed * 0.6 * dt;
      enemy.y -= Math.sin(enemy.angle) * enemy.speed * 0.6 * dt;
    }
    enemy.walkPhase += dt * 8;
    enemy.shootTimer -= dt;
    if (enemy.shootTimer <= 0 && dist < 460) {
      enemy.shootTimer = 1.3 + rng() * 0.9;
      if (rng() < 0.6) enemyShoot(combat, enemy.x, enemy.y, enemy.angle + (rng() - 0.5) * 0.2);
    }
    // Melee range: a rival's fists hurt.
    if (dist < 26 && player.hurtTimer <= 0 && !player.car) {
      player.hp = Math.max(0, player.hp - 9);
      player.hurtTimer = 0.5;
    }
  }
}

export function drawCombat(ctx, combat, cam, viewW, viewH, ox, oy) {
  for (const enemy of combat.enemies) {
    if (Math.abs(enemy.x - cam.x) > viewW / 2 + 40 || Math.abs(enemy.y - cam.y) > viewH / 2 + 40) continue;
    const px = enemy.x + (ox || 0);
    const py = enemy.y + (oy || 0);
    const flash = enemy.hurtTimer > 0 && Math.floor(enemy.hurtTimer * 20) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(px, py + 7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#ff6b5e' : '#3a3f4a';
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(px + Math.cos(enemy.angle) * 3, py + Math.sin(enemy.angle) * 3, 5, 0, Math.PI * 2); ctx.fill();
    // Health bar above the rival.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px - 12, py - 20, 24, 4);
    ctx.fillStyle = '#ff5a4e';
    ctx.fillRect(px - 12, py - 20, 24 * Math.max(0, enemy.hp / 40), 4);
  }
  for (const b of combat.bullets) {
    ctx.fillStyle = b.friendly ? '#ffe27a' : '#ff7a5e';
    ctx.beginPath(); ctx.arc(b.x + (ox || 0), b.y + (oy || 0), 3.5, 0, Math.PI * 2); ctx.fill();
  }
}
