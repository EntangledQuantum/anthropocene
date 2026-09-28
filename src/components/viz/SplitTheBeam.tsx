import { useState } from 'react';
import { SG, countInCup, deflectionMM, fireAtoms, type Beam } from '../../lib/physics/stern-gerlach.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * Stern–Gerlach. Silver atoms from an oven fly through a magnet whose field is
 * stronger near the knife-edge pole, and land on a glass plate. On the left,
 * the magnet seen from the oven; on the right, the plate, face on, in mm.
 *
 * Ungraded: fire volleys, and swap the silver for tiny compass needles aimed
 * every which way to see what the classical picture predicts: one smeared band.
 * Graded (`id`, `cup`): the magnet is turned; drag the collecting cup to where
 * the atoms will land, then fire. Firing is the check. Every hit is computed by
 * `fireAtoms` in src/lib/physics/stern-gerlach.ts.
 */
export interface SplitTheBeamProps {
  id?: string;
  prompt?: string;
  /** Magnet axis, degrees: 0 knife-edge up, 90 knife-edge to the right. */
  axisDeg?: number;
  /** Show the cup (graded mode). */
  cup?: boolean;
  cupStart?: [number, number];
  explanation?: string;
}

const VOLLEY = 200;
const CUP_R = 0.035; // mm
const HALF = 0.22;   // mm, half the plate height shown

export default function SplitTheBeam({ id, prompt, axisDeg = 0, cup, cupStart = [0, 0.12], explanation }: SplitTheBeamProps) {
  const graded = Boolean(id && cup);
  const task = useTask(graded ? id : undefined, 'split-the-beam');
  const [beam, setBeam] = useState<Beam>('silver');
  const [hits, setHits] = useState<[number, number][]>([]);
  const [volleys, setVolleys] = useState(0);
  const [cupAt, setCupAt] = useState<Vec>(cupStart);
  const [lastCaught, setLastCaught] = useState(0);
  const d = deflectionMM();

  const fire = () => {
    const shot = fireAtoms(VOLLEY, axisDeg, beam, 17 + volleys * 31 + (beam === 'needles' ? 1000 : 0));
    setHits((h) => [...h.slice(-(VOLLEY * 4)), ...shot]);
    setVolleys((v) => v + 1);
    if (graded) {
      const k = countInCup(shot, cupAt, CUP_R);
      setLastCaught(k);
      task.check(k >= 0.3 * VOLLEY, { cupAt, caught: k });
    }
  };

  const swap = () => { setBeam((b) => (b === 'silver' ? 'needles' : 'silver')); setHits([]); setVolleys(0); };
  const fresh = hits.length - Math.min(hits.length, VOLLEY);

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {!graded && <button type="button" className="anth-btn anth-btn-primary" onClick={fire} style={{ padding: '9px 18px', fontSize: 15 }}>
            Fire {VOLLEY} {beam === 'silver' ? 'atoms' : 'needles'}
          </button>}
          {!graded && <button type="button" className="anth-btn" onClick={swap} style={{ padding: '9px 18px', fontSize: 15 }}>
            {beam === 'silver' ? 'Swap in compass needles' : 'Back to silver atoms'}
          </button>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Landed" value={String(hits.length)} />
            {graded && <Meter label="In your cup, last volley" value={`${lastCaught} of ${VOLLEY}`} color={C.position} />}
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} label={`Fire ${VOLLEY} atoms`}
          onCheck={fire}
          miss={`Your cup caught ${lastCaught} of ${VOLLEY}. The atoms landed ${d.toFixed(2)} mm either side of the middle, along the magnet's axis.`}
          hit={explanation} />}
      </div>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2.6fr)', gap: 14, alignItems: 'center' }}>
        <div>
          <Magnet deg={axisDeg} />
          <p className="hud-label" style={{ margin: '4px 0 0', textAlign: 'center' }}>magnet, seen from the oven</p>
        </div>
        <div>
          <Stage x={[-HALF, HALF]} y={[-HALF, HALF]} height={300} equal
            axes={{ x: 'mm', y: 'mm', xTicks: [-0.2, -0.1, 0, 0.1, 0.2], yTicks: [-0.2, -0.1, 0, 0.1, 0.2] }}
            label={`Glass plate with ${hits.length} atoms landed`}>
            {(s) => <>
              <style>{'@keyframes sg41pop { from { opacity: 0; } to { opacity: 0.9; } }'}</style>
              <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(-HALF)} y2={s.sy(HALF)} stroke={C.rule} strokeWidth={1.4} />
              {hits.map(([x, y], i) => (
                <circle key={`${volleys}-${i}`} cx={s.sx(x)} cy={s.sy(y)} r={2.1} fill={C.position}
                  style={i >= fresh ? { animation: `sg41pop 0.2s ease-out ${(i - fresh) * 5}ms both` } : { opacity: 0.9 }} />
              ))}
              {graded && <>
                <circle cx={s.sx(cupAt[0])} cy={s.sy(cupAt[1])} r={s.len(CUP_R)} fill="none" stroke={C.ink} strokeWidth={2} strokeDasharray="5 4" />
                <Handle s={s} at={cupAt} r={7} step={0.01} label="The cup: drag it where the atoms will land"
                  onChange={(p) => { setCupAt([Math.max(-0.2, Math.min(0.2, p[0])), Math.max(-0.2, Math.min(0.2, p[1]))]); task.touch(); }} />
              </>}
            </>}
          </Stage>
          <p className="hud-label" style={{ margin: '4px 0 0', textAlign: 'center' }}>
            glass plate, face on · {beam === 'silver' ? 'silver atoms' : 'compass needles, aimed at random'} · beam width {(SG.spread * 1000).toFixed(0)} µm
          </p>
        </div>
      </div>
    </SceneCard>
  );
}

/** The pole pieces end on: a knife edge (N) over a groove (S), rotated so the
 *  knife edge points along the axis. The field is strongest at the edge. A
 *  picture, not to scale: its own small SVG, so it stays legible in a narrow column. */
function Magnet({ deg }: { deg: number }) {
  const S = 80; // px per unit
  const cx = 110, cy = 120;
  const a = (deg * Math.PI) / 180;
  const rot = (p: Vec): Vec => [p[0] * Math.cos(a) + p[1] * Math.sin(a), -p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const px = (p: Vec): Vec => { const q = rot(p); return [cx + q[0] * S, cy - q[1] * S]; };
  const path = (pts: Vec[]) => pts.map((p, i) => { const q = px(p); return `${i ? 'L' : 'M'}${q[0]},${q[1]}`; }).join('') + 'Z';
  const knife: Vec[] = [[-0.75, 1.3], [0.75, 1.3], [0.75, 0.6], [0.08, 0.2], [-0.08, 0.2], [-0.75, 0.6]];
  const groove: Vec[] = [[-0.75, -1.3], [0.75, -1.3], [0.75, -0.3], [0.25, -0.3], [0, -0.52], [-0.25, -0.3], [-0.75, -0.3]];
  const nAt = px([0, 0.85]), sAt = px([0, -0.95]);
  const tip = px([0, 0.17]), tail = px([0, -0.25]);
  return <svg viewBox="0 0 220 240" role="img" aria-label={`The magnet seen from the oven, knife edge at ${deg} degrees`}
    style={{ width: '100%', maxWidth: 220, display: 'block', margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
    <path d={path(knife)} fill={C.surface} stroke={C.soft} strokeWidth={2} />
    <path d={path(groove)} fill={C.surface} stroke={C.soft} strokeWidth={2} />
    <text x={nAt[0]} y={nAt[1] + 6} textAnchor="middle" fontSize={17} fontWeight={600} fill={C.soft}>N</text>
    <text x={sAt[0]} y={sAt[1] + 6} textAnchor="middle" fontSize={17} fontWeight={600} fill={C.soft}>S</text>
    <line x1={tail[0]} y1={tail[1]} x2={tip[0]} y2={tip[1]} stroke={C.field} strokeWidth={2} strokeDasharray="3 3" />
    <circle cx={cx} cy={cy} r={5} fill={C.position} />
  </svg>;
}
