import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GM_EARTH, ISS_ALTITUDE, R_EARTH, circularSpeed, elementsOf, escapeSpeed, flyOnce, kineticPerKg, potentialPerKg, speedAtInfinity,
} from '../../lib/physics/orbits.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A probe 400 km up, pointed sideways. One control: the launch speed, set by
 * dragging the tip of its cyan velocity arrow. Fire, and it flies the path the
 * integrator computes: a closed orbit that comes back, or a path that opens
 * and leaves.
 *
 * Beside it, the same launch as energy per kilogram: kinetic up, potential
 * down (zero at infinity), and the total as a line. The path stops closing
 * exactly when the total line reaches zero.
 *
 * With `station`, a ghost station starts 300 km ahead on the circular orbit,
 * and the readout says how far ahead it is: the chase that speeding up loses.
 * With `id`, graded: the slowest launch that never comes back.
 * Physics: `flyOnce`, `elementsOf`, `escapeSpeed` from orbits.ts.
 */
export interface FireToEscapeProps {
  id?: string;
  prompt?: string;
  /** Launch speed to start at, km/s. */
  start?: number;
  /** Half-size of the view, thousands of km. */
  reach?: number;
  station?: boolean;
  /** km/s above escape speed that still counts as "slowest". */
  tolerance?: number;
  explanation?: string;
}

const MM = 1e6;
const r0 = R_EARTH + ISS_ALTITUDE;
const VE = escapeSpeed(GM_EARTH, r0) / 1000;
const VC = circularSpeed(GM_EARTH, r0) / 1000;
const LEAD = 300e3; // m along the orbit
const EMAX = 70; // MJ/kg on the energy bar

export default function FireToEscape({ id, prompt, start = 9, reach = 40, station, tolerance = 0.1, explanation }: FireToEscapeProps) {
  const task = useTask(id, 'fire-to-escape');
  const [v, setV] = useState(start);
  const [fired, setFired] = useState<number | null>(null);
  const [lead, setLead] = useState(LEAD);
  const api = useRef<StageApi | null>(null);
  const probe = useRef<SVGCircleElement>(null);
  const ghost = useRef<SVGRectElement>(null);
  const t0 = useRef(0);
  const K = reach * 0.03; // arrow Mm per km/s
  const warp = reach * 60;

  const flight = useMemo(() => fired === null ? null
    : flyOnce(GM_EARTH, [0, r0], [fired * 1000, 0], 10, 3 * reach * MM, 1.2e6), [fired, reach]);
  const pts = useMemo(() => flight?.path.filter((_, i) => i % 4 === 0).map((s) => [s.p[0] / MM, s.p[1] / MM] as const) ?? [], [flight]);

  const fire = () => { t0.current = performance.now(); setFired(v); task.touch(); };

  useEffect(() => {
    if (!flight) return;
    let raf = 0, lastShown = 0;
    const frame = (now: number) => {
      const s = api.current;
      const n = Math.min(flight.path.length - 1, Math.floor(((now - t0.current) / 1000) * warp / 10));
      const st = flight.path[n];
      if (s && probe.current) { probe.current.setAttribute('cx', String(s.sx(st.p[0] / MM))); probe.current.setAttribute('cy', String(s.sy(st.p[1] / MM))); }
      // the station keeps circling at circular speed, clockwise from 300 km ahead
      const th = LEAD / r0 + (VC * 1000 / r0) * st.t;
      if (s && ghost.current) ghost.current.setAttribute('transform', `translate(${s.sx(r0 * Math.sin(th) / MM)},${s.sy(r0 * Math.cos(th) / MM)})`);
      if (now - lastShown > 120 || n === flight.path.length - 1) { lastShown = now; setLead((th - flight.turned[n]) * r0); }
      if (n < flight.path.length - 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [flight, warp]);

  const U = potentialPerKg(GM_EARTH, [0, r0]) / 1e6;
  const K_ = kineticPerKg([v * 1000, 0]) / 1e6, E = K_ + U;
  const Ef = fired === null ? 0 : kineticPerKg([fired * 1000, 0]) / 1e6 + U;
  const el = fired === null ? null : elementsOf(GM_EARTH, [0, r0], [fired * 1000, 0]);
  const hit = fired !== null && fired > VE && fired - VE <= tolerance;
  const miss = fired === null ? 'Nothing has been fired yet.'
    : el!.bound ? `At ${fired.toFixed(2)} km/s the total energy is ${Ef.toFixed(2)} MJ per kg, below zero. It climbs to ${Math.round((el!.ra - R_EARTH) / 1000).toLocaleString('en-US')} km up and falls back.`
    : `At ${fired.toFixed(2)} km/s it leaves with ${(speedAtInfinity(GM_EARTH, r0, fired * 1000) / 1000).toFixed(2)} km/s to spare far away. A slower launch would still escape.`;

  const yTop = Math.max(reach * 0.45, 9);
  const bar = (mj: number) => 100 - (mj / EMAX) * 80; // energy bar, view y

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={fire}>Fire</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Launch speed" value={v.toFixed(2)} unit="km/s" color={C.velocity} />
            {station
              ? <Meter label="Station ahead of you" value={Math.round(lead / 1000).toLocaleString('en-US')} unit="km" />
              : <Meter label="Total energy" value={E.toFixed(2)} unit="MJ/kg" color={C.energy} />}
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { v: fired })} miss={miss} hit={explanation} />}
      </div>}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Stage x={[-reach, reach]} y={[-reach, yTop]} height={380} equal
            label={`Probe 400 kilometres up, launch speed ${v.toFixed(2)} kilometres per second.`}>
            {(s) => {
              api.current = s;
              return <>
                <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(R_EARTH / MM)} fill={C.surface} stroke={C.rule} strokeWidth={2} />
                <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(r0 / MM)} fill="none" stroke={C.grid} strokeDasharray="4 5" />
                {pts.length > 1 && <polyline points={pts.map((p) => `${s.sx(p[0])},${s.sy(p[1])}`).join(' ')} fill="none" stroke={C.position} strokeWidth={2} />}
                {station && <rect ref={ghost} x={-6} y={-6} width={12} height={12} fill="none" stroke={C.ink} strokeWidth={2}
                  transform={`translate(${s.sx(r0 * Math.sin(LEAD / r0) / MM)},${s.sy(r0 * Math.cos(LEAD / r0) / MM)})`} />}
                <circle ref={probe} cx={s.sx(0)} cy={s.sy(r0 / MM)} r={5} fill={C.ink} />
                <Arrow s={s} from={[0, r0 / MM]} to={[v * K, r0 / MM]} color={C.velocity} label={`${v.toFixed(2)} km/s`} />
                <Handle s={s} at={[v * K, r0 / MM]} color={C.velocity} step={0.01 * K} label="Launch speed: drag the arrow tip"
                  onChange={(p) => { setV(Math.round(Math.min(12, Math.max(7, p[0] / K)) * 100) / 100); task.touch(); }} />
              </>;
            }}
          </Stage>
        </div>
        {!station && <svg viewBox="0 0 120 200" style={{ width: 120, flexShrink: 0 }} role="img"
          aria-label={`Energy per kilogram: kinetic ${K_.toFixed(1)}, potential ${U.toFixed(1)}, total ${E.toFixed(1)} megajoules`}>
          <line x1={10} x2={110} y1={bar(0)} y2={bar(0)} stroke={C.rule} strokeWidth={1.5} />
          <text x={112} y={bar(0) + 4} fontSize={11} fill={C.faint} textAnchor="end" dy={-8}>zero</text>
          <rect x={22} width={26} y={bar(K_)} height={bar(0) - bar(K_)} fill={C.energy} />
          <rect x={58} width={26} y={bar(0)} height={bar(U) - bar(0)} fill="none" stroke={C.energy} strokeWidth={2} />
          <line x1={14} x2={92} y1={bar(E)} y2={bar(E)} stroke={C.ink} strokeWidth={2.5} />
          <text x={35} y={196} fontSize={11} fill={C.soft} textAnchor="middle">K</text>
          <text x={71} y={196} fontSize={11} fill={C.soft} textAnchor="middle">U</text>
          <text x={95} y={bar(E) + 4} fontSize={11} fill={C.ink}>total</text>
          <text x={4} y={12} fontSize={10} fill={C.faint}>MJ per kg</text>
        </svg>}
      </div>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {station ? 'dashed: the circular orbit · square: the station · iris: your path after the burn'
          : 'dashed: the circular orbit, 7.67 km/s · iris: the path of the last shot · right: energy per kilogram at launch'}
      </p>
    </SceneCard>
  );
}
