// Save and load: progress (money, missions done, best score) lives in
// localStorage under one key, so a fresh browser tab keeps the player's story.
const SAVE_KEY = 'solmar-streets-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: Math.max(0, data.money | 0),
      missionsDone: Math.max(0, Math.min(5, data.missionsDone | 0)),
      bestScore: Math.max(0, data.bestScore | 0),
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money | 0,
      missionsDone: state.missionsDone | 0,
      bestScore: state.bestScore | 0,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}
