import { useMemo, useState } from 'react';
import Plot from '../viz/Plot.tsx';
import { Button, Panel, Readout, ReadoutRow } from '../viz/controls.tsx';
import { formatValue, type Series } from '../viz/chart-core.ts';
import { useWidget } from '../../lib/use-lesson.ts';
import type { Deriv, State, Stepper } from '../../lib/numerics/types.ts';
import { convergenceStudy, stepSweep } from '../../lib/numerics/convergence.ts';
import { PROBLEMS } from '../../lib/numerics/problems.ts';

export interface CodeChallengeProps {
  id: string;
  prompt: string;
  /** Starting code. Must be the body of `step(f, t, y, h)` returning a State. */
  starter: string;
  /** Problem key the submission is graded on. */
  problem?: string;
  /** Order of accuracy the submission must actually achieve. */
  expectedOrder: number;
  solution: string;
  hint?: string;
  height?: number;
}

/* The grader runs the learner's function through the SAME convergence
   machinery the lessons use, so "did you implement RK4" is answered by
   measuring the slope of its error curve rather than by comparing strings.
   A correct method written differently from ours still passes; a plausible
   method that is secretly second-order does not. */

interface Verdict {
  ok: boolean;
  message: string;
  observedOrder?: number;
  series?: Series[];
}

function gradeSubmission(code: string, problemKey: string, expectedOrder: number): Verdict {
  let step: Stepper;
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function('f', 't', 'y', 'h', code);
    step = factory as unknown as Stepper;
  } catch (err) {
    return { ok: false, message: `Syntax error: ${(err as Error).message}` };
  }

  const problem = PROBLEMS[problemKey]();

  // Smoke test before the expensive sweep, so a broken return shape gives a
  // useful message rather than a wall of NaN.
  try {
    const probe = step(problem.f as Deriv, problem.t0, problem.y0 as State, 0.01);
    if (!Array.isArray(probe) || probe.length !== problem.y0.length) {
      return { ok: false, message: `step() must return an array of length ${problem.y0.length}; got ${JSON.stringify(probe)?.slice(0, 60)}` };
    }
    if (!probe.every(Number.isFinite)) {
      return { ok: false, message: 'step() returned a non-finite value on the very first step.' };
    }
  } catch (err) {
    return { ok: false, message: `step() threw: ${(err as Error).message}` };
  }

  const fake = { key: 'submission', label: 'your step()', order: expectedOrder, symplectic: false, cost: 1, step };

  let result;
  try {
    result = convergenceStudy(fake, problem, stepSweep(0.4, 9));
  } catch (err) {
    return { ok: false, message: `Grading failed: ${(err as Error).message}` };
  }

  const { observedOrder } = result;
  const series: Series[] = [
    {
      key: 'yours', label: `your step() — slope ${formatValue(observedOrder, 3)}`, color: 'cyan', style: 'line+dots',
      points: result.points.filter((p) => Number.isFinite(p.error) && p.error > 0).map((p) => [p.h, p.error] as const),
    },
  ];

  if (!Number.isFinite(observedOrder)) {
    return { ok: false, message: 'Could not measure an order — the error never settled into a clean power law.', series };
  }
  if (Math.abs(observedOrder - expectedOrder) > 0.25) {
    return {
      ok: false,
      observedOrder,
      series,
      message: `It runs, but it converges at order ${observedOrder.toFixed(2)}, not ${expectedOrder}. ${
        observedOrder < expectedOrder
          ? 'Some stage is using the wrong time or the wrong slope.'
          : 'That is suspiciously good — check the problem is being stepped correctly.'
      }`,
    };
  }
  return { ok: true, observedOrder, series, message: `Order ${observedOrder.toFixed(2)} — that is a genuine ${expectedOrder}${expectedOrder === 1 ? 'st' : expectedOrder === 2 ? 'nd' : expectedOrder === 3 ? 'rd' : 'th'}-order method.` };
}

/**
 * Implement the algorithm, and be graded on whether it actually achieves the
 * order it claims — not on whether it looks like the reference.
 */
export default function CodeChallenge({
  id, prompt, starter, problem = 'decay', expectedOrder, solution, hint, height = 280,
}: CodeChallengeProps) {
  const { solved, solve } = useWidget(id, 'code');
  const [code, setCode] = useState(starter);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [runs, setRuns] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const done = solved || verdict?.ok;

  const run = () => {
    const v = gradeSubmission(code, problem, expectedOrder);
    setVerdict(v);
    setRuns((n) => n + 1);
    if (v.ok) void solve(true, runs === 0, { observedOrder: v.observedOrder }, 20);
  };

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="implement"
        right={
          <span className="hud-label" style={{ color: done ? 'var(--color-acid)' : 'var(--color-ink-faint)' }}>
            {done ? 'passing' : `graded on measured order`}
          </span>
        }
      >
        <p style={{ margin: '0 0 12px', color: 'var(--color-ink)', fontSize: '1rem', lineHeight: 1.6 }}>{prompt}</p>

        <div style={{ border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)', overflow: 'hidden' }}>
          <div className="hud-label" style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-rule)', background: 'color-mix(in oklab, var(--color-abyss) 70%, transparent)' }}>
            step(f, t, y, h) → State
          </div>
          <textarea
            value={code}
            onChange={(e) => { setCode(e.target.value); setVerdict(null); }}
            spellCheck={false}
            rows={Math.max(8, Math.min(lineCount + 2, 24))}
            style={{
              width: '100%', display: 'block', resize: 'vertical',
              background: 'color-mix(in oklab, var(--color-abyss) 88%, transparent)',
              color: 'var(--color-ink)', border: 0, outline: 'none',
              padding: '10px 12px',
              fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.65, tabSize: 2,
            }}
            aria-label="your implementation"
          />
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <Button onClick={run} accent="magenta">run &amp; grade</Button>
          <Button onClick={() => { setCode(starter); setVerdict(null); }}>reset</Button>
          {hint && !done && <Button onClick={() => setShowHint(true)} accent="amber">hint</Button>}
          {(done || runs >= 3) && (
            <Button onClick={() => setShowSolution(!showSolution)} accent="violet">
              {showSolution ? 'hide' : 'show'} reference
            </Button>
          )}
        </div>

        {showHint && !done && hint && (
          <p style={{ marginTop: 10, fontSize: '0.86rem', color: 'var(--color-amber)', lineHeight: 1.6 }}>{hint}</p>
        )}

        {verdict && (
          <div style={{
            marginTop: 12, padding: '9px 12px',
            border: `1px solid ${verdict.ok ? 'var(--color-acid)' : 'var(--color-amber)'}`,
            borderRadius: 'var(--radius-hud)',
            background: `color-mix(in oklab, ${verdict.ok ? 'var(--color-acid)' : 'var(--color-amber)'} 8%, transparent)`,
            color: 'var(--color-ink)', fontSize: '0.9rem', lineHeight: 1.6,
          }}>
            {verdict.message}
          </div>
        )}

        {verdict?.series && (
          <Plot
            series={verdict.series}
            x={{ label: 'step size h', scale: 'log' }}
            y={{ label: 'endpoint error', scale: 'log' }}
            height={height}
          />
        )}

        {showSolution && (
          <pre style={{
            marginTop: 12, padding: '10px 12px', overflowX: 'auto',
            background: 'color-mix(in oklab, var(--color-abyss) 88%, transparent)',
            border: '1px solid var(--color-violet)', borderRadius: 'var(--radius-hud)',
            fontSize: 13, lineHeight: 1.65, color: 'var(--color-ink)',
          }}><code>{solution}</code></pre>
        )}

        {verdict?.observedOrder !== undefined && (
          <ReadoutRow>
            <Readout label="measured order" value={formatValue(verdict.observedOrder, 3)} accent={verdict.ok ? 'acid' : 'amber'} />
            <Readout label="target order" value={String(expectedOrder)} />
          </ReadoutRow>
        )}
      </Panel>
    </div>
  );
}
