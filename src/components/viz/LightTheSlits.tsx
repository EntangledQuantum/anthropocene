import { useEffect, useRef, useState } from 'react';
import { MERCURY, doubletDip, doubletProfile, gratingAngle, lineHalfWidth, slitsToSplit } from '../../lib/physics/diffraction.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { HG_YELLOW, cssVar } from './diffraction-kit-ch36.tsx';

/**
 * A grating spectrometer looking at a mercury lamp's yellow light, which is
 * two lines 2.1 nm apart. One handle: slide the mask along the grating to
 * uncover more slits (600 per millimetre).
 *
 * Two views of one state. The wall shows the whole pattern, 50° either side:
 * bright lines where d sin θ = mλ, which never move as slits are added, only
 * narrow. The eyepiece magnifies the first-order line about 250 times, where
 * the pair either blurs into one or comes apart. Both are `doubletProfile`
 * from diffraction.ts, averaged over each pixel; exposure is adjusted so the
 * brightest line is always full brightness.
 *
 * Graded (`id`): uncover the fewest slits that split the pair by Rayleigh's
 * rule, the 579 nm peak on the 577 nm line's first dark: N = λ/Δλ ≈ 274
 * (`slitsToSplit`). Up to 20% more is accepted.
 */
export interface LightTheSlitsProps {
  id?: string;
  prompt?: string;
  /** Slits uncovered at the start. */
  start?: number;
  /** How far past the fewest slits still counts, as a fraction. */
  slack?: number;
  explanation?: string;
}

const N_MAX = 600;
const { l1, l2, d } = MERCURY;
const DEG = Math.PI / 180;
const T1 = gratingAngle(d, l1, 1), T2 = gratingAngle(d, l2, 1);
const MID = (T1 + T2) / 2, SPAN = 2.6 * (T2 - T1); // eyepiece half-width, rad
const WALL = 50 * DEG;

function strip(N: number, lo: number, hi: number, cols: number, sub: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < cols; c++) {
    let s = 0;
    for (let k = 0; k < sub; k++) s += doubletProfile(N, d, l1, l2, lo + ((hi - lo) * (c + (k + 0.5) / sub)) / cols);
    out.push(s / sub);
  }
  const m = Math.max(...out);
  return out.map((v) => v / m);
}

export default function LightTheSlits({ id, prompt, start = 2, slack = 0.2, explanation }: LightTheSlitsProps) {
  const task = useTask(id, 'light-the-slits');
  const [N, setN] = useState(start);
  const wall = useRef<HTMLCanvasElement>(null);
  const eye = useRef<HTMLCanvasElement>(null);
  const NR = Math.ceil(slitsToSplit(l1, l2, 1));
  const dip = doubletDip(N, d, l1, l2, 1);
  const hitNow = N >= NR && N <= NR * (1 + slack);

  useEffect(() => {
    const ink = cssVar('--color-ink'), faint = cssVar('--color-ink-faint'), grid = cssVar('--color-rule'), soft = cssVar('--color-ink-soft');
    const [r, g, b] = HG_YELLOW;
    const prep = (el: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1, W = el.clientWidth, H = el.clientHeight;
      if (el.width !== Math.round(W * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
      const x = el.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, W, H);
      return { x, W, H };
    };
    // ── the wall: the whole pattern
    if (wall.current) {
      const { x, W, H } = prep(wall.current);
      const L = 10, R = W - 10, top = 18, bot = H - 22, cols = Math.round(R - L);
      const v = strip(N, -WALL, WALL, cols, 48);
      for (let c = 0; c < cols; c++) {
        x.fillStyle = `rgba(${r},${g},${b},${Math.pow(v[c], 0.6)})`;
        x.fillRect(L + c, top, 1.05, bot - top);
      }
      x.strokeStyle = grid; x.strokeRect(L, top, R - L, bot - top);
      x.font = '12px ui-monospace, monospace'; x.fillStyle = faint; x.textAlign = 'center';
      for (let deg = -50; deg <= 50; deg += 10) {
        const px = L + ((deg * DEG + WALL) / (2 * WALL)) * (R - L);
        x.fillRect(px, bot, 1, 4);
        x.fillText(`${deg}°`, px, bot + 16);
      }
      const ex = L + ((MID + WALL) / (2 * WALL)) * (R - L);
      x.strokeStyle = ink; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(ex - 7, top - 3); x.lineTo(ex - 7, top - 8); x.lineTo(ex + 7, top - 8); x.lineTo(ex + 7, top - 3); x.stroke();
      x.font = '13px Inter, sans-serif'; x.fillStyle = soft; x.textAlign = 'left';
      x.fillText('the wall', L, 12);
      x.textAlign = 'center'; x.fillText('eyepiece looks here', ex, 12);
    }
    // ── the eyepiece: the first-order line, magnified
    if (eye.current) {
      const { x, W, H } = prep(eye.current);
      const L = 46, R = W - 12, top = 8, band = 66, ptop = band + 22, pbot = H - 24, cols = Math.round(R - L);
      const lo = MID - SPAN, hi = MID + SPAN;
      const v = strip(N, lo, hi, cols, 4);
      const tx = (t: number) => L + ((t - lo) / (hi - lo)) * (R - L);
      for (let c = 0; c < cols; c++) {
        x.fillStyle = `rgba(${r},${g},${b},${Math.pow(v[c], 0.6)})`;
        x.fillRect(L + c, top, 1.05, band);
      }
      x.strokeStyle = grid; x.strokeRect(L, top, R - L, band);
      // profile
      x.strokeStyle = grid; x.lineWidth = 1;
      for (const f of [0, 0.5, 1]) { const y = pbot - f * (pbot - ptop); x.beginPath(); x.moveTo(L, y); x.lineTo(R, y); x.stroke(); }
      x.font = '12px ui-monospace, monospace'; x.fillStyle = faint; x.textAlign = 'right';
      x.fillText('0', L - 6, pbot + 4); x.fillText('1', L - 6, ptop + 4);
      x.strokeStyle = ink; x.lineWidth = 2.2; x.beginPath();
      v.forEach((val, c) => { const y = pbot - val * (pbot - ptop); if (c) x.lineTo(L + c, y); else x.moveTo(L + c, y); });
      x.stroke();
      x.textAlign = 'center';
      const t0 = Math.ceil((lo / DEG) * 20) / 20;
      for (let deg = t0; deg <= hi / DEG; deg += 0.05) {
        const px = tx(deg * DEG);
        x.fillRect(px, pbot, 1, 4);
        x.fillText(`${deg.toFixed(2)}°`, px, pbot + 16);
      }
      // where each colour's line must be, and the 577 line's first dark
      x.font = '12px Inter, sans-serif';
      for (const [t, lab] of [[T1, '577.0 nm'], [T2, '579.1 nm']] as const) {
        x.fillStyle = soft; x.fillRect(tx(t) - 0.5, ptop - 10, 1, 8);
        x.fillText(lab, tx(t), ptop - 13 + (t === T1 ? 0 : 0));
      }
      const tz = T1 + lineHalfWidth(N, d, l1, 1);
      if (tz < hi) {
        x.setLineDash([5, 4]); x.strokeStyle = cssVar('--color-ink-soft'); x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(tx(tz), ptop - 2); x.lineTo(tx(tz), pbot); x.stroke(); x.setLineDash([]);
        x.fillStyle = soft; x.textAlign = tz > T2 ? 'left' : 'right';
        x.fillText('577’s first dark', tx(tz) + (tz > T2 ? 6 : -6), pbot - 8);
      }
    }
  }, [N]);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Slits uncovered" value={`${N}`} color={C.position} />
          <Meter label="Width uncovered" value={`${(N / 600).toFixed(2)} mm`} />
          <Meter label="Dip between the yellow lines" value={`${(100 * dip).toFixed(0)}%`} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { N })}
          miss={N < NR
            ? `With ${N} slits the 579 nm peak still sits inside the 577 nm line’s first dark gap; the dip between them is ${(100 * dip).toFixed(0)}%.`
            : `Two clean lines, but ${N} slits is more than it takes: the 579 nm peak is well past the 577 nm line’s first dark. Cover some up.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-14, 626]} y={[-1, 1]} height={92} label={`Grating with ${N} of its slits uncovered`}>
        {(s) => {
          const ticks = N <= 60 ? Array.from({ length: N }, (_, i) => i + 0.5) : Array.from({ length: Math.floor(N / 10) }, (_, i) => i * 10 + 5);
          return <>
            <rect x={s.sx(0)} y={s.sy(0.55)} width={s.len(N_MAX)} height={s.sy(-0.55) - s.sy(0.55)} fill={C.surface} stroke={C.rule} />
            <rect x={s.sx(0)} y={s.sy(0.55)} width={s.len(N)} height={s.sy(-0.55) - s.sy(0.55)}
              fill={`rgba(${HG_YELLOW.join(',')},0.16)`} stroke={`rgb(${HG_YELLOW.join(',')})`} strokeWidth={1.2} />
            {ticks.map((t) => <line key={t} x1={s.sx(t)} x2={s.sx(t)} y1={s.sy(0.45)} y2={s.sy(-0.45)} stroke={`rgb(${HG_YELLOW.join(',')})`} strokeOpacity={0.5} />)}
            <rect x={s.sx(N)} y={s.sy(0.7)} width={s.len(N_MAX - N) + 8} height={s.sy(-0.7) - s.sy(0.7)} fill={C.faint} opacity={0.55} rx={3} />
            {[0, 100, 200, 300, 400, 500, 600].map((t) => <text key={t} x={s.sx(t)} y={s.sy(-1) - 2} textAnchor="middle" fontSize={11}
              fill={C.faint} fontFamily="var(--font-mono)">{t}</text>)}
            <text x={s.sx(N_MAX)} y={s.sy(0.7) - 6} textAnchor="end" fontSize={12} fill={C.soft}>mask</text>
            <text x={s.sx(0)} y={s.sy(0.7) - 6} fontSize={12} fill={C.soft}>grating, 600 slits per mm</text>
            <Handle s={s} at={[N, 0]} color={C.position} step={1} r={10} label="Mask edge: drag to uncover slits"
              clamp={(q) => [Math.max(2, Math.min(N_MAX, Math.round(q[0]))), 0]}
              onChange={(q) => { setN(Math.max(2, Math.min(N_MAX, Math.round(q[0])))); task.touch(); }} />
          </>;
        }}
      </Stage>
      <canvas ref={wall} style={{ width: '100%', height: 96, display: 'block', marginTop: 6 }}
        aria-label={`The wall: yellow lines at 0, plus or minus 20.3 and 43.8 degrees, ${N} slits`} />
      <canvas ref={eye} style={{ width: '100%', height: 190, display: 'block', marginTop: 8 }}
        aria-label={`Eyepiece on the first-order yellow line. Dip between the two lines ${(100 * dip).toFixed(0)} percent.`} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Mercury lamp through a yellow filter · top: the whole wall · bottom: the eyepiece, the first-order line magnified, with its brightness across · exposure adjusted to the brightest line
      </p>
    </SceneCard>
  );
}
