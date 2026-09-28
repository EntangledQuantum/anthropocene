import { useState } from 'react';
import { MODEL_ATOM, crystalBands, spread, widthOverPairSplit } from '../../lib/physics/solids.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A row of identical atoms and their energy levels. Alone, an atom has two
 * levels. Put two side by side and each splits into a pair; bring in more
 * and each level becomes as many levels as there are atoms, fanning into a
 * band. Drag the last atom to squeeze or spread the row: closer atoms share
 * their electrons more and the bands widen.
 *
 * Graded with `id` and `ratio`: add atoms until the lower band is `ratio`
 * times as wide as the pair's split. It takes more atoms than anyone
 * expects, because new levels mostly pack in rather than spread out.
 * Physics: crystalBands (tridiagonal eigenvalues) in src/lib/physics/solids.ts.
 */
export interface CrowdIntoBandsProps {
  id?: string;
  prompt?: string;
  ratio?: number;
  explanation?: string;
}

const NMAX = 12;
const DMIN = 0.22, DMAX = 0.5;
const COLS = { atom: [0.3, 1.5], pair: [2.1, 3.3], row: [4.1, 9.7] } as const;

export default function CrowdIntoBands({ id, prompt, ratio, explanation }: CrowdIntoBandsProps) {
  const graded = Boolean(id && ratio);
  const task = useTask(graded ? id : undefined, 'crowd-into-bands');
  const [N, setN] = useState(2);
  const [d, setD] = useState(0.25);
  const bands = crystalBands(N, d);
  const pair = crystalBands(2, d);
  const r = widthOverPairSplit(N);
  const change = (dn: number) => { setN((n) => Math.min(NMAX, Math.max(2, n + dn))); task.touch(); };

  const levels = (s: StageApi, col: readonly [number, number], es: number[], color: string) =>
    es.map((e, i) => <line key={i} x1={s.sx(col[0])} x2={s.sx(col[1])} y1={s.sy(e)} y2={s.sy(e)} stroke={color} strokeWidth={1.8} />);
  const shade = (s: StageApi, col: readonly [number, number], es: number[]) =>
    <rect x={s.sx(col[0]) - 4} width={s.sx(col[1]) - s.sx(col[0]) + 8} y={s.sy(Math.max(...es)) - 3}
      height={s.sy(Math.min(...es)) - s.sy(Math.max(...es)) + 6} fill={C.energy} opacity={0.1} rx={3} />;

  const lowC = MODEL_ATOM.levels[0].E;
  const half = ratio ? (ratio * spread(pair[0])) / 2 : 0;
  const rowLen = (N - 1) * d;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => change(1)} disabled={N >= NMAX}>Add an atom</button>
          <button type="button" className="anth-btn" onClick={() => change(-1)} disabled={N <= 2}>Take one away</button>
          <span className="readout" style={{ marginLeft: 'auto', fontSize: 16, color: C.ink }}>
            {N} atoms · {bands[0].length} levels in each band · spacing {d.toFixed(2)} nm
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(r >= ratio! - 1e-9, { N, d })}
          miss={`With ${N} atoms the band is ${r.toFixed(2)} times the pair's split. Each new atom adds a level, mostly inside.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[0, 10]} y={[-8.6, 0.4]} height={330} label={`Energy levels of ${N} atoms spaced ${d.toFixed(2)} nanometres apart`}
        axes={{ y: 'energy (eV)', xTicks: [], yTicks: [-8, -6, -4, -2, 0] }}>
        {(s) => <>
          {[['one atom', COLS.atom], ['two atoms', COLS.pair], [`your row of ${N}`, COLS.row]].map(([t, c]) =>
            <text key={t as string} x={(s.sx((c as readonly number[])[0]) + s.sx((c as readonly number[])[1])) / 2} y={s.sy(0.4) + 16}
              textAnchor="middle" fontSize={13} fill={C.soft}>{t as string}</text>)}
          {levels(s, COLS.atom, MODEL_ATOM.levels.map((l) => l.E), C.energy)}
          {pair.map((b, i) => <g key={i}>{shade(s, COLS.pair, b)}{levels(s, COLS.pair, b, C.energy)}</g>)}
          {bands.map((b, i) => <g key={i}>{shade(s, COLS.row, b)}{levels(s, COLS.row, b, C.energy)}</g>)}
          {graded && <g stroke={C.ink} strokeWidth={1.5} strokeDasharray="5 4">
            {[lowC - half, lowC + half].map((e) => <line key={e} x1={s.sx(COLS.row[0]) - 12} x2={s.sx(COLS.row[1]) + 12} y1={s.sy(e)} y2={s.sy(e)} />)}
          </g>}
          {graded && <text x={s.sx(COLS.row[1]) + 8} y={s.sy(lowC + half) - 8} textAnchor="end" fontSize={12} fill={C.ink}>
            {ratio} × the pair&apos;s split
          </text>}
          <text x={s.sx(COLS.row[1])} y={s.sy(Math.min(...bands[1])) + 18} textAnchor="end" fontSize={12} fill={C.faint}>
            gap {Math.max(0, Math.min(...bands[1]) - Math.max(...bands[0])).toFixed(2)} eV
          </text>
        </>}
      </Stage>
      <Stage x={[-0.2, 5.8]} y={[-0.2, 0.2]} height={70} label={`A row of ${N} atoms, ${rowLen.toFixed(2)} nanometres long`}>
        {(s) => <>
          {Array.from({ length: N }, (_, i) => i === 1 ? null :
            <circle key={i} cx={s.sx(i * d)} cy={s.sy(0)} r={9} fill={C.surface} stroke={C.soft} strokeWidth={2} />)}
          <Handle s={s} at={[d, 0]} r={9} step={0.01} color={C.position}
            label="Second atom: drag to squeeze or spread the row" clamp={(p) => [p[0], 0]}
            onChange={(p) => { setD(Math.min(DMAX, Math.max(DMIN, p[0]))); task.touch(); }} />
        </>}
      </Stage>
    </SceneCard>
  );
}
