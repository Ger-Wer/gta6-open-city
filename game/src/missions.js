// Missions and story: five jobs for Carmen Delgado's courier crew, from a first
// delivery at the marina to the big score at the Solmar Bank. Each mission has a
// target point, a short brief, and a payout; the chain ends with the crew's escape.
import { streetCenter, WORLD_SIZE } from './world.js';export const MISSION_REWARDS = [150, 250, 400, 500, 1200];

function pt(streetX, streetY) {
  return { x: streetCenter(streetX), y: streetCenter(streetY) };
}

export const MISSIONS = [
  {
    id: 'first-delivery',
    title: 'Job 1 — First Delivery',
    brief: 'Carmen: "Milo, the marina package. Walk or drive to the yellow marker at the docks — no trouble, just fast."',
    target: pt(2, 8),
    targetLabel: 'Marina drop-off',
    kind: 'goto',
    reward: MISSION_REWARDS[0],
  },
  {
    id: 'borrowed-wheels',
    title: 'Job 2 — Borrowed Wheels',
    brief: 'Carmen: "The crew needs wheels. Steal any car with E and bring it to the garage on Palm Row. The cops will notice — that is the job."',
    target: pt(7, 3),
    targetLabel: 'Crew garage',
    kind: 'steal-deliver',
    reward: MISSION_REWARDS[1],
  },
  {
    id: 'hot-cargo',
    title: 'Job 3 — Hot Cargo',
    brief: 'Carmen: "A package the Sharks want. Take it to the north plaza, and whatever you do — do not get caught. Lose the heat first."',
    target: pt(5, 1),
    targetLabel: 'North plaza',
    kind: 'escape-deliver',
    reward: MISSION_REWARDS[2],
  },
  {
    id: 'street-fight',
    title: 'Job 4 — Street Fight',
    brief: 'Carmen: "The Sharks took our corner at the plaza. Clear them out — punch with F, shoot with the mouse — then stand on the marker."',
    target: pt(5, 5),
    targetLabel: 'Plaza corner',
    kind: 'combat',
    reward: MISSION_REWARDS[3],
  },
  {
    id: 'big-score',
    title: 'Job 5 — The Big Score',
    brief: 'Carmen: "Solmar Bank, noon. Grab the cash, then run to the safehouse at the beach. Four stars, Milo. Make them count."',
    target: pt(8, 8),
    targetLabel: 'Beach safehouse',
    kind: 'heist',
    reward: MISSION_REWARDS[4],
  },
];

export function createMissionState(missionsDone) {
  return {
    index: Math.min(missionsDone, MISSIONS.length - 1),
    stage: 'go', // go | done | finished
    hasPackage: false,
    delivered: false,
    enemiesLeft: 0,
    startedAt: 0,
  };
}

export function currentMission(state) {
  return MISSIONS[state.index] || null;
}

export function missionTarget(state) {
  const m = currentMission(state);
  return m ? m.target : null;
}

// Advance the mission machine. Returns an event string ('picked', 'done', 'finished', '').
export function updateMissions(state, game, dt) {
  const m = currentMission(state);
  if (!m || state.stage === 'finished') return '';
  const player = game.player;
  const pos = player.car || player;
  const dx = m.target.x - pos.x;
  const dy = m.target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (m.kind === 'goto' && dist < 60) {
    return completeMission(state, game);
  }
  if (m.kind === 'steal-deliver') {
    if (!player.car) return '';
    if (dist < 70) return completeMission(state, game);
    return '';
  }
  if (m.kind === 'escape-deliver') {
    if (dist < 70 && game.police.wanted === 0) return completeMission(state, game);
    return '';
  }
  if (m.kind === 'combat') {
    if (state.enemiesLeft === 0 && game.enemies.length === 0 && dist < 80) {
      return completeMission(state, game);
    }
    return '';
  }
  if (m.kind === 'heist') {
    // Pickup happens at the bank (4,4); the escape target is the safehouse.
    const bank = { x: streetCenter(4), y: streetCenter(4) };
    if (state.stage === 'go' && Math.hypot(bank.x - pos.x, bank.y - pos.y) < 90 && !state.hasPackage) {
      state.hasPackage = true;
      state.stage = 'escape';
      game.addWanted(4);
      game.toast('Cash grabbed! Run to the beach safehouse!');
      return 'picked';
    }
    if (state.stage === 'escape' && dist < 70) return completeMission(state, game);
    return '';
  }
  return '';
}

function completeMission(state, game) {
  const m = currentMission(state);
  game.money += m.reward;
  game.score += m.reward;
  game.missionsDone = Math.min(MISSIONS.length, game.missionsDone + 1);
  game.toast(`Job done! +$${m.reward}`);
  game.saveProgress();
  if (state.index + 1 >= MISSIONS.length) {
    state.stage = 'finished';
    return 'finished';
  }
  state.index += 1;
  state.stage = 'go';
  state.hasPackage = false;
  state.enemiesLeft = 0;
  return 'done';
}

// Where the current mission's marker sits (bank for the heist pickup, safehouse after).
export function missionMarkerPos(state) {
  const m = currentMission(state);
  if (!m) return null;
  if (m.kind === 'heist' && state.stage === 'go') return pt(4, 4); // Solmar Bank
  return m.target;
}

export function missionBrief(state) {
  const m = currentMission(state);
  if (!m) return { title: 'All jobs done', brief: 'Solmar is yours, Milo. Free roam — the city, the cars, the cops.' };
  if (m.kind === 'heist' && state.stage === 'escape') {
    return { title: m.title, brief: 'Cash in hand. Get to the beach safehouse — lose the cops on the way if you can.' };
  }
  return { title: m.title, brief: m.brief };
}
