import { useState } from 'react';
import { siUnit, wireField } from '../../lib/physics/biot.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';
import { CurrentMark, FieldKey, FieldLinesStage, ScaleBar } from './magnet-kit-ch28.tsx';

/**
 * One long wire seen end-on and one small compass. Turn the needle to the way
 * it will settle. The tempting answer points the needle at the wire (or away),
 * the way an electric field would. The field of a current does neither: it
 * runs round the wire. Once solved, the painted field lines appear (circles),
 * with a ring of needles all lying along them.
 *
 * The field is `wireField` from biot.ts; the shading underneath shows only
 * |B|, which is the same all round a circle, so it gives away no direction.
 */
export interface AimTheCompassProps {
  id?: string;
  prompt?: string;
  /** Current, A: + out of the page, − into it. */
  current?: number;
  /** Compass centre, cm from the wire. */
  at?: [number, number];
  /** Needle's starting angle, degrees from +x. */
  start?: number;
  /** Largest error that counts, degrees. */
  tolerance?: number;
  explanation?: string;
}

const NEEDLE = 1.5; // cm, centre to tip

function Needle({ s, c, ang, len = NEEDLE, width = 5 }: { s: StageApi; c: Vec; ang: number; len?: number; width?: number }) {
  const u: Vec = [Math.cos(ang), Math.sin(ang)];
  const n: Vec = [-u[1] * len * 0.18, u[0] * len * 0.18];
  const P = (x: number, y: number) => `${s.sx(x)},${s.sy(y)}`;
  const tip: Vec = [c[0] + u[0] * len, c[1] + u[1] * len];
  const tail: Vec = [c[0] - u[0] * len, c[1] - u[1] * len];
  return <g pointerEvents="none" strokeLinejoin="round">
    <polygon points={`${P(tip[0], tip[1])} ${P(c[0] + n[0], c[1] + n[1])} ${P(c[0] - n[0], c[1] - n[1])}`} fill={C.field} stroke={C.field} strokeWidth={width > 3 ? 1 : 0.5} />
    <polygon points={`${P(tail[0], tail[1])} ${P(c[0] + n[0], c[1] + n[1])} ${P(c[0] - n[0], c[1] - n[1])}`} fill={C.faint} />
  </g>;
}

export default function AimTheCompass({
  id, prompt, current = -20, at = [4, 2], start = 90, tolerance = 12, explanation,
}: AimTheCompassProps) {
  const task = useTask(id, 'aim-the-compass');
  const [ang, setAng] = useState((start * Math.PI) / 180);

  const B = wireField([{ x: 0, y: 0, I: current }], at[0] / 100, at[1] / 100);
  const Bm = Math.hypot(B[0], B[1]);
  const bAng = Math.atan2(B[1], B[0]);
  let d = bAng - ang;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // −π..π: + means the needle would swing counterclockwise
  const off = Math.abs((d * 180) / Math.PI);
  const shown = task.done || !id;
  const tip: Vec = [at[0] + Math.cos(ang) * NEEDLE, at[1] + Math.sin(ang) * NEEDLE];
  const ringR = Math.hypot(at[0], at[1]);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Current" value={`${Math.abs(current)} A`} unit={current < 0 ? 'into the page' : 'out of the page'} />
          <Meter label="Field at the compass" value={siUnit(Bm, 'T', 2)} color={C.field} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(off <= tolerance, { deg: (ang * 180) / Math.PI })}
          miss={`The needle is ${off.toFixed(0)}° off the field here. Let go and it swings ${off.toFixed(0)}° ${d > 0 ? 'counterclockwise' : 'clockwise'} before it settles.`}
          hit={explanation} />}
      </div>}>
      <FieldLinesStage wires={[{ x: 0, y: 0, I: current }]} range={[Math.log2(Math.abs(current) / 14), Math.log2(Math.abs(current) / 0.8)]} lineStep={0.3 * Math.abs(current)} lines={shown} stage={(capture) =>
        <Stage x={[-10, 10]} y={[-6, 6]} height={330} equal
          label={`A wire carrying ${Math.abs(current)} amperes ${current < 0 ? 'into' : 'out of'} the page, and a compass whose needle points ${((ang * 180) / Math.PI).toFixed(0)} degrees from the right.`}>
          {(s) => { capture(s); return <>
            <ScaleBar s={s} at={[-9, -5.2]} length={2} label="2 cm" />
            {shown && Array.from({ length: 8 }, (_, k) => {
              const t = (k / 8) * 2 * Math.PI + Math.atan2(at[1], at[0]) + Math.PI / 8;
              const c: Vec = [ringR * Math.cos(t), ringR * Math.sin(t)];
              const b = wireField([{ x: 0, y: 0, I: current }], c[0] / 100, c[1] / 100);
              return <g key={k} opacity={0.8}><Needle s={s} c={c} ang={Math.atan2(b[1], b[0])} len={0.8} width={2} /></g>;
            })}
            <CurrentMark s={s} at={[0, 0]} I={current} r={14} label={`${Math.abs(current)} A`} />
            <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={s.len(NEEDLE * 1.25)} fill="var(--color-surface)" fillOpacity={0.55} stroke={C.soft} strokeWidth={2} />
            <Needle s={s} c={at} ang={ang} />
            <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={3} fill={C.ink} />
            <Handle s={s} at={tip} color={C.field} step={0.3} r={7} label="Compass needle: drag its tip round"
              onChange={(p) => { setAng(Math.atan2(p[1] - at[1], p[0] - at[0])); task.touch(); }} />
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>Cross: current into the page · dot: out of it · coloured end: the needle's north</span>
        <FieldKey lines={shown} />
      </p>
    </SceneCard>
  );
}
