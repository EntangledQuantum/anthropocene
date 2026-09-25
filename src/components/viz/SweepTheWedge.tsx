import { useEffect, useRef, useState } from 'react';
import { AU, COMET, DAY, anomalyAtTime, cometDaysFromAphelion, periodOf, radiusAt, sectorArea } from '../../lib/physics/orbits.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A comet on a long ellipse round the Sun (a = 2 AU, e = 0.6, period 1,032 days).
 *
 * Ungraded: the comet flies, and the orbit is cut into twelve wedges that each
 * take the same 86 days. Fat and short near the Sun, long and thin far out.
 *
 * With `id`: the comet is frozen. The shaded wedge is what it sweeps in the 60
 * days after perihelion. Drag the marker to where it will be 60 days after
 * aphelion. A naive "same length of arc" guess lands months too far; the miss
 * line says how many days, and how many times bigger the wedge is.
 *
 * Physics: Kepler's equation (`anomalyAtTime`, `cometDaysFromAphelion`) and
 * `sectorArea` by quadrature, both checked against the Verlet integrator in
 * src/lib/physics/__tests__/orbits.test.ts.
 */
export interface SweepTheWedgeProps {
  id?: string;
  prompt?: string;
  /** Days either side of 60 that count. */
  tolerance?: number;
  explanation?: string;
}

const { a, e, GM } = COMET;
const aAU = a / AU;
const T = periodOf(GM, a);
const WINDOW = 60; // days
const TH60 = anomalyAtTime(GM, a, e, WINDOW * DAY);
const SECONDS_PER_ORBIT = 12; // animation

const at = (th: number): Vec => { const r = radiusAt(aAU, e, th); return [r * Math.cos(th), r * Math.sin(th)]; };
const arc = (t1: number, t2: number) => { let L = 0; for (let i = 0; i < 200; i++) { const p = at(t1 + ((t2 - t1) * i) / 200), q = at(t1 + ((t2 - t1) * (i + 1)) / 200); L += Math.hypot(q[0] - p[0], q[1] - p[1]); } return L; };

function wedge(s: StageApi, t1: number, t2: number): string {
  let d = `M${s.sx(0)},${s.sy(0)}`;
  for (let i = 0; i <= 60; i++) { const p = at(t1 + ((t2 - t1) * i) / 60); d += `L${s.sx(p[0])},${s.sy(p[1])}`; }
  return d + 'Z';
}

export default function SweepTheWedge({ id, prompt, tolerance = 12, explanation }: SweepTheWedgeProps) {
  const task = useTask(id, 'sweep-the-wedge');
  // The saved verdict is read during render; show it only after hydration so the
  // server's "Check" and the client's first render agree (React #418 otherwise).
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [th, setTh] = useState(Math.PI + 0.02);
  const [dayShown, setDayShown] = useState(0);
  const comet = useRef<SVGCircleElement>(null);
  const api = useRef<StageApi | null>(null);

  // Ungraded: the comet flies. The loop writes to the SVG node, not to React.
  useEffect(() => {
    if (id) return;
    let raf = 0, lastShown = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = ((((now - t0) / 1000) / SECONDS_PER_ORBIT) % 1) * T;
      const p = at(anomalyAtTime(GM, a, e, t));
      const s = api.current;
      if (s && comet.current) { comet.current.setAttribute('cx', String(s.sx(p[0]))); comet.current.setAttribute('cy', String(s.sy(p[1]))); }
      if (now - lastShown > 120) { lastShown = now; setDayShown(t / DAY); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  const days = cometDaysFromAphelion(th);
  const ratio = sectorArea(a, e, Math.PI, th) / sectorArea(a, e, 0, TH60);
  const hit = Math.abs(days - WINDOW) <= tolerance;
  const cuts = Array.from({ length: 12 }, (_, k) => anomalyAtTime(GM, a, e, (k * T) / 12));

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {id ? <>
            <Meter label="Shaded arc" value={arc(0, TH60).toFixed(2)} unit="AU" color={C.position} />
            <Meter label="Your arc" value={arc(Math.PI, th).toFixed(2)} unit="AU" />
          </> : <>
            <Meter label="Days since perihelion" value={dayShown.toFixed(0)} />
            <Meter label="Each wedge" value={(T / DAY / 12).toFixed(0)} unit="days" color={C.position} />
          </>}
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done} onCheck={() => task.check(hit, { days })}
          miss={`The comet takes ${days.toFixed(0)} days to get there, not ${WINDOW}. Your wedge is ${ratio.toFixed(2)} times the shaded one.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-3.5, 1.1]} y={[-2.05, 2.05]} height={320} equal
        label={id ? `Comet orbit. The shaded wedge is swept in ${WINDOW} days after perihelion. Your marker is ${days.toFixed(0)} days after aphelion.` : 'Comet orbit cut into twelve wedges of equal time.'}>
        {(s) => {
          api.current = s;
          const ell = wedge(s, 0, 2 * Math.PI).replace(/^M[^L]+L/, 'M');
          const mine = at(th);
          return <>
            {!id && cuts.map((c, k) => <path key={k} d={wedge(s, c, k === 11 ? 2 * Math.PI : cuts[k + 1])}
              fill={C.position} fillOpacity={k % 2 ? 0.08 : 0.26} stroke={C.position} strokeOpacity={0.5} strokeWidth={1} />)}
            <path d={ell} fill="none" stroke={C.rule} strokeWidth={1.5} />
            {id && <>
              <path d={wedge(s, 0, TH60)} fill={C.position} fillOpacity={0.3} stroke={C.position} strokeWidth={1.5} />
              <text x={s.sx(at(TH60 / 2)[0]) + 10} y={s.sy(at(TH60 / 2)[1])} fontSize={13} fill={C.position}>{WINDOW} days</text>
              <path d={wedge(s, Math.PI, th)} fill={C.soft} fillOpacity={0.22} stroke={C.ink} strokeWidth={1.5} />
              <text x={s.sx(-aAU * (1 + e)) - 8} y={s.sy(0) + 4} textAnchor="end" fontSize={12} fill={C.faint}>aphelion</text>
              <Handle s={s} at={mine} color={C.ink} step={0.02} label="Where the comet is 60 days after aphelion: drag along the orbit"
                clamp={(p) => { let q = Math.atan2(p[1], p[0]); if (q < 0) q += 2 * Math.PI; return at(Math.min(Math.PI + 2.4, Math.max(Math.PI + 0.001, q))); }}
                onChange={(p) => { let q = Math.atan2(p[1], p[0]); if (q < 0) q += 2 * Math.PI; setTh(q); task.touch(); }} />
            </>}
            <circle cx={s.sx(0)} cy={s.sy(0)} r={9} fill={C.force} />
            <text x={s.sx(0)} y={s.sy(0) + 26} textAnchor="middle" fontSize={13} fill={C.soft}>Sun</text>
            <text x={s.sx(aAU * (1 - e)) + 8} y={s.sy(0) + 4} fontSize={12} fill={C.faint}>perihelion</text>
            {!id && <circle ref={comet} r={6} fill={C.ink} />}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {id ? 'comet orbit, 1 AU = Earth–Sun distance · shaded: 60 days after perihelion · outlined: your wedge from aphelion'
          : 'comet orbit, period 1,032 days · every wedge takes the same 86 days'}
      </p>
    </SceneCard>
  );
}
