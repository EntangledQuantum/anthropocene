/**
 * Chapter 43's box of nuclei: a sealed box of identical radioactive nuclei,
 * laid out on a jittered grid so each one can be watched. A live nucleus is
 * a filled iris dot; a decayed one is a hollow grey ring, and for a moment
 * after it decays an aqua flash shows the energy it threw out.
 *
 * Shared by DecayBox and LoadTheCoin, so both lessons' steps show the same
 * box. Updates go straight to the DOM through refs (see `paintBox`); React
 * never re-renders per frame.
 */
import { mulberry32 } from '../../lib/physics/nuclear.ts';
import { C } from './scene.tsx';

export const LIVE = 'var(--color-iris)';
export const DEAD = 'var(--color-ink-ghost)';

export interface BoxGeom { x: number; y: number; size: number }

/** Jittered grid positions for n nuclei inside a square box. */
export function boxLayout(n: number, box: BoxGeom, seed = 4343): [number, number][] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = (box.size - 20) / Math.max(cols, rows);
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    return [
      box.x + 10 + (cx + 0.5 + (rnd() - 0.5) * 0.45) * cell,
      box.y + 10 + (cy + 0.5 + (rnd() - 0.5) * 0.45) * cell,
    ];
  });
}

export function BoxFrame({ box, label }: { box: BoxGeom; label: string }) {
  return <g>
    <rect x={box.x} y={box.y} width={box.size} height={box.size} rx={6} fill="var(--color-raised)" stroke={C.rule} strokeWidth={2} />
    <text x={box.x + 4} y={box.y + box.size + 18} fontSize={12} fill={C.faint}>{label}</text>
  </g>;
}

/**
 * Paint every nucleus for the moment `now` (in the same units as `decayedAt`).
 * `dots[i]` is the nucleus, `flashes[i]` its decay flash.
 */
export function paintBox(
  dots: (SVGCircleElement | null)[], flashes: (SVGCircleElement | null)[],
  decayedAt: number[], now: number, flashFor: number, r: number,
) {
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i], fl = flashes[i];
    if (!d) continue;
    const gone = decayedAt[i] <= now;
    d.setAttribute('fill', gone ? 'transparent' : LIVE);
    d.setAttribute('stroke', gone ? DEAD : LIVE);
    if (fl) {
      const age = now - decayedAt[i];
      if (gone && age < flashFor) {
        const k = age / flashFor;
        fl.setAttribute('r', String(r + 9 * k));
        fl.setAttribute('opacity', String(1 - k));
      } else fl.setAttribute('opacity', '0');
    }
  }
}
