import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cabs, drivenAmplitude, drivenPattern, drivenTravellers, stillPoints, travellerHeight, waveSpeed, type Cx, type Drive,
} from '../../lib/physics/waves.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A rope tied to a wall, its other end on a shaker that moves only 1 cm.
 * One control: the shaker's rate. At most rates the rope shivers at the
 * shaker's rhythm and goes nowhere. At a few rates it swings huge, in loops,
 * with points that never move.
 *
 * The rope shown is the settled motion y = Re[Y(x) e^{iωt}] of the damped,
 * driven rope (`drivenAmplitude` in waves.ts, which the tests check against
 * the marched rope). With `id`, the scene grades itself: find the rate that
 * makes `loops` loops. Once solved, the two travellers that add up to the
 * standing wave are drawn dashed.
 */
export interface DriveTheStringProps {
  id?: string;
  prompt?: string;
  length?: number;
  tension?: number;
  mu?: number;
  damping?: number;
  /** Shaker amplitude, m. */
  amp?: number;
  /** Starting rate, Hz. */
  start?: number;
  /** Graded: the number of loops to make. */
  loops?: number;
  explanation?: string;
}

const N = 160, F_MIN = 0.3, F_MAX = 3.5;

export default function DriveTheString({
  id, prompt, length = 4, tension = 16, mu = 0.25, damping = 0.3, amp = 0.01, start = 0.6, loops = 2, explanation,
}: DriveTheStringProps) {
  const task = useTask(id, 'drive-the-string');
  const [freq, setFreq] = useState(start);
  const speed = waveSpeed(tension, mu);
  const drive: Drive = { length, speed, damping, amp, freq };
  const pattern = drivenPattern(drive);
  const hit = pattern.resonant && pattern.n === loops;
  const showTravellers = task.done;

  const shape = useMemo(() => {
    const d: Drive = { length, speed, damping, amp, freq };
    const xs = Array.from({ length: N + 1 }, (_, i) => (i / N) * length);
    const Y: Cx[] = xs.map((x) => drivenAmplitude(d, x));
    const tr = xs.map((x) => drivenTravellers(d, x));
    return { xs, Y, tr, still: pattern.resonant ? stillPoints(d) : [] };
  }, [length, speed, damping, amp, freq, pattern.resonant]);

  const live = useRef(shape);
  live.current = shape;
  const f = useRef(freq);
  f.current = freq;
  const api = useRef<StageApi | null>(null);
  const els = useRef<{ rope?: SVGPolylineElement | null; right?: SVGPolylineElement | null; left?: SVGPolylineElement | null; shaker?: SVGRectElement | null }>({});

  // The loop lives in refs; React only hears about it when the rate changes.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000, s = api.current, sh = live.current, e = els.current, w = 2 * Math.PI * f.current;
      if (s) {
        const line = (h: (i: number) => number) => sh.xs.map((x, i) => `${s.sx(x).toFixed(1)},${s.sy(h(i)).toFixed(1)}`).join(' ');
        e.rope?.setAttribute('points', line((i) => sh.Y[i].re * Math.cos(w * t) - sh.Y[i].im * Math.sin(w * t)));
        e.right?.setAttribute('points', line((i) => travellerHeight(sh.tr[i].right, f.current, t)));
        e.left?.setAttribute('points', line((i) => travellerHeight(sh.tr[i].left, f.current, t)));
        e.shaker?.setAttribute('y', String(s.sy(amp * Math.cos(w * t)) - 14));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [amp]);

  const cm = (m: number) => (m * 100).toFixed(1);
  const miss = pattern.resonant
    ? `At ${freq.toFixed(2)} Hz the rope swings in ${pattern.n} loop${pattern.n > 1 ? 's' : ''}, ${cm(pattern.swing)} cm at its widest.`
    : `At ${freq.toFixed(2)} Hz the widest swing is ${cm(pattern.swing)} cm, next to the shaker's ${cm(amp)} cm: the rope is fighting it.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 240px' }}>
            <span className="hud-label">Shaker rate</span>
            <input type="range" className="anth-slider" min={F_MIN} max={F_MAX} step={0.01} value={freq} aria-label="Shaker rate in hertz"
              onChange={(e) => { setFreq(+e.target.value); task.touch(); }} />
          </label>
          <span style={{ display: 'flex', gap: 22 }}>
            <Meter label="Shaker rate" value={freq.toFixed(2)} unit="Hz" color={C.force} />
            <Meter label="Widest swing" value={cm(pattern.swing)} unit="cm" color={C.position} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { freq })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.45, length + 0.25]} y={[-0.2, 0.2]} height={250}
        label={`A ${length} metre rope shaken at ${freq.toFixed(2)} hertz. Widest swing ${cm(pattern.swing)} centimetres.`}>
        {(s) => {
          api.current = s;
          const env = shape.xs.map((x, i) => `${s.sx(x).toFixed(1)},${s.sy(cabs(shape.Y[i])).toFixed(1)}`);
          const envLo = shape.xs.map((x, i) => `${s.sx(x).toFixed(1)},${s.sy(-cabs(shape.Y[i])).toFixed(1)}`).reverse();
          return <>
            {/* the blur a fast-moving rope leaves */}
            <polygon points={[...env, ...envLo].join(' ')} fill={C.position} opacity={0.12} />
            {/* the wall and the shaker */}
            <line x1={s.sx(length)} x2={s.sx(length)} y1={s.sy(-0.18)} y2={s.sy(0.18)} stroke={C.soft} strokeWidth={4} />
            <rect x={s.sx(-0.4)} y={s.sy(-0.02)} width={s.sx(-0.02) - s.sx(-0.4)} height={s.sy(-0.2) - s.sy(-0.02)} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
            <rect ref={(el) => { els.current.shaker = el; }} x={s.sx(-0.1)} y={s.sy(0) - 14} width={s.sx(0) - s.sx(-0.1)} height={28} rx={3}
              fill={C.surface} stroke={C.force} strokeWidth={2} />
            {showTravellers && <>
              <polyline ref={(el) => { els.current.right = el; }} fill="none" stroke={C.velocity} strokeWidth={1.5} strokeDasharray="6 5" opacity={0.8} />
              <polyline ref={(el) => { els.current.left = el; }} fill="none" stroke={C.accel} strokeWidth={1.5} strokeDasharray="6 5" opacity={0.8} />
            </>}
            <polyline ref={(el) => { els.current.rope = el; }} fill="none" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
            {shape.still.map((x) => (
              <g key={x}>
                <circle cx={s.sx(x)} cy={s.sy(0)} r={5} fill={C.ok} />
                <text x={s.sx(x)} y={s.sy(-0.17)} textAnchor="middle" fontSize={12} fill={C.ok}>still</text>
              </g>
            ))}
            {/* scales: the picture is stretched upward, so both are shown */}
            <line x1={s.sx(0.2)} x2={s.sx(1.2)} y1={s.sy(-0.185)} y2={s.sy(-0.185)} stroke={C.faint} strokeWidth={1.2} />
            <text x={s.sx(0.7)} y={s.sy(-0.185) - 5} textAnchor="middle" fontSize={12} fill={C.faint}>1 m</text>
            <line x1={s.sx(length + 0.12)} x2={s.sx(length + 0.12)} y1={s.sy(0.05)} y2={s.sy(0.15)} stroke={C.faint} strokeWidth={1.2} />
            <text x={s.sx(length + 0.12) - 6} y={s.sy(0.1) + 4} textAnchor="end" fontSize={12} fill={C.faint}>10 cm</text>
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Rope {length} m, {tension} N, {mu} kg/m · shown once it settles · heights stretched for visibility
        {showTravellers && ' · dashed: the wave going out (cyan) and the wave coming back (magenta)'}
      </p>
    </SceneCard>
  );
}
