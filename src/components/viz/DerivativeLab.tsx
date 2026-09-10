import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Toggle } from './controls.tsx';
import { SERIES_COLORS, formatValue, type Series } from './chart-core.ts';
import { SCHEMES, TARGETS, complexStep, diffSweep, hSweep, optimalStep } from '../../lib/numerics/diff.ts';

export interface DerivativeLabProps {
  target?: string;
  schemes?: string[];
  initial?: string[];
  /** Include the complex-step estimate, which has no U at all. */
  complexStepCurve?: boolean;
  height?: number;
  caption?: string;
}

/**
 * The U-curve: error against step size for finite differences.
 *
 * This is the most important picture in elementary numerical analysis, because
 * it contradicts the intuition everyone arrives with. The left branch is
 * truncation error falling as h^p exactly as the Taylor series promises. The
 * right branch is roundoff error rising as eps/h, because subtracting two
 * nearly equal numbers destroys significant digits. Accuracy bottoms out in
 * the middle — "just take h smaller" is wrong, and here is where it stops
 * working.
 */
export default function DerivativeLab({
  target: targetKey = 'sin',
  schemes = ['forward', 'central', 'five-point'],
  initial,
  complexStepCurve = false,
  height = 360,
  caption,
}: DerivativeLabProps) {
  const target = TARGETS[targetKey];
  if (!target) throw new Error(`Unknown differentiation target "${targetKey}"`);

  const available = SCHEMES.filter((s) => schemes.includes(s.key));
  const [selected, setSelected] = useState<string[]>(initial ?? schemes);

  const hs = useMemo(
    () => hSweep(1e-1, complexStepCurve ? 1e-20 : 1e-16, complexStepCurve ? 5 : 6),
    [complexStepCurve],
  );

  const { series, best } = useMemo(() => {
    const out: Series[] = [];
    const best: { label: string; h: number; error: number; order: number }[] = [];

    available
      .filter((s) => selected.includes(s.key))
      .forEach((scheme) => {
        const pts = diffSweep(scheme, target, hs);
        const color = SERIES_COLORS[SCHEMES.findIndex((s) => s.key === scheme.key) % SERIES_COLORS.length];
        out.push({
          key: scheme.key,
          label: `${scheme.label} — O(h^${scheme.order})`,
          color,
          points: pts.map((p) => [p.h, p.error] as const),
        });
        const min = pts.reduce((a, b) => (b.error < a.error ? b : a));
        best.push({ label: scheme.label, h: min.h, error: min.error, order: scheme.order });
      });

    if (complexStepCurve && target.fComplex) {
      const pts = hs.map((h) => {
        const est = complexStep(target.fComplex!, target.x0, h);
        return { h, error: Math.max(Math.abs(est - target.df(target.x0)), 1e-18) };
      });
      out.push({
        key: 'complex-step',
        label: 'Complex step — no cancellation',
        color: 'ok',
        dash: [5, 3],
        points: pts.map((p) => [p.h, p.error] as const),
      });
      const min = pts.reduce((a, b) => (b.error < a.error ? b : a));
      best.push({ label: 'Complex step', h: min.h, error: min.error, order: 2 });
    }
    return { series: out, best };
  }, [available, selected, target, hs, complexStepCurve]);

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel title={`d/dx of ${target.label}`}>
        <Plot
          series={series}
          x={{ label: 'step size h', scale: 'log' }}
          y={{ label: '|error|', scale: 'log' }}
          rules={available
            .filter((s) => selected.includes(s.key))
            .map((s) => ({
              x: optimalStep(s.order),
              label: `h* for O(h^${s.order})`,
              color: 'rgba(255,181,69,0.5)',
            }))}
          height={height}
          legend
        />

        <div style={{ marginTop: 12 }}>
          <span className="hud-label" style={{ display: 'block', marginBottom: 6 }}>schemes</span>
          <Toggle
            multiple
            options={available.map((s) => ({
              key: s.key,
              label: s.label,
              accent: SERIES_COLORS[SCHEMES.findIndex((x) => x.key === s.key) % SERIES_COLORS.length],
            }))}
            value={selected}
            onChange={(next) => setSelected(next.length ? next : selected)}
          />
        </div>

        <ReadoutRow>
          {best.map((b) => (
            <Readout
              key={b.label}
              label={`${b.label} · best h`}
              value={`${formatValue(b.h, 2)} → ${formatValue(b.error, 2)}`}
            />
          ))}
        </ReadoutRow>
      </Panel>

      {caption && (
        <figcaption className="hud-label" style={{ marginTop: 8, lineHeight: 1.6, letterSpacing: '0.06em', textTransform: 'none' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
