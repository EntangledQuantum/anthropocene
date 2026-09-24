import { useState } from 'react';
import { G_EARTH, surfaceNormal, surfaceTangent } from '../../lib/physics/dynamics.ts';
import { bankedRoad, idealBank } from '../../lib/physics/circular.ts';
import { add2, scale2 } from '../../lib/physics/vectors.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * A car going round a bend, seen from behind, and one control: the bank of
 * the road. The centre of the bend is off to the left.
 *
 * The magenta arrow is fixed by the turn: v²/R toward the centre. The road
 * has to supply it, through two amber arrows it controls — the normal force,
 * which tilts with the road, and friction along it, which is whatever is
 * left over. Tilt until the leftover is nothing and the normal force alone
 * turns the car. Physics: `bankedRoad` from circular.ts.
 */
export interface BankTheCurveProps {
  id?: string;
  prompt?: string;
  speed?: number;
  radius?: number;
  mass?: number;
  startDeg?: number;
  /** How far from the no-friction bank still counts, degrees. */
  tolerance?: number;
  explanation?: string;
}

const MAXDEG = 40;
const toDeg = (r: number) => (r * 180) / Math.PI;

export default function BankTheCurve({
  id, prompt, speed = 15, radius = 50, mass = 1200, startDeg = 0, tolerance = 0.8, explanation,
}: BankTheCurveProps) {
  const task = useTask(id, 'bank-the-curve');
  const [deg, setDeg] = useState(startDeg);
  const th = (deg * Math.PI) / 180;
  const road = { angleRad: th, muS: 0, muK: 0 };
  const t = surfaceTangent(road), n = surfaceNormal(road);
  const r = bankedRoad(mass, speed, radius, th);
  const ideal = toDeg(idealBank(speed, radius));
  const kF = 1.9 / (mass * G_EARTH);
  const fk = Math.abs(r.friction) / 1000;
  const way = r.friction < 0 ? 'down the slope, toward the centre' : 'up the slope, away from the centre';
  const hitNow = Math.abs(deg - ideal) <= tolerance;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Bank" value={deg.toFixed(1)} unit="°" />
          <Meter label="Friction the tyres must supply" value={fk.toFixed(2)} unit={fk < 0.005 ? 'kN' : `kN, ${r.friction < 0 ? 'down' : 'up'} the slope`} color={C.force} />
          <Meter label="Speed" value={speed.toFixed(0)} unit="m/s" color={C.velocity} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { deg })}
          miss={`At ${deg.toFixed(1)}° the tyres still have to grip with ${fk.toFixed(2)} kN, pointing ${way}.`} hit={explanation} />}
      </div>}>
      <Stage x={[-3, 3]} y={[-1.5, 2.5]} height={330} equal
        label={`Road banked at ${deg.toFixed(1)} degrees. Friction needed ${fk.toFixed(2)} kilonewtons ${way}.`}>
        {(s) => {
          const P = (v: Vec) => `${s.sx(v[0])},${s.sy(v[1])}`;
          const L = scale2(t, -2.6), Rr = scale2(t, 2.6);
          const c = scale2(n, 0.55);
          const acc: Vec = [-mass * r.accel * kF, 0];
          const base = scale2(t, -2.4);
          const fFrom = add2(scale2(t, 0.3 * Math.sign(r.friction || 1)), scale2(n, -0.1));
          const aFrom: Vec = [2.2, 2.1];
          return <>
            <polygon points={[P(L), P(Rr), P([Rr[0], -1.6]), P([L[0], -1.6])].join(' ')} fill={C.surface} stroke={C.rule} strokeWidth={2} />
            <line x1={s.sx(base[0])} y1={s.sy(base[1])} x2={s.sx(base[0] + 1.3)} y2={s.sy(base[1])} stroke={C.faint} strokeDasharray="5 4" />
            <text x={s.sx(base[0] + 0.1)} y={s.sy(base[1] - 0.28)} fontSize={14} fill={C.soft}>{deg.toFixed(1)}°</text>
            <text x={s.sx(-2.9)} y={s.sy(2.3)} fontSize={13} fill={C.faint}>← centre of the bend, {radius} m</text>
            {/* drawn before the car, so they emerge from it */}
            <Arrow s={s} from={c} to={add2(c, [0, -mass * G_EARTH * kF])} color={C.force} label="weight" labelSide={-1} />
            <Arrow s={s} from={[0, 0]} to={scale2(n, r.normal * kF)} color={C.force} label="normal" labelSide={-1} />
            <g transform={`rotate(${-deg},${s.sx(c[0])},${s.sy(c[1])})`}>
              <rect x={s.sx(c[0]) - s.len(0.9)} y={s.sy(c[1]) - s.len(0.3)} width={s.len(1.8)} height={s.len(0.55)} rx={10} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              <rect x={s.sx(c[0]) - s.len(0.6)} y={s.sy(c[1]) - s.len(0.72)} width={s.len(1.2)} height={s.len(0.45)} rx={10} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              {[-0.6, 0.6].map((dx) => <rect key={dx} x={s.sx(c[0] + dx) - s.len(0.14)} y={s.sy(c[1]) + s.len(0.2)} width={s.len(0.28)} height={s.len(0.35)} rx={3} fill={C.soft} />)}
            </g>
            <Arrow s={s} from={fFrom} to={add2(fFrom, scale2(t, r.friction * kF))} color={C.force} label={fk >= 0.005 ? 'friction' : undefined} />
            <Arrow s={s} from={aFrom} to={add2(aFrom, acc)} color={C.accel} width={4} dash="7 5" />
            <text x={s.sx(aFrom[0] + 0.12)} y={s.sy(aFrom[1]) + 5} fontSize={14} fontWeight={600} fill={C.accel}>a = {r.accel.toFixed(2)} m/s²</text>
            <Handle s={s} at={scale2(t, 2.1)} step={0.02} label="Outer edge of the road: drag up or down"
              onChange={(p) => {
                const d = Math.max(0, Math.min(MAXDEG, toDeg(Math.atan2(p[1], Math.max(p[0], 0.01)))));
                setDeg(Math.round(d * 10) / 10);
                task.touch();
              }} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}
