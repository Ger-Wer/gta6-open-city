// The city of Solmar: a seeded grid of streets, blocks, buildings, parks and a
// beach, plus the collision and drawing helpers every other system uses.
import { makeRng, pick, range, rangeInt } from './rng.js';

export const WORLD_SIZE = 2688;
export const PITCH = 268; // block (220) + road (48)
export const ROAD = 48;
export const BLOCK = 220;

const ROOF_COLORS = ['#c96f4a', '#d9a05b', '#7fa8c9', '#e0cfa8', '#b56b6b', '#8fae8b', '#d8d3c3', '#e8b04b'];
const WALL_COLORS = ['#e8d9b8', '#f2e3c2', '#d9c9a8', '#cfd8dc', '#e6c9a0'];

export function streetCenter(i) { return i * PITCH + ROAD / 2; }

export function isRoad(x, y) {
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const my = ((y % PITCH) + PITCH) % PITCH;
  return mx < ROAD || my < ROAD;
}

export function nearestStreetCenter(v) {
  const i = Math.round((v - ROAD / 2) / PITCH);
  return Math.max(ROAD / 2, Math.min(WORLD_SIZE - ROAD / 2, streetCenter(i)));
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const parks = [];
  for (let bx = 0; bx < 10; bx += 1) {
    for (let by = 0; by < 10; by += 1) {
      const x0 = bx * PITCH + ROAD;
      const y0 = by * PITCH + ROAD;
      // The south row is the beach: no buildings, sand and palms instead.
      if (by === 9) {
        for (let t = 0; t < 6; t += 1) {
          trees.push({ x: x0 + range(rng, 20, BLOCK - 20), y: y0 + range(rng, 20, BLOCK - 20), r: range(rng, 7, 11) });
        }
        continue;
      }
      if (rng() < 0.14) {
        parks.push({ x: x0, y: y0, w: BLOCK, h: BLOCK });
        for (let t = 0; t < 7; t += 1) {
          trees.push({ x: x0 + range(rng, 16, BLOCK - 16), y: y0 + range(rng, 16, BLOCK - 16), r: range(rng, 6, 10) });
        }
        continue;
      }
      const split = rng() < 0.45;
      const parts = split ? 2 : 1;
      for (let p = 0; p < parts; p += 1) {
        const w = split ? BLOCK / 2 - 16 : BLOCK - 28;
        const h = BLOCK - 28;
        const x = split ? x0 + 14 + p * (BLOCK / 2) : x0 + 14;
        const y = y0 + 14;
        buildings.push({
          x, y, w, h,
          roof: pick(rng, ROOF_COLORS),
          wall: pick(rng, WALL_COLORS),
          height: rangeInt(rng, 1, 4),
          windows: rangeInt(rng, 2, 5),
        });
      }
    }
  }
  return { seed, buildings, trees, parks };
}

// Circle (x, y, r) against every building near it; returns the building hit or null.
export function hitBuilding(city, x, y, r) {
  const bx0 = Math.max(0, Math.floor((x - r) / PITCH));
  const bx1 = Math.min(9, Math.floor((x + r) / PITCH));
  const by0 = Math.max(0, Math.floor((y - r) / PITCH));
  const by1 = Math.min(9, Math.floor((y + r) / PITCH));
  for (const b of city.buildings) {
    const cbx = Math.floor(b.x / PITCH);
    const cby = Math.floor(b.y / PITCH);
    if (cbx < bx0 || cbx > bx1 || cby < by0 || cby > by1) continue;
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

export function clampToWorld(x, y, r) {
  return {
    x: Math.max(r, Math.min(WORLD_SIZE - r, x)),
    y: Math.max(r, Math.min(WORLD_SIZE - r, y)),
  };
}

// Push a circle out of a building rect along the smallest penetration axis.
export function resolveBuilding(city, x, y, r) {
  const b = hitBuilding(city, x, y, r);
  if (!b) return { x, y, hit: false };
  const dxLeft = (x + r) - b.x;
  const dxRight = (b.x + b.w) - (x - r);
  const dyTop = (y + r) - b.y;
  const dyBottom = (b.y + b.h) - (y - r);
  const min = Math.min(dxLeft, dxRight, dyTop, dyBottom);
  if (min === dxLeft) return { x: b.x - r, y, hit: true };
  if (min === dxRight) return { x: b.x + b.w + r, y, hit: true };
  if (min === dyTop) return { x, y: b.y - r, hit: true };
  return { x, y: b.y + b.h + r, hit: true };
}

// Fill a polygon from local points rotated by `angle` around (cx, cy).
// Obscura's canvas ignores setTransform/translate/rotate, so every rotated
// shape in the game is drawn this way, with absolute screen coordinates.
export function rotPoly(ctx, cx, cy, angle, points, color) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const px = cx + points[i][0] * cos - points[i][1] * sin;
    const py = cy + points[i][0] * sin + points[i][1] * cos;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawCity(ctx, city, cam, viewW, viewH, night) {
  const ox = -cam.x + viewW / 2;
  const oy = -cam.y + viewH / 2;
  const x0 = cam.x - viewW / 2 - 60;
  const y0 = cam.y - viewH / 2 - 60;
  const x1 = cam.x + viewW / 2 + 60;
  const y1 = cam.y + viewH / 2 + 60;
  // Ground: warm pavement for blocks, asphalt for roads.
  ctx.fillStyle = night ? '#3a3f4a' : '#cbb98f';
  ctx.fillRect(x0 + ox, y0 + oy, x1 - x0, y1 - y0);
  // Beach strip along the south edge.
  ctx.fillStyle = night ? '#8a7a55' : '#f0dca0';
  ctx.fillRect(x0 + ox, WORLD_SIZE - BLOCK + oy, x1 - x0, BLOCK);
  ctx.fillStyle = night ? '#16324a' : '#2e86c1';
  ctx.fillRect(x0 + ox, WORLD_SIZE - 26 + oy, x1 - x0, 26);
  // Roads.
  ctx.fillStyle = night ? '#23262e' : '#3c4148';
  for (let i = 0; i <= 10; i += 1) {
    const c = streetCenter(i);
    if (c < x1 && c > x0) ctx.fillRect(c - ROAD / 2 + ox, Math.max(y0, 0) + oy, ROAD, Math.min(y1, WORLD_SIZE) - Math.max(y0, 0));
    if (c < y1 && c > y0) ctx.fillRect(Math.max(x0, 0) + ox, c - ROAD / 2 + oy, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), ROAD);
  }
  // Lane dashes.
  ctx.fillStyle = night ? '#5a5f6a' : '#e8d44d';
  for (let i = 0; i <= 10; i += 1) {
    const c = streetCenter(i);
    for (let s = 0; s < WORLD_SIZE; s += 56) {
      if (c > x0 && c < x1 && s > y0 && s < y1) ctx.fillRect(c - 2 + ox, s + oy, 4, 26);
      if (c > y0 && c < y1 && s > x0 && s < x1) ctx.fillRect(s + ox, c - 2 + oy, 26, 4);
    }
  }
  // Parks.
  for (const p of city.parks) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = night ? '#1e4d2a' : '#69b578';
    ctx.fillRect(p.x + ox, p.y + oy, p.w, p.h);
  }
  // Buildings with roof, wall edge and windows.
  for (const b of city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4 + ox, b.y + 4 + oy, b.w - 8, b.h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    const cols = b.windows;
    for (let i = 0; i < cols; i += 1) {
      const wx = b.x + 12 + (i * (b.w - 24)) / Math.max(1, cols - 1 || 1);
      ctx.fillRect(wx + ox, b.y + 14 + oy, 8, 8);
      ctx.fillRect(wx + ox, b.y + b.h - 26 + oy, 8, 8);
    }
  }
  // Trees and palms.
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = night ? '#1d4d2a' : '#2e8b57';
    ctx.beginPath(); ctx.arc(t.x + ox, t.y + oy, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(t.x + 2 + ox, t.y + 2 + oy, t.r * 0.5, 0, Math.PI * 2); ctx.fill();
  }
}
