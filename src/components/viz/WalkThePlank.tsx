import { useEffect, useRef, useState } from 'react';
import { G_EARTH } from '../../lib/physics/dynamics.ts';
import { farthestReach, supportReactions, tipStep, type Plank, type TiltState } from '../../lib/physics/statics.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { KF, PAINTER_MID, PLANK_T, Painter, PlankBar, PlankTicks, TRESTLE_H, Trestle } from './plank-ch11.tsx';

/**
 * A painter on a plank that overhangs its right trestle. Drag her along it.
 * The two trestle pushes (amber, from below) are `supportReactions`: as she
 * walks out past the right trestle, the left push shrinks, and where it would
 * have to become a pull the plank tips about the right trestle instead —
 * `tipStep` integrates the fall until the far end meets the floor.
 *
 * With `id` it grades itself: stand as far out as she can without tipping.
 */
export interface WalkThePlankProps {
  id?: string;
  prompt?: string;
  plank?: Plank;
  painterMass?: number;
  /** Trestle positions from the plank's left end, m. */
  xA?: number;
  xB?: number;
  start?: number;
  /** How close to the limit counts, m. */
  tolerance?: number;
  explanation?: string;
}

const DT = 1 / 240;

export default function WalkThePlank({
  id, prompt, plank = { mass: 30, length: 4 }, painterMass = 60, xA = 0.5, xB = 3, start = 1.6, tolerance = 0.08, explanation,
}: WalkThePlankProps) {
  const task = useTask(id, 'walk-the-plank');
  const [x, setX] = useState(start);
  const [tipped, setTipped] = useState(false);
  const xRef = useRef(start);
  const tilt = useRef<TiltState>({ theta: 0, omega: 0 });
  const rig = useRef<SVGGElement>(null);
  const hinge = useRef({ px: 0, py: 0 });
  const reach = farthestReach(plank, painterMass, xB);
  const maxTilt = Math.asin(Math.min(1, TRESTLE_H / (plank.length - xB)));

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (xRef.current > reach) {
        for (let k = 0; k < Math.round(dt / DT); k++) {
          tipStep(tilt.current, plank, { label: 'painter', mass: painterMass, x: xRef.current }, xB, maxTilt, DT);
        }
        const { px, py } = hinge.current;
        rig.current?.setAttribute('transform', `rotate(${(tilt.current.theta * 180) / Math.PI},${px},${py})`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reach, maxTilt]);

  const reset = () => {
    tilt.current = { theta: 0, omega: 0 };
    rig.current?.setAttribute('transform', '');
    xRef.current = start;
    setX(start);
    setTipped(false);
    task.touch();
  };

  const r = supportReactions([{ label: 'plank', mass: plank.mass, x: plank.length / 2 }, { label: 'painter', mass: painterMass, x }], xA, xB);
  const past = x - xB;
  const hit = !tipped && x >= reach - tolerance;
  const miss = tipped
    ? `It tipped with her ${past.toFixed(2)} m past the right trestle: the left trestle would have had to pull down. Start over.`
    : `The left trestle still pushes up with ${r.left.toFixed(0)} N. She can go further.`;
  const Wp = plank.mass * G_EARTH, Wm = painterMass * G_EARTH;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Left trestle pushes" value={tipped ? '0' : Math.max(0, r.left).toFixed(0)} unit="N" color={C.force} />
          <Meter label="Right trestle pushes" value={tipped ? '—' : r.right.toFixed(0)} unit="N" color={C.force} />
          <Meter label="Past the right trestle" value={past.toFixed(2)} unit="m" color={C.position} />
          <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }} onClick={reset}>Start over</button>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { x })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.3, plank.length + 0.4]} y={[-0.36, 2.75]} height={320} equal
        label={`Plank on two trestles. The painter stands ${past.toFixed(2)} metres ${past >= 0 ? 'past' : 'short of'} the right trestle.${tipped ? ' The plank has tipped.' : ''}`}>
        {(s) => {
          hinge.current = { px: s.sx(xB), py: s.sy(TRESTLE_H) };
          return <>
            <line x1={0} x2={s.W} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
            <PlankTicks s={s} length={plank.length} />
            <Trestle s={s} x={xA} />
            <Trestle s={s} x={xB} />
            {!tipped && <>
              <Arrow s={s} from={[xA, TRESTLE_H - Math.max(0, r.left) * KF]} to={[xA, TRESTLE_H]} color={C.force} label={`${Math.max(0, r.left).toFixed(0)} N`} labelSide={-1} />
              <Arrow s={s} from={[xB, TRESTLE_H - r.right * KF]} to={[xB, TRESTLE_H]} color={C.force} label={`${r.right.toFixed(0)} N`} labelSide={1} />
            </>}
            <g ref={rig}>
              <PlankBar s={s} length={plank.length} />
              <Painter s={s} x={x} label={`${painterMass} kg`} />
              {!tipped && <>
                <Arrow s={s} from={[plank.length / 2, TRESTLE_H + PLANK_T / 2]} to={[plank.length / 2, TRESTLE_H + PLANK_T / 2 - Wp * KF]} color={C.force} label={`plank ${Wp.toFixed(0)} N`} labelSide={-1} />
                <Arrow s={s} from={[x, PAINTER_MID]} to={[x, PAINTER_MID - Wm * KF]} color={C.force} label={`${Wm.toFixed(0)} N`} labelSide={1} />
              </>}
              <Handle s={s} at={[x, TRESTLE_H + PLANK_T + 0.02]} step={0.02} color={C.position} label="Painter: drag along the plank"
                onChange={(p) => {
                  if (tipped) return;
                  const nx = Math.round(Math.min(plank.length - 0.1, Math.max(0.2, p[0])) * 100) / 100;
                  xRef.current = nx;
                  setX(nx);
                  if (nx > reach) setTipped(true);
                  task.touch();
                }} />
            </g>
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}
