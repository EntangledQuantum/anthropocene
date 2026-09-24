import { useEffect, useRef, useState } from 'react';
import { G_EARTH, surfaceNormal, surfaceTangent } from '../../lib/physics/dynamics.ts';
import { glideAngle, ramp, readBlock, slideStep, slipAngle, type SlideState } from '../../lib/physics/friction.ts';
import { add2, scale2 } from '../../lib/physics/vectors.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * A block on a plank, and one control: the plank's raised end.
 *
 * As the plank rises, friction (amber, up the slope) grows to match the pull
 * of gravity along it, while its limit (dashed) shrinks because the normal
 * force shrinks. Where the two meet, the block goes. The view follows the
 * block, so once it slides it can slide for as long as you like, and the
 * magenta acceleration arrow says whether it is still speeding up.
 *
 * `masses` with two entries puts two blocks side by side on one plank.
 * With `id` and `goal`, the scene grades itself:
 *   goal 'hold'  — the steepest angle at which the block still rests;
 *   goal 'glide' — an angle at which the SLIDING block stops speeding up.
 * Physics: `readBlock` / `slideStep` from friction.ts.
 */
export interface TiltUntilSlipProps {
  id?: string;
  prompt?: string;
  masses?: number[];
  muS?: number;
  muK?: number;
  startDeg?: number;
  goal?: 'hold' | 'glide';
  explanation?: string;
}

const DT = 1 / 240;
const MAXDEG = 45;
const HATCH = 0.35;
const R_HANDLE = 2.4;
const toDeg = (r: number) => (r * 180) / Math.PI;

export default function TiltUntilSlip({
  id, prompt, masses = [2], muS = 0.6, muK = 0.4, startDeg = 12, goal, explanation,
}: TiltUntilSlipProps) {
  const graded = Boolean(id && goal);
  const task = useTask(graded ? id : undefined, 'tilt-until-slip');
  const states = useRef<SlideState[]>(masses.map(() => ({ s: 0, v: 0 })));
  const degRef = useRef(startDeg);
  const hatch = useRef<SVGGElement>(null);
  const ppm = useRef(1);
  const brokeAt = useRef<number | null>(null);
  const [deg, setDegState] = useState(startDeg);
  const [shown, setShown] = useState({ v: 0, a: 0, ds: [0, 0], broke: null as number | null });

  const reset = () => {
    states.current = masses.map(() => ({ s: 0, v: 0 }));
    brokeAt.current = null;
    degRef.current = startDeg;
    setDegState(startDeg);
    setShown({ v: 0, a: 0, ds: [0, 0], broke: null });
  };
  useEffect(reset, [masses.join(','), muS, muK, startDeg]);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const surf = ramp(degRef.current, muS, muK);
      let a0 = 0;
      for (let k = 0; k < Math.round(dt / DT); k++) {
        states.current.forEach((st, i) => {
          const still = st.v === 0;
          const r = slideStep(st, masses[i], surf, 0, DT);
          if (i === 0) a0 = r.accel;
          if (still && st.v !== 0 && brokeAt.current === null) brokeAt.current = degRef.current;
        });
      }
      const s0 = states.current[0].s;
      const off = ((s0 % HATCH) + HATCH) % HATCH;
      const th = (degRef.current * Math.PI) / 180;
      hatch.current?.setAttribute('transform', `translate(${-off * Math.cos(th) * ppm.current},${off * Math.sin(th) * ppm.current})`);
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ v: states.current[0].v, a: a0, ds: states.current.map((st) => st.s - s0), broke: brokeAt.current });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [masses.join(','), muS, muK]);

  const surf = ramp(deg, muS, muK);
  const t = surfaceTangent(surf), n = surfaceNormal(surf);
  const reads = masses.map((m, i) => readBlock(m, surf, 0, states.current[i]?.v ?? 0));
  const sliding = shown.v !== 0 || !reads[0].stuck;
  const kF = 1.1 / (Math.max(...masses) * G_EARTH);
  const home = masses.length > 1 ? [0.6, -0.65] : [0];
  const sides = masses.map((m) => 0.55 * Math.cbrt(m / masses[0]));
  const one = masses.length === 1;
  const slipDeg = toDeg(slipAngle(muS)), glideDeg = toDeg(glideAngle(muK));

  const hit = goal === 'hold'
    ? !sliding && deg >= slipDeg - 1.5
    : goal === 'glide' ? sliding && Math.abs(deg - glideDeg) <= 0.75 : false;
  const r0 = reads[0];
  const miss = goal === 'hold'
    ? sliding
      ? `It broke free at ${(shown.broke ?? deg).toFixed(1)}° and is sliding. Start over and stop short of that.`
      : `At ${deg.toFixed(1)}° friction is ${r0.friction.toFixed(1)} N of a possible ${r0.ceiling.toFixed(1)} N. There is room to tilt further.`
    : !sliding
      ? shown.broke === null
        ? `At ${deg.toFixed(1)}° the block is still resting. Get it sliding first.`
        : `At ${deg.toFixed(1)}° it slowed and stopped: static friction holds it again. Raise the plank to restart it.`
      : `Sliding at ${deg.toFixed(1)}°, its speed ${shown.a < 0 ? 'grows' : 'falls'} by ${Math.abs(shown.a).toFixed(2)} m/s every second.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Plank angle" value={deg.toFixed(1)} unit="°" />
          <Meter label="Friction" value={`${Math.abs(r0.friction).toFixed(1)}`} unit={sliding ? 'N, sliding' : `N of ${r0.ceiling.toFixed(1)}`} color={C.force} />
          <Meter label="Speed" value={Math.abs(shown.v).toFixed(2)} unit="m/s" color={C.velocity} />
          <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }} onClick={() => { reset(); task.touch(); }}>Start over</button>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { deg, sliding })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-2.6, 2.6]} y={[-1.45, 2.05]} height={330} equal
        label={`Plank at ${deg.toFixed(1)} degrees. ${sliding ? 'The block is sliding.' : 'The block is resting.'}`}>
        {(s) => {
          ppm.current = s.len(1);
          const P = (v: Vec): string => `${s.sx(v[0])},${s.sy(v[1])}`;
          const base = scale2(t, -1.9);
          const arc = 0.7;
          const blocks = masses.map((m, i) => {
            const side = sides[i];
            const foot = scale2(t, home[i] + (shown.ds[i] ?? 0));
            return { m, r: reads[i], side, foot, c: add2(foot, scale2(n, side / 2)), grip: add2(foot, scale2(n, -0.07)) };
          });
          return <>
            <polygon points={[P(scale2(t, -3.6)), P(scale2(t, 3.6)), P(add2(scale2(t, 3.6), scale2(n, -0.14))), P(add2(scale2(t, -3.6), scale2(n, -0.14)))].join(' ')}
              fill={C.surface} stroke={C.rule} strokeWidth={2} />
            <g ref={hatch}>
              {Array.from({ length: 24 }, (_, i) => -4.2 + i * HATCH).map((d) => {
                const a = add2(scale2(t, d), scale2(n, -0.02)), b = add2(scale2(t, d - 0.1), scale2(n, -0.13));
                return <line key={d} x1={s.sx(a[0])} y1={s.sy(a[1])} x2={s.sx(b[0])} y2={s.sy(b[1])} stroke={C.grid} strokeWidth={1.5} />;
              })}
            </g>
            <line x1={s.sx(base[0])} y1={s.sy(base[1])} x2={s.sx(base[0] + 1.6)} y2={s.sy(base[1])} stroke={C.faint} strokeDasharray="5 4" />
            <path d={`M${s.sx(base[0] + arc)},${s.sy(base[1])} A${s.len(arc)},${s.len(arc)} 0 0 0 ${P(add2(base, scale2(t, arc)))}`} fill="none" stroke={C.soft} strokeWidth={1.5} />
            <text x={s.sx(base[0] + 0.05)} y={s.sy(base[1] - 0.28)} fontSize={14} fill={C.soft}>{deg.toFixed(1)}°</text>
            {/* arrows that start inside a block are drawn first, so they emerge from it */}
            {blocks.map(({ m, foot, c, r }, i) => <g key={`in${i}`}>
              <Arrow s={s} from={c} to={add2(c, [0, -m * G_EARTH * kF])} color={C.force} label={one ? `weight ${(m * G_EARTH).toFixed(1)} N` : undefined} labelSide={-1} />
              <Arrow s={s} from={foot} to={add2(foot, scale2(n, r.normal * kF))} color={C.force} label={one ? `normal ${r.normal.toFixed(1)} N` : undefined} />
            </g>)}
            {blocks.map(({ m, side, c }, i) => <g key={`b${i}`}>
              <rect x={s.sx(c[0]) - s.len(side) / 2} y={s.sy(c[1]) - s.len(side) / 2} width={s.len(side)} height={s.len(side)} rx={4}
                fill={C.surface} stroke={C.soft} strokeWidth={2} transform={`rotate(${-deg},${s.sx(c[0])},${s.sy(c[1])})`} />
              <text x={s.sx(c[0])} y={s.sy(c[1]) + 5} textAnchor="middle" fontSize={13} fill={C.soft}>{m} kg</text>
            </g>)}
            {blocks.map(({ r, grip }, i) => <g key={`f${i}`}>
              {r.stuck && <Arrow s={s} from={grip} to={add2(grip, scale2(t, r.ceiling * kF))} color={C.force} width={1.5} dash="4 4" />}
              <Arrow s={s} from={grip} to={add2(grip, scale2(t, r.friction * kF))} color={C.force} label={one ? `friction ${Math.abs(r.friction).toFixed(1)} N` : undefined} />
            </g>)}
            {one && r0.stuck && <text x={s.sx(add2(blocks[0].grip, scale2(t, r0.ceiling * kF))[0]) + 6} y={s.sy(add2(blocks[0].grip, scale2(t, r0.ceiling * kF))[1]) - 8} fontSize={12} fill={C.faint}>grip limit</text>}
            {sliding && Math.abs(shown.a) > 0.02 && (() => {
              const c = add2(scale2(t, home[0] - 0.25), scale2(n, sides[0] + 0.35));
              return <Arrow s={s} from={c} to={add2(c, scale2(t, shown.a * 0.4))} color={C.accel} width={4} dash="7 5" label={`a = ${Math.abs(shown.a).toFixed(2)} m/s²`} />;
            })()}
            <Handle s={s} at={scale2(t, R_HANDLE)} step={0.02} label="Raised end of the plank: drag up or down"
              onChange={(p) => {
                const d = Math.max(0, Math.min(MAXDEG, toDeg(Math.atan2(p[1], Math.max(p[0], 0.01)))));
                const v = Math.round(d * 10) / 10;
                degRef.current = v;
                setDegState(v);
                task.touch();
              }} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}
