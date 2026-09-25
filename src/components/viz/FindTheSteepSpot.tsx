import { useMemo, useState } from 'react';
import { along, field, fieldStrength, potential, scanTrack, sceneToSI, type SceneCharge } from '../../lib/physics/potential-ch23.ts';
import { si as fmt } from '../../lib/physics/charges-ch21.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ChargeDot } from './charge-kit-ch21.tsx';
import { PotentialKey, PotentialStage, ScaleBar } from './potential-kit-ch23.tsx';

/**
 * A potential map, a straight track across it, and a probe that slides along
 * the track. The meter shows V at the probe, live. The field strength stays
 * hidden until you check.
 *
 * The task is to park the probe where the field is strongest. V is the lure:
 * the highest ground on the track sits near the big + charge, but the field is
 * strongest near the small − charge, where V is lowest and the contours are
 * packed tightest (pinned in potential-ch23.test.ts). A spark would start there.
 *
 * Physics: `scanTrack`, `fieldStrength`, `potential` from potential-ch23.ts.
 */
export interface FindTheSteepSpotProps {
  id: string;
  prompt?: string;
  charges?: SceneCharge[];
  /** Track ends, cm. */
  track?: [[number, number], [number, number]];
  /** Where the probe starts, as a fraction of the track. */
  start?: number;
  /** Fraction of the strongest field that counts as "the strongest". */
  tolerance?: number;
  explanation?: string;
}

const X: [number, number] = [-22, 20];
const Y: [number, number] = [-13, 13];
const CM = 0.01;

export default function FindTheSteepSpot({
  id, prompt, charges = [{ x: -10, y: -4, q: 8 }, { x: 8, y: 0.5, q: -3 }],
  track = [[-18, 3], [16, 3]], start = 0.45, tolerance = 0.85, explanation,
}: FindTheSteepSpotProps) {
  const task = useTask(id, 'find-the-steep-spot');
  const siC = useMemo(() => sceneToSI(charges), [charges]);
  const [t, setT] = useState(start);
  const [a, b] = track;
  const p = along(a, b, t) as Vec;
  const scan = useMemo(() => scanTrack(siC, [a[0] * CM, a[1] * CM], [b[0] * CM, b[1] * CM]), [siC, a, b]);
  const V = potential(siC, p[0] * CM, p[1] * CM);
  const E = fieldStrength(siC, p[0] * CM, p[1] * CM);
  const ok = E >= tolerance * scan.eMax;
  const revealed = task.verdict !== 'none' || task.done;
  const eVec = field(siC, p[0] * CM, p[1] * CM);
  const best = along(a, b, scan.tE);

  const project = (r: Vec) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const u = ((r[0] - a[0]) * dx + (r[1] - a[1]) * dy) / (dx * dx + dy * dy);
    setT(Math.max(0, Math.min(1, u)));
    task.touch();
  };
  const L = 3 * Math.min(1, E / scan.eMax) + 0.6;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Potential at the probe" value={V.toFixed(0)} unit="V" color={C.ink} />
          <Meter label="Field strength at the probe" value={revealed ? fmt(E, 'V/m') : 'hidden'} color={C.field} />
        </div>
        <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { t })}
          miss={`The field here is ${fmt(E, 'V/m')}. Elsewhere on the track it reaches ${fmt(scan.eMax, 'V/m')}.`}
          hit={explanation} />
      </div>}>
      <PotentialStage charges={charges} stage={(capture) =>
        <Stage x={X} y={Y} height={360} equal
          label={`Potential map with a straight track. The probe is at ${p[0].toFixed(1)} cm along it, where V is ${V.toFixed(0)} volts.`}>
          {(s) => { capture(s); return <>
            <ScaleBar s={s} at={[-20.5, -11.8]} />
            <line x1={s.sx(a[0])} y1={s.sy(a[1])} x2={s.sx(b[0])} y2={s.sy(b[1])} stroke={C.ink} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
            {charges.map((c, i) => <ChargeDot key={i} s={s} at={[c.x, c.y]} q={c.q} label={`${c.q > 0 ? '+' : '−'}${Math.abs(c.q)} nC`} />)}
            {task.done && <circle cx={s.sx(best[0])} cy={s.sy(best[1])} r={14} fill="none" stroke={C.field} strokeWidth={2} strokeDasharray="4 3" />}
            {revealed && <Arrow s={s} from={p} to={[p[0] + (eVec[0] / E) * L, p[1] + (eVec[1] / E) * L]} color={C.field} width={4} label="E" />}
            <Handle s={s} at={p} step={0.3} r={10} color={C.ink} label="Probe: slide it along the track" onChange={project} />
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>White bar: the track{revealed ? ' · orchid: the field at the probe' : ''}</span>
        <PotentialKey />
      </p>
    </SceneCard>
  );
}
