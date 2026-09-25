import { useMemo, useRef, useState } from 'react';
import { NANO, rodField, tubeRods, type Rod } from '../../lib/physics/gauss.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { Arrow, C, Handle, Meter, SceneCard, Stage } from './scene.tsx';
import { POS, TubeLines, TubeRing } from './gauss-kit.tsx';

/**
 * A long plastic tube with charge spread evenly over its wall, seen end-on,
 * and a probe you drag in and out of it. The arrow is the field at the probe,
 * summed honestly over 360 rods round the wall (`tubeRods`, `rodField`).
 *
 * The strip keeps score of where you have been: field against distance from
 * the axis. The dashed curve is a single rod on the axis carrying the tube's
 * whole charge, and outside the wall your trace lands on it exactly.
 * Ungraded: this is the payoff for the opening bet.
 */
export interface ProbeTheTubeProps {
  prompt?: string;
  /** Charge on the tube, nC per metre. */
  lambda?: number;
  /** Tube radius, m. */
  radius?: number;
}

const RMAX = 1.8;
const EMAX = 120;

export default function ProbeTheTube({ prompt, lambda = 3, radius = 0.7 }: ProbeTheTubeProps) {
  const tube = useMemo(() => tubeRods(0, 0, radius, lambda * NANO), [lambda, radius]);
  const axis: Rod[] = useMemo(() => [{ x: 0, y: 0, q: lambda * NANO }], [lambda]);
  const [probe, setProbe] = useState<Vec2>([0.3, 0.2]);
  const trace = useRef(new Map<number, number>());

  const e = rodField(tube, probe[0], probe[1]);
  const eMag = Math.hypot(e[0], e[1]);
  const r = Math.hypot(probe[0], probe[1]);
  trace.current.set(Math.round(r * 50) / 50, eMag);
  const pts = [...trace.current.entries()].sort((a, b) => a[0] - b[0]);
  const PER = 0.008;

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        <Meter label="Distance from the axis" value={r.toFixed(2)} unit="m" />
        <Meter label="Field at the probe" value={eMag < 0.05 ? '0.0' : eMag.toFixed(1)} unit="N/C" color={C.field} />
      </div>}>
      <Stage x={[-2, 2]} y={[-1.15, 1.15]} height={300} equal
        label={`A charged tube seen end-on. The probe is ${r.toFixed(2)} m from the axis, field ${eMag.toFixed(1)} N/C.`}>
        {(s) => <>
          <TubeLines s={s} tube={tube} radius={radius} lambda={lambda} />
          <TubeRing s={s} radius={radius} />
          {eMag > 0.3 && <Arrow s={s} from={probe} to={[probe[0] + e[0] * PER, probe[1] + e[1] * PER]} color={C.field} width={4} />}
          <Handle s={s} at={probe} step={0.05} color={C.ink} label="Probe: drag it in and out of the tube"
            onChange={(p) => setProbe([Math.max(-1.9, Math.min(1.9, p[0])), Math.max(-1.1, Math.min(1.1, p[1]))])} />
        </>}
      </Stage>
      <Stage x={[0, RMAX]} y={[0, EMAX]} height={170} axes={{ x: 'distance from the axis (m)', y: 'field (N/C)', yTicks: [0, 40, 80, 120] }}
        label="Field against distance from the axis, where you have probed">
        {(p) => {
          const ghost: string[] = [];
          for (let x = 0.4; x <= RMAX; x += 0.02) ghost.push(`${ghost.length ? 'L' : 'M'}${p.sx(x).toFixed(1)},${p.sy(Math.min(EMAX, Math.hypot(...rodField(axis, x, 0)))).toFixed(1)}`);
          return <>
            <line x1={p.sx(radius)} x2={p.sx(radius)} y1={p.sy(0)} y2={p.sy(EMAX)} stroke={POS} strokeDasharray="3 4" />
            <text x={p.sx(radius) + 5} y={p.sy(EMAX) + 14} fontSize={12} fill={POS}>wall</text>
            <path d={ghost.join('')} fill="none" stroke={C.soft} strokeWidth={1.5} strokeDasharray="5 5" />
            {pts.map(([x, v]) => <circle key={x} cx={p.sx(x)} cy={p.sy(Math.min(EMAX, v))} r={2.6} fill={C.field} />)}
            <circle cx={p.sx(Math.min(RMAX, r))} cy={p.sy(Math.min(EMAX, eMag))} r={5} fill={C.field} />
            <text x={p.sx(RMAX) - 4} y={p.sy(EMAX) + 14} textAnchor="end" fontSize={12} fill={C.soft}>dashed: one rod on the axis with the tube's charge</text>
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        A plastic tube carrying {lambda} nC per metre, spread evenly round its wall, seen end-on · orchid: the field at the probe
      </p>
    </SceneCard>
  );
}
