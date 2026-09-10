import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, DEFAULT_MARGIN, formatTick, formatValue, makeScale, type Series } from './chart-core.ts';
import {
  DECAY_INV, OSC_INV, decayAdjoint, decayForward, decayLossLandscape,
  oscillatorAdjoint, oscillatorForward, oscillatorLoss,
} from '../../lib/numerics/adjoint.ts';

export interface InverseLabProps {
  system?: 'decay' | 'oscillator';
  caption?: string;
}

type System = 'decay' | 'oscillator';

const LAMBDA_RANGE: [number, number] = [0.18, 4.2];
const OMEGA_RANGE: [number, number] = [0.35, 2.6];
const DECAY_HANDLE_T = 1.2;
const OSC_HANDLE_T = 1.0;
const DECAY_LR = 8;
const OSC_LR = 0.4;

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

function lambdaFromHandle(y: number): number {
  const yy = clamp(y, [0.015, 0.82]);
  return clamp(-Math.log(yy) / DECAY_HANDLE_T, LAMBDA_RANGE);
}

function omegaFromHandle(q: number): number {
  const qq = clamp(q, [-0.98, 0.98]);
  return clamp(Math.acos(qq) / OSC_HANDLE_T, OMEGA_RANGE);
}

/**
 * Inverse problem as a pair of coupled views. Drag the target trajectory;
 * the loss bowl and the current solve share one parameter state. Descend
 * walks that parameter by the discrete adjoint until the curves lock.
 */
export default function InverseLab({ system: initial = 'decay', caption }: InverseLabProps) {
  const reduced = usePrefersReducedMotion();
  const [system, setSystem] = useState<System>(initial);
  const [running, setRunning] = useState(false);

  const decayTarget = useRef(2);
  const decayGuess = useRef(0.55);
  const oscTarget = useRef(1.6);
  const oscGuess = useRef(0.7);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const lastReadout = useRef(0);

  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    trailRef.current = [];
    setRunning(false);
    bump();
  }, [system, bump]);

  const target = system === 'decay' ? decayTarget.current : oscTarget.current;
  const guess = system === 'decay' ? decayGuess.current : oscGuess.current;

  const snap = useMemo(() => {
    void tick;
    if (system === 'decay') {
      const yObs = decayForward(decayTarget.current).y;
      const g = decayAdjoint(decayGuess.current, yObs);
      const grid = Array.from({ length: 70 }, (_, i) => LAMBDA_RANGE[0] + (i / 69) * (LAMBDA_RANGE[1] - LAMBDA_RANGE[0]));
      return {
        t: g.run.t,
        targetY: yObs,
        currentY: g.run.y,
        loss: g.loss,
        grad: g.dLambda,
        landscape: decayLossLandscape(yObs, grid),
        handleT: DECAY_HANDLE_T,
        handleY: Math.exp(-decayTarget.current * DECAY_HANDLE_T),
        xDomain: [0, DECAY_INV.span] as [number, number],
        yDomain: [-0.05, 1.12] as [number, number],
        paramDomain: LAMBDA_RANGE,
        yLabel: 'y',
        paramLabel: 'λ',
      };
    }
    const qObs = oscillatorForward(oscTarget.current).q;
    const g = oscillatorAdjoint(oscGuess.current, qObs);
    const grid = Array.from({ length: 70 }, (_, i) => OMEGA_RANGE[0] + (i / 69) * (OMEGA_RANGE[1] - OMEGA_RANGE[0]));
    const landscape = grid.map((omega) => ({
      lambda: omega,
      loss: oscillatorLoss(oscillatorForward(omega).q, qObs),
    }));
    return {
      t: g.run.t,
      targetY: qObs,
      currentY: g.run.q,
      loss: g.loss,
      grad: g.dOmega,
      landscape,
      handleT: OSC_HANDLE_T,
      handleY: Math.cos(oscTarget.current * OSC_HANDLE_T),
      xDomain: [0, OSC_INV.span] as [number, number],
      yDomain: [-1.25, 1.25] as [number, number],
      paramDomain: OMEGA_RANGE,
      yLabel: 'q',
      paramLabel: 'ω',
    };
  }, [system, tick]);

  const relErr = Math.abs(guess - target) / Math.max(Math.abs(target), 1e-9);
  const recovered = relErr < 0.02 && snap.loss < 5e-4;

  const takeSteps = (n: number) => {
    if (system === 'decay') {
      const yObs = decayForward(decayTarget.current).y;
      for (let i = 0; i < n; i++) {
        const g = decayAdjoint(decayGuess.current, yObs);
        decayGuess.current = clamp(decayGuess.current - DECAY_LR * g.dLambda, LAMBDA_RANGE);
        trailRef.current.push({ x: decayGuess.current, y: g.loss });
        if (trailRef.current.length > 240) trailRef.current.splice(0, trailRef.current.length - 240);
        if (Math.abs(g.dLambda) < 1e-8) break;
      }
    } else {
      const qObs = oscillatorForward(oscTarget.current).q;
      for (let i = 0; i < n; i++) {
        const g = oscillatorAdjoint(oscGuess.current, qObs);
        oscGuess.current = clamp(oscGuess.current - OSC_LR * g.dOmega, OMEGA_RANGE);
        trailRef.current.push({ x: oscGuess.current, y: g.loss });
        if (trailRef.current.length > 240) trailRef.current.splice(0, trailRef.current.length - 240);
        if (Math.abs(g.dOmega) < 1e-8) break;
      }
    }
  };

  useAnimationFrame(running && !reduced, (dt) => {
    takeSteps(Math.max(1, Math.round(dt * 28)));
    const now = performance.now();
    if (now - lastReadout.current > 125) {
      lastReadout.current = now;
      bump();
    }
    const tgt = system === 'decay' ? decayTarget.current : oscTarget.current;
    const gss = system === 'decay' ? decayGuess.current : oscGuess.current;
    if (Math.abs(gss - tgt) / Math.max(Math.abs(tgt), 1e-9) < 0.015) {
      setRunning(false);
      bump();
    }
  });

  const descend = () => {
    if (reduced) {
      takeSteps(80);
      setRunning(false);
      bump();
      return;
    }
    setRunning(true);
  };

  const reset = () => {
    if (system === 'decay') decayGuess.current = 0.55;
    else oscGuess.current = 0.7;
    trailRef.current = [];
    setRunning(false);
    bump();
  };

  const onDragHandle = (y: number) => {
    setRunning(false);
    trailRef.current = [];
    if (system === 'decay') decayTarget.current = lambdaFromHandle(y);
    else oscTarget.current = omegaFromHandle(y);
    bump();
  };

  const trajSeries: Series[] = [
    {
      key: 'target', label: 'target', color: 'magenta', width: 2.2,
      points: snap.t.map((t, i) => [t, snap.targetY[i]] as const),
    },
    {
      key: 'current', label: 'current solve', color: 'cyan', width: 2,
      points: snap.t.map((t, i) => [t, snap.currentY[i]] as const),
    },
  ];

  const lossSeries: Series[] = [
    {
      key: 'bowl', label: 'L', color: 'iris', width: 1.8,
      points: snap.landscape.map((p) => [p.lambda, p.loss] as const),
    },
    {
      key: 'trail', label: 'path', color: 'cyan', style: 'dots', width: 2.2,
      points: trailRef.current.map((p) => [p.x, p.y] as const),
    },
    {
      key: 'here', label: 'guess', color: 'cyan', style: 'dots', width: 5,
      points: [[guess, snap.loss]],
    },
  ];

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="inverse problem"
        right={
          <span className="hud-label" style={{ color: recovered ? 'var(--sig-ok)' : 'var(--color-ink-faint)' }}>
            {recovered ? 'recovered' : running ? 'descending' : 'drag the target · descend'}
          </span>
        }
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <Toggle
            value={[system]}
            onChange={(v) => setSystem((v[0] as System) ?? 'decay')}
            options={[
              { key: 'decay', label: 'y′ = −λy', accent: 'cyan' },
              { key: 'oscillator', label: 'q̈ = −ω²q', accent: 'magenta' },
            ]}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Button onClick={() => { takeSteps(1); bump(); }} accent="iris" disabled={running}>step</Button>
            <Button onClick={running ? () => setRunning(false) : descend} accent="magenta" active={running}>
              {running ? 'pause' : 'descend'}
            </Button>
            <Button onClick={reset} accent="warn">reset</Button>
          </div>
        </div>

        <TrajChart
          series={trajSeries}
          xDomain={snap.xDomain}
          yDomain={snap.yDomain}
          xLabel="t"
          yLabel={snap.yLabel}
          handle={{ t: snap.handleT, y: snap.handleY }}
          onDragY={onDragHandle}
        />

        <Plot
          series={lossSeries}
          x={{ label: snap.paramLabel, domain: snap.paramDomain }}
          y={{ label: 'L', domain: [0, Math.max(0.08, ...snap.landscape.map((p) => p.loss)) * 1.08] }}
          height={200}
          legend={false}
          crosshair={false}
          rules={[
            { x: target, label: 'true', color: ACCENTS.magenta },
          ]}
        />

        <ReadoutRow>
          <Readout label={`true ${snap.paramLabel}`} value={formatValue(target, 3)} accent="magenta" />
          <Readout label={`guess ${snap.paramLabel}`} value={formatValue(guess, 3)} accent="cyan" />
          <Readout label="loss L" value={snap.loss < 1e-4 ? snap.loss.toExponential(2) : formatValue(snap.loss, 4)} />
          <Readout label={'∂L / ∂' + snap.paramLabel} value={formatValue(snap.grad, 3)} accent={Math.abs(snap.grad) < 1e-4 ? 'ok' : 'iris'} />
        </ReadoutRow>
      </Panel>
      {caption && (
        <p style={{ margin: '8px 4px 0', color: 'var(--color-ink-faint)', fontSize: '0.92rem', lineHeight: 1.5 }}>{caption}</p>
      )}
    </div>
  );
}

/* ── trajectory panel with a draggable handle on the target ─────────────── */

function TrajChart({
  series, xDomain, yDomain, xLabel, yLabel, handle, onDragY,
}: {
  series: Series[];
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel: string;
  yLabel: string;
  handle: { t: number; y: number };
  onDragY: (y: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(720);
  const dragging = useRef(false);
  const height = 220;
  const m = DEFAULT_MARGIN;
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xScale = useMemo(
    () => makeScale({ domain: xDomain }, series, 0, [0, iw]),
    [xDomain, series, iw],
  );
  const yScale = useMemo(
    () => makeScale({ domain: yDomain }, series, 1, [ih, 0]),
    [yDomain, series, ih],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(iw * dpr);
    canvas.height = Math.round(ih * dpr);
    canvas.style.width = `${iw}px`;
    canvas.style.height = `${ih}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, iw, ih);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    series.forEach((s) => {
      const color = s.color && s.color in ACCENTS ? ACCENTS[s.color as keyof typeof ACCENTS] : ACCENTS.cyan;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = s.width ?? 1.8;
      let pen = false;
      for (const [dx, dy] of s.points) {
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) { pen = false; continue; }
        const px = xScale(dx);
        const py = yScale(dy);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }, [series, xScale, yScale, iw, ih]);

  const hx = xScale(handle.t);
  const hy = yScale(handle.y);
  const xTicks = xScale.ticks(6);
  const yTicks = yScale.ticks(5);
  const gridStroke = 'rgba(58,48,84,0.55)';
  const axisStroke = 'rgba(111,102,131,0.85)';

  const pointerY = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const py = e.clientY - r.top - m.top;
    return yScale.invert(py);
  };

  return (
    <div ref={wrapRef} className="hud hud-brackets" style={{ position: 'relative', padding: '8px 8px 2px', marginBottom: 10 }}>
      <div style={{ position: 'relative', width: '100%', height }}>
        <div style={{ position: 'absolute', left: m.left, top: m.top }}>
          <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
        <svg
          width={width}
          height={height}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', cursor: dragging.current ? 'grabbing' : 'ns-resize', touchAction: 'none' }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            dragging.current = true;
            onDragY(pointerY(e));
          }}
          onPointerMove={(e) => { if (dragging.current) onDragY(pointerY(e)); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          role="img"
          aria-label="target trajectory — drag vertically to set the target"
        >
          <g transform={`translate(${m.left},${m.top})`}>
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={xScale(t)} x2={xScale(t)} y1={0} y2={ih} stroke={gridStroke} />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={0} x2={iw} y1={yScale(t)} y2={yScale(t)} stroke={gridStroke} />
            ))}
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke={axisStroke} />
            <line x1={0} x2={0} y1={0} y2={ih} stroke={axisStroke} />
            {xTicks.map((t) => (
              <g key={`tx${t}`} transform={`translate(${xScale(t)},${ih})`}>
                <line y2={4} stroke={axisStroke} />
                <text y={16} textAnchor="middle" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">{formatTick(t)}</text>
              </g>
            ))}
            {yTicks.map((t) => (
              <g key={`ty${t}`} transform={`translate(0,${yScale(t)})`}>
                <line x2={-4} stroke={axisStroke} />
                <text x={-8} dy="0.32em" textAnchor="end" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">{formatTick(t)}</text>
              </g>
            ))}
            <line x1={hx} x2={hx} y1={0} y2={ih} stroke={ACCENTS.magenta} strokeOpacity={0.35} strokeDasharray="3 4" />
            <circle cx={hx} cy={hy} r={14} fill="transparent" />
            <circle cx={hx} cy={hy} r={6} fill={ACCENTS.magenta} stroke={ACCENTS.ink} strokeWidth={1.5} />
            <circle cx={hx} cy={hy} r={10} fill="none" stroke={ACCENTS.magenta} strokeOpacity={0.45} />
          </g>
          <text x={m.left + iw / 2} y={height - 2} textAnchor="middle" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)" letterSpacing="0.14em">{xLabel.toUpperCase()}</text>
          <text transform={`translate(11,${m.top + ih / 2}) rotate(-90)`} textAnchor="middle" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)" letterSpacing="0.14em">{yLabel.toUpperCase()}</text>
        </svg>
      </div>
      <p style={{ margin: '2px 8px 6px 56px', color: 'var(--color-ink-faint)', fontSize: '0.86rem' }}>
        drag the magenta handle — the whole target curve follows
      </p>
    </div>
  );
}
