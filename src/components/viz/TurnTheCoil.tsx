import { useEffect, useState } from 'react';
import { loopSides, loopTorque } from '../../lib/physics/magnetism.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { CoilEdgeOn, PolesAndField } from './magnet-kit-ch27.tsx';

/**
 * A current-carrying coil between the poles of a magnet, seen along its axle.
 * One control: drag the end of the coil to turn it. The two long sides are
 * wire ends (⊙ current toward you, ⊗ away); the amber force on each is
 * N I L × B from `loopSides`, and it never changes size or direction as the
 * coil turns. Only the gap between their lines of action changes, and with it
 * the torque. The net force is always zero.
 *
 * Graded (`id`): turn the coil to where it would rest if let go and stay if
 * nudged: μ along B. The unstable balance at 180° gets its own miss line.
 */
export interface TurnTheCoilProps {
  id?: string;
  prompt?: string;
  /** Starting angle from B to μ, degrees. */
  start?: number;
  tolerance?: number;
  explanation?: string;
}

// the scene's coil: 20 turns, 2 A, 4 cm wide, 5 cm long, in 0.5 T
export const COIL = { N: 20, I: 2, w: 0.04, len: 0.05, B: 0.5 } as const;
const A = COIL.w * COIL.len;
const HALF = 2.6; // drawn half-width, stage units
const PER_N = 2.4;

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const signed = (d: number) => { const n = norm360(d); return n > 180 ? n - 360 : n; };

export default function TurnTheCoil({ id, prompt, start = 50, tolerance = 6, explanation }: TurnTheCoilProps) {
  const task = useTask(id, 'turn-the-coil');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [deg, setDeg] = useState(start);
  const th = (deg * Math.PI) / 180;
  const sides = loopSides(COIL.N, COIL.I, COIL.w, COIL.len, COIL.B, th);
  const tz = sides.torque[2];
  const netF = Math.hypot(sides.net[0], sides.net[1], sides.net[2]);
  const fSide = Math.hypot(...sides.sides[0].F);
  const d = signed(deg);
  const turnWord = (t: number) => (Math.abs(t) < 5e-4 ? '' : t < 0 ? ' clockwise' : ' counterclockwise');
  const nudged = Math.abs(loopTorque(COIL.N, COIL.I, A, COIL.B, Math.PI + (5 * Math.PI) / 180));

  const ok = Math.abs(d) <= tolerance;
  const nearFlip = Math.abs(Math.abs(d) - 180) <= tolerance;
  const miss = nearFlip
    ? `The torque here is only ${Math.abs(tz).toFixed(3)} N·m, but nudged 5° either way it grows to ${nudged.toFixed(3)} N·m and turns the coil further away. This balance does not hold.`
    : `At ${Math.abs(d).toFixed(0)}° the field still twists the coil with ${Math.abs(tz).toFixed(3)} N·m${turnWord(tz)}.`;

  const tip: [number, number] = [-Math.sin(th) * HALF, Math.cos(th) * HALF];
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Angle from B to μ" value={`${Math.abs(d).toFixed(0)}°`} />
          <Meter label="Force on each long side" value={fSide.toFixed(2)} unit="N" color={C.force} />
          <Meter label="Net force" value={netF.toFixed(2)} unit="N" color={C.force} />
          <Meter label="Torque" value={Math.abs(tz).toFixed(3)} unit={`N·m${turnWord(tz)}`} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done}
          onCheck={() => task.check(ok, { deg: d })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-7.5, 7.5]} y={[-4.6, 4.6]} height={360} equal
        label={`Coil between magnet poles, turned ${Math.abs(d).toFixed(0)} degrees from the field. Torque ${Math.abs(tz).toFixed(3)} newton metres.`}>
        {(s) => <>
          <PolesAndField s={s} x={[-7.9, 7.9]} y={[-4.4, 4.4]} label="B, 0.50 T" />
          <CoilEdgeOn s={s} theta={th} half={HALF} sign={1} perN={PER_N}
            forces={[[sides.sides[0].F[0], sides.sides[0].F[1]], [sides.sides[1].F[0], sides.sides[1].F[1]]]} />
          <Handle s={s} at={tip} color={C.ink} step={0.12} r={7} label="The coil: drag its end to turn it"
            onChange={(p) => { setDeg(Math.round((Math.atan2(p[1], p[0]) * 180) / Math.PI - 90)); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Looking along the axle · 20 turns carrying 2 A · ⊙ current toward you, ⊗ away · amber: force on each side · dashed: its line of action · μ: the coil’s face direction
      </p>
    </SceneCard>
  );
}
