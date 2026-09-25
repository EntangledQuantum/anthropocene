import { useEffect, useRef, useState } from 'react';
import { BOX_H, BOX_W, MID, arrangementOf, binomial, createGasBox, leftIn, stepGas, type GasBox } from '../../lib/physics/entropy.ts';
import { C, CheckBar, SceneCard, useTask } from './scene.tsx';

/**
 * Four labelled particles in a box with a closed divider. Tap a particle to
 * move it to the other side. Every distinct arrangement you build drops a
 * tile into its column, sorted by how many are on the left.
 *
 * Graded with `id`: find every arrangement with two on each side. Once that
 * is solved, "Let them fly" opens the divider and runs the real gas; each
 * tile's bar is then the share of time the gas spends in that arrangement,
 * measured, not assumed. They come out equal, so the column with the most
 * tiles is where the gas spends most of its time.
 *
 * Physics: `createGasBox` / `stepGas` / `arrangementOf` in entropy.ts.
 */
export interface CountTheWaysProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const N = 4;
const ALL = 1 << N;
const SPEEDUP = 10;
const DT = 1 / 60;
const BX = 16, BY = 30, BW = 250, BH = 150;
const COL_X = 300, COL_W = 66, TILE_H = 26;

const label = (a: number) => {
  const L: number[] = [], R: number[] = [];
  for (let i = 0; i < N; i++) (a & (1 << i) ? L : R).push(i + 1);
  return `${L.join('') || '–'} | ${R.join('') || '–'}`;
};
/** Columns run from all-left (4) to none-left (0). */
const colOf = (a: number) => N - leftIn(a);

export default function CountTheWays({ id, prompt, explanation }: CountTheWaysProps) {
  const task = useTask(id, 'count-the-ways');
  const [arr, setArr] = useState(0b1111);
  const [found, setFound] = useState<number[]>([0b1111]);
  const [running, setRunning] = useState(false);
  const [share, setShare] = useState<number[] | null>(null);
  const gas = useRef<GasBox | null>(null);
  const tally = useRef(new Float64Array(ALL));
  const total = useRef(0);
  const dots = useRef<(SVGGElement | null)[]>([]);
  const bars = useRef<(SVGRectElement | null)[]>([]);

  const flip = (i: number) => {
    if (running) return;
    const a = arr ^ (1 << i);
    setArr(a);
    setFound((f) => (f.includes(a) ? f : [...f, a]));
    task.touch();
  };

  useEffect(() => {
    if (!running) return;
    const g = createGasBox(N, 1);
    g.closed = false;
    gas.current = g;
    tally.current = new Float64Array(ALL);
    total.current = 0;
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) * SPEEDUP;
      last = now;
      for (let k = 0; k < Math.round(dt / DT); k++) {
        stepGas(g, DT);
        tally.current[arrangementOf(g)] += DT;
        total.current += DT;
      }
      for (let i = 0; i < N; i++) {
        const el = dots.current[i];
        if (el) el.setAttribute('transform', `translate(${BX + (g.x[i] / BOX_W) * BW},${BY + BH - (g.y[i] / BOX_H) * BH})`);
      }
      for (let a = 0; a < ALL; a++) {
        const el = bars.current[a];
        if (el) el.setAttribute('width', String(Math.min(1, (tally.current[a] / total.current) * 8) * (COL_W - 8)));
      }
      if (now - lastShown > 150) {
        lastShown = now;
        setShare(Array.from(tally.current, (v) => v / total.current));
        setArr(arrangementOf(g));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const twoTwo = found.filter((a) => leftIn(a) === 2).length;
  const shownTiles = running ? Array.from({ length: ALL }, (_, a) => a) : found;
  const stacks: number[][] = [[], [], [], [], []];
  for (const a of shownTiles) stacks[colOf(a)].push(a);
  for (const s of stacks) s.sort((p, q) => p - q);

  // resting place of particle i: its own row, in the half it is in
  const rest = (i: number, a: number) =>
    [BX + (a & (1 << i) ? 0.25 : 0.75) * BW + (i % 2 ? 18 : -18), BY + 24 + i * 34] as const;

  const colShare = (c: number) => (share ? stacks[c].reduce((s, a) => s + share[a], 0) : 0);
  const secs = total.current;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, color: C.soft }}>
            {running ? `Gas running · ${secs.toFixed(0)} s measured` : `${found.length} arrangement${found.length === 1 ? '' : 's'} built · ${twoTwo} with two on each side`}
          </span>
          {(task.done || !id) && (
            <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }} onClick={() => setRunning((r) => !r)}>
              {running ? 'Stop the gas' : 'Let them fly'}
            </button>
          )}
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(twoTwo === binomial(N, 2), { found })}
          miss={`${twoTwo} different arrangement${twoTwo === 1 ? '' : 's'} with two on each side so far. Each one is a different pair on the left.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 300" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Four labelled particles; the arrangement is ${label(arr)}.`}>
        {/* the box */}
        <rect x={BX} y={BY} width={BW} height={BH} fill="none" stroke={C.ink} strokeWidth={2.5} />
        <line x1={BX + BW / 2} x2={BX + BW / 2} y1={BY} y2={BY + BH} stroke={running ? C.grid : C.ink}
          strokeWidth={running ? 1.5 : 4} strokeDasharray={running ? '4 6' : undefined} />
        <text x={BX + 6} y={BY - 10} fontSize={13} fill={C.faint}>left</text>
        <text x={BX + BW - 6} y={BY - 10} fontSize={13} fill={C.faint} textAnchor="end">right</text>
        <text x={BX} y={BY + BH + 24} fontSize={13} fill={C.soft}>now: {label(arr)}</text>
        {Array.from({ length: N }, (_, i) => {
          const [x, y] = rest(i, arr);
          return (
            <g key={i} ref={(el) => { dots.current[i] = el; }} transform={running ? undefined : `translate(${x},${y})`}
              role="button" tabIndex={running ? -1 : 0} aria-label={`Particle ${i + 1}, on the ${arr & (1 << i) ? 'left' : 'right'}. Move it across.`}
              style={{ cursor: running ? 'default' : 'pointer' }}
              onClick={() => flip(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(i); } }}>
              <circle r={13} fill={C.surface} stroke={C.position} strokeWidth={2.5} />
              <text y={5} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.position}>{i + 1}</text>
            </g>
          );
        })}
        {/* the columns of arrangements */}
        {stacks.map((s, c) => {
          const x = COL_X + c * COL_W;
          return <g key={c}>
            <text x={x + COL_W / 2 - 4} y={20} textAnchor="middle" fontSize={13} fill={C.soft}>{N - c} left</text>
            <line x1={x} x2={x + COL_W - 8} y1={28} y2={28} stroke={C.rule} />
            {s.map((a, j) => {
              const y = 36 + j * (TILE_H + 8);
              const lit = a === arr;
              return <g key={a}>
                <rect x={x} y={y} width={COL_W - 8} height={TILE_H} rx={3} fill={C.surface}
                  stroke={lit ? C.position : C.rule} strokeWidth={lit ? 2 : 1} />
                <text x={x + (COL_W - 8) / 2} y={y + 17} textAnchor="middle" fontSize={12} fill={C.ink} fontFamily="var(--font-mono)">{label(a)}</text>
                {running && <rect ref={(el) => { bars.current[a] = el; }} x={x} y={y + TILE_H + 1} height={4} width={0} fill={C.position} />}
              </g>;
            })}
            {running && share && <text x={x + COL_W / 2 - 4} y={290} textAnchor="middle" fontSize={13} fill={C.ink} fontFamily="var(--font-mono)">
              {(colShare(c) * 100).toFixed(0)}%
            </text>}
          </g>;
        })}
        {running && <text x={COL_X} y={272} fontSize={12} fill={C.faint}>share of the time in each column</text>}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Tiles read left | right · {running ? 'bar under each tile: its share of the time, full width at 1/8' : 'each tile is one arrangement you have built'}
      </p>
    </SceneCard>
  );
}
