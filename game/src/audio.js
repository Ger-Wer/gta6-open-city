// Sound: everything is synthesized with WebAudio — engine hum, siren wail,
// gunshots, punches and cash blips. Nothing is loaded from a file, and the
// audio context only starts after a user gesture, as browsers require.
export function createAudio() {
  const audio = {
    ctx: null, master: null, engineOsc: null, engineGain: null,
    muted: false, started: false,
  };
  return audio;
}

export function ensureAudio(audio) {
  if (audio.started) {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.35;
    audio.master.connect(audio.ctx.destination);
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 50;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    audio.engineOsc.connect(filter);
    filter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.started = true;
  } catch {
    audio.started = false;
  }
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master && audio.ctx) audio.master.gain.value = muted ? 0 : 0.35;
}

function blip(audio, freq, dur, type, vol, slideTo) {
  if (!audio.ctx || audio.muted) return;
  try {
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* audio is decoration, never fatal */ }
}

function noise(audio, dur, vol, lowpass) {
  if (!audio.ctx || audio.muted) return;
  try {
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * dur);
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = audio.ctx.createGain();
    gain.gain.value = vol || 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t);
  } catch { /* audio is decoration, never fatal */ }
}

export function playShoot(audio) { noise(audio, 0.12, 0.3, 2400); blip(audio, 220, 0.08, 'square', 0.12, 60); }
export function playPunch(audio) { noise(audio, 0.08, 0.25, 500); }
export function playCash(audio) { blip(audio, 880, 0.1, 'sine', 0.22); setTimeout(() => blip(audio, 1320, 0.16, 'sine', 0.22), 90); }
export function playCrash(audio) { noise(audio, 0.25, 0.35, 700); }
export function playSirenBlip(audio) { blip(audio, 700, 0.18, 'sine', 0.1, 1100); }
export function playSteal(audio) { blip(audio, 300, 0.12, 'sawtooth', 0.16, 520); }

// Engine hum follows speed; the siren wails while the player is wanted.
// Fully guarded: some headless browsers lack the automation methods, and
// sound must never break the game loop.
export function updateEngineSound(audio, speed, wanted, time) {
  if (!audio.ctx || !audio.engineGain) return;
  try {
    const target = Math.min(0.12, Math.abs(speed) / 340 * 0.12);
    const gain = audio.engineGain.gain;
    if (gain && typeof gain.setTargetAtTime === 'function') gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
    else if (gain) gain.value = target;
    if (audio.engineOsc) {
      const freq = audio.engineOsc.frequency;
      const value = 50 + Math.abs(speed) * 0.35;
      if (freq && typeof freq.setTargetAtTime === 'function') freq.setTargetAtTime(value, audio.ctx.currentTime, 0.1);
      else if (freq) freq.value = value;
    }
    if (wanted > 0 && !audio.muted) {
      const phase = (time * 2.4) % 2;
      if (phase < 0.06) blip(audio, phase < 1 ? 660 : 520, 0.05, 'sine', 0.05);
    }
  } catch { /* audio is decoration, never fatal */ }
}
