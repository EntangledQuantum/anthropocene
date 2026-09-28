import { useState } from 'react';
import { SG, countInCup, deflectionMM, fireAtoms, type Beam } from '../../lib/physics/stern-gerlach.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

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
          <Stage x={[-1, 1]} y={[-1.25, 1.25]} height={300} equal label={`The magnet seen from the oven, knife edge at ${axisDeg} degrees`}>
            {(s) => <Magnet s={s} deg={axisDeg} />}
          </Stage>
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
 *  knife edge points along the axis. The field is strongest at the edge. */
function Magnet({ s, deg }: { s: StageApi; deg: number }) {
  const a = (deg * Math.PI) / 180;
  const rot = (p: Vec): Vec => [p[0] * Math.cos(a) + p[1] * Math.sin(a), -p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const path = (pts: Vec[]) => pts.map((p, i) => { const q = rot(p); return `${i ? 'L' : 'M'}${s.sx(q[0])},${s.sy(q[1])}`; }).join('') + 'Z';
  const knife: Vec[] = [[-0.75, 1.05], [0.75, 1.05], [0.75, 0.55], [0.08, 0.2], [-0.08, 0.2], [-0.75, 0.55]];
  const groove: Vec[] = [[-0.75, -1.05], [0.75, -1.05], [0.75, -0.3], [0.25, -0.3], [0, -0.52], [-0.25, -0.3], [-0.75, -0.3]];
  const nAt = rot([0, 0.72]), sAt = rot([0, -0.8]);
  const tip = rot([0, 0.17]), tail = rot([0, -0.22]);
  return <g>
    <path d={path(knife)} fill={C.surface} stroke={C.soft} strokeWidth={2} />
    <path d={path(groove)} fill={C.surface} stroke={C.soft} strokeWidth={2} />
    <text x={s.sx(nAt[0])} y={s.sy(nAt[1]) + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.soft}>N</text>
    <text x={s.sx(sAt[0])} y={s.sy(sAt[1]) + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.soft}>S</text>
    <line x1={s.sx(tail[0])} y1={s.sy(tail[1])} x2={s.sx(tip[0])} y2={s.sy(tip[1])} stroke={C.field} strokeWidth={2} strokeDasharray="3 3" />
    <circle cx={s.sx(0)} cy={s.sy(0)} r={4} fill={C.position} />
  </g>;
}
