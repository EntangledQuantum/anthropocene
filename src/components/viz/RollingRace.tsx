import { useEffect, useRef, useState } from 'react';
import { G_EARTH } from '../../lib/physics/dynamics.ts';
import { SHAPE_K, rollState, rollingTime, type Shape } from '../../lib/physics/rotation.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * Two lanes, two round bodies of the same mass and radius, released together
 * from rest. Each lane carries an energy bar split into moving (½mv²) and
 * spinning (½Iω²). The hoop fills its spin locker with half of everything it
 * gets, so it has less left for going downhill.
 *
 * Ungraded, both ramps share one slope and the only control is Release.
 * With `id`, the top ramp gets a handle: tilt it until the race is a tie.
 * Physics: `rollState` / `rollingTime` from rotation.ts.
 */
export interface RollingRaceProps {
  id?: string;
  prompt?: string;
  top?: Shape;
  bottom?: Shape;
  /** Slope of both ramps, degrees (the top one is yours when graded). */
  angleDeg?: number;
  /** Arrival-time difference that counts as a tie, s. */
  tolerance?: number;
  explanation?: string;
}

const L = 2, FINISH = 2.2, RAD = 0.1, MASS = 1, BASES = [0.82, 0] as const;
const MIN_DEG = 5, MAX_DEG = 26;
const E_MAX = MASS * G_EARTH * L * Math.sin((MAX_DEG * Math.PI) / 180);
const BAR_H = 0.62, BAR_X = 2.42, BAR_W = 0.12;
const NAMES: Record<Shape, string> = { hoop: 'hoop', disc: 'disc', 'solid-sphere': 'solid ball', 'hollow-sphere': 'hollow ball', 'sliding-block': 'block' };
const rad = (d: number) => (d * Math.PI) / 180;

export default function RollingRace({
  id, prompt, top = 'hoop', bottom = 'disc', angleDeg = 12, tolerance = 0.04, explanation,
}: RollingRaceProps) {
  const task = useTask(id, 'rolling-race');
  const shapes = [top, bottom] as const;
  const [topDeg, setTopDeg] = useState(angleDeg);
  const degs = [topDeg, angleDeg];
  const degRef = useRef(degs);
  degRef.current = degs;
  const running = useRef(false);
  const t = useRef(0);
  const [shown, setShown] = useState({ running: false, t: 0, done: [false, false] });
  const bodies = [useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const bars = [[useRef<SVGRectElement>(null), useRef<SVGRectElement>(null)], [useRef<SVGRectElement>(null), useRef<SVGRectElement>(null)]];
  const stage = useRef<StageApi | null>(null);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (running.current) t.current += dt;
      const s = stage.current;
      const done = [false, false];
      shapes.forEach((sh, i) => {
        const th = rad(degRef.current[i]);
        const st = rollState(SHAPE_K[sh], th, L, running.current ? t.current : 0, MASS, RAD);
        done[i] = running.current && st.done;
        if (!s) return;
        const dx = s.len(st.s * Math.cos(th)), dy = s.len(st.s * Math.sin(th));
        const c = centre(i, th, 0);
        bodies[i].current?.setAttribute('transform', `translate(${dx},${dy}) rotate(${(st.spin * 180) / Math.PI},${s.sx(c[0])},${s.sy(c[1])})`);
        const hm = s.len((st.moving / E_MAX) * BAR_H), hs = s.len((st.spinning / E_MAX) * BAR_H);
        const y0 = s.sy(BASES[i]);
        bars[i][0].current?.setAttribute('y', `${y0 - hm}`); bars[i][0].current?.setAttribute('height', `${hm}`);
        bars[i][1].current?.setAttribute('y', `${y0 - hm - hs}`); bars[i][1].current?.setAttribute('height', `${hs}`);
      });
      if (now - lastShown > 120) { lastShown = now; setShown({ running: running.current, t: t.current, done }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [top, bottom]);

  const release = () => {
    running.current = !running.current;
    t.current = 0;
    setShown({ running: running.current, t: 0, done: [false, false] });
    task.touch();
  };

  const times = shapes.map((sh, i) => rollingTime(SHAPE_K[sh], rad(degs[i]), L));
  const gap = times[0] - times[1];
  const finished = shown.done[0] && shown.done[1];
  const hit = finished && Math.abs(gap) <= tolerance;
  const miss = !shown.running
    ? 'Release them first: this slope has not been raced.'
    : !finished
      ? 'Let both reach the flag.'
      : `On a ${topDeg.toFixed(1)}° ramp the ${NAMES[top]} arrived ${Math.abs(gap).toFixed(2)} s ${gap > 0 ? 'after' : 'before'} the ${NAMES[bottom]}.`;
  const readTime = (i: number) => (shown.done[i] ? times[i] : Math.min(shown.t, times[i]));

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={release}>{shown.running ? 'Back to the top' : 'Release'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            {shapes.map((sh, i) => <Meter key={i} label={`${NAMES[sh]}${shown.done[i] ? ', arrived' : ''}`} value={readTime(i).toFixed(2)} unit="s" />)}
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { topDeg })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.1, 2.75]} y={[-0.1, 1.85]} height={410} equal
        label={`Two ramps, each ${L} metres long. Top: a ${NAMES[top]} on a ${topDeg.toFixed(1)} degree slope. Bottom: a ${NAMES[bottom]} on a ${angleDeg} degree slope.`}>
        {(s) => {
          stage.current = s;
          const P = (v: Vec) => `${s.sx(v[0])},${s.sy(v[1])}`;
          return <>
            {shapes.map((sh, i) => {
              const th = rad(degs[i]);
              const start: Vec = [FINISH - L * Math.cos(th), BASES[i] + L * Math.sin(th)];
              const c = centre(i, th, 0);
              const r = s.len(RAD);
              return <g key={i}>
                <polygon points={`${P(start)} ${P([FINISH, BASES[i]])} ${P([start[0], BASES[i]])}`} fill={C.surface} stroke={C.rule} strokeWidth={2} />
                <line x1={s.sx(FINISH)} x2={s.sx(FINISH)} y1={s.sy(BASES[i])} y2={s.sy(BASES[i] + 0.34)} stroke={C.soft} strokeWidth={2} />
                <path d={`M${P([FINISH, BASES[i] + 0.34])}L${P([FINISH - 0.12, BASES[i] + 0.3])}L${P([FINISH, BASES[i] + 0.26])}Z`} fill={shown.done[i] ? C.ok : C.soft} />
                <text x={s.sx(start[0] + 0.3)} y={s.sy(BASES[i]) - 8} fontSize={13} fill={C.soft}>{NAMES[sh]}, {MASS} kg, {RAD * 100} cm · {degs[i].toFixed(1)}°</text>
                <g ref={bodies[i]}>
                  {sh === 'hoop'
                    ? <circle cx={s.sx(c[0])} cy={s.sy(c[1])} r={r - 2.5} fill="none" stroke={C.ink} strokeWidth={5} />
                    : <circle cx={s.sx(c[0])} cy={s.sy(c[1])} r={r} fill={C.soft} fillOpacity={0.35} stroke={C.ink} strokeWidth={2} />}
                  <line x1={s.sx(c[0])} y1={s.sy(c[1])} x2={s.sx(c[0])} y2={s.sy(c[1]) - r + 3} stroke={C.ink} strokeWidth={2.5} />
                </g>
                <rect x={s.sx(BAR_X)} y={s.sy(BASES[i] + BAR_H)} width={s.len(BAR_W)} height={s.len(BAR_H)} fill="none" stroke={C.grid} />
                <rect ref={bars[i][0]} x={s.sx(BAR_X)} width={s.len(BAR_W)} fill={C.energy} />
                <rect ref={bars[i][1]} x={s.sx(BAR_X)} width={s.len(BAR_W)} fill={C.energy} fillOpacity={0.35} stroke={C.energy} strokeDasharray="3 3" />
                {shown.done[i] && <text x={s.sx(BAR_X + BAR_W / 2)} y={s.sy(BASES[i]) + 16} textAnchor="middle" fontSize={12} fill={C.energy}>
                  {Math.round((100 * SHAPE_K[sh]) / (1 + SHAPE_K[sh]))}% spin
                </text>}
              </g>;
            })}
            {id && !shown.running && (() => {
              const th = rad(topDeg);
              return <Handle s={s} at={[FINISH - L * Math.cos(th), BASES[0] + L * Math.sin(th)]} step={0.01} label="Top ramp: drag its high end up or down"
                onChange={(p) => {
                  const d = (Math.atan2(p[1] - BASES[0], Math.max(FINISH - p[0], 0.05)) * 180) / Math.PI;
                  setTopDeg(Math.round(Math.max(MIN_DEG, Math.min(MAX_DEG, d)) * 10) / 10);
                  task.touch();
                }} />;
            })()}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Both roll without slipping · aqua bars: energy, solid for moving and pale for spinning
      </p>
    </SceneCard>
  );
}

/** Centre of the body in lane i, a distance s down its ramp. */
function centre(i: number, th: number, s: number): Vec {
  const start: Vec = [FINISH - L * Math.cos(th), BASES[i] + L * Math.sin(th)];
  return [start[0] + s * Math.cos(th) + RAD * Math.sin(th), start[1] - s * Math.sin(th) + RAD * Math.cos(th)];
}
