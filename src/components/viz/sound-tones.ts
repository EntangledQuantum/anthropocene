/**
 * A few sine tones through the Web Audio API, for the chapter 16 scenes.
 *
 * Sound is optional everywhere it is used: every graded decision can be made
 * with the speaker muted, from what the scene shows. Audio starts only from a
 * click (browsers require a gesture) and is always off by default.
 */
export interface Tones {
  /** Set each tone's frequency (Hz) and the shared loudness, 0 to 1. */
  set: (freqs: number[], gain: number) => void;
  stop: () => void;
}

export function startTones(count: number): Tones | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  const oscs = Array.from({ length: count }, () => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.connect(master);
    o.start();
    return o;
  });
  return {
    set(freqs, gain) {
      const now = ctx.currentTime;
      freqs.forEach((f, i) => oscs[i]?.frequency.setTargetAtTime(f, now, 0.02));
      // Keep it gentle: two summed tones peak at twice this.
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, gain)) * 0.12, now, 0.04);
    },
    stop() {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => { oscs.forEach((o) => o.stop()); void ctx.close(); }, 150);
    },
  };
}
