/**
 * Minimal sound design system for Boardroom Simulator.
 * Uses Web Audio API — no external dependencies.
 * All sounds are synthesized (no audio files needed).
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let ambientGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let ambientOsc: OscillatorNode | null = null;
let ambientPlaying = false;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);

    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0.15;
    ambientGain.connect(masterGain);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  gainVal = 0.3,
  dest?: GainNode
) {
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(gainVal, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(dest ?? sfxGain!);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

// ── Public API ──────────────────────────────────────────────

export const Sound = {
  /** Start low ambient boardroom hum */
  startAmbient() {
    if (ambientPlaying) return;
    const ctx = getContext();
    ambientOsc = ctx.createOscillator();
    ambientOsc.type = "sine";
    ambientOsc.frequency.value = 55; // low A hum
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(ambientOsc.frequency);
    ambientOsc.connect(ambientGain!);
    ambientOsc.start();
    lfo.start();
    ambientPlaying = true;
  },

  stopAmbient() {
    if (!ambientPlaying) return;
    ambientOsc?.stop();
    ambientOsc = null;
    ambientPlaying = false;
  },

  /** A new turn begins — short chime */
  turnStart() {
    playTone(660, 0.12, "sine", 0.2);
    setTimeout(() => playTone(880, 0.15, "sine", 0.15), 80);
  },

  /** Coalition formed — rising interval */
  coalitionFormed() {
    playTone(523, 0.2, "triangle", 0.25);
    setTimeout(() => playTone(659, 0.25, "triangle", 0.2), 120);
    setTimeout(() => playTone(784, 0.3, "triangle", 0.15), 240);
  },

  /** Challenge / escalation — short buzz */
  challenge() {
    playTone(150, 0.15, "sawtooth", 0.15);
  },

  /** Compromise / agreement — pleasant chord */
  compromise() {
    playTone(392, 0.3, "sine", 0.2);
    setTimeout(() => playTone(523, 0.4, "sine", 0.15), 100);
  },

  /** Simulation ends — final chord */
  simulationEnd() {
    playTone(262, 0.5, "sine", 0.25);
    setTimeout(() => playTone(330, 0.5, "sine", 0.2), 150);
    setTimeout(() => playTone(392, 0.6, "sine", 0.15), 300);
    setTimeout(() => playTone(523, 0.8, "sine", 0.1), 450);
  },

  /** Error / alert */
  alert() {
    playTone(220, 0.15, "square", 0.2);
    setTimeout(() => playTone(180, 0.2, "square", 0.15), 150);
  },

  /** Toggle mute */
  setMuted(muted: boolean) {
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.3;
  },

  /** Set volume 0-1 */
  setVolume(v: number) {
    if (masterGain) masterGain.gain.value = v * 0.3;
  },
};
