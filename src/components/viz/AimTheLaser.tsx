import { useState } from 'react';
import { N_WATER, laserLanding } from '../../lib/physics/light.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { AngleArc, Medium, Normal, Ray, WATER_FILL, useGlow } from './optics-kit-ch33.tsx';

/**
 * A pool, a coin on the floor, and a laser on the deck. Drag the aim point;
 * the dotted sight line runs dead straight to the floor. Press Fire and the
 * real beam is drawn, bending toward the normal as it enters the water, and
 * stays as a faint trace. Each shot is an attempt.
 *
 * Aimed straight at the coin, the beam lands short: it enters more steeply
 * than you aimed. Landing points come from `laserLanding` (Snell) in light.ts.
 */
export interface AimTheLaserProps {
  id?: string;
  prompt?: string;
  /** Coin position along the floor, m. */
  coin?: number;
  /** Metres from the coin's centre that count as a hit. */
  tolerance?: number;
  explanation?: string;
}

const L: Vec = [0, 1.2];
const DEPTH = 2, WIDTH = 6;

interface Shot { entry: number; land: number; wallY: number | null; t1: number; t2: number }

function fire(aim: Vec): Shot {
  const entry = L[0] + (aim[0] - L[0]) * (L[1] / (L[1] - aim[1]));
  const { landX, theta1, theta2 } = laserLanding(L, entry, -DEPTH, 1, N_WATER);
  const wallY = landX > WIDTH ? -(WIDTH - entry) / Math.tan(theta2) : null;
  return { entry, land: landX, wallY, t1: theta1, t2: theta2 };
}

export default function AimTheLaser({ id, prompt, coin = 4.2, tolerance = 0.12, explanation }: AimTheLaserProps) {
  const task = useTask(id, 'aim-the-laser');
  const [aim, setAim] = useState<Vec>([1.0, 0.5]);
  const [shots, setShots] = useState<Shot[]>([]);
  const { id: glow, defs } = useGlow();
  const last = shots[shots.length - 1];

  // The straight sight line, continued to the floor.
  const k = (L[1] + DEPTH) / (L[1] - aim[1]);
  const sight: Vec = [L[0] + (aim[0] - L[0]) * k, -DEPTH];
  const ang = Math.atan2(aim[1] - L[1], aim[0] - L[0]);

  const shoot = () => {
    const s = fire(aim);
    setShots((a) => [...a.slice(-3), s]);
    task.check(s.wallY === null && Math.abs(s.land - coin) <= tolerance, { aim, land: s.land });
  };
  const miss = !last ? '' : last.wallY !== null
    ? `The beam bent to ${(last.t2 * 180 / Math.PI).toFixed(0)}° from the normal and still reached the far wall, overshooting the coin.`
    : `The beam bent from ${(last.t1 * 180 / Math.PI).toFixed(0)}° to ${(last.t2 * 180 / Math.PI).toFixed(0)}° from the normal and landed ${Math.abs(last.land - coin).toFixed(2)} m ${last.land < coin ? 'short of' : 'past'} the coin.`;

  const end = (sh: Shot): Vec => (sh.wallY !== null ? [WIDTH, sh.wallY] : [sh.land, -DEPTH]);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id ? <CheckBar label="Fire" verdict={task.verdict} done={task.done} onCheck={shoot} miss={miss} hit={explanation} />
        : <button type="button" className="anth-btn anth-btn-primary" onClick={shoot}>Fire</button>}>
      <Stage x={[-0.8, 6.6]} y={[-2.35, 2.0]} height={330} equal
        label={`Pool 2 metres deep with a coin ${coin} metres out. ${last ? `Last shot landed at ${last.land.toFixed(2)} metres.` : 'No shots yet.'}`}>
        {(s) => <>
          {defs}
          <Medium s={s} x={[0, WIDTH]} y={[-DEPTH, 0]} fill={WATER_FILL} label={`water, n = ${N_WATER}`} labelAt={[0, -DEPTH + 0.3]} />
          <path d={`M${s.sx(-0.8)},${s.sy(0)}L${s.sx(0)},${s.sy(0)}L${s.sx(0)},${s.sy(-DEPTH)}L${s.sx(WIDTH)},${s.sy(-DEPTH)}L${s.sx(WIDTH)},${s.sy(0)}L${s.sx(6.6)},${s.sy(0)}`}
            fill="none" stroke={C.soft} strokeWidth={2.5} />
          {[0, 1, 2, 3, 4, 5, 6].map((m) => <g key={m}>
            <line x1={s.sx(m)} x2={s.sx(m)} y1={s.sy(-DEPTH)} y2={s.sy(-DEPTH) + 6} stroke={C.faint} />
            <text x={s.sx(m)} y={s.sy(-DEPTH) + 19} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{m} m</text>
          </g>)}
          {/* the coin */}
          <ellipse cx={s.sx(coin)} cy={s.sy(-DEPTH) - 3} rx={s.len(0.13)} ry={4} fill={C.soft} stroke={C.ink} strokeWidth={1.2} />
          <text x={s.sx(coin)} y={s.sy(-DEPTH) - 12} textAnchor="middle" fontSize={12} fill={C.soft}>coin</text>
          {/* the sight line: where a beam would go if nothing bent it */}
          <line x1={s.sx(L[0])} y1={s.sy(L[1])} x2={s.sx(sight[0])} y2={s.sy(sight[1])} stroke={C.faint} strokeWidth={1.4} strokeDasharray="2 6" />
          {shots.slice(0, -1).map((sh, i) => <g key={i} opacity={0.35}>
            <Ray s={s} from={L} to={[sh.entry, 0]} glow={glow} b={0.3} arrow={false} />
            <Ray s={s} from={[sh.entry, 0]} to={end(sh)} glow={glow} b={0.3} arrow={false} />
          </g>)}
          {last && <>
            <Normal s={s} at={[last.entry, 0]} len={0.9} />
            <AngleArc s={s} at={[last.entry, 0]} a0={Math.PI / 2} a1={Math.PI / 2 + last.t1} r={38} label={`${(last.t1 * 180 / Math.PI).toFixed(0)}°`} />
            <AngleArc s={s} at={[last.entry, 0]} a0={-Math.PI / 2} a1={-Math.PI / 2 + last.t2} r={38} label={`${(last.t2 * 180 / Math.PI).toFixed(0)}°`} />
            <Ray s={s} from={L} to={[last.entry, 0]} glow={glow} />
            <Ray s={s} from={[last.entry, 0]} to={end(last)} glow={glow} />
            <circle cx={s.sx(end(last)[0])} cy={s.sy(end(last)[1])} r={4} fill={C.ink} />
          </>}
          {/* the laser on its stand */}
          <line x1={s.sx(L[0])} x2={s.sx(L[0])} y1={s.sy(L[1])} y2={s.sy(0)} stroke={C.soft} strokeWidth={2} />
          <g transform={`translate(${s.sx(L[0])},${s.sy(L[1])}) rotate(${(-ang * 180) / Math.PI})`}>
            <rect x={-26} y={-6} width={30} height={12} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={1.8} />
          </g>
          <Handle s={s} at={aim} step={0.05} label="Aim point: drag it" color={C.ink}
            clamp={(p) => [Math.max(0.1, Math.min(6.4, p[0])), Math.max(-0.2, Math.min(L[1] - 0.25, p[1]))]}
            onChange={(p) => { setAim(p); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Dotted: your sight line, straight to the floor · white: the beam, once fired · angles from the normal
      </p>
    </SceneCard>
  );
}
