import { useRef, useState } from 'react';
import {
  SPREAD_BOX, createGas, energySI, histogram, meanKE, meanSpeed2D, mbDensity2D, mostProbableSpeed2D,
  rmsSpeed2D, speeds, temperature, temperatureOfSpeed, type Gas,
} from '../../lib/physics/gas.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { dots, useGasLoop, useTicker } from './gas-kit-ch18.tsx';

/**
 * Three hundred nitrogen molecules that all start at one speed, in random
 * directions, and a live histogram of their speeds under the box. Release
 * them and the spike melts into the lopsided Maxwell–Boltzmann hump, from
 * elastic collisions alone; the mean kinetic energy, the temperature, never
 * moves.
 *
 * With `id`, the learner first drags a marker to where they think the
 * tallest bar will end up, then releases. The trap is the start speed; the
 * truth is `mostProbableSpeed2D`, 1/√2 of it. Once solved, the settled curve
 * and its three speeds (most probable, mean, rms) appear.
 * Physics: src/lib/physics/gas.ts.
 */
export interface SpreadTheSpeedsProps {
  id?: string;
  prompt?: string;
  /** Every molecule's start speed, m/s. */
  start?: number;
  /** Marker tolerance, m/s. */
  tolerance?: number;
  explanation?: string;
}

const B = SPREAD_BOX;
const BIN = 0.05;           // nm/ps = 50 m/s
const VMAX = 1.4;           // nm/ps shown
const NB = Math.round(VMAX / BIN);
const YMAX = 0.24;          // share of molecules per bin shown

export default function SpreadTheSpeeds({ id, prompt, start = 400, tolerance = 40, explanation }: SpreadTheSpeedsProps) {
  const graded = Boolean(id);
  const task = useTask(id, 'spread-the-speeds');
  const v0 = start / 1000;
  const make = () => createGas({ w: B.w, h: B.h, seed: 21, species: [{ count: B.count, mass: B.mass, radius: B.radius, speed: v0 }] });
  const gas = useRef<Gas>(make());
  const hist = useRef<number[]>(histogram(speeds(gas.current), BIN, NB).map((c) => c / B.count));
  const running = useRef(false);
  const [released, setReleased] = useState(false);
  const [marker, setMarker] = useState(start);
  const box = useRef<StageApi | null>(null);
  const plot = useRef<StageApi | null>(null);
  const dotPath = useRef<SVGPathElement>(null);
  const bars = useRef<SVGPathElement>(null);
  const [, tick] = useTicker();

  const drawBars = (s: StageApi) => {
    let d = '';
    hist.current.forEach((f, k) => {
      if (f < 1e-4) return;
      const x0 = s.sx(k * BIN * 1000) + 1, x1 = s.sx((k + 1) * BIN * 1000) - 1;
      d += `M${x0.toFixed(1)},${s.sy(0).toFixed(1)}V${s.sy(Math.min(f, YMAX)).toFixed(1)}H${x1.toFixed(1)}V${s.sy(0).toFixed(1)}Z`;
    });
    bars.current?.setAttribute('d', d);
  };

  useGasLoop(gas, {
    psPerSecond: 15, running, maxDt: () => 0.04,
    frame: (g, ps) => {
      if (ps > 0) {
        // the bars follow the gas with a 6 ps memory, so they read smoothly
        const a = 1 - Math.exp(-ps / 6);
        const now = histogram(speeds(g), BIN, NB);
        hist.current = hist.current.map((f, k) => f + a * (now[k] / g.n - f));
      }
      if (box.current) dotPath.current?.setAttribute('d', dots(g, box.current));
      if (plot.current) drawBars(plot.current);
    },
    tick,
  });

  const g = gas.current;
  const T = temperatureOfSpeed(B.mass, v0);
  const vp = mostProbableSpeed2D(B.mass, T) * 1000;
  const showCurve = released && (!graded || task.done);
  const hitNow = Math.abs(marker - vp) <= tolerance;
  const reset = () => { gas.current = make(); hist.current = histogram(speeds(gas.current), BIN, NB).map((c) => c / B.count); running.current = false; setReleased(false); task.touch(); };
  const spike = hist.current.some((f) => f > YMAX);

  const curve = (s: StageApi) => Array.from({ length: 141 }, (_, i) => (i / 140) * VMAX)
    .map((v, i) => `${i ? 'L' : 'M'}${s.sx(v * 1000).toFixed(1)},${s.sy(Math.min(YMAX, mbDensity2D(v, B.mass, T) * BIN)).toFixed(1)}`).join('');
  const speedsMarked = [
    { v: vp, label: 'most probable' },
    { v: meanSpeed2D(B.mass, T) * 1000, label: 'mean' },
    { v: rmsSpeed2D(B.mass, T) * 1000, label: 'rms' },
  ];

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" disabled={released}
            onClick={() => { running.current = true; setReleased(true); }}>Release</button>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Mean kinetic energy" value={(energySI(meanKE(g)) / 1e-21).toFixed(3)} unit="× 10⁻²¹ J" color={C.energy} />
            <Meter label="Temperature" value={temperature(g).toFixed(0)} unit="K" />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} disabled={!released}
          label={released ? 'Check' : 'Release first'}
          onCheck={() => task.check(hitNow, { marker })}
          miss={`Your marker is at ${marker.toFixed(0)} m/s. The tallest bars settle near ${vp.toFixed(0)} m/s, ${Math.round((vp / start) * 100)}% of the speed every molecule started with.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.3, 24.3]} y={[-0.3, 16.3]} height={250} equal
        label={`${B.count} nitrogen molecules${released ? ' colliding' : `, all at ${start} metres per second, waiting`}.`}>
        {(s) => { box.current = s; return <>
          <rect x={s.sx(0)} y={s.sy(B.h)} width={s.sx(B.w) - s.sx(0)} height={s.sy(0) - s.sy(B.h)} fill="none" stroke={C.soft} strokeWidth={3} rx={2} />
          <path ref={dotPath} fill={C.soft} />
        </>; }}
      </Stage>
      <Stage x={[0, VMAX * 1000]} y={[0, YMAX]} height={250}
        axes={{ x: 'speed (m/s)', y: 'share of molecules, per 50 m/s', xTicks: [0, 200, 400, 600, 800, 1000, 1200, 1400], yTicks: [0, 0.05, 0.1, 0.15, 0.2] }}
        label={`Histogram of molecular speeds.${graded ? ` Your marker is at ${marker.toFixed(0)} metres per second.` : ''}`}>
        {(s) => { plot.current = s; return <>
          <path ref={bars} fill={C.velocity} opacity={0.75} />
          {spike && <text x={s.sx(start) + 10} y={s.sy(YMAX) + 16} fontSize={13} fill={C.velocity}>↑ all {B.count} at {start} m/s</text>}
          {showCurve && <>
            <path d={curve(s)} fill="none" stroke={C.ink} strokeWidth={2} strokeDasharray="6 4" />
            {speedsMarked.map(({ v, label }, i) => <g key={label}>
              <line x1={s.sx(v)} x2={s.sx(v)} y1={s.sy(0)} y2={s.sy(0.16 + i * 0.025)} stroke={C.ink} strokeWidth={1} />
              <text x={s.sx(v) + 5} y={s.sy(0.16 + i * 0.025) + 4} fontSize={12} fill={C.ink}>{label} {v.toFixed(0)}</text>
            </g>)}
          </>}
          {graded && <>
            <line x1={s.sx(marker)} x2={s.sx(marker)} y1={s.sy(0)} y2={s.sy(YMAX * 0.92)} stroke={C.accel} strokeWidth={2} strokeDasharray="4 4" />
            <text x={s.sx(marker) - 8} y={s.sy(YMAX * 0.92) + 4} textAnchor="end" fontSize={13} fill={C.accel}>your peak {marker.toFixed(0)}</text>
            {!released && <Handle s={s} at={[marker, YMAX * 0.92]} color={C.accel} step={10} label="Marker: where the tallest bar will settle, metres per second"
              onChange={(p) => { setMarker(Math.round(Math.min(1300, Math.max(0, p[0])) / 5) * 5); task.touch(); }} />}
          </>}
        </>; }}
      </Stage>
    </SceneCard>
  );
}
