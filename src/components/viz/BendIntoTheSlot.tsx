import { useEffect, useRef, useState } from 'react';
import {
  E_CHARGE, M_PROTON, cyclotronPeriod, intoPage, lorentzForce, norm, spectrometerShot, type V3,
} from '../../lib/physics/magnetism.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { FieldMarks, LoopArrow, placeArrow, sci3 } from './magnet-kit-ch27.tsx';

/**
 * A mass spectrometer, seen from above. A proton gun fires straight up
 * through a hole in a metal plate into a field that points into the page.
 * One control: the field strength, dragged along the track under the plate.
 *
 * In flight the cyan velocity arrow keeps its length and the amber force
 * arrow stays at right angles to it, so the proton turns and never speeds up.
 * The speed meter reads the integrated velocity (Boris push) and stays flat.
 * The proton comes back to the plate half a circle later, 2r from the hole;
 * earlier landings stay as ticks on the plate.
 *
 * Graded (`id` + `target`): set the field so the proton lands in the detector
 * slot `target` cm from the hole. Physics: `spectrometerShot` (magnetism.ts).
 */
export interface BendIntoTheSlotProps {
  id?: string;
  prompt?: string;
  /** Distance from the hole to the detector slot, cm. Graded when set with `id`. */
  target?: number;
  /** Starting field, T. */
  start?: number;
  /** Proton speed, m/s. */
  speed?: number;
  /** Landing error that counts as in the slot, cm. */
  tolerance?: number;
  explanation?: string;
}

const CM = 0.01;
const BMIN = 0.05, BMAX = 0.4;
const TRACK: [number, number] = [-40, -12]; // world x of the field track, cm
const TRACK_Y = -11;
const GUN_Y = -7;
const WARP = 5e6; // one microsecond of flight takes 5 s on screen
const V_ARROW = 6; // cm
const F_ARROW = 26; // cm of arrow per tesla (the force grows with B at fixed speed)

type Flight = { B: number; path: { x: V3; v: V3; t: number }[]; landX: number; tLand: number; t0: number; done: boolean };
type Result = { B: number; land: number };

const bOf = (x: number) => BMIN + ((x - TRACK[0]) / (TRACK[1] - TRACK[0])) * (BMAX - BMIN);
const xOf = (B: number) => TRACK[0] + ((B - BMIN) / (BMAX - BMIN)) * (TRACK[1] - TRACK[0]);

export default function BendIntoTheSlot({
  id, prompt, target, start = 0.1, speed = 1e6, tolerance = 0.6, explanation,
}: BendIntoTheSlotProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'bend-into-the-slot');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [B, setB] = useState(start);
  const [flying, setFlying] = useState(false);
  const [last, setLast] = useState<Result | null>(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [ghosts, setGhosts] = useState<string[]>([]);
  const [vShown, setVShown] = useState(speed);
  const api = useRef<StageApi | null>(null);
  const trail = useRef<SVGPolylineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const vArrow = useRef<SVGGElement>(null);
  const fArrow = useRef<SVGGElement>(null);
  const flight = useRef<Flight | null>(null);

  const fire = () => {
    const pts = trail.current?.getAttribute('points');
    if (flight.current && pts) setGhosts((g) => [...g.slice(-3), pts]);
    const shot = spectrometerShot(M_PROTON, E_CHARGE, speed, B);
    flight.current = { B, path: shot.path, landX: shot.landX, tLand: shot.tLand, t0: performance.now(), done: false };
    setFlying(true);
    task.touch();
  };

  useEffect(() => {
    let raf = 0, lastShown = 0;
    const lead = (-GUN_Y * CM) / speed; // time from the gun to the hole, s
    const frame = (now: number) => {
      const f = flight.current, s = api.current;
      if (f && s && trail.current && dot.current) {
        const t = ((now - f.t0) / 1000) / WARP - lead; // flight time since the hole
        let pts = `${s.sx(0)},${s.sy(GUN_Y)} `;
        let x = 0, y = GUN_Y, v: V3 = [0, speed, 0];
        if (t < 0) {
          y = (t * speed) / CM; // below the plate, rising toward the hole
        } else {
          const path = f.path;
          const end = f.done ? path.length - 1 : path.findIndex((p) => p.t >= t);
          const n = end < 0 ? path.length - 1 : end;
          for (let i = 0; i <= n; i += 8) pts += `${s.sx(path[i].x[0] / CM).toFixed(1)},${s.sy(path[i].x[1] / CM).toFixed(1)} `;
          x = path[n].x[0] / CM; y = Math.max(0, path[n].x[1] / CM); v = path[n].v;
          if (end < 0 && !f.done) {
            f.done = true;
            x = f.landX / CM; y = 0;
            setTicks((k) => [...k.slice(-5), -f.landX / CM]);
            setLast({ B: f.B, land: -f.landX / CM });
            setFlying(false);
          }
        }
        pts += `${s.sx(x).toFixed(1)},${s.sy(y).toFixed(1)}`;
        trail.current.setAttribute('points', pts);
        dot.current.setAttribute('cx', `${s.sx(x)}`); dot.current.setAttribute('cy', `${s.sy(y)}`);
        dot.current.style.display = '';
        const sp = norm(v);
        if (!f.done) {
          placeArrow(vArrow.current, s.sx(x), s.sy(y), s.sx(x + (v[0] / sp) * V_ARROW), s.sy(y + (v[1] / sp) * V_ARROW));
          const F = y > 0 || t > 0 ? lorentzForce(E_CHARGE, v, intoPage(f.B)) : ([0, 0, 0] as V3);
          const fm = norm(F);
          const L = F_ARROW * f.B;
          placeArrow(fArrow.current, s.sx(x), s.sy(y), s.sx(x + (fm ? F[0] / fm : 0) * L), s.sy(y + (fm ? F[1] / fm : 0) * L));
        } else { placeArrow(vArrow.current, 0, 0, 0, 0); placeArrow(fArrow.current, 0, 0, 0, 0); }
        if (now - lastShown > 120) { lastShown = now; setVShown(sp); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  const off = last && target !== undefined ? last.land - target : 0;
  const hitNow = graded && !flying && !!last && Math.abs(off) <= tolerance;
  const miss = flying ? 'Still in flight. Wait for it to land.'
    : !last ? 'Nothing has been fired yet.'
    : `At ${last.B.toFixed(3)} T the proton landed ${last.land.toFixed(1)} cm from the hole, ${Math.abs(off).toFixed(1)} cm ${off > 0 ? 'beyond' : 'short of'} the slot.`;
  const halfLap = cyclotronPeriod(M_PROTON, E_CHARGE, B) / 2;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={fire} disabled={flying}>
            {flying ? 'In flight…' : 'Fire'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Speed" value={sci3(vShown)} unit="m/s" color={C.velocity} />
            <Meter label="Field" value={B.toFixed(3)} unit="T" color={C.field} />
            <Meter label="Landed" value={last ? last.land.toFixed(1) : '–'} unit="cm from the hole" />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={live && task.done}
          onCheck={() => task.check(hitNow, last ?? undefined)} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-46, 8]} y={[-16, 26]} height={420} equal
        label={`Proton spectrometer. Field ${B.toFixed(3)} tesla into the page.${last ? ` Last proton landed ${last.land.toFixed(1)} centimetres from the hole.` : ''}`}>
        {(s) => {
          api.current = s;
          return <>
            <rect x={s.sx(-44)} y={s.sy(24)} width={s.len(50)} height={s.len(24)} fill="none" stroke={C.grid} />
            <FieldMarks s={s} x={[-44, 6]} y={[0, 24]} into strength={(B - BMIN) / (BMAX - BMIN)} label="B into the page" />
            {ghosts.map((g, i) => <polyline key={i} points={g} fill="none" stroke={C.position} strokeOpacity={0.3} strokeWidth={1.5} />)}
            {/* the plate, with its entrance hole at x = 0 */}
            <line x1={s.sx(-44)} x2={s.sx(-0.8)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.soft} strokeWidth={4} />
            <line x1={s.sx(0.8)} x2={s.sx(6)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.soft} strokeWidth={4} />
            {[0, 10, 20, 30, 40].map((d) => <g key={d}>
              <line x1={s.sx(-d)} x2={s.sx(-d)} y1={s.sy(0) + 3} y2={s.sy(0) + 9} stroke={C.faint} />
              <text x={s.sx(-d)} y={s.sy(0) + 22} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{d} cm</text>
            </g>)}
            {target !== undefined && <g>
              <rect x={s.sx(-target - tolerance)} y={s.sy(0) - 7} width={s.len(2 * tolerance)} height={10} fill={C.ok} opacity={0.85} />
              <text x={s.sx(-target)} y={s.sy(0) - 12} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.ok}
                stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">detector slot</text>
            </g>}
            {ticks.map((d, i) => <line key={i} x1={s.sx(-d)} x2={s.sx(-d)} y1={s.sy(0) - 9} y2={s.sy(0) + 1}
              stroke={C.warn} strokeWidth={2.5} opacity={i === ticks.length - 1 ? 1 : 0.4} />)}
            {/* the gun */}
            <rect x={s.sx(-1.6)} y={s.sy(GUN_Y + 0.8)} width={s.len(3.2)} height={s.len(4.5)} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
            <text x={s.sx(-2.4)} y={s.sy(GUN_Y - 1.4)} textAnchor="end" fontSize={13} fill={C.faint}>proton gun, {sci3(speed).replace('.000', '.0')} m/s</text>
            <polyline ref={trail} fill="none" stroke={C.position} strokeWidth={2.2} />
            <LoopArrow ref={fArrow} color={C.force} />
            <LoopArrow ref={vArrow} color={C.velocity} />
            <circle ref={dot} r={5} fill={C.ink} style={{ display: 'none' }} />
            {/* the field control */}
            <line x1={s.sx(TRACK[0])} x2={s.sx(TRACK[1])} y1={s.sy(TRACK_Y)} y2={s.sy(TRACK_Y)} stroke={C.rule} strokeWidth={3} strokeLinecap="round" />
            <text x={s.sx(TRACK[0])} y={s.sy(TRACK_Y) + 22} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{BMIN} T</text>
            <text x={s.sx(TRACK[1])} y={s.sy(TRACK_Y) + 22} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{BMAX} T</text>
            <text x={s.sx(xOf(B))} y={s.sy(TRACK_Y) - 16} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.field}>B = {B.toFixed(3)} T</text>
            <Handle s={s} at={[xOf(B), TRACK_Y]} color={C.field} step={((TRACK[1] - TRACK[0]) / (BMAX - BMIN)) * 0.005}
              label="Field strength: drag along the track"
              onChange={(p) => { if (flying) return; setB(Math.round(Math.min(BMAX, Math.max(BMIN, bOf(p[0]))) * 1000) / 1000); task.touch(); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Seen from above · cyan: velocity · amber: magnetic force · half a lap at this field takes {(halfLap * 1e9).toFixed(0)} ns, shown slowed
      </p>
    </SceneCard>
  );
}
