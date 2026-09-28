import { useMemo, useRef, useState } from 'react';
import { boxState, densitySampler, probabilityBetween, seededRandom } from '../../lib/physics/quantum1d.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask } from './scene.tsx';
import { Wall, pts } from './quantum-kit.tsx';

/**
 * The electron sits in one level of a 1 nm box. You cannot see it; you can
 * only fire detectors. Detector A is fixed on the wave's first crest. You
 * place detector B, then fire: 400 electrons prepared the same way are each
 * found somewhere, drawn as dots under the box, and each detector counts the
 * dots in its window. Clicks are drawn from ψ² (`densitySampler`), so where
 * the wave is a trough they land just as often as under a crest.
 *
 * Graded on the expected click rate from `probabilityBetween`, not on one
 * noisy run: B must be somewhere else and catch at least 90% as often as A.
 * Once solved, ψ² itself is drawn over the dots.
 */
export interface CatchTheElectronProps {
  id?: string;
  prompt?: string;
  level?: number;
  shots?: number;
  explanation?: string;
}

const L = 1, WIN = 0.1, A_AT = 0.25, SCALE = 0.9;
const STRIP: [number, number] = [-3.3, -2.0];

export default function CatchTheElectron({ id, prompt, level = 2, shots = 400, explanation }: CatchTheElectronProps) {
  const task = useTask(id, 'catch-the-electron');
  const state = useMemo(() => boxState(level, L, 400), [level]);
  const click = useMemo(() => densitySampler(state.xs, state.psi), [state]);
  const [b, setB] = useState(0.5);
  const [dots, setDots] = useState<{ x: number; y: number }[]>([]);
  const [shown, setShown] = useState(0);
  const [firing, setFiring] = useState(false);
  const seed = useRef(40);

  const pA = probabilityBetween(state.xs, state.psi, A_AT - WIN / 2, A_AT + WIN / 2);
  const pB = probabilityBetween(state.xs, state.psi, b - WIN / 2, b + WIN / 2);
  const apart = Math.abs(b - A_AT) >= 0.15;
  const good = apart && pB >= 0.9 * pA;

  const visible = dots.slice(0, shown);
  const inWin = (c: number) => visible.filter((d) => Math.abs(d.x - c) <= WIN / 2).length;
  const cA = inWin(A_AT), cB = inWin(b);

  const fire = () => {
    const rnd = seededRandom(seed.current++);
    const next = Array.from({ length: shots }, () => ({ x: click(rnd()), y: STRIP[0] + 0.1 + rnd() * (STRIP[1] - STRIP[0] - 0.2) }));
    setDots(next);
    setShown(0);
    setFiring(true);
    // Reveal in ~1.2 s at about 8 updates a second, then grade.
    let n = 0;
    const timer = window.setInterval(() => {
      n = Math.min(shots, n + Math.ceil(shots / 10));
      setShown(n);
      if (n >= shots) {
        window.clearInterval(timer);
        setFiring(false);
        task.check(good, { b, pA, pB });
      }
    }, 120);
  };

  const final = { a: dots.filter((d) => Math.abs(d.x - A_AT) <= WIN / 2).length, b: dots.filter((d) => Math.abs(d.x - b) <= WIN / 2).length };
  const miss = !apart
    ? `B is sitting on top of A. Put it somewhere else in the box that clicks as often.`
    : `B at ${b.toFixed(2)} nm clicked ${final.b} times out of ${shots}; A clicked ${final.a}.`;

  const dens = state.psi.map((v) => v * v);
  const densMax = Math.max(...dens);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<CheckBar verdict={task.verdict} done={task.done} label={firing ? 'Firing…' : `Fire ${shots}`} disabled={firing}
        onCheck={fire} miss={miss} hit={explanation} />}>
      <Stage x={[-0.12, 1.12]} y={[-3.75, 1.75]} height={400}
        label={`The level ${level} wave in a one nanometre box. Detector A at ${A_AT} nanometres, detector B at ${b.toFixed(2)} nanometres.`}>
        {(s) => <>
          <Wall s={s} id="cte-l" x0={-0.1} x1={0} y0={-1.7} y1={1.7} />
          <Wall s={s} id="cte-r" x0={L + 0.1} x1={L} y0={-1.7} y1={1.7} />
          <line x1={s.sx(0)} x2={s.sx(L)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.grid} />
          <polyline points={pts(s, state.xs, state.psi.map((v) => SCALE * v))} fill="none" stroke={C.position} strokeWidth={3} />
          <text x={s.sx(0.02)} y={s.sy(1.45)} fontSize={14} fill={C.position} fontWeight={600}>ψ</text>
          {/* the detector strip */}
          <rect x={s.sx(0)} y={s.sy(STRIP[1])} width={s.sx(L) - s.sx(0)} height={s.sy(STRIP[0]) - s.sy(STRIP[1])} fill="none" stroke={C.grid} />
          <text x={s.sx(0)} y={s.sy(STRIP[1]) - 8} fontSize={13} fill={C.faint}>where each electron was found</text>
          {task.done && <polygon fill={C.position} opacity={0.18}
            points={`${s.sx(0)},${s.sy(STRIP[0])} ${pts(s, state.xs, dens.map((d) => STRIP[0] + (d / densMax) * (STRIP[1] - STRIP[0])))} ${s.sx(L)},${s.sy(STRIP[0])}`} />}
          {visible.map((d, i) => <circle key={i} cx={s.sx(d.x)} cy={s.sy(d.y)} r={2.2} fill={C.ink} opacity={0.75} />)}
          {[{ c: A_AT, name: 'A', n: cA, col: C.soft }, { c: b, name: 'B', n: cB, col: C.ink }].map((d) => (
            <g key={d.name}>
              <rect x={s.sx(d.c - WIN / 2)} y={s.sy(1.7)} width={s.sx(d.c + WIN / 2) - s.sx(d.c - WIN / 2)} height={s.sy(STRIP[0]) - s.sy(1.7)}
                fill={d.col} opacity={0.07} stroke={d.col} strokeWidth={1.5} strokeDasharray={d.name === 'A' ? '5 4' : undefined} />
              <text x={s.sx(d.c)} y={s.sy(STRIP[0]) + 20} textAnchor="middle" fontSize={14} fontWeight={600} fill={d.col}>
                {d.name}{dots.length > 0 ? `: ${d.n}` : ''}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((x) => (
            <text key={x} x={s.sx(x)} y={s.sy(-1.7) + 16} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{x} nm</text>
          ))}
          <Handle s={s} at={[b, 1.7]} step={0.01} color={C.ink} label="Detector B: drag along the box"
            clamp={(p) => [Math.min(L - WIN / 2, Math.max(WIN / 2, p[0])), 1.7]}
            onChange={(p) => { if (firing) return; setB(Math.round(p[0] * 100) / 100); setDots([]); setShown(0); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Electron in level {level} of a 1 nm box · each detector window is {WIN} nm wide · dots: {shots} electrons, one position each{task.done ? ' · shaded: ψ²' : ''}
      </p>
    </SceneCard>
  );
}
