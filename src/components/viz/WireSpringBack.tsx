import { useRef, useState } from 'react';
import { COPPER, newWire, pullWire, type Wire, type WireReading, type WireState } from '../../lib/physics/statics.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { HWire, MmScale } from './wire-ch11.tsx';

/**
 * One copper wire, 1 mm thick and 2 m long. Drag the tip of your pull; let go
 * with the button. The wire's end moves along a millimetre scale, and the
 * strip underneath records every pull against every stretch. Below 55 N the
 * record is one steep straight line, walked up and back down. Past it the
 * wire flows, the line lies down, and letting go leaves the end short of
 * zero — `pullWire` in statics.ts, elastic–plastic with hardening.
 *
 * With `id` it grades itself: pull as hard as you can and still have the
 * wire come all the way back.
 */
export interface WireSpringBackProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const WIRE: Wire = { length: 2, diameter: 1e-3, material: COPPER };
const K = 0.06; // mm-units of arrow per newton
const FMAX = 62;
const XMAX = 11;

export default function WireSpringBack({ id, prompt, explanation }: WireSpringBackProps) {
  const task = useTask(id, 'wire-spring-back');
  const wire = useRef<WireState>(newWire());
  const [F, setF] = useState(0);
  const [peak, setPeak] = useState(0);
  const [r, setR] = useState<WireReading>(() => pullWire(newWire(), WIRE, 0));
  const [trace, setTrace] = useState<[number, number][]>([[0, 0]]);

  const pull = (f: number) => {
    const reading = pullWire(wire.current, WIRE, f);
    setF(f);
    setR(reading);
    setPeak((p) => Math.max(p, f));
    setTrace((t) => [...t, [reading.extension * 1000, f]]);
    task.touch();
  };
  const fresh = () => {
    wire.current = newWire();
    setF(0); setPeak(0); setR(pullWire(newWire(), WIRE, 0)); setTrace([[0, 0]]);
    task.touch();
  };

  const e = r.extension * 1000, perm = r.permanent * 1000;
  const hit = F <= 0.5 && perm < 0.01 && peak >= 0.85 * 55;
  const miss = F > 0.5
    ? `You are still pulling with ${F.toFixed(0)} N. Let go, then check.`
    : perm >= 0.01
      ? `It stays ${perm.toFixed(2)} mm longer than it started. You pulled it to ${peak.toFixed(0)} N. Take a new wire.`
      : `It came all the way back, but you only pulled ${peak.toFixed(0)} N. It can take more.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Pull" value={F.toFixed(0)} unit="N" color={C.force} />
          <Meter label="Stretch" value={e.toFixed(2)} unit="mm" color={C.position} />
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button type="button" className="anth-btn" onClick={() => pull(0)} disabled={F === 0}>Let go</button>
            <button type="button" className="anth-btn" onClick={fresh}>New wire</button>
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { peak, perm })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-3, 15.5]} y={[0, 1.6]} height={130}
        label={`Copper wire pulled with ${F.toFixed(0)} newtons, stretched ${e.toFixed(2)} millimetres.`}>
        {(s) => <>
          <HWire s={s} y={1.05} end={Math.min(e, XMAX)} from={-2.9} thick={2.5} label="1 mm copper, 2 m long" />
          {F > 0 && <Arrow s={s} from={[Math.min(e, XMAX) + 0.15, 1.05]} to={[Math.min(e, XMAX) + 0.15 + F * K, 1.05]} color={C.force} label={`${F.toFixed(0)} N`} />}
          <Handle s={s} at={[Math.min(e, XMAX) + 0.15 + F * K, 1.05]} step={0.06} color={C.force} label="Your pull: drag the tip to the right"
            onChange={(p) => pull(Math.round(Math.max(0, Math.min(FMAX, (p[0] - Math.min(e, XMAX) - 0.15) / K))))} />
          <MmScale s={s} y={0.5} to={10} minor={0.5} major={1} />
        </>}
      </Stage>
      <Stage x={[0, XMAX]} y={[0, 65]} height={220} axes={{ x: 'stretch (mm)', y: 'pull (N)', xTicks: [0, 2, 4, 6, 8, 10], yTicks: [0, 20, 40, 60] }}
        label="Record of pull against stretch.">
        {(s) => <>
          <polyline fill="none" stroke={C.position} strokeWidth={2.5} strokeLinejoin="round"
            points={trace.map(([x, y]) => `${s.sx(Math.min(x, XMAX))},${s.sy(y)}`).join(' ')} />
          <circle cx={s.sx(Math.min(e, XMAX))} cy={s.sy(F)} r={5} fill={C.force} />
          {perm >= 0.01 && F === 0 && <text x={s.sx(Math.min(perm, XMAX)) + 8} y={s.sy(0) - 8} fontSize={13} fill={C.warn}>{perm.toFixed(2)} mm it keeps</text>}
        </>}
      </Stage>
    </SceneCard>
  );
}
