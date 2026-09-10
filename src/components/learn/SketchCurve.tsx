import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow } from '../viz/controls.tsx';
import { formatValue } from '../viz/chart-core.ts';
import { useWidget } from '../../lib/use-lesson.ts';
import { SKETCH_SCENARIOS } from './sketch-scenarios.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Draw the curve you expect, then watch the real one land on top of it.

   This is the sharpest test of understanding we have, and it needs no code.
   Multiple choice lets you recognise a right answer among wrong ones;
   sketching forces you to COMMIT to a shape — where it bends, which way it
   goes, whether it is bounded — before seeing the answer. You cannot bluff a
   curve, and the gap between your line and the truth is legible at a glance.

   Grading is on mean vertical deviation across the domain, in axis units, so
   the threshold means something physical rather than being a pixel count.
   ───────────────────────────────────────────────────────────────────────── */

export interface SketchCurveProps {
  id: string;
  prompt: string;
  /** Key into SKETCH_SCENARIOS. */
  scenario: string;
  height?: number;
  /** Shown after submitting, whether right or wrong. */
  explanation?: string;
  hint?: string;
}

const PAD = { left: 62, right: 18, top: 18, bottom: 44 };

export default function SketchCurve({
  id, prompt, scenario, height = 380, explanation, hint,
}: SketchCurveProps) {
  const spec = SKETCH_SCENARIOS[scenario];
  if (!spec) throw new Error(`Unknown SketchCurve scenario "${scenario}"`);

  const { solved, solve } = useWidget(id, 'sketch');

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 720, h: height });
  const [drawing, setDrawing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [deviation, setDeviation] = useState<number | null>(null);

  /** Learner's curve, as one y per x-bucket. */
  const BUCKETS = 120;
  const drawnRef = useRef<Float32Array>(new Float32Array(BUCKETS).fill(NaN));

  const truth = useMemo(() => spec.truth(), [spec]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const iw = Math.max(10, size.w - PAD.left - PAD.right);
  const ih = Math.max(10, size.h - PAD.top - PAD.bottom);

  const toPx = useCallback((x: number, y: number): [number, number] => {
    const u = (x - spec.xRange[0]) / (spec.xRange[1] - spec.xRange[0]);
    const v = (y - spec.yRange[0]) / (spec.yRange[1] - spec.yRange[0]);
    return [PAD.left + u * iw, PAD.top + (1 - v) * ih];
  }, [spec, iw, ih]);

  const toData = useCallback((px: number, py: number): [number, number] => {
    const u = (px - PAD.left) / iw;
    const v = 1 - (py - PAD.top) / ih;
    return [
      spec.xRange[0] + u * (spec.xRange[1] - spec.xRange[0]),
      spec.yRange[0] + v * (spec.yRange[1] - spec.yRange[0]),
    ];
  }, [spec, iw, ih]);

  const bucketOf = (x: number) =>
    Math.round(((x - spec.xRange[0]) / (spec.xRange[1] - spec.xRange[0])) * (BUCKETS - 1));
  const bucketX = (i: number) =>
    spec.xRange[0] + (i / (BUCKETS - 1)) * (spec.xRange[1] - spec.xRange[0]);

  /* ── painting ──────────────────────────────────────────────────────────── */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // grid
    ctx.strokeStyle = 'rgba(68,58,99,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const x = PAD.left + (i / 6) * iw;
      const y = PAD.top + (i / 6) * ih;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + ih); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + iw, y); ctx.stroke();
    }

    // zero line, when zero is in view
    if (spec.yRange[0] < 0 && spec.yRange[1] > 0) {
      const [, yz] = toPx(spec.xRange[0], 0);
      ctx.strokeStyle = 'rgba(201,193,220,0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(PAD.left, yz); ctx.lineTo(PAD.left + iw, yz); ctx.stroke();
      ctx.setLineDash([]);
    }

    // axis labels
    ctx.fillStyle = 'rgba(141,132,166,1)';
    ctx.font = '12px "JetBrains Mono Variable", monospace';
    for (let i = 0; i <= 3; i++) {
      const xv = spec.xRange[0] + (i / 3) * (spec.xRange[1] - spec.xRange[0]);
      const [px] = toPx(xv, 0);
      ctx.textAlign = 'center';
      ctx.fillText(formatValue(xv, 3), px, PAD.top + ih + 20);

      const yv = spec.yRange[0] + (i / 3) * (spec.yRange[1] - spec.yRange[0]);
      const [, py] = toPx(0, yv);
      ctx.textAlign = 'right';
      ctx.fillText(formatValue(yv, 3), PAD.left - 10, py + 4);
    }

    // anchors
    for (const a of spec.anchors ?? []) {
      const [px, py] = toPx(a.x, a.y);
      ctx.fillStyle = '#ffc46b';
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillText(a.label, px + 9, py - 8);
    }

    // learner's curve
    const drawn = drawnRef.current;
    ctx.strokeStyle = '#5ce1e6';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = '#5ce1e6';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < BUCKETS; i++) {
      if (Number.isNaN(drawn[i])) { pen = false; continue; }
      const [px, py] = toPx(bucketX(i), drawn[i]);
      pen ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), (pen = true));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // truth, only after submitting
    if (submitted) {
      ctx.strokeStyle = '#ff4d9e';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff4d9e';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      truth.forEach((p, i) => {
        const [px, py] = toPx(p.x, Math.max(spec.yRange[0], Math.min(spec.yRange[1], p.y)));
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [size, iw, ih, spec, toPx, submitted, truth]);

  useEffect(() => { paint(); });

  /* ── drawing ───────────────────────────────────────────────────────────── */
  const record = (e: React.PointerEvent) => {
    if (submitted) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const [x, y] = toData(e.clientX - r.left, e.clientY - r.top);
    const b = bucketOf(x);
    if (b < 0 || b >= BUCKETS) return;

    const clamped = Math.max(spec.yRange[0], Math.min(spec.yRange[1], y));
    const drawn = drawnRef.current;

    // Fill the gap since the last bucket so a fast drag leaves no holes.
    const prev = lastBucket.current;
    if (prev !== null && Math.abs(b - prev) > 1) {
      const lo = Math.min(prev, b);
      const hi = Math.max(prev, b);
      const yLo = prev < b ? drawn[prev] : clamped;
      const yHi = prev < b ? clamped : drawn[prev];
      for (let i = lo; i <= hi; i++) {
        drawn[i] = yLo + ((yHi - yLo) * (i - lo)) / Math.max(hi - lo, 1);
      }
    } else {
      drawn[b] = clamped;
    }
    lastBucket.current = b;
    paint();
  };
  const lastBucket = useRef<number | null>(null);

  const coverage = () => {
    const drawn = drawnRef.current;
    let n = 0;
    for (let i = 0; i < BUCKETS; i++) if (!Number.isNaN(drawn[i])) n++;
    return n / BUCKETS;
  };

  /** Mean |sketch − truth| in y-axis units, over the buckets actually drawn. */
  const score = () => {
    const drawn = drawnRef.current;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < BUCKETS; i++) {
      if (Number.isNaN(drawn[i])) continue;
      const x = bucketX(i);
      // nearest truth sample to this x
      let best = truth[0];
      let bestD = Infinity;
      for (const p of truth) {
        const d = Math.abs(p.x - x);
        if (d < bestD) { bestD = d; best = p; }
      }
      const ty = Math.max(spec.yRange[0], Math.min(spec.yRange[1], best.y));
      sum += Math.abs(drawn[i] - ty);
      n++;
    }
    return n ? sum / n : Infinity;
  };

  const submit = () => {
    const dev = score();
    setDeviation(dev);
    setSubmitted(true);
    setAttempts((n) => n + 1);
    void solve(dev <= spec.tolerance, attempts === 0, { deviation: dev }, 16);
  };

  const reset = () => {
    drawnRef.current = new Float32Array(BUCKETS).fill(NaN);
    lastBucket.current = null;
    setSubmitted(false);
    setDeviation(null);
    paint();
  };

  const enough = coverage() > 0.55;
  const correct = deviation !== null && deviation <= spec.tolerance;
  const done = submitted || solved;

  return (
    <div className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title="sketch it"
        right={
          <span
            className="hud-label"
            style={{ color: !submitted ? 'var(--color-ink-faint)' : correct ? 'var(--sig-ok)' : 'var(--sig-warn)' }}
          >
            {!submitted ? 'draw across the whole plot' : correct ? 'close enough' : 'not the shape'}
          </span>
        }
      >
        <p style={{ margin: '0 0 16px', color: 'var(--color-ink)', fontSize: '1.06rem', lineHeight: 1.6 }}>
          {prompt}
        </p>

        <div
          ref={wrapRef}
          onPointerDown={(e) => {
            if (submitted) return;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrawing(true);
            lastBucket.current = null;
            record(e);
          }}
          onPointerMove={(e) => { if (drawing) record(e); }}
          onPointerUp={() => { setDrawing(false); lastBucket.current = null; }}
          onPointerLeave={() => { setDrawing(false); lastBucket.current = null; }}
          style={{
            position: 'relative', height: size.h, touchAction: 'none',
            cursor: submitted ? 'default' : 'crosshair',
            border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)',
            background: 'color-mix(in oklab, var(--color-abyss) 80%, transparent)',
          }}
        >
          <canvas ref={canvasRef} style={{ display: 'block' }} />
          <span className="hud-label" style={{ position: 'absolute', left: PAD.left, bottom: 8, pointerEvents: 'none' }}>
            {spec.xLabel}
          </span>
          <span className="hud-label" style={{ position: 'absolute', left: 8, top: 6, pointerEvents: 'none' }}>
            {spec.yLabel}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {!submitted && (
            <Button onClick={submit} accent="magenta" disabled={!enough}>
              {enough ? 'reveal the truth' : 'draw a bit more'}
            </Button>
          )}
          <Button onClick={reset}>{submitted ? 'try again' : 'clear'}</Button>
          {hint && !submitted && <Button onClick={() => setShowHint(true)} accent="warn">hint</Button>}
          {submitted && (
            <span className="hud-label" style={{ display: 'inline-flex', gap: 14, marginLeft: 4 }}>
              <span style={{ color: 'var(--color-cyan)' }}>—— yours</span>
              <span style={{ color: 'var(--color-magenta)' }}>—— actual</span>
            </span>
          )}
        </div>

        {showHint && !submitted && hint && (
          <p style={{ marginTop: 12, fontSize: '0.96rem', color: 'var(--sig-warn)', lineHeight: 1.6 }}>{hint}</p>
        )}

        {submitted && (
          <>
            <ReadoutRow>
              <Readout label="mean deviation" value={formatValue(deviation ?? 0, 3)} accent={correct ? 'ok' : 'warn'} />
              <Readout label="needed under" value={formatValue(spec.tolerance, 3)} />
              <Readout label="units" value={spec.yLabel} />
            </ReadoutRow>
            {explanation && (
              <p style={{
                marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-rule)',
                fontSize: '1rem', color: 'var(--color-ink-soft)', lineHeight: 1.68,
              }}>
                {explanation}
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
