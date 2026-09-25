import { useEffect, useRef, useState } from 'react';
import { G_EARTH } from '../../lib/physics/dynamics.ts';
import { seesawStep, seesawTorque, type PointLoad, type TiltState } from '../../lib/physics/statics.ts';
import { Arrow, C, CheckBar, Handle, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * A seesaw held level by your hand. A child sits on the left; you slide the
 * sack along the right arm, then let go. If the two turning effects do not
 * cancel, the plank tips until an end hits the ground — `seesawStep` from
 * statics.ts integrates it, with every torque carrying its cos θ.
 *
 * The distances are marked on the plank but the torques are not printed:
 * the learner has to weigh mass against arm. The miss line gives both
 * torques in N·m. Drag the sack again and your hand catches the plank.
 */
export interface LevelTheSeesawProps {
  id?: string;
  prompt?: string;
  /** kg, and metres from the left end of the 4 m plank. */
  child?: { mass: number; x: number };
  sackMass?: number;
  start?: number;
  explanation?: string;
}

const L = 4, PIVOT = 2, H = 0.6, PLANK_KG = 20, THICK = 0.08;
const MAX_TILT = Math.asin(H / (L / 2));
const KF = 0.0012; // metres of arrow per newton
const DT = 1 / 240;

export default function LevelTheSeesaw({
  id, prompt, child = { mass: 25, x: 0.4 }, sackMass = 40, start = 3.6, explanation,
}: LevelTheSeesawProps) {
  const task = useTask(id, 'level-the-seesaw');
  const [sack, setSack] = useState(start);
  const tilt = useRef<TiltState>({ theta: 0, omega: 0 });
  const released = useRef(false);
  const rot = useRef<SVGGElement>(null);
  const arrows = useRef<(SVGGElement | null)[]>([]);
  const geo = useRef({ ppm: 1, px: 0, py: 0 });

  const loads: PointLoad[] = [
    { label: 'child', mass: child.mass, x: child.x },
    { label: 'sack', mass: sackMass, x: sack },
    { label: 'plank', mass: PLANK_KG, x: PIVOT },
  ];
  const loadsRef = useRef(loads);
  loadsRef.current = loads;

  const boxes = [
    { x: child.x, w: 0.34, h: 0.46, text: `${child.mass} kg`, m: child.mass },
    { x: sack, w: 0.44, h: 0.34, text: `${sackMass} kg`, m: sackMass },
  ];
  const lift = (h: number) => THICK / 2 + h / 2; // box centre above the plank's centre line
  const xs = useRef<number[]>([]);
  xs.current = boxes.map((b) => b.x);

  const pose = () => {
    const th = tilt.current.theta;
    const { ppm, px, py } = geo.current;
    rot.current?.setAttribute('transform', `rotate(${(-th * 180) / Math.PI},${px},${py})`);
    // Each weight acts where its load presses on the plank's centre line; that point swings with the plank.
    xs.current.forEach((x, i) => {
      const dx = x - PIVOT;
      arrows.current[i]?.setAttribute('transform', `translate(${(dx * Math.cos(th) - dx) * ppm},${-dx * Math.sin(th) * ppm})`);
    });
  };

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (released.current) {
        for (let k = 0; k < Math.round(dt / DT); k++) seesawStep(tilt.current, loadsRef.current, { mass: PLANK_KG, length: L }, MAX_TILT, DT);
        pose();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const catchIt = () => {
    released.current = false;
    tilt.current = { theta: 0, omega: 0 };
    pose();
  };

  const w = (m: number) => m * G_EARTH;
  const left = w(child.mass) * (PIVOT - child.x);
  const right = w(sackMass) * (sack - PIVOT);
  const net = seesawTorque(loads, PIVOT);
  const balanced = Math.abs(net) < 1e-6;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id ? <CheckBar verdict={task.verdict} done={task.done} label="Let go"
        onCheck={() => { released.current = true; task.check(balanced, { sack }); }}
        miss={`The child turns it with ${left.toFixed(0)} N·m, the sack with ${right.toFixed(0)} N·m. The ${net > 0 ? 'left' : 'right'} end goes down.`}
        hit={explanation} />
        : <button type="button" className="anth-btn" onClick={() => { released.current = true; }}>Let go</button>}>
      <Stage x={[-0.3, 4.3]} y={[-0.3, 1.75]} height={300} equal ground
        label={`Seesaw. Child ${child.mass} kilograms ${(PIVOT - child.x).toFixed(2)} metres left of the pivot; sack ${sackMass} kilograms ${(sack - PIVOT).toFixed(2)} metres right.`}>
        {(s) => {
          geo.current = { ppm: s.len(1), px: s.sx(PIVOT), py: s.sy(H) };
          const P = (v: Vec) => `${s.sx(v[0])},${s.sy(v[1])}`;
          return <>
            {[-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((d) => <g key={d}>
              <line x1={s.sx(PIVOT + d)} x2={s.sx(PIVOT + d)} y1={s.sy(0)} y2={s.sy(0) + 6} stroke={C.faint} />
              <text x={s.sx(PIVOT + d)} y={s.sy(0) + 20} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{Math.abs(d)}</text>
            </g>)}
            <text x={s.sx(L) + 14} y={s.sy(0) + 20} fontSize={12} fill={C.faint}>m from the pivot</text>
            <polygon points={[P([PIVOT, H - THICK / 2]), P([PIVOT - 0.3, 0]), P([PIVOT + 0.3, 0])].join(' ')} fill={C.surface} stroke={C.rule} strokeWidth={2} />
            {boxes.map((b, i) => (
              <g key={`w${i}`} ref={(el) => { arrows.current[i] = el; }}>
                <Arrow s={s} from={[b.x, H]} to={[b.x, H - w(b.m) * KF]} color={C.force} />
                <text x={s.sx(b.x) + (i === 0 ? 9 : -9)} y={s.sy(H - w(b.m) * KF * 0.6) + 5} textAnchor={i === 0 ? 'start' : 'end'}
                  fontSize={14} fontWeight={600} fill={C.force} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{w(b.m).toFixed(0)} N</text>
              </g>
            ))}
            <g ref={rot}>
              <rect x={s.sx(0)} y={s.sy(H + THICK / 2)} width={s.len(L)} height={s.len(THICK)} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              {boxes.map((b, i) => <g key={i}>
                <rect x={s.sx(b.x - b.w / 2)} y={s.sy(H + THICK / 2 + b.h)} width={s.len(b.w)} height={s.len(b.h)} rx={4} fill={C.surface} stroke={C.soft} strokeWidth={2} />
                <text x={s.sx(b.x)} y={s.sy(H + lift(b.h)) + 5} textAnchor="middle" fontSize={13} fill={C.soft}>{b.text}</text>
              </g>)}
              <Handle s={s} at={[sack, H + THICK / 2 + boxes[1].h + 0.12]} step={0.05} color={C.position} label="Sack: drag along the plank"
                onChange={(p) => {
                  const x = Math.round(Math.min(L - 0.05, Math.max(PIVOT + 0.1, p[0])) * 20) / 20;
                  catchIt();
                  setSack(x);
                  task.touch();
                }} />
            </g>
            {task.done && <Arrow s={s} from={[PIVOT, H + THICK / 2]} to={[PIVOT, H + THICK / 2 + w(child.mass + sackMass + PLANK_KG) * KF]} color={C.force} width={3.5}
              label={`pivot ${w(child.mass + sackMass + PLANK_KG).toFixed(0)} N`} labelSide={-1} />}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        4 m plank, {PLANK_KG} kg, pivot at its middle · amber: weights{task.done ? ', and the pivot’s push on the plank' : ''}
      </p>
    </SceneCard>
  );
}
