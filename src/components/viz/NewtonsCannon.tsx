import { useEffect, useRef, useState } from 'react';
import { GM_EARTH, ISS_ALTITUDE, R_EARTH, accelAt, cannonShot, gravityAt, type CannonShot } from '../../lib/physics/orbits.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * Newton's cannon. A mountain as tall as the ISS orbit (400 km) on a true-scale
 * Earth, a cannon on top that fires sideways, and one control: the launch
 * speed, set by dragging the tip of the cyan velocity arrow.
 *
 * Every shot falls; the magenta arrow on the ball is gravity's pull per
 * kilogram, computed where the ball is and never zero. Slow shots land.
 * Somewhere near 7.6 km/s the ground curves away as fast as the ball falls,
 * and it comes all the way round. Earlier shots stay on the picture, dimmed.
 *
 * With `id`, the scene grades itself: fire a shot that never lands.
 * Physics: `cannonShot` (velocity Verlet) from src/lib/physics/orbits.ts.
 */
export interface NewtonsCannonProps {
  id?: string;
  prompt?: string;
  /** Starting launch speed, km/s. */
  start?: number;
  explanation?: string;
}

const MM = 1e6; // the stage works in thousands of km
const R = R_EARTH / MM;
const TOP = (R_EARTH + ISS_ALTITUDE) / MM;
const K = 0.36; // arrow length, Mm per km/s
const VMIN = 1, VMAX = 8.2;
const WARP = 900; // one orbit in about six seconds
const G_ARROW = 0.14; // Mm of arrow per m/s²

type Result = { v: number; outcome: CannonShot['outcome']; time: number; downrange: number };

export default function NewtonsCannon({ id, prompt, start = 5, explanation }: NewtonsCannonProps) {
  const task = useTask(id, 'newtons-cannon');
  // The saved verdict is read during render; show it only after hydration so the
  // server's "Check" and the client's first render agree (React #418 otherwise).
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [v, setV] = useState(start);
  const [ghosts, setGhosts] = useState<string[]>([]);
  const [craters, setCraters] = useState<Vec[]>([]);
  const [flying, setFlying] = useState(false);
  const [last, setLast] = useState<Result | null>(null);
  const [gShown, setGShown] = useState(gravityAt(GM_EARTH, R_EARTH + ISS_ALTITUDE));
  const [tShown, setTShown] = useState(0);
  const api = useRef<StageApi | null>(null);
  const trail = useRef<SVGPolylineElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const gLine = useRef<SVGLineElement>(null);
  const gHead = useRef<SVGPathElement>(null);
  const shot = useRef<{ s: CannonShot; v: number; t0: number; done: boolean } | null>(null);

  const fire = () => {
    if (shot.current && trail.current) {
      const pts = trail.current.getAttribute('points');
      if (pts) setGhosts((g) => [...g.slice(-3), pts]);
    }
    shot.current = { s: cannonShot(GM_EARTH, R_EARTH, R_EARTH + ISS_ALTITUDE, v * 1000, 2), v, t0: performance.now(), done: false };
    setFlying(true);
    task.touch();
  };

  useEffect(() => {
    let raf = 0, lastShown = 0;
    const rest: Vec = [0, R_EARTH + ISS_ALTITUDE];
    const frame = (now: number) => {
      const sh = shot.current, s = api.current;
      if (s && trail.current && ball.current) {
        let p: Vec = rest, t = 0;
        if (sh) {
          const path = sh.s.path;
          const n = sh.done ? path.length - 1 : Math.min(path.length - 1, Math.max(0, Math.floor((((now - sh.t0) / 1000) * WARP) / 2)));
          if (!sh.done) {
            let pts = '';
            for (let i = 0; i <= n; i += 6) pts += `${s.sx(path[i].p[0] / MM).toFixed(1)},${s.sy(path[i].p[1] / MM).toFixed(1)} `;
            pts += `${s.sx(path[n].p[0] / MM).toFixed(1)},${s.sy(path[n].p[1] / MM).toFixed(1)}`;
            trail.current.setAttribute('points', pts);
          }
          p = path[n].p; t = path[n].t;
          if (n === path.length - 1 && !sh.done) {
            sh.done = true;
            if (sh.s.outcome === 'landed') setCraters((c) => [...c.slice(-5), [p[0] / MM, p[1] / MM]]);
            setLast({ v: sh.v, outcome: sh.s.outcome, time: sh.s.time, downrange: sh.s.downrange });
            setFlying(false);
            lastShown = 0;
          }
        }
        const hide = sh?.done && sh.s.outcome === 'landed';
        ball.current.style.display = hide ? 'none' : '';
        if (gLine.current) gLine.current.style.display = hide ? 'none' : '';
        if (gHead.current) gHead.current.style.display = hide ? 'none' : '';
        ball.current.setAttribute('cx', String(s.sx(p[0] / MM)));
        ball.current.setAttribute('cy', String(s.sy(p[1] / MM)));
        // gravity's pull per kilogram, where the ball is now
        const a = accelAt(GM_EARTH, p);
        const x1 = s.sx(p[0] / MM), y1 = s.sy(p[1] / MM);
        const x2 = s.sx(p[0] / MM + a[0] * G_ARROW), y2 = s.sy(p[1] / MM + a[1] * G_ARROW);
        const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
        gLine.current?.setAttribute('x1', String(x1)); gLine.current?.setAttribute('y1', String(y1));
        gLine.current?.setAttribute('x2', String(x2 - ux * 9)); gLine.current?.setAttribute('y2', String(y2 - uy * 9));
        gHead.current?.setAttribute('d', `M${x2},${y2}L${x2 - ux * 11 - uy * 6},${y2 - uy * 11 + ux * 6}L${x2 - ux * 11 + uy * 6},${y2 - uy * 11 - ux * 6}Z`);
        if (now - lastShown > 120) {
          lastShown = now;
          setGShown(gravityAt(GM_EARTH, Math.hypot(p[0], p[1])));
          setTShown(t);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const min = (t: number) => `${(t / 60).toFixed(0)} min`;
  const km = (m: number) => `${Math.round(m / 1000).toLocaleString('en-US')} km`;
  const miss = flying ? 'Still in flight. Wait for it to land or come round.'
    : !last ? 'Nothing has been fired yet.'
    : last.outcome === 'landed' ? `Fired at ${last.v.toFixed(2)} km/s, it hit the ground ${km(last.downrange)} downrange after ${min(last.time)}.`
    : '';

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={fire} disabled={flying}>
            {flying ? 'In flight…' : 'Fire'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Launch speed" value={v.toFixed(2)} unit="km/s" color={C.velocity} />
            <Meter label="Gravity at the ball" value={gShown.toFixed(2)} unit="m/s²" color={C.accel} />
            <Meter label="Time aloft" value={(tShown / 60).toFixed(0)} unit="min" />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done}
          onCheck={() => task.check(!flying && last?.outcome === 'orbit', last ?? undefined)}
          miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-9, 9]} y={[-9.4, 8.0]} height={420} equal
        label={`Earth with a 400 kilometre mountain. Launch speed ${v.toFixed(2)} kilometres per second.${last ? ` Last shot ${last.outcome === 'landed' ? 'landed' : 'went all the way round'}.` : ''}`}>
        {(s) => {
          api.current = s;
          const foot = 0.07; // half-width of the mountain's base, radians
          return <>
            <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(R)} fill={C.surface} stroke={C.rule} strokeWidth={2} />
            <text x={s.sx(0)} y={s.sy(0) + 5} textAnchor="middle" fontSize={14} fill={C.faint}>Earth, to scale</text>
            <path d={`M${s.sx(-R * Math.sin(foot))},${s.sy(R * Math.cos(foot))}L${s.sx(0)},${s.sy(TOP)}L${s.sx(R * Math.sin(foot))},${s.sy(R * Math.cos(foot))}Z`}
              fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
            <text x={s.sx(-0.35)} y={s.sy(TOP) + 4} textAnchor="end" fontSize={12} fill={C.faint}>400 km</text>
            {ghosts.map((g, i) => <polyline key={i} points={g} fill="none" stroke={C.position} strokeOpacity={0.28} strokeWidth={1.5} />)}
            {craters.map((c, i) => <g key={`c${i}`} stroke={C.warn} strokeWidth={2}>
              <line x1={s.sx(c[0]) - 5} y1={s.sy(c[1]) - 5} x2={s.sx(c[0]) + 5} y2={s.sy(c[1]) + 5} />
              <line x1={s.sx(c[0]) - 5} y1={s.sy(c[1]) + 5} x2={s.sx(c[0]) + 5} y2={s.sy(c[1]) - 5} />
            </g>)}
            <polyline ref={trail} fill="none" stroke={C.position} strokeWidth={2.2} />
            <line ref={gLine} stroke={C.accel} strokeWidth={3} strokeLinecap="round" />
            <path ref={gHead} fill={C.accel} />
            <circle ref={ball} r={5} fill={C.ink} />
            <Arrow s={s} from={[0, TOP]} to={[v * K, TOP]} color={C.velocity} label={`${v.toFixed(2)} km/s`} />
            <Handle s={s} at={[v * K, TOP]} color={C.velocity} step={0.01 * K} label="Launch speed: drag the arrow tip"
              onChange={(p) => { setV(Math.round(Math.min(VMAX, Math.max(VMIN, p[0] / K)) * 100) / 100); task.touch(); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        cyan: launch velocity · magenta: gravity's pull on each kilogram of the ball · faint: earlier shots
      </p>
    </SceneCard>
  );
}
