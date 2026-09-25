import { useState } from 'react';
import { angleFromRest, angularAcceleration, doorI, DOOR, leverArm, leverFoot, torqueAbout } from '../../lib/physics/torque.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A door seen from above, hinged at the left. You push it with a fixed-size
 * force: drag where your push lands on the door, and drag your hand to aim it.
 * The dashed line is the push's line of action, and the iris segment from the
 * hinge to it is the lever arm. The faint door is where this push leaves the
 * door after one second, from rest.
 *
 * With `target` set it grades itself: the ghost must reach the doorstop
 * (`target` degrees after one second). `target: 0` with `against` is the
 * hold-it-still problem. Physics: torqueAbout / leverArm / α = τ/I from
 * src/lib/physics/torque.ts.
 */
export interface PushTheDoorProps {
  id?: string;
  prompt?: string;
  /** Your push, newtons. */
  force?: number;
  /** Where your push starts: distance from the hinge (m) and angle to the door face (deg, + opens). */
  start?: { s: number; angle: number };
  /** A second, fixed push: distance from hinge, newtons, angle to the face in degrees. */
  against?: { s: number; F: number; angle: number; label?: string };
  /** Door angle one second later that counts as solved, degrees. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const L = DOOR.L;
const PER_N = 0.015; // metres of arrow per newton
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export default function PushTheDoor({
  id, prompt, force = DOOR.F, start = { s: 0.9, angle: 90 }, against, target, tolerance = 3, explanation,
}: PushTheDoorProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'push-the-door');
  const [s, setS] = useState(start.s);
  const [phi, setPhi] = useState(rad(start.angle));

  const I = doorI();
  const contact: Vec = [s, 0];
  const F: Vec = [force * Math.cos(phi), force * Math.sin(phi)];
  const tauMine = torqueAbout([0, 0], contact, F);
  const other = against && {
    at: [against.s, 0] as Vec,
    F: [against.F * Math.cos(rad(against.angle)), against.F * Math.sin(rad(against.angle))] as Vec,
  };
  const tauOther = other ? torqueAbout([0, 0], other.at, other.F) : 0;
  const tau = tauMine + tauOther;
  const alpha = angularAcceleration(tau, I);
  const theta = angleFromRest(alpha, 1);
  const thetaDeg = deg(theta);
  const arm = leverArm([0, 0], contact, F);
  const foot = leverFoot([0, 0], contact, F);
  const hand: Vec = [s - Math.cos(phi) * force * PER_N, -Math.sin(phi) * force * PER_N];

  const off = target !== undefined ? thetaDeg - target : 0;
  const hit = graded && Math.abs(off) <= tolerance;
  const dirWord = tau >= 0 ? 'open' : 'shut';
  const miss = target === 0
    ? `The pushes still add to ${Math.abs(tau).toFixed(1)} N·m turning the door ${dirWord}: it swings ${Math.abs(thetaDeg).toFixed(0)}° in one second.`
    : `After one second the door is at ${thetaDeg.toFixed(0)}°, ${Math.abs(off).toFixed(0)}° ${off < 0 ? 'short of' : 'past'} the doorstop. Your torque is ${tau.toFixed(1)} N·m.`;

  const moveContact = (p: Vec) => { setS(Math.min(L, Math.max(0, p[0]))); task.touch(); };
  const moveHand = (p: Vec) => {
    const a = Math.atan2(0 - p[1], s - p[0]);
    if (Math.hypot(s - p[0], p[1]) > 0.02) { setPhi(a); task.touch(); }
  };

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Lever arm" value={arm.toFixed(2)} unit="m" color={C.position} />
          <Meter label={against ? 'Net torque' : 'Torque'} value={tau.toFixed(1)} unit="N·m" color={C.force} />
          <Meter label="Angular acceleration" value={alpha.toFixed(2)} unit="rad/s²" color={C.accel} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { s, angle: deg(phi), theta: thetaDeg })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.5, 1.4]} y={[-0.52, 1.06]} height={420} equal
        label={`Door seen from above. Push ${force} newtons, ${s.toFixed(2)} metres from the hinge, lever arm ${arm.toFixed(2)} metres. After one second the door is at ${thetaDeg.toFixed(0)} degrees.`}>
        {(st) => <>
          <Walls st={st} />
          {target !== undefined && target !== 0 && <Doorstop st={st} angle={rad(target)} />}
          <Ghost st={st} theta={theta} />
          {/* the door itself, closed */}
          <line x1={st.sx(0)} y1={st.sy(0)} x2={st.sx(L)} y2={st.sy(0)} stroke={C.soft} strokeWidth={9} strokeLinecap="round" />
          <circle cx={st.sx(0)} cy={st.sy(0)} r={7} fill={C.surface} stroke={C.ink} strokeWidth={2} />
          <text x={st.sx(0) - 14} y={st.sy(0) - 12} textAnchor="end" fontSize={13} fill={C.faint}>hinge</text>
          <Curl st={st} tau={tau} />
          <LineOfAction st={st} at={contact} F={F} />
          {arm > 0.01 && <>
            <line x1={st.sx(0)} y1={st.sy(0)} x2={st.sx(foot[0])} y2={st.sy(foot[1])} stroke={C.position} strokeWidth={2.5} strokeDasharray="6 4" />
            <text x={st.sx(foot[0] / 2) - 8} y={st.sy(foot[1] / 2) - 8} textAnchor="end" fontSize={14} fontWeight={600} fill={C.position}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">r⊥ {arm.toFixed(2)} m</text>
          </>}
          {other && <Arrow s={st} from={[other.at[0] - other.F[0] * PER_N, -other.F[1] * PER_N]} to={other.at}
            color={C.force} />}
          {other && <ForceTag st={st} at={[other.at[0] - other.F[0] * PER_N, -other.F[1] * PER_N]} text={`${against!.label ?? 'friend'} ${against!.F} N`} />}
          <Arrow s={st} from={hand} to={contact} color={C.force} width={4} />
          <ForceTag st={st} at={hand} text={`you ${force} N`} />
          <Handle s={st} at={contact} onChange={moveContact} step={0.01} label="Where your push lands on the door" color={C.ink} />
          <Handle s={st} at={hand} onChange={moveHand} step={0.03} label="Your hand: drag to aim the push" color={C.force} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        door {DOOR.M} kg, {L} m wide, I = {I.toFixed(2)} kg·m² · faint door: where it is one second later
      </p>
    </SceneCard>
  );
}

function ForceTag({ st, at, text }: { st: StageApi; at: Vec; text: string }) {
  return <text x={st.sx(at[0]) + 16} y={st.sy(at[1]) + 5} fontSize={14} fontWeight={600} fill={C.force}
    stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{text}</text>;
}

function Walls({ st }: { st: StageApi }) {
  return <g stroke={C.rule} strokeWidth={6}>
    <line x1={st.sx(st.x[0])} y1={st.sy(0)} x2={st.sx(-0.05)} y2={st.sy(0)} />
    <line x1={st.sx(L + 0.05)} y1={st.sy(0)} x2={st.sx(st.x[1])} y2={st.sy(0)} />
  </g>;
}

function Ghost({ st, theta }: { st: StageApi; theta: number }) {
  if (Math.abs(theta) < rad(0.5)) return null;
  const shown = Math.max(-Math.PI * 0.95, Math.min(Math.PI * 0.95, theta));
  const end: Vec = [L * Math.cos(shown), L * Math.sin(shown)];
  const lab: Vec = [(L + 0.1) * Math.cos(shown), (L + 0.1) * Math.sin(shown)];
  const words = Math.abs(theta) > Math.PI * 0.95 ? 'past 170° in 1 s' : `after 1 s: ${deg(theta).toFixed(0)}°`;
  return <g>
    <line x1={st.sx(0)} y1={st.sy(0)} x2={st.sx(end[0])} y2={st.sy(end[1])} stroke={C.faint} strokeWidth={7} strokeLinecap="round" opacity={0.55} />
    <text x={st.sx(lab[0])} y={st.sy(lab[1])} textAnchor={lab[0] < 0 ? 'end' : 'start'} fontSize={13} fill={C.soft}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{words}</text>
  </g>;
}

function Doorstop({ st, angle }: { st: StageApi; angle: number }) {
  const p = (r: number): Vec => [r * Math.cos(angle), r * Math.sin(angle)];
  const a = p(L * 0.9), b = p(L * 1.06), t = p(L * 1.14);
  return <g>
    <line x1={st.sx(a[0])} y1={st.sy(a[1])} x2={st.sx(b[0])} y2={st.sy(b[1])} stroke={C.ok} strokeWidth={5} strokeLinecap="round" />
    <text x={st.sx(t[0])} y={st.sy(t[1])} fontSize={13} fill={C.ok} textAnchor="middle">doorstop</text>
  </g>;
}

function LineOfAction({ st, at, F }: { st: StageApi; at: Vec; F: Vec }) {
  const m = Math.hypot(F[0], F[1]) || 1;
  const u: Vec = [F[0] / m, F[1] / m];
  return <line x1={st.sx(at[0] - u[0] * 3)} y1={st.sy(at[1] - u[1] * 3)} x2={st.sx(at[0] + u[0] * 3)} y2={st.sy(at[1] + u[1] * 3)}
    stroke={C.force} strokeWidth={1.2} strokeDasharray="3 5" opacity={0.6} />;
}

/** A curl at the hinge: its sweep grows with |τ|, its head shows the sense of twist. */
function Curl({ st, tau }: { st: StageApi; tau: number }) {
  if (Math.abs(tau) < 0.2) return null;
  const R = st.len(0.12), cx = st.sx(0), cy = st.sy(0);
  const sweep = Math.min(Math.abs(tau) / 18, 1) * Math.PI * 1.4 + 0.3;
  const sgn = Math.sign(tau);
  const a0 = -Math.PI * 0.5 - sgn * 0.2; // start below the hinge
  const a1 = a0 + sgn * sweep;
  const P = (a: number) => [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  const [x0, y0] = P(a0), [x1, y1] = P(a1);
  const tx = -Math.sin(a1) * sgn, ty = -Math.cos(a1) * sgn; // screen tangent at the end
  const h = 9;
  return <g>
    <path d={`M${x0},${y0} A${R},${R} 0 ${sweep > Math.PI ? 1 : 0} ${sgn > 0 ? 0 : 1} ${x1},${y1}`} fill="none" stroke={C.force} strokeWidth={2.5} />
    <path d={`M${x1 + tx * h},${y1 + ty * h} L${x1 - ty * h * 0.5},${y1 + tx * h * 0.5} L${x1 + ty * h * 0.5},${y1 - tx * h * 0.5} Z`} fill={C.force} />
  </g>;
}
