/**
 * Chapter 37's small shared pieces: a frame loop that lives in refs, and the
 * one speed control the light clock and the muon scenes use.
 */
import { useEffect, useRef } from 'react';
import { C, Handle, Stage } from './scene.tsx';

/** Light is drawn in ink across the path's optics chapters. */
export const LIGHT = 'var(--color-ink)';

/** requestAnimationFrame loop; the callback lives in a ref so React never re-runs the effect. */
export function useFrame(cb: (dt: number, now: number) => void) {
  const f = useRef(cb);
  f.current = cb;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      f.current(dt, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export type SpeedScale =
  | { kind: 'linear'; max: number; ticks: number[] }
  | { kind: 'log'; lo: number; hi: number; ticks: number[] };

const toFrac = (b: number, sc: SpeedScale) => sc.kind === 'linear'
  ? b / sc.max
  : (Math.log10(1 - b) - Math.log10(1 - sc.lo)) / (Math.log10(1 - sc.hi) - Math.log10(1 - sc.lo));
const fromFrac = (f: number, sc: SpeedScale) => sc.kind === 'linear'
  ? f * sc.max
  : 1 - 10 ** (Math.log10(1 - sc.lo) + f * (Math.log10(1 - sc.hi) - Math.log10(1 - sc.lo)));

const tickLabel = (b: number) => (b === 0 ? '0' : `${+b.toFixed(4)}c`);

/** A horizontal speed bar in units of c, with one draggable marker. */
export function SpeedStrip({ beta, onChange, scale, label, disabled }: {
  beta: number; onChange: (b: number) => void; scale: SpeedScale; label: string; disabled?: boolean;
}) {
  const f = Math.min(1, Math.max(0, toFrac(beta, scale)));
  return (
    <div style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : undefined }}>
      <Stage x={[-0.04, 1.04]} y={[-1, 1]} height={62} label={label}>
        {(s) => <g>
          <line x1={s.sx(0)} x2={s.sx(1)} y1={s.sy(0.25)} y2={s.sy(0.25)} stroke={C.rule} strokeWidth={3} strokeLinecap="round" />
          <line x1={s.sx(0)} x2={s.sx(f)} y1={s.sy(0.25)} y2={s.sy(0.25)} stroke={C.velocity} strokeWidth={3} strokeLinecap="round" />
          {scale.ticks.map((b) => {
            const x = s.sx(toFrac(b, scale));
            return <g key={b}>
              <line x1={x} x2={x} y1={s.sy(0.25) + 5} y2={s.sy(0.25) + 11} stroke={C.faint} />
              <text x={x} y={s.sy(0.25) + 26} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{tickLabel(b)}</text>
            </g>;
          })}
          <text x={s.sx(0)} y={s.sy(0.25) - 14} fontSize={13} fill={C.soft}>{label}</text>
          <Handle s={s} at={[f, 0.25]} color={C.velocity} step={scale.kind === 'linear' ? 0.005 : 0.0025} label={label}
            clamp={(p) => [Math.min(1, Math.max(0, p[0])), 0.25]}
            onChange={(p) => onChange(fromFrac(p[0], scale))} />
        </g>}
      </Stage>
    </div>
  );
}

/** β to a readable string: 0.866c, 0.99904c. */
export function fmtBeta(b: number): string {
  if (b < 0.99) return `${b.toFixed(3)}c`;
  if (b < 0.9999) return `${b.toFixed(5)}c`;
  return `${b.toFixed(6)}c`;
}

/** A signed number with a true minus sign and no negative zero. */
export function fmtSigned(v: number, digits = 2): string {
  const t = Math.abs(v).toFixed(digits);
  return v < 0 && Number(t) !== 0 ? `−${t}` : t;
}
