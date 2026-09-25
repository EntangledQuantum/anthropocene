import { useState } from 'react';
import { MATERIALS, SKIN_T, contactFlux, effusivity, feltTemperature } from '../../lib/physics/heat.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { HEAT, Thermometer } from './heat-kit-ch17.tsx';

/**
 * A steel bench and a pine bench, side by side outdoors, both at the air's
 * temperature. A hand rests on each. One control: drag the air thermometer
 * to change the day. Above each hand, the temperature your skin actually
 * meets; between hand and bench, the heat leaving your hand (aqua, as thick
 * as the current, reversing when the bench is the hotter one).
 *
 * Graded with `id`: find the day on which the two benches feel the same.
 * Physics: `feltTemperature` / `contactFlux` in heat.ts (two thick bodies in
 * contact meet at the effusivity-weighted mean temperature).
 */
export interface TouchTheBenchProps {
  id?: string;
  prompt?: string;
  T0?: number;
  /** Largest felt difference that counts as the same, °C. */
  tolerance?: number;
  explanation?: string;
}

const LO = -10, HI = 60, AREA = 0.01; // °C scale; 100 cm² of palm in contact

export default function TouchTheBench({ id, prompt, T0 = 5, tolerance = 1, explanation }: TouchTheBenchProps) {
  const task = useTask(id, 'touch-the-bench');
  const [T, setT] = useState(T0);
  const eSkin = effusivity(MATERIALS.skin);
  const benches = [
    { key: 'steel', name: 'steel', m: MATERIALS.steel, x0: -25, x1: -7 },
    { key: 'wood', name: 'pine', m: MATERIALS.wood, x0: 1, x1: 19 },
  ].map((b) => ({
    ...b,
    felt: feltTemperature(b.m, T),
    watts: contactFlux(eSkin, SKIN_T, effusivity(b.m), T, 1) * AREA,
  }));
  const maxW = contactFlux(eSkin, SKIN_T, effusivity(MATERIALS.steel), LO, 1) * AREA;
  const gap = benches[0].felt - benches[1].felt;

  // A hand seen from the side: fingers and palm flat on the bench, forearm rising to the left.
  const hand = (s: StageApi, cx: number) => <g>
    <line x1={s.sx(cx - 3)} y1={s.sy(4.4)} x2={s.sx(cx - 8.5)} y2={s.sy(10)} stroke={C.soft} strokeWidth={s.len(2.4) + 3} strokeLinecap="round" />
    <line x1={s.sx(cx - 3)} y1={s.sy(4.4)} x2={s.sx(cx - 8.5)} y2={s.sy(10)} stroke={C.surface} strokeWidth={s.len(2.4)} strokeLinecap="round" />
    <rect x={s.sx(cx - 4)} y={s.sy(5.1)} width={s.len(9)} height={s.len(2.1)} rx={s.len(1)} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
  </g>;

  const colTop = (s: StageApi) => {
    const h = s.sy(0) - s.sy(13) - 10;
    const px = s.sy(0) - 10 - ((T - LO) / (HI - LO)) * h;
    return { h, world: (s.sy(0) - px) / s.len(1) };
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Benches and air" value={T.toFixed(1)} unit="°C" />
          <Meter label="Steel feels" value={benches[0].felt.toFixed(1)} unit="°C" />
          <Meter label="Pine feels" value={benches[1].felt.toFixed(1)} unit="°C" />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(gap) <= tolerance, { T })}
          miss={`At ${T.toFixed(1)} °C your skin meets ${benches[0].felt.toFixed(1)} °C on the steel and ${benches[1].felt.toFixed(1)} °C on the pine: ${Math.abs(gap).toFixed(1)} °C apart. The steel is the ${gap < 0 ? 'colder' : 'hotter'}-feeling one.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-30, 30]} y={[-7, 18]} height={270} equal
        label={`Steel and pine benches at ${T.toFixed(1)} degrees. Your skin meets ${benches[0].felt.toFixed(1)} on steel and ${benches[1].felt.toFixed(1)} on pine.`}>
        {(s) => {
          const top = colTop(s);
          return <>
            {benches.map((b) => {
              const cx = (b.x0 + b.x1) / 2;
              const f = Math.min(1, Math.abs(b.watts) / maxW);
              const down = b.watts > 0;
              return <g key={b.key}>
                <rect x={s.sx(b.x0)} y={s.sy(3)} width={s.len(b.x1 - b.x0)} height={s.len(3)} rx={2}
                  fill={b.key === 'steel' ? C.faint : C.surface} opacity={b.key === 'steel' ? 0.35 : 1}
                  stroke={b.key === 'steel' ? C.ink : C.soft} strokeWidth={2} />
                {b.key === 'wood' && [0.8, 1.6, 2.4].map((y) => (
                  <line key={y} x1={s.sx(b.x0 + 0.5)} x2={s.sx(b.x1 - 0.5)} y1={s.sy(y)} y2={s.sy(y)} stroke={C.ghost} />
                ))}
                <line x1={s.sx(b.x0 + 2)} x2={s.sx(b.x0 + 2)} y1={s.sy(0)} y2={s.sy(-2.4)} stroke={C.soft} strokeWidth={3} />
                <line x1={s.sx(b.x1 - 2)} x2={s.sx(b.x1 - 2)} y1={s.sy(0)} y2={s.sy(-2.4)} stroke={C.soft} strokeWidth={3} />
                <text x={s.sx(cx)} y={s.sy(-3.9)} textAnchor="middle" fontSize={14} fill={C.soft}>{b.name}</text>
                {hand(s, cx)}
                {f > 0.01 && <Arrow s={s} from={down ? [cx, 3.2] : [cx, 0.2]} to={down ? [cx, 0.2] : [cx, 3.2]}
                  color={HEAT} width={1.5 + 7 * f} />}
                <text x={s.sx(cx)} y={s.sy(-5.9)} textAnchor="middle" fontSize={13} fill={HEAT}>
                  {Math.abs(b.watts) < 0.5 ? 'no heat flows' : `${Math.abs(b.watts).toFixed(0)} W ${down ? 'out of' : 'into'} your hand`}
                </text>
                <text x={s.sx(cx)} y={s.sy(14.6)} textAnchor="middle" fontSize={13} fill={C.soft}>your skin meets</text>
                <text x={s.sx(cx)} y={s.sy(12.4)} textAnchor="middle" fontSize={18} fontWeight={600} fill={C.ink}
                  fontFamily="var(--font-mono)">{b.felt.toFixed(1)} °C</text>
              </g>;
            })}
            <Thermometer x={s.sx(25)} y={s.sy(0)} h={top.h} T={T} lo={LO} hi={HI} step={10} label="air" readout={false} />
            <Handle s={s} at={[25, top.world]} color={C.ink} r={7}
              step={((0.5 / (HI - LO)) * top.h) / s.len(1)} label="Air and bench temperature: drag up or down"
              onChange={(p) => {
                const px = s.sy(0) - p[1] * s.len(1);
                const v = LO + ((s.sy(0) - 10 - px) / top.h) * (HI - LO);
                setT(Math.round(Math.min(HI, Math.max(LO, v)) * 2) / 2);
                task.touch();
              }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Both benches sit at the air temperature · your skin starts at {SKIN_T} °C · aqua: heat through 100 cm² of palm, one second after touching
      </p>
    </SceneCard>
  );
}
