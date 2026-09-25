import { useRef, useState } from 'react';
import {
  AIR_BOX, celsiusForPressureRatio, createGas, heatingPressureRatio, kelvin, thermostat, type Gas,
} from '../../lib/physics/gas.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { BoxWalls, Ledger, dots, ticks, useGasLoop, useGauge, useTicker } from './gas-kit-ch18.tsx';

/**
 * A sealed box of air, 300 molecules, and one control: the heater. Drag the
 * thermometer and the molecules speed up; the gauge reads what the walls
 * feel, and the piston's amber ticks are the individual hits.
 *
 * With `id` and `target`, the scene grades itself: set the heater so the
 * pressure is `target` times the pressure at 20 °C. The trap is the Celsius
 * number; the truth is `celsiusForPressureRatio`, where the kelvin
 * temperature has multiplied by `target`.
 * Physics: src/lib/physics/gas.ts. The heater rescales every velocity toward
 * the dial with a 10 ps response (a Berendsen thermostat).
 */
export interface HeatTheBoxProps {
  id?: string;
  prompt?: string;
  /** Pressure ratio to reach. Grades the scene when set with `id`. */
  target?: number;
  /** Heater tolerance, °C. */
  tolerance?: number;
  explanation?: string;
}

const B = AIR_BOX;
const T0C = 20;
const LO = -50, HI = 700;          // heater range, °C
const TX = 28.2;                   // thermometer x, nm
const yOf = (c: number) => ((c - LO) / (HI - LO)) * B.h;
const cOf = (y: number) => LO + (y / B.h) * (HI - LO);
const make = () => createGas({ w: B.w, h: B.h, seed: 18, species: [{ count: B.count, mass: B.mass, radius: B.radius, T: B.T }] });

export default function HeatTheBox({ id, prompt, target, tolerance = 12, explanation }: HeatTheBoxProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'heat-the-box');
  const { start, gauge } = useGauge(make);
  const gas = useRef<Gas>(make());
  const running = useRef(true);
  const dial = useRef(T0C);
  const [heater, setHeater] = useState(T0C);
  const stage = useRef<StageApi | null>(null);
  const dotPath = useRef<SVGPathElement>(null);
  const tickPath = useRef<SVGPathElement>(null);
  const recent = useRef<number[][]>([]);
  const [, tick] = useTicker();

  useGasLoop(gas, {
    psPerSecond: 40, running,
    maxDt: () => 0.04 * Math.sqrt(B.T / Math.max(B.T, kelvin(dial.current))),
    each: (g, dt) => thermostat(g, kelvin(dial.current), 1 - Math.exp(-dt / 10)),
    frame: (g) => {
      const s = stage.current;
      if (!s) return;
      gauge.current.read(g);
      dotPath.current?.setAttribute('d', dots(g, s));
      tickPath.current?.setAttribute('d', ticks(g, s, recent.current));
    },
    tick,
  });

  const r = gauge.current.value;
  const truth = target ? celsiusForPressureRatio(T0C, target) : 0;
  const hitNow = graded && Math.abs(heater - truth) <= tolerance;
  const K = kelvin(heater);

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <Ledger r={r} start={start} />
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { heater })}
          miss={`At ${heater.toFixed(0)} °C the gas is at ${K.toFixed(0)} K, ${(K / kelvin(T0C)).toFixed(2)}× its starting ${kelvin(T0C).toFixed(0)} K, so the pressure settles at ${heatingPressureRatio(T0C, heater).toFixed(2)}× the start, not ${target}×.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.6, 31.4]} y={[-1.2, 17.4]} height={380} equal
        label={`A sealed box of air heated to ${heater.toFixed(0)} degrees Celsius. ${r ? `The pressure reads ${r.p.toFixed(0)} kilopascals.` : ''}`}>
        {(s) => { stage.current = s; return <>
          <BoxWalls s={s} w={B.w} h={B.h} />
          <path ref={dotPath} fill={C.soft} />
          <path ref={tickPath} stroke={C.force} strokeWidth={2} />
          {/* the heater's thermometer */}
          <line x1={s.sx(TX)} x2={s.sx(TX)} y1={s.sy(0)} y2={s.sy(B.h)} stroke={C.rule} strokeWidth={8} strokeLinecap="round" />
          <line x1={s.sx(TX)} x2={s.sx(TX)} y1={s.sy(0)} y2={s.sy(yOf(heater))} stroke="var(--color-rose)" strokeWidth={5} strokeLinecap="round" />
          {[0, 100, 200, 300, 400, 500, 600, 700].map((c) => <g key={c}>
            <line x1={s.sx(TX) - 12} x2={s.sx(TX) - 6} y1={s.sy(yOf(c))} y2={s.sy(yOf(c))} stroke={C.faint} />
            <text x={s.sx(TX) - 16} y={s.sy(yOf(c)) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{c}</text>
          </g>)}
          <text x={s.sx(TX)} y={s.sy(-0.9)} textAnchor="middle" fontSize={12} fill={C.faint}>heater, °C</text>
          <text x={s.sx(TX) + 16} y={s.sy(yOf(heater)) - 4} fontSize={14} fontWeight={600} fill={C.ink}>{heater.toFixed(0)} °C</text>
          <text x={s.sx(TX) + 16} y={s.sy(yOf(heater)) + 14} fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{K.toFixed(0)} K</text>
          <Handle s={s} at={[TX, yOf(heater)]} color="var(--color-rose)" step={1 / ((HI - LO) / B.h)} label="Heater temperature, degrees Celsius"
            onChange={(p) => {
              const c = Math.round(Math.min(HI, Math.max(LO, cOf(p[1]))));
              dial.current = c; setHeater(c); task.touch();
            }} />
          <text x={s.sx(0)} y={s.sy(B.h) - 8} fontSize={12} fill={C.faint}>300 molecules of air · 24 nm × 16 nm · played about 25 billion times slower</text>
        </>; }}
      </Stage>
    </SceneCard>
  );
}
