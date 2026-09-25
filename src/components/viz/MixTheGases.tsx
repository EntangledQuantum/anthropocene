import { useRef, useState } from 'react';
import { MIX_BOX, createGas, energySI, equalKESpeed, meanKE, meanSpeed, type Gas } from '../../lib/physics/gas.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { dots, useGasLoop, useTicker } from './gas-kit-ch18.tsx';

/**
 * Helium and argon mixed in one box. Every helium atom starts at 400 m/s;
 * the argon atoms start at a speed you choose. Release them and the trace
 * under the box follows each gas's mean kinetic energy: collisions move
 * energy from whichever gas has more per atom until the two lines meet.
 * They meet at equal energy, not equal speed, so helium ends √10 ≈ 3× faster.
 *
 * With `id`, the scene grades itself: choose argon's start so the lines stay
 * level from the first instant. The truth is `equalKESpeed`, 127 m/s.
 * Physics: src/lib/physics/gas.ts.
 */
export interface MixTheGasesProps {
  id?: string;
  prompt?: string;
  /** Argon's start speed, m/s. */
  argon?: number;
  /** m/s */
  tolerance?: number;
  explanation?: string;
}

const M = MIX_BOX;
const SPAN = 300;       // ps of trace
const EMAX = 6;         // × 10⁻²¹ J
const HE = C.ink, AR = 'var(--color-rose)';
const zJ = (e: number) => energySI(e) / 1e-21;

export default function MixTheGases({ id, prompt, argon = 400, tolerance = 15, explanation }: MixTheGasesProps) {
  const graded = Boolean(id);
  const task = useTask(id, 'mix-the-gases');
  const [vAr, setVAr] = useState(argon);
  const make = (v: number) => createGas({
    w: M.w, h: M.h, seed: 7,
    species: [{ ...M.light, radius: M.radius }, { ...M.heavy, speed: v / 1000, radius: M.radius }],
  });
  const gas = useRef<Gas>(make(argon));
  const running = useRef(false);
  const [released, setReleased] = useState(false);
  const trace = useRef<[number, number, number][]>([[0, meanKE(gas.current, 0), meanKE(gas.current, 1)]]);
  const box = useRef<StageApi | null>(null);
  const plot = useRef<StageApi | null>(null);
  const he = useRef<SVGPathElement>(null), ar = useRef<SVGPathElement>(null);
  const heLine = useRef<SVGPathElement>(null), arLine = useRef<SVGPathElement>(null);
  const [, tick] = useTicker();

  useGasLoop(gas, {
    psPerSecond: 20, running, maxDt: () => 0.02,
    frame: (g, ps) => {
      if (ps > 0 && g.t <= SPAN) trace.current.push([g.t, meanKE(g, 0), meanKE(g, 1)]);
      if (g.t > SPAN) running.current = false;
      const b = box.current, p = plot.current;
      if (b) { he.current?.setAttribute('d', dots(g, b, 0)); ar.current?.setAttribute('d', dots(g, b, 1)); }
      if (p) {
        const line = (k: 1 | 2) => trace.current.map(([t, ...e], i) => `${i ? 'L' : 'M'}${p.sx(t).toFixed(1)},${p.sy(Math.min(EMAX, zJ(e[k - 1]))).toFixed(1)}`).join('');
        heLine.current?.setAttribute('d', line(1)); arLine.current?.setAttribute('d', line(2));
      }
    },
    tick,
  });

  const g = gas.current;
  const truth = equalKESpeed(M.light.speed, M.light.mass, M.heavy.mass) * 1000;
  const hitNow = Math.abs(vAr - truth) <= tolerance;
  const ratio = (M.heavy.mass * vAr * vAr) / (M.light.mass * (M.light.speed * 1000) ** 2);
  const reset = (v = vAr) => {
    gas.current = make(v); running.current = false; setReleased(false);
    trace.current = [[0, meanKE(gas.current, 0), meanKE(gas.current, 1)]];
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" disabled={released} onClick={() => { running.current = true; setReleased(true); }}>Release</button>
          <button type="button" className="anth-btn" onClick={() => reset()}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Helium, mean speed" value={(meanSpeed(g, 0) * 1000).toFixed(0)} unit="m/s" color={C.velocity} />
            <Meter label="Argon, mean speed" value={(meanSpeed(g, 1) * 1000).toFixed(0)} unit="m/s" color={C.velocity} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} disabled={!released}
          label={released ? 'Check' : 'Release first'}
          onCheck={() => task.check(hitNow, { argon: vAr })}
          miss={`At ${vAr.toFixed(0)} m/s each argon atom starts with ${ratio.toFixed(2)}× the kinetic energy of a helium atom, so energy flows ${ratio > 1 ? 'from argon to helium' : 'from helium to argon'} until the lines meet.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.3, 24.3]} y={[-0.3, 16.3]} height={230} equal label="Helium and argon atoms mixed in one box.">
        {(s) => { box.current = s; return <>
          <rect x={s.sx(0)} y={s.sy(M.h)} width={s.sx(M.w) - s.sx(0)} height={s.sy(0) - s.sy(M.h)} fill="none" stroke={C.soft} strokeWidth={3} rx={2} />
          <path ref={ar} fill={AR} />
          <path ref={he} fill={HE} />
        </>; }}
      </Stage>
      <Stage x={[0, 500]} y={[0, 1]} height={74} axes={{ x: 'start speed (m/s)', xTicks: [0, 100, 200, 300, 400, 500], yTicks: [] }}
        label={`Start speeds. Helium 400 metres per second; argon ${vAr.toFixed(0)}.`}>
        {(s) => <>
          <circle cx={s.sx(400)} cy={s.sy(0.35)} r={6} fill={HE} />
          <text x={s.sx(400) + 12} y={s.sy(0.35) + 5} fontSize={13} fill={HE}>helium, 4 u</text>
          <text x={s.sx(vAr) + 14} y={s.sy(0.35) + 5} fontSize={13} fill={AR}>argon, 40 u · {vAr.toFixed(0)} m/s</text>
          {released
            ? <circle cx={s.sx(vAr)} cy={s.sy(0.35)} r={7} fill={AR} />
            : <Handle s={s} at={[vAr, 0.35]} color={AR} step={5} label="Argon start speed, metres per second"
                onChange={(p) => { const v = Math.round(Math.min(500, Math.max(20, p[0]))); setVAr(v); reset(v); task.touch(); }} />}
        </>}
      </Stage>
      <Stage x={[0, SPAN]} y={[0, EMAX]} height={200}
        axes={{ x: 'time (ps)', y: 'mean kinetic energy per atom (× 10⁻²¹ J)', yTicks: [0, 2, 4, 6] }}
        label="Mean kinetic energy of each gas against time.">
        {(s) => { plot.current = s; return <>
          <path ref={arLine} fill="none" stroke={AR} strokeWidth={2.5} />
          <path ref={heLine} fill="none" stroke={HE} strokeWidth={2.5} />
          <text x={s.sx(SPAN) - 4} y={s.sy(EMAX) + 30} textAnchor="end" fontSize={12} fill={HE}>helium</text>
          <text x={s.sx(SPAN) - 60} y={s.sy(EMAX) + 30} textAnchor="end" fontSize={12} fill={AR}>argon</text>
        </>; }}
      </Stage>
    </SceneCard>
  );
}
