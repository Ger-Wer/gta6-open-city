# Solmar Streets

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Ger-Wer/gta6-open-city/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Ger-Wer/gta6-open-city/reward.svg)](https://make.fun/bounty/gta6-01)

A sun-soaked open-world crime game in the city of **Solmar**, built for the
make.fun **gta6-01 "Make GTA 6"** bounty. Top-down 2D, pure Canvas, no build
step, no network requests — open `game/index.html` and play.

You are **Milo Reyes**, new in town, broke and fast. **Carmen Delgado** runs
the courier crew that owns these streets. Run her five jobs — from a first
delivery at the marina to the big score at Solmar Bank — dodge the Solmar PD,
and earn your way from nothing to the beach safehouse.

## What is in the game

- **A city to explore** — a seeded 10×10 street grid with houses, parks, palm
  trees and a beach, the same city every time from the same seed.
- **On foot and by car** — walk the sidewalks, steal any parked or driven car
  with **E**, drive with arcade physics (throttle, brake, steering, crashes).
- **Traffic and pedestrians** — cars cruise the grid and turn at intersections,
  pedestrians stroll and scatter when a car barrels at them.
- **Wanted level** — 1 to 5 stars. Steal a car, hit a pedestrian, shoot, and the
  Solmar PD sends cruisers that ram you and foot cops that shoot back. Stay
  clean and the heat cools off.
- **Missions and story** — five jobs with a briefing, a map marker and a payout:
  delivery, car theft, a hot-cargo escape, a street fight against the
  **Los Tiburones** gang, and the bank heist.
- **Combat** — punch with **F**, shoot with the mouse; rivals have health bars
  and shoot back.
- **Progression** — money and missions done save to `localStorage` and survive
  a reload; the title screen welcomes you back with your pocket.
- **HUD** — money, wanted stars, health bar, clock, speed, mission briefing and
  a live circular minimap, all as DOM elements over the canvas.
- **Sound** — engine hum, sirens, gunshots, punches and cash blips, all
  synthesized with WebAudio (starts after your first key press or click).
- **Screens** — title, pause (**P**), game over with your stats, restart.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk and drive (Shift runs) |
| E | Steal / enter a car, get out |
| Mouse click | Shoot toward the cursor |
| F | Punch |
| P / Esc | Pause |
| M | Mute |

## How to run

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies. `main.ts` (Node 22, standard library only)
copies `game/` and `screenshots/` to `/output` and writes `dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Screenshots

The four frames in `screenshots/` are real renders of this game, staged with
`?shot=chase|street|mission|night&seed=1` and taken in a headless browser:

1. `1-chase.jpg` — the getaway: three stars, cruisers behind, garage ahead.
2. `2-street.jpg` — Milo on foot downtown, traffic and pedestrians around.
3. `3-mission.jpg` — the street fight at the plaza, a Shark down.
4. `4-night.jpg` — the coast road at night, 187 km/h, two stars.

## Tech notes

- Canvas 2D only, static files under `game/`, zero network requests.
- The city, traffic and missions run on a seeded RNG, so every screenshot
  scene reproduces exactly.
- The renderer uses absolute screen coordinates only — no canvas transforms —
  so it paints identically in every browser, including headless ones.

## License

MIT — see `LICENSE`.
