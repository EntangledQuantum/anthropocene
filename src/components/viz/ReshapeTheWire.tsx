import { useState } from 'react';
import { METALS, resistance, wireArea } from '../../lib/physics/current.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { Dial } from './circuit-kit-ch25.tsx';

/**
 * A nichrome heating element strung between two posts on a 12 V supply.
 * Two handles: drag the right clamp to change its length, and drag the top
 * edge of the wire to change its thickness. The ammeter and the glow follow.
 * Reach the target current and check.
 *
 * Many shapes work: every one with the same L/A. That is R = ρL/A arriving
 * from the learner's hands. Graded with `id`: resistance within `tolerance`
 * (a fraction) of V/target. Physics: `resistance`, `wireArea` in current.ts.
 */
export interface ReshapeTheWireProps {
  id?: string;
  prompt?: string;
  volts?: number;
  /** Target current, A. */
  target?: number;
  /** Starting length, m, and diameter, mm. */
  L0?: number;
  d0?: number;
  tolerance?: number;
  explanation?: string;
}

const L_MIN = 0.1, L_MAX = 1.5, D_MIN = 0.1, D_MAX = 1.0;
const PX_PER_MM = 56;           // drawn diameter, px per mm of real diameter
const WY = 0.3;                 // world y of the wire's axis

export default function ReshapeTheWire({
  id, prompt, volts = 12, target = 2, L0 = 0.5, d0 = 0.25, tolerance = 0.04, explanation,
}: ReshapeTheWireProps) {
  const task = useTask(id, 'reshape-the-wire');
  const [L, setL] = useState(L0);
  const [d, setD] = useState(d0);
  const rho = METALS.nichrome.rho;
  const R = resistance(rho, L, wireArea(d / 1000));
  const I = volts / R;
  const P = volts * I;
  const want = volts / target;
  const ok = Math.abs(R - want) / want <= tolerance;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Length" value={L.toFixed(2)} unit="m" />
          <Meter label="Diameter" value={d.toFixed(2)} unit="mm" />
          <Meter label="Resistance" value={R.toFixed(2)} unit="Ω" />
          <Meter label="Current" value={I.toFixed(2)} unit="A" />
        </span>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { L, d })}
          miss={`The element is ${R.toFixed(2)} Ω, so ${I.toFixed(2)} A flows: ${I < target ? `${(target - I).toFixed(2)} A short of` : `${(I - target).toFixed(2)} A over`} the ${target} A it is built for.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.2, 1.7]} y={[-1, 1]} height={260}
        label={`A nichrome wire ${L.toFixed(2)} metres long and ${d.toFixed(2)} millimetres thick, carrying ${I.toFixed(2)} amps from ${volts} volts.`}>
        {(s) => {
          const perPx = (s.sy(0) - s.sy(1));             // view px per world unit of y
          const half = (d * PX_PER_MM) / 2;
          const yTop = WY + half / perPx;
          const glow = Math.min(1, P / (volts * target * 2));
          return <>
            {/* leads down to the supply, with the ammeter in the right-hand lead */}
            <path d={`M${s.sx(-0.06)},${s.sy(WY)} L${s.sx(-0.12)},${s.sy(WY)} L${s.sx(-0.12)},${s.sy(-0.62)} L${s.sx(0.55)},${s.sy(-0.62)}
              M${s.sx(0.85)},${s.sy(-0.62)} L${s.sx(1.05)},${s.sy(-0.62)} M${s.sx(1.35)},${s.sy(-0.62)} L${s.sx(L + 0.06)},${s.sy(-0.62)} L${s.sx(L + 0.06)},${s.sy(WY)}`}
              fill="none" stroke={C.soft} strokeWidth={1.8} />
            <rect x={s.sx(0.55)} y={s.sy(-0.45)} width={s.sx(0.85) - s.sx(0.55)} height={s.sy(-0.8) - s.sy(-0.45)} rx={6}
              fill={C.surface} stroke={C.ink} strokeWidth={1.5} />
            <text x={s.sx(0.7)} y={s.sy(-0.62) + 5} textAnchor="middle" fontSize={14} fill={C.ink} fontFamily="var(--font-mono)">{volts} V</text>
            <Dial cx={s.sx(1.2)} cy={s.sy(-0.62) - 8} value={I} max={target * 2} unit="A" />
            <text x={s.sx(1.2) + 48} y={s.sy(-0.62) - 30} fontSize={12} fill={C.faint}>target {target} A</text>
            {/* a metre rule under the element */}
            <line x1={s.sx(0)} x2={s.sx(1.5)} y1={s.sy(-0.2)} y2={s.sy(-0.2)} stroke={C.faint} />
            {[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5].map((m) => <g key={m}>
              <line x1={s.sx(m)} x2={s.sx(m)} y1={s.sy(-0.2)} y2={s.sy(-0.2) + (m % 0.5 ? 4 : 8)} stroke={C.faint} />
              {m % 0.5 === 0 && <text x={s.sx(m)} y={s.sy(-0.2) + 20} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{m} m</text>}
            </g>)}
            {/* posts */}
            <rect x={s.sx(-0.06) - 8} y={s.sy(WY) - 26} width={16} height={52} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={1.5} />
            <rect x={s.sx(L + 0.06) - 8} y={s.sy(WY) - 26} width={16} height={52} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={1.5} />
            {/* the element: glow, then metal */}
            {glow > 0.01 && <rect x={s.sx(-0.02)} y={s.sy(WY) - half - 8} width={s.sx(L + 0.02) - s.sx(-0.02)} height={2 * half + 16} rx={half + 8}
              fill="var(--color-rose)" opacity={0.08 + 0.4 * glow} />}
            <rect x={s.sx(-0.06)} y={s.sy(WY) - half} width={s.sx(L + 0.06) - s.sx(-0.06)} height={2 * half}
              fill={C.faint} stroke={C.ink} strokeWidth={1} />
            <text x={s.sx(L / 2) + 16} y={s.sy(yTop) - 12} fontSize={13} fill={C.soft}>{d.toFixed(2)} mm across</text>
            <Handle s={s} at={[L + 0.06, WY]} step={0.01} label="Length: drag the right-hand clamp"
              onChange={(p: Vec) => { setL(Math.round(Math.max(L_MIN, Math.min(L_MAX, p[0] - 0.06)) * 100) / 100); task.touch(); }} />
            <Handle s={s} at={[L / 2, yTop]} step={0.01 * PX_PER_MM / 2 / perPx} label="Thickness: drag the top edge of the wire"
              onChange={(p: Vec) => { setD(Math.round(Math.max(D_MIN, Math.min(D_MAX, ((p[1] - WY) * perPx * 2) / PX_PER_MM)) * 100) / 100); task.touch(); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Nichrome, ρ = {(rho * 1e6).toFixed(2)} × 10⁻⁶ Ω·m · thickness drawn {Math.round(PX_PER_MM / ((640 - 24) / 1.9 / 1000) / 10) * 10}× life size · the glow is the power, {P.toFixed(0)} W
      </p>
    </SceneCard>
  );
}
