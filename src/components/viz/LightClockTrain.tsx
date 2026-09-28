import { useRef, useState } from 'react';
import { gamma, lightClockHalfTick, lightClockPhoton, zigzagLeg } from '../../lib/physics/relativity.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { LIGHT, SpeedStrip, fmtBeta, useFrame } from './relativity-kit-ch37.tsx';

/**
 * Two light clocks: one standing on the platform, one riding a train. Each
 * tick is a flash of light going up to a mirror and back. Seen from the
 * platform, the train's light runs a zig-zag, and the last leg is drawn as the
 * right triangle it is: gap up, v·t along, c·t slanted. The learner sets the
 * train's speed; the tick counters and the slant do the rest.
 *
 * Graded: make the platform count `ratio` ticks for each tick of the train clock.
 * Physics: `lightClockHalfTick`, `lightClockPhoton`, `zigzagLeg` in src/lib/physics/relativity.ts.
 */
export interface LightClockTrainProps {
  id?: string;
  prompt?: string;
  /** Platform ticks per train tick to aim for. */
  ratio?: number;
  tolerance?: number;
  explanation?: string;
}

/** Screen units: the mirror gap is 1 and light covers 1.6 of them per second. */
const GAP = 1, CS = 1.6;
const TF = 0.2, TC = TF + GAP;          // train mirrors (floor, ceiling)
const PF = 2.1, PC = PF + GAP, PX = 1.6; // platform clock mirrors and position
const CAR = 0.75;                        // half-width of the car

export default function LightClockTrain({ id, prompt, ratio = 2, tolerance = 0.05, explanation }: LightClockTrainProps) {
  const task = useTask(id, 'light-clock-train');
  const [beta, setBeta] = useState(0.4);
  const betaRef = useRef(beta);
  betaRef.current = beta;
  const run = useRef({ t: 0, tWrap: 0, shift: 0 });
  const xr = useRef<readonly [number, number]>([0, 10]);
  const el = useRef<Record<string, SVGElement | null>>({});
  const put = (k: string) => (n: SVGElement | null) => { el.current[k] = n; };
  const [shown, setShown] = useState({ plat: 0, train: 0 });
  const last = useRef(0);
  const sRef = useRef<{ sx: (x: number) => number; sy: (y: number) => number } | null>(null);

  const restart = (b: number) => { setBeta(b); run.current = { t: 0, tWrap: 0, shift: 0 }; task.touch(); };

  useFrame((dt, now) => {
    const s = sRef.current;
    if (!s) return;
    const r = run.current;
    const v = betaRef.current * CS;
    r.t += dt;
    const x0 = xr.current[0] + 1.2;
    const span = xr.current[1] - xr.current[0] + 2 * CAR + 0.4;
    const xAt = (t: number) => x0 + v * t - r.shift;
    if (xAt(r.t) > xr.current[1] + CAR + 0.2) { r.shift += span; r.tWrap = r.t; }

    const half = lightClockHalfTick(GAP, v, CS);
    const X = xAt(r.t);
    const set = (k: string, a: Record<string, string | number>) => { const n = el.current[k]; if (n) for (const [kk, vv] of Object.entries(a)) n.setAttribute(kk, String(vv)); };

    set('car', { transform: `translate(${s.sx(X) - s.sx(0)},0)` });
    const [, h] = lightClockPhoton(r.t, GAP, v, CS);
    set('photon', { cx: s.sx(X), cy: s.sy(TF + h) });
    const [, hp] = lightClockPhoton(r.t, GAP, 0, CS);
    set('pphoton', { cy: s.sy(PF + hp) });

    // the zig-zag since the last wrap, at most the last two ticks
    const t0 = Math.max(r.tWrap, r.t - 4 * half);
    const pts: string[] = [];
    const yAt = (t: number) => TF + lightClockPhoton(t, GAP, v, CS)[1];
    pts.push(`${s.sx(xAt(t0))},${s.sy(yAt(t0))}`);
    for (let k = Math.ceil(t0 / half); k * half < r.t; k++) pts.push(`${s.sx(xAt(k * half))},${s.sy(k % 2 ? TC : TF)}`);
    pts.push(`${s.sx(X)},${s.sy(TF + h)}`);
    set('trail', { points: pts.join(' ') });

    // the last complete leg as a right triangle
    const k = Math.floor(r.t / half);
    const showTri = k >= 1 && (k - 1) * half >= r.tWrap && betaRef.current > 0.05;
    set('tri', { opacity: showTri ? 1 : 0 });
    if (showTri) {
      const ya = (k - 1) % 2 ? TC : TF, yb = k % 2 ? TC : TF;
      const xa = xAt((k - 1) * half), xb = xAt(k * half);
      set('legUp', { x1: s.sx(xa), x2: s.sx(xa), y1: s.sy(ya), y2: s.sy(yb) });
      set('legAlong', { x1: s.sx(xa), x2: s.sx(xb), y1: s.sy(yb), y2: s.sy(yb) });
      set('lblUp', { x: s.sx(xa) - 8, y: s.sy((ya + yb) / 2) + 5 });
      set('lblAlong', { x: s.sx((xa + xb) / 2), y: s.sy(yb) + (yb > ya ? -8 : 18) });
      set('lblSlant', { x: s.sx((xa + xb) / 2) + 10, y: s.sy((ya + yb) / 2) + 4 });
    }

    const plat = Math.floor(r.t / (2 * lightClockHalfTick(GAP, 0, CS)));
    const train = Math.floor(r.t / (2 * half));
    const tc = el.current.trainCount;
    if (tc) { tc.textContent = `train clock: ${train} ticks`; tc.setAttribute('x', String(s.sx(X))); }
    const pc = el.current.platCount;
    if (pc) pc.textContent = `platform clock: ${plat} ticks`;
    if (now - last.current > 120) { last.current = now; setShown({ plat, train }); }
  });

  const g = gamma(beta);
  const leg = zigzagLeg(GAP, beta * CS, CS);
  const off = g - ratio;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <SpeedStrip beta={beta} onChange={restart} label="Train speed"
          scale={{ kind: 'linear', max: 0.99, ticks: [0, 0.2, 0.4, 0.6, 0.8, 0.99] }} />
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Train speed" value={fmtBeta(beta)} color={C.velocity} />
          <Meter label="Platform clock" value={String(shown.plat)} unit="ticks" />
          <Meter label="Train clock" value={String(shown.train)} unit="ticks" />
          <Meter label="Slant ÷ gap" value={(leg.slant / GAP).toFixed(2)} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(off) <= tolerance, { beta, gamma: g })}
          miss={`At ${fmtBeta(beta)} the platform counts ${g.toFixed(2)} ticks for each train tick: each slanted leg is ${g.toFixed(2)} times the mirror gap, ${off < 0 ? 'too short' : 'too long'}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[0, 10]} y={[-0.45, 3.35]} height={300} equal label={`A light clock on a train moving at ${fmtBeta(beta)}, and one on the platform`}>
        {(s) => {
          sRef.current = s;
          xr.current = s.x;
          return <g>
            {/* platform clock */}
            <rect x={s.sx(PX - 0.5)} y={s.sy(PF - 0.12)} width={s.len(1)} height={s.len(0.12) + 2} fill={C.surface} stroke={C.rule} />
            <line x1={s.sx(PX - 0.35)} x2={s.sx(PX + 0.35)} y1={s.sy(PF)} y2={s.sy(PF)} stroke={C.soft} strokeWidth={4} />
            <line x1={s.sx(PX - 0.35)} x2={s.sx(PX + 0.35)} y1={s.sy(PC)} y2={s.sy(PC)} stroke={C.soft} strokeWidth={4} />
            <line x1={s.sx(PX)} x2={s.sx(PX)} y1={s.sy(PF)} y2={s.sy(PC)} stroke={LIGHT} strokeOpacity={0.25} strokeDasharray="3 4" />
            <circle ref={put('pphoton')} cx={s.sx(PX)} cy={s.sy(PF)} r={6} fill={LIGHT} />
            <text ref={put('platCount')} x={s.sx(PX + 0.6)} y={s.sy(PC) + 5} fontSize={14} fill={C.soft}>platform clock: 0 ticks</text>
            <text x={s.sx(PX + 0.6)} y={s.sy(PC) + 25} fontSize={12.5} fill={C.faint}>at rest on the platform</text>

            {/* track */}
            <line x1={0} x2={s.W} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />

            {/* the zig-zag and its triangle */}
            <polyline ref={put('trail')} points="" fill="none" stroke={LIGHT} strokeWidth={2} strokeOpacity={0.7} />
            <g ref={put('tri')} opacity={0}>
              <line ref={put('legUp')} stroke={C.soft} strokeWidth={1.5} strokeDasharray="4 4" />
              <line ref={put('legAlong')} stroke={C.velocity} strokeWidth={2} strokeDasharray="4 4" />
              <text ref={put('lblUp')} textAnchor="end" fontSize={13} fill={C.soft}>L</text>
              <text ref={put('lblAlong')} textAnchor="middle" fontSize={13} fill={C.velocity}>v·t</text>
              <text ref={put('lblSlant')} fontSize={13} fill={LIGHT}>c·t</text>
            </g>

            {/* the train car with its clock, moved by transform */}
            <g ref={put('car')}>
              <rect x={s.sx(-CAR)} y={s.sy(TC + 0.22)} width={s.len(2 * CAR)} height={s.sy(0.06) - s.sy(TC + 0.22)} rx={6}
                fill="none" stroke={C.faint} strokeWidth={1.5} />
              <line x1={s.sx(-0.35)} x2={s.sx(0.35)} y1={s.sy(TF)} y2={s.sy(TF)} stroke={C.soft} strokeWidth={4} />
              <line x1={s.sx(-0.35)} x2={s.sx(0.35)} y1={s.sy(TC)} y2={s.sy(TC)} stroke={C.soft} strokeWidth={4} />
              <circle cx={s.sx(-0.45)} cy={s.sy(0.03)} r={5} fill="none" stroke={C.faint} />
              <circle cx={s.sx(0.45)} cy={s.sy(0.03)} r={5} fill="none" stroke={C.faint} />
            </g>
            <circle ref={put('photon')} r={6} fill={LIGHT} />
            <text ref={put('trainCount')} x={s.sx(0)} y={s.sy(TC + 0.22) - 8} textAnchor="middle" fontSize={14} fill={C.soft}>train clock: 0 ticks</text>
          </g>;
        }}
      </Stage>
    </SceneCard>
  );
}
