/**
 * Two small pieces shared by chapter 17's scenes (temperature and heat).
 *
 *   <Thermometer>  a glass thermometer in view pixels, with a scale and a
 *                  reading; `covered` hides the column behind a sleeve.
 *   useSim         a requestAnimationFrame loop that lives in refs. The
 *                  simulation advances every frame; React re-renders at most
 *                  ~10 times a second, and only while something changed.
 *                  Thermal processes are slow, so 10 Hz reads as smooth.
 *
 * Heat in transit is energy, so it is always drawn in `C.energy` (aqua).
 * Thermometer liquid is rose, used for nothing else in the chapter.
 */
import { useEffect, useRef, useState } from 'react';
import { C } from './scene.tsx';

export const HOT = 'var(--color-rose)';
export const HEAT = C.energy;

export function Thermometer({ x, y, h, T, lo, hi, step, label, covered, readout = true }: {
  /** View x of the tube, and view y of the bulb's centre. */
  x: number; y: number;
  /** Tube length in view px. */
  h: number;
  T: number; lo: number; hi: number;
  /** Scale tick spacing, °C. */
  step: number;
  label?: string;
  covered?: boolean;
  readout?: boolean;
}) {
  const top = y - 10 - h;
  const ty = (v: number) => y - 10 - ((v - lo) / (hi - lo)) * h;
  const col = ty(Math.max(lo, Math.min(hi, T)));
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  return <g>
    {label && <text x={x} y={top - 26} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>}
    {readout && <text x={x} y={top - 9} textAnchor="middle" fontSize={14} fontWeight={600}
      fill={covered ? C.faint : C.ink} fontFamily="var(--font-mono)">{covered ? '? °C' : `${T.toFixed(1)} °C`}</text>}
    <rect x={x - 5} y={top} width={10} height={h + 6} rx={5} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
    <circle cx={x} cy={y} r={9} fill={HOT} stroke={C.soft} strokeWidth={1.5} />
    {!covered && <rect x={x - 2.5} y={col} width={5} height={y - col} fill={HOT} />}
    {ticks.map((v) => <g key={v}>
      <line x1={x + 6} x2={x + 11} y1={ty(v)} y2={ty(v)} stroke={C.faint} />
      <text x={x + 14} y={ty(v) + 4} fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
    </g>)}
    {covered && <g>
      <rect x={x - 9} y={top - 2} width={18} height={h + 4} rx={4} fill={C.ghost} stroke={C.soft} />
      <text x={x} y={top + h / 2} textAnchor="middle" fontSize={11} fill={C.ink}
        transform={`rotate(-90 ${x} ${top + h / 2})`}>covered</text>
    </g>}
  </g>;
}

/**
 * Run `step(dt)` every animation frame. `step` returns true when it changed
 * something worth showing; the component then re-renders, throttled.
 */
export function useSim(step: (dt: number) => boolean, hz = 10) {
  const [, setFrame] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    let raf = 0, last = performance.now(), shown = 0, dirty = false;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (stepRef.current(dt)) dirty = true;
      if (dirty && now - shown > 1000 / hz) { shown = now; dirty = false; setFrame((n) => n + 1); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hz]);
}

/** A flame under a pot, drawn in view px. Lit or not. Rose, like the thermometers: it is hot, not a force. */
export function Burner({ x, y, w, on }: { x: number; y: number; w: number; on: boolean }) {
  const n = 5;
  return <g>
    <rect x={x - w / 2} y={y} width={w} height={8} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
    {on && Array.from({ length: n }, (_, i) => {
      const cx = x - w / 2 + (w * (i + 0.5)) / n;
      return <path key={i} d={`M${cx - 7},${y}Q${cx},${y - 26} ${cx + 7},${y}Z`} fill={HOT} opacity={0.55} stroke={HOT} />;
    })}
  </g>;
}
