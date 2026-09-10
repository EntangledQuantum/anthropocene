import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import { bump, bumpD2, laplacianError, sampleField } from '../../lib/numerics/pde-types.ts';

export interface ContinuumLabProps {
  caption?: string;
  height?: number;
}

const DENSE = 240;
const denseX = Array.from({ length: DENSE }, (_, i) => i / (DENSE - 1));
const continuumPoints = denseX.map((x) => [x, bump(x)] as const);

/**
 * The same smooth bump in two costumes: N masses, or N samples of a field.
 * One state, two drawings, and a real second-difference error against u″.
 * Drag N and the list becomes a function — that is the continuum limit.
 */
export default function ContinuumLab({ caption, height = 260 }: ContinuumLabProps) {
  const [n, setN] = useState(8);
  const [costume, setCostume] = useState<string[]>(['particles', 'samples']);

  const { x, u, h } = useMemo(() => sampleField(n, bump), [n]);
  const err = useMemo(() => laplacianError(n, bump, bumpD2), [n]);

  const series: Series[] = useMemo(() => {
    const out: Series[] = [
      {
        key: 'continuum',
        label: 'u(x)',
        color: 'ink',
        dash: [4, 3],
        width: 1.25,
        points: continuumPoints,
      },
    ];
    const pts = x.map((xi, i) => [xi, u[i]] as const);
    if (costume.includes('particles')) {
      out.push({
        key: 'particles',
        label: 'particles',
        color: 'magenta',
        style: 'dots',
        width: 7,
        points: pts,
      });
    }
    if (costume.includes('samples')) {
      out.push({
        key: 'samples',
        label: 'samples',
        color: 'cyan',
        style: 'line+dots',
        width: 2,
        points: pts,
      });
    }
    return out;
  }, [costume, x, u]);

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="one function, two costumes"
        right={<span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>N = {n}</span>}
      >
        <Toggle
          options={[
            { key: 'particles', label: 'particles', accent: 'magenta' },
            { key: 'samples', label: 'samples', accent: 'cyan' },
          ]}
          value={costume}
          onChange={(next) => setCostume(next.length ? next : costume)}
          multiple
        />

        <div style={{ marginTop: 12 }}>
          <Plot
            series={series}
            x={{ label: 'x', domain: [0, 1] }}
            y={{ label: 'u', domain: [-0.05, 1.15] }}
            height={height}
            legend
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <Slider
            spec={{ key: 'n', label: 'how many', symbol: 'N', min: 4, max: 48, step: 1, value: 8 }}
            value={n}
            onChange={setN}
          />
        </div>

        <ReadoutRow>
          <Readout label="N" value={String(n)} accent="cyan" />
          <Readout label="spacing h" value={formatValue(h, 3)} />
          <Readout label="max |D²u − u″|" value={formatValue(err, 3)} accent={err < 0.5 ? 'ok' : 'ink'} />
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
