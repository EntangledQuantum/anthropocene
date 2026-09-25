import { useState } from 'react';
import { COPPER, newWire, pullWire, type Wire } from '../../lib/physics/statics.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { HWire, MmScale } from './wire-ch11.tsx';

/**
 * Two copper wires, 2 m long, one 1 mm thick and one 2 mm thick. The thin
 * one carries a fixed pull; you drag the tip of the pull on the thick one.
 * The stretch is drawn magnified (x is in millimetres of stretch) with a
 * dashed line through the thin wire's end, so matching the stretch is a
 * thing you see. Physics: `pullWire` in statics.ts, all in the elastic range.
 *
 * With `id` it grades itself: make the thick wire stretch exactly as far.
 */
export interface MatchTheStretchProps {
  id?: string;
  prompt?: string;
  /** Fixed pull on the thin wire, N. */
  thinLoad?: number;
  /** Starting pull on the thick wire, N. */
  start?: number;
  /** mm of stretch that counts as equal. */
  tolerance?: number;
  explanation?: string;
}

const THIN: Wire = { length: 2, diameter: 1e-3, material: COPPER };
const THICK: Wire = { length: 2, diameter: 2e-3, material: COPPER };
const K = 0.008; // mm-units of arrow per newton
const FMAX = 160;
const Y_THIN = 1.9, Y_THICK = 0.95;

export default function MatchTheStretch({ id, prompt, thinLoad = 30, start = 30, tolerance = 0.02, explanation }: MatchTheStretchProps) {
  const task = useTask(id, 'match-the-stretch');
  const [F, setF] = useState(start);
  const a = pullWire(newWire(), THIN, thinLoad);
  const b = pullWire(newWire(), THICK, F);
  const ea = a.extension * 1000, eb = b.extension * 1000;
  const hit = Math.abs(ea - eb) <= tolerance;
  const MPa = (p: number) => (p / 1e6).toFixed(1);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Thin wire stretches" value={ea.toFixed(2)} unit="mm" color={C.position} />
          <Meter label="Thick wire stretches" value={eb.toFixed(2)} unit="mm" color={C.position} />
          {task.done && <Meter label="Stress in each" value={`${MPa(a.stress)} and ${MPa(b.stress)}`} unit="MPa" />}
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { F })}
          miss={`Pulled with ${F.toFixed(0)} N, the thick wire stretches ${eb.toFixed(2)} mm; the thin one ${ea.toFixed(2)} mm.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.35, 2.45]} y={[0.3, 2.55]} height={270}
        label={`Two copper wires. The thin one stretches ${ea.toFixed(2)} millimetres under ${thinLoad} newtons; the thick one ${eb.toFixed(2)} millimetres under ${F.toFixed(0)} newtons.`}>
        {(s) => <>
          <line x1={s.sx(ea)} x2={s.sx(ea)} y1={s.sy(2.4)} y2={s.sy(0.6)} stroke={C.ink} strokeDasharray="4 5" opacity={0.6} />
          <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(2.4)} y2={s.sy(0.6)} stroke={C.ghost} />
          <HWire s={s} y={Y_THIN} end={ea} from={-1.3} thick={2.5} label="1 mm thick, 2 m long" />
          <HWire s={s} y={Y_THICK} end={eb} from={-1.3} thick={5} label="2 mm thick, 2 m long" />
          <Arrow s={s} from={[ea + 0.03, Y_THIN]} to={[ea + 0.03 + thinLoad * K, Y_THIN]} color={C.force} label={`${thinLoad} N`} />
          <Arrow s={s} from={[eb + 0.03, Y_THICK]} to={[eb + 0.03 + F * K, Y_THICK]} color={C.force} label={`${F.toFixed(0)} N`} />
          <Handle s={s} at={[eb + 0.03 + F * K, Y_THICK]} step={0.008} color={C.force} label="Pull on the thick wire: drag the arrow tip"
            onChange={(p) => { setF(Math.round(Math.max(0, Math.min(FMAX, (p[0] - eb - 0.03) / K)))); task.touch(); }} />
          <MmScale s={s} y={0.5} to={1.2} minor={0.1} major={0.2} />
          <text x={s.sx(0) + 4} y={s.sy(2.4) + 4} fontSize={12} fill={C.faint}>unstretched</text>
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>Both copper · the stretch is magnified; the scale reads true millimetres · dashed: where the thin wire ends</p>
    </SceneCard>
  );
}
