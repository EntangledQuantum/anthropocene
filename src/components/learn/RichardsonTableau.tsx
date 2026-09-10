import { useEffect, useMemo, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow } from '../viz/controls.tsx';
import { formatValue } from '../viz/chart-core.ts';
import { useWidget } from '../../lib/use-lesson.ts';
import {
  TARGETS, centralDifference, richardson, richardsonColumnOrder, richardsonTableau,
} from '../../lib/numerics/diff.ts';

export interface RichardsonTableauProps {
  id: string;
  target?: string;
  h0?: number;
  rows?: number;
  prompt?: string;
}

type CellRef = { r: number; c: number };

/**
 * A Romberg-style tableau the learner fills by choosing which two rows to
 * combine. Column 0 is computed from central differences; every later cell is
 * a Richardson step the learner has to pick the parents for. Adjacent same-
 * column pairs cancel the leading error; a skipped row with the same weights
 * does not, and that failure is visible as a scratch result that is not
 * written into the table.
 */
export default function RichardsonTableau({
  id,
  target: targetKey = 'sin',
  h0 = 0.4,
  rows = 4,
  prompt = 'Click two filled cells in the same column, then combine. Adjacent rows cancel the leading error; a skipped row does not.',
}: RichardsonTableauProps) {
  const target = TARGETS[targetKey];
  if (!target) throw new Error(`Unknown differentiation target "${targetKey}"`);

  const { solved, solve } = useWidget(id, 'richardson');
  const truth = target.df(target.x0);

  const hs = useMemo(
    () => Array.from({ length: rows }, (_, i) => h0 / 2 ** i),
    [h0, rows],
  );
  const column0 = useMemo(
    () => hs.map((h) => centralDifference(target.f, target.x0, h)),
    [hs, target],
  );
  const complete = useMemo(() => richardsonTableau(column0, 2, true), [column0]);

  const emptyGrid = (): (number | null)[][] =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: rows }, (_, c) => (c === 0 ? column0[r] : null)),
    );

  const [grid, setGrid] = useState<(number | null)[][]>(emptyGrid);
  const [picked, setPicked] = useState<CellRef[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [scratch, setScratch] = useState<{ value: number; note: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!solved) return;
    setGrid((g) => (g.slice(1).every((row) => row[1] != null) ? g : complete));
  }, [solved, complete]);

  const col1Filled = (g: (number | null)[][]) =>
    g.slice(1).every((row) => row[1] != null);

  const errOf = (v: number) => Math.abs(v - truth);

  const toggle = (r: number, c: number) => {
    if (grid[r][c] == null) return;
    const i = picked.findIndex((p) => p.r === r && p.c === c);
    if (i >= 0) {
      setPicked(picked.filter((_, k) => k !== i));
      return;
    }
    if (picked.length >= 2) setPicked([picked[1], { r, c }]);
    else setPicked([...picked, { r, c }]);
  };

  const combine = () => {
    if (picked.length !== 2) return;
    const [a, b] = picked[0].r < picked[1].r ? [picked[0], picked[1]] : [picked[1], picked[0]];
    if (a.c !== b.c) {
      setScratch({ value: NaN, ok: false, note: 'Combine two cells from the same column — they share a leading error term.' });
      return;
    }
    const p = richardsonColumnOrder(a.c);
    const coarse = grid[a.r][a.c];
    const fine = grid[b.r][b.c];
    if (coarse == null || fine == null) return;
    const value = richardson(coarse, fine, p, 2);

    if (b.r !== a.r + 1) {
      setScratch({
        value,
        ok: false,
        note: `|error| = ${formatValue(errOf(value), 3)}. Those steps are not neighbours — the weights assume a halved h, so the leading terms did not cancel.`,
      });
      setAttempts((n) => n + 1);
      return;
    }

    const child = { r: b.r, c: a.c + 1 };
    const next = grid.map((row) => [...row]);
    next[child.r][child.c] = value;
    setGrid(next);
    setPicked([]);
    const dropped = errOf(fine) / Math.max(errOf(value), 1e-18);
    setScratch({
      value,
      ok: true,
      note: `h^${p} cancelled. Leftover is O(h^${p + 2}). Error dropped ${dropped.toFixed(0)}× versus the finer parent.`,
    });

    if (col1Filled(next) && !solved) {
      void solve(true, attempts + 1, { filled: 'col1' }, 18);
    }
  };

  const reset = () => {
    if (solved) return;
    setGrid(emptyGrid());
    setPicked([]);
    setScratch(null);
  };

  const isPicked = (r: number, c: number) => picked.some((p) => p.r === r && p.c === c);

  return (
    <div className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title="richardson tableau"
        right={
          <span className="hud-label" style={{ color: col1Filled(grid) ? 'var(--sig-ok)' : 'var(--color-ink-faint)' }}>
            {col1Filled(grid) ? 'column 1 filled' : 'pick two rows'}
          </span>
        }
      >
        <p style={{ margin: '0 0 14px', color: 'var(--color-ink)', fontSize: '1.06rem', lineHeight: 1.6 }}>{prompt}</p>

        <ReadoutRow>
          <Readout label="true f′" value={formatValue(truth, 6)} />
          <Readout label="target" value={target.label} />
        </ReadoutRow>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `72px repeat(${rows}, minmax(108px, 1fr))`,
              gap: 6,
              minWidth: 72 + rows * 114,
            }}
          >
            <div className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>h</div>
            {Array.from({ length: rows }, (_, c) => (
              <div key={`h-${c}`} className="hud-label" style={{ color: 'var(--color-cyan)', textAlign: 'center' }}>
                O(h^{richardsonColumnOrder(c)})
              </div>
            ))}

            {hs.map((h, r) => (
              <Row
                key={r}
                r={r}
                h={h}
                cols={rows}
                grid={grid}
                truth={truth}
                isPicked={isPicked}
                onToggle={toggle}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <Button onClick={combine} accent="magenta" disabled={picked.length !== 2}>
            combine
          </Button>
          {!solved && <Button onClick={reset}>reset</Button>}
          {picked.length === 1 && <span className="hud-label">pick one more</span>}
        </div>

        {scratch && (
          <p style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-rule)',
            fontSize: '1rem', lineHeight: 1.65,
            color: scratch.ok ? 'var(--color-ink-soft)' : 'var(--color-ink)',
          }}>
            {Number.isFinite(scratch.value) && (
              <span className="readout" style={{
                display: 'inline-block', marginRight: 10,
                color: scratch.ok ? 'var(--sig-ok)' : 'var(--color-magenta)',
              }}>
                {formatValue(scratch.value, 6)}
              </span>
            )}
            {scratch.note}
          </p>
        )}
      </Panel>
    </div>
  );
}

function Row({
  r, h, cols, grid, truth, isPicked, onToggle,
}: {
  r: number; h: number; cols: number;
  grid: (number | null)[][];
  truth: number;
  isPicked: (r: number, c: number) => boolean;
  onToggle: (r: number, c: number) => void;
}) {
  return (
    <>
      <div className="readout" style={{ color: 'var(--color-ink-faint)', fontSize: 12, alignSelf: 'center' }}>
        {formatValue(h, 3)}
      </div>
      {Array.from({ length: cols }, (_, c) => {
        if (c > r) {
          return <div key={c} />;
        }
        const v = grid[r][c];
        const empty = v == null;
        const picked = isPicked(r, c);
        const err = empty ? null : Math.abs(v - truth);
        const tone = empty
          ? 'var(--color-rule)'
          : picked
            ? 'var(--color-cyan)'
            : 'var(--color-rule-bright)';
        return (
          <button
            key={c}
            type="button"
            onClick={() => onToggle(r, c)}
            disabled={empty}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              border: `1px ${empty ? 'dashed' : 'solid'} ${tone}`,
              borderRadius: 'var(--radius-hud)',
              background: picked
                ? 'color-mix(in oklab, var(--color-cyan) 12%, transparent)'
                : empty
                  ? 'transparent'
                  : 'color-mix(in oklab, var(--color-surface) 55%, transparent)',
              color: 'var(--color-ink)',
              cursor: empty ? 'default' : 'pointer',
              minHeight: 56,
            }}
          >
            {empty ? (
              <span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>—</span>
            ) : (
              <>
                <div className="readout" style={{ fontSize: 13 }}>{formatValue(v, 5)}</div>
                <div className="hud-label" style={{
                  marginTop: 4,
                  color: err! < 1e-6 ? 'var(--sig-ok)' : 'var(--color-ink-faint)',
                  textTransform: 'none',
                  letterSpacing: 0,
                }}>
                  |err| {formatValue(err!, 2)}
                </div>
              </>
            )}
          </button>
        );
      })}
    </>
  );
}
