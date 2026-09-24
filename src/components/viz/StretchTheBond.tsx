import { useState } from 'react';
import { bondForce, bondU, strongestPull } from '../../lib/physics/coaster-ch7.ts';
import { Arrow, Body, C, CheckBar, Handle, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * Two argon atoms and the energy landscape of the bond between them.
 *
 * There is no hill in this room: the curve above is U(r), drawn with its r
 * axis lined up under the atoms, so the right-hand atom always sits directly
 * below its own point on the curve. Drag it to where the pull holding the pair
 * together is strongest. The pull stays hidden until you check; then amber
 * arrows show it on both atoms and the tangent shows the slope that set it.
 *
 * Physics: Lennard-Jones with argon's ε and σ, via `bondU` / `bondForce` /
 * `strongestPull` in src/lib/physics/coaster-ch7.ts.
 */
export interface StretchTheBondProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const XR: [number, number] = [-0.2, 0.85];
const R_RANGE: [number, number] = [0.35, 0.8];
const R_CURVE = 0.335;
const PX_PER_PN = 6;
const ATOM_R = 0.05; // drawn radius, nm: not to scale, so the gap stays visible

/** An axes-free stage whose x mapping matches an axes stage with range XR
 *  (margins 52/16 against 12/12), so the atoms line up under the curve. */
function alignedRange(): [number, number] {
  const span = XR[1] - XR[0];
  const span2 = (span * 616) / 572;
  const lo = XR[0] - (40 * span) / 572;
  return [lo, lo + span2];
}

export default function StretchTheBond({ id, prompt, explanation }: StretchTheBondProps) {
  const task = useTask(id, 'stretch-the-bond');
  const [r, setR] = useState(0.6);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const best = strongestPull();
  const F = bondForce(r);
  const good = F < 0 && Math.abs(F) >= 0.9 * Math.abs(best.F);

  const move = (nr: number) => {
    setR(Math.min(R_RANGE[1], Math.max(R_RANGE[0], nr)));
    setCheckedAt(null);
    task.touch();
  };

  const curve: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const rr = R_CURVE + ((XR[1] - R_CURVE) * i) / 240;
    curve.push(`${rr},${bondU(rr)}`);
  }
  const shown = checkedAt !== null;
  const Fs = shown ? bondForce(checkedAt) : 0;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id ? <CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => { setCheckedAt(r); task.check(good, { r }); }}
        miss={`At ${r.toFixed(3)} nm the pull is ${Math.abs(F).toFixed(1)} pN. The bond can pull harder than that somewhere else.`}
        hit={explanation} /> : undefined}>
      <Stage x={XR} y={[-2, 0.8]} height={230} label="Potential energy of the bond against separation"
        axes={{ x: 'separation r (nm)', y: 'U (zJ)', xTicks: [0, 0.2, 0.4, 0.6, 0.8], yTicks: [-1.5, -1, -0.5, 0, 0.5] }}>
        {(s) => {
          const pts = curve.map((p) => p.split(',').map(Number)).filter(([, u]) => u <= 0.8);
          const d = `M${pts.map(([rr, u]) => `${s.sx(rr).toFixed(1)},${s.sy(u).toFixed(1)}`).join('L')}`;
          const tangent = (at: number, color: string) => {
            const slope = -bondForce(at); // dU/dr, zJ per nm
            const w = 0.07;
            return <line x1={s.sx(at - w)} y1={s.sy(bondU(at) - slope * w)} x2={s.sx(at + w)} y2={s.sy(bondU(at) + slope * w)}
              stroke={color} strokeWidth={2} />;
          };
          return <>
            <path d={d} fill="none" stroke={C.energy} strokeWidth={2.5} />
            <line x1={s.sx(r)} x2={s.sx(r)} y1={s.sy(bondU(r))} y2={s.sy(-2)} stroke={C.faint} strokeDasharray="3 4" />
            {shown && tangent(checkedAt, C.force)}
            {task.done && tangent(best.r, C.force)}
            <circle cx={s.sx(r)} cy={s.sy(bondU(r))} r={6} fill={C.surface} stroke={C.energy} strokeWidth={2.5} />
          </>;
        }}
      </Stage>
      <Stage x={alignedRange()} y={[-0.2, 0.2]} height={120} label={`Two argon atoms ${r.toFixed(3)} nanometres apart`}>
        {(s) => <>
          <Body s={s} at={[0, 0]} w={2 * ATOM_R} round label="Ar" />
          <Body s={s} at={[r, 0]} w={2 * ATOM_R} round label="Ar" color={C.position} />
          {shown && Math.abs(Fs) > 0.2 && (() => {
            // Attraction (F < 0) points each atom toward the other.
            const L = (Math.abs(Fs) * PX_PER_PN) / s.len(1);
            const inward = Fs < 0 ? 1 : -1;
            return <>
              <Arrow s={s} from={[checkedAt - ATOM_R, 0]} to={[checkedAt - ATOM_R - inward * L, 0]}
                color={C.force} label={`${Math.abs(Fs).toFixed(1)} pN`} labelSide={-1} />
              <Arrow s={s} from={[ATOM_R, 0]} to={[ATOM_R + inward * L, 0]} color={C.force} />
            </>;
          })()}
          <Handle s={s} at={[r, 0]} step={0.005} r={13} label="Right-hand atom: drag to change the separation"
            onChange={(p) => move(p[0])} color={C.position} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '4px 0 0' }}>
        Argon pair · aqua curve: the bond&apos;s potential energy · amber: the pull, shown when you check
      </p>
    </SceneCard>
  );
}
