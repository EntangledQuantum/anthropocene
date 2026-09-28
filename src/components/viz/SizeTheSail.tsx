import { useEffect, useRef, useState } from 'react';
import {
  SOLAR_CONSTANT, distanceAfter, sailAcceleration, sailForce, type Surface,
} from '../../lib/physics/emwaves.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A square sail facing the Sun, seen edge-on, with a 5 kg probe behind it.
 * Sunlight streams in from the left; on a mirror it bounces straight back, on
 * a black sail it stops. Launch, and a day passes in three seconds on the
 * track below: the probe starts from rest and the track shows where it is.
 *
 * `choose` lets the learner switch mirror and black at a fixed size. With `id`
 * and `targetKm`, the sail's size is the control and the scene grades itself:
 * reach the station after exactly one day.
 *
 * Physics: `sailForce` / `sailAcceleration` / `distanceAfter` in
 * src/lib/physics/emwaves.ts. The photons are a picture; every number is from
 * the pressure 2I/c or I/c.
 */
export interface SizeTheSailProps {
  id?: string;
  prompt?: string;
  /** Starting side of the square sail, m. */
  side?: number;
  surface?: Surface;
  /** Show the mirror / black switch. */
  choose?: boolean;
  mass?: number;
  /** Graded: distance to cover in one day, km. */
  targetKm?: number;
  explanation?: string;
}

const DAY = 86400, TRACK = 800, PLAY = 3, SAIL_X = 3, ROWS = 15, PER_ROW = 4, NPH = ROWS * PER_ROW;
const MIN_SIDE = 2, MAX_SIDE = 16;

export default function SizeTheSail({
  id, prompt, side: side0 = 10, surface: surf0 = 'reflect', choose, mass = 5, targetKm, explanation,
}: SizeTheSailProps) {
  const graded = Boolean(id && targetKm !== undefined);
  const task = useTask(graded ? id : undefined, 'size-the-sail');
  const [side, setSide] = useState(side0);
  const [surface, setSurface] = useState<Surface>(surf0);
  const cfg = useRef({ side: side0, surface: surf0 });
  const [flown, setFlown] = useState<{ side: number; surface: Surface; km: number } | null>(null);
  const flight = useRef<{ t0: number; km: number } | null>(null);
  const top = useRef<StageApi | null>(null), bot = useRef<StageApi | null>(null);
  const els = useRef<{ ph: (SVGCircleElement | null)[]; probe?: SVGGElement | null; trail?: SVGLineElement | null }>({ ph: [] });
  // Rows of photons, evenly spaced in height, staggered along each row.
  const photons = useRef(Array.from({ length: NPH }, (_, i) => {
    const row = i % ROWS, k = Math.floor(i / ROWS);
    return { x: -22 + ((k * 11 + ((row * 7) % 11)) % 44), y: -7 + (14 * row) / (ROWS - 1), vx: 1 };
  }));

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = top.current, b = bot.current, e = els.current, { side: sd, surface: sf } = cfg.current;
      photons.current.forEach((p, i) => {
        p.x += p.vx * dt * 9;
        const onSail = Math.abs(p.y) <= sd / 2;
        if (p.vx > 0 && onSail && p.x >= SAIL_X - 0.25) {
          if (sf === 'reflect') { p.vx = -1; p.x = SAIL_X - 0.25; } else { p.x = s ? s.x[0] : -22; }
        }
        const xl = s ? s.x[0] : -22, xr = s ? s.x[1] : 22;
        if (p.x > xr || p.x < xl) { p.x = xl; p.vx = 1; }
        const el = e.ph[i];
        if (el && s) { el.setAttribute('cx', s.sx(p.x).toFixed(1)); el.setAttribute('cy', s.sy(p.y).toFixed(1)); el.setAttribute('opacity', p.vx > 0 ? '0.9' : '0.45'); }
      });
      const f = flight.current;
      if (f && b) {
        const u = Math.min(1, (now - f.t0) / 1000 / PLAY);
        const km = f.km * u * u; // ½at², with t running from 0 to one day
        const x = b.sx(Math.min(km, TRACK));
        e.probe?.setAttribute('transform', `translate(${(x - b.sx(0)).toFixed(1)}, 0)`);
        e.trail?.setAttribute('x2', x.toFixed(1));
        if (u >= 1) flight.current = null;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reset = () => {
    flight.current = null;
    setFlown(null);
    const b = bot.current, e = els.current;
    if (b) { e.probe?.setAttribute('transform', 'translate(0, 0)'); e.trail?.setAttribute('x2', String(b.sx(0))); }
    task.touch();
  };
  const changeSide = (v: number) => {
    const next = Math.round(Math.max(MIN_SIDE, Math.min(MAX_SIDE, v)) * 10) / 10;
    if (next === cfg.current.side) return;
    cfg.current.side = next; setSide(next); reset();
  };
  const changeSurface = (sf: Surface) => { cfg.current.surface = sf; setSurface(sf); reset(); };
  const launch = () => {
    const km = distanceAfter(sailAcceleration(SOLAR_CONSTANT, side, mass, surface), DAY) / 1000;
    reset();
    flight.current = { t0: performance.now(), km };
    setTimeout(() => setFlown({ side, surface, km }), PLAY * 1000);
  };

  const F = sailForce(SOLAR_CONSTANT, side, surface);
  const flownHere = flown !== null && flown.side === side && flown.surface === surface;
  const hit = graded && flownHere && Math.abs(flown!.km - targetKm!) <= 0.04 * targetKm!;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {choose && (['reflect', 'absorb'] as Surface[]).map((sf) => (
            <button key={sf} type="button" className="anth-btn" aria-pressed={surface === sf}
              style={{ borderColor: surface === sf ? C.ink : undefined, color: surface === sf ? C.ink : C.faint }}
              onClick={() => changeSurface(sf)}>{sf === 'reflect' ? 'Mirror sail' : 'Black sail'}</button>
          ))}
          <button type="button" className="anth-btn" onClick={launch}>Launch for one day</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Sail" value={`${side.toFixed(1)} × ${side.toFixed(1)}`} unit="m" />
            <Meter label="Push of the light" value={(F * 1000).toFixed(2)} unit="mN" color={C.force} />
            <Meter label="After one day" value={flownHere ? flown!.km.toFixed(0) : '—'} unit={flownHere ? 'km' : undefined} color={C.position} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { side, km: flown?.km })}
          miss={!flownHere
            ? `This ${side.toFixed(1)} m sail has not flown yet. Launch it.`
            : `A ${side.toFixed(1)} m sail carries the probe ${flown!.km.toFixed(0)} km in a day; the station is ${targetKm} km out.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-12, 12]} y={[-8, 8]} height={250} equal
        label={`A ${side.toFixed(1)} metre ${surface === 'reflect' ? 'mirror' : 'black'} sail in sunlight, pushed with ${(F * 1000).toFixed(2)} millinewtons.`}>
        {(s) => {
          top.current = s;
          return <g>
            {Array.from({ length: NPH }, (_, i) => (
              <circle key={i} ref={(el) => { els.current.ph[i] = el; }} r={3} fill={C.energy} />
            ))}
            <text x={s.sx(s.x[0]) + 4} y={s.sy(7.6)} fontSize={13} fill={C.energy}>sunlight from the left, 1361 W/m²</text>
            {/* the sail, edge-on, and the probe behind it */}
            <line x1={s.sx(SAIL_X)} x2={s.sx(SAIL_X)} y1={s.sy(side / 2)} y2={s.sy(-side / 2)}
              stroke={surface === 'reflect' ? C.ink : C.ghost} strokeWidth={6} strokeLinecap="round" />
            <line x1={s.sx(SAIL_X)} x2={s.sx(SAIL_X + 2.2)} y1={s.sy(side / 2)} y2={s.sy(0)} stroke={C.faint} strokeWidth={1} />
            <line x1={s.sx(SAIL_X)} x2={s.sx(SAIL_X + 2.2)} y1={s.sy(-side / 2)} y2={s.sy(0)} stroke={C.faint} strokeWidth={1} />
            <rect x={s.sx(SAIL_X + 2.2)} y={s.sy(0.6)} width={s.len(1.4)} height={s.len(1.2)} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={2} />
            <text x={s.sx(SAIL_X + 2.9)} y={s.sy(-1.4)} textAnchor="middle" fontSize={12} fill={C.soft}>{mass} kg</text>
            <Arrow s={s} from={[SAIL_X + 4, 0]} to={[SAIL_X + 4 + Math.min(4.2, F * 4000), 0]} color={C.force} label="push" />
            {graded && <Handle s={s} at={[SAIL_X, side / 2]} step={0.05} label="Sail size: drag its top edge up or down"
              onChange={(p) => changeSide(2 * p[1])} clamp={(p) => [SAIL_X, p[1]]} />}
            {/* 1 m-ish scale: the sail's own size */}
            <text x={s.sx(SAIL_X) - 12} y={s.sy(side / 2) - 10} textAnchor="end" fontSize={12} fill={C.soft}>{side.toFixed(1)} m</text>
          </g>;
        }}
      </Stage>
      <Stage x={[0, TRACK]} y={[0, 1]} height={96} axes={{ x: 'distance from the start (km)', xTicks: [0, 100, 200, 300, 400, 500, 600, 700, 800], yTicks: [] }}
        label="The track: where the probe is after one day.">
        {(b) => {
          bot.current = b;
          return <g>
            <line ref={(el) => { els.current.trail = el; }} x1={b.sx(0)} x2={b.sx(0)} y1={b.sy(0.4)} y2={b.sy(0.4)} stroke={C.position} strokeWidth={3} opacity={0.5} />
            {targetKm !== undefined && <g>
              <line x1={b.sx(targetKm)} x2={b.sx(targetKm)} y1={b.sy(0.05)} y2={b.sy(0.95)} stroke={C.ink} strokeDasharray="4 4" />
              <text x={b.sx(targetKm) + 6} y={b.sy(0.8)} fontSize={12} fill={C.ink}>station</text>
            </g>}
            <g ref={(el) => { els.current.probe = el; }}>
              <circle cx={b.sx(0)} cy={b.sy(0.4)} r={7} fill={C.position} stroke={C.surface} strokeWidth={2} />
            </g>
          </g>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Sail and probe {mass} kg together, whatever the size · starts from rest · a day plays in three seconds
      </p>
    </SceneCard>
  );
}
