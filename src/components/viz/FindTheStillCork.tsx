import { useRef, useState } from 'react';
import {
  CORK_DIPPERS, CORK_START, TANK, bobAmplitude, pathDifference, singleHeight, type P2,
} from '../../lib/physics/interference.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { Dipper, LambdaBar, RippleStage, WaterKey, sourcesAt, type RippleSpec } from './ripple-kit-ch35.tsx';

/**
 * Two dippers and a cork you drag around the tank. Under the tank, the last
 * three seconds at the cork: the ripple from each dipper (thin) and the cork's
 * own motion, their sum (thick). Where the two thin traces are mirror images
 * the thick one is flat, and the cork sits still on a moving sea.
 *
 * Graded (`id`): leave the cork where it bobs less than a tenth of the most it
 * can. The meter always shows how much farther the cork is from one dipper
 * than the other, so the half-wavelength is there to be noticed.
 *
 * With `detune` (ungraded), the upper dipper runs slightly fast: the two stop
 * being in step, the quiet lines sweep across the tank, and nowhere stays still.
 */
export interface FindTheStillCorkProps {
  id?: string;
  prompt?: string;
  /** Hz: the upper dipper's frequency offset. Ungraded use only. */
  detune?: number;
  start?: [number, number];
  explanation?: string;
}

const SPAN = 3;       // seconds of trace
const MAX = 2;        // two equal ripples of 1 cm
const QUIET = 0.2;    // cm: a tenth of the loudest

export default function FindTheStillCork({ id, prompt, detune = 0, start, explanation }: FindTheStillCorkProps) {
  const graded = Boolean(id) && !detune;
  const task = useTask(graded ? id : undefined, 'find-the-still-cork');
  const [p, setP] = useState<Vec>(start ?? CORK_START);
  const [shownAmp, setShownAmp] = useState<number | null>(null);
  const trace = useRef<HTMLCanvasElement>(null);
  const bob = useRef<SVGCircleElement>(null);
  const colours = useRef<Record<string, string>>({});
  const lastShown = useRef(0);

  const spec: RippleSpec = { sources: CORK_DIPPERS, lambda: TANK.lambda, freq: TANK.freq, detune, water: [-0.8, 60] };
  const [upper, lower] = CORK_DIPPERS;
  const pp: P2 = [p[0], p[1]];
  const steadyAmp = bobAmplitude(CORK_DIPPERS, pp, TANK.lambda);
  const delta = pathDifference(upper, lower, pp); // farther from the lower dipper by
  const amp = detune ? shownAmp ?? steadyAmp : steadyAmp;

  const onFrame = (t: number) => {
    const src = sourcesAt(spec, t);
    const h = singleHeight(src[0], pp, t, TANK.lambda, TANK.freq) + singleHeight(src[1], pp, t, TANK.lambda, TANK.freq);
    if (bob.current) bob.current.setAttribute('r', String(7 + 2.6 * h));
    if (detune && t - lastShown.current > 0.125) { lastShown.current = t; setShownAmp(bobAmplitude(src, pp, TANK.lambda)); }
    drawTrace(t);
  };

  const drawTrace = (t: number) => {
    const el = trace.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = el.clientWidth, H = el.clientHeight;
    if (el.width !== Math.round(W * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const css = (n: string) => (colours.current[n] ??= getComputedStyle(el).getPropertyValue(n).trim() || '#ccc');
    const left = 46, right = W - 10, top = 24, bot = H - 22;
    const tx = (tau: number) => left + ((tau - (t - SPAN)) / SPAN) * (right - left);
    const hy = (h: number) => (top + bot) / 2 - (h / 2.2) * ((bot - top) / 2);
    g.font = '12px ui-monospace, monospace'; g.fillStyle = css('--color-ink-faint'); g.textAlign = 'right';
    for (const v of [-2, 0, 2]) {
      g.strokeStyle = css('--color-rule'); g.lineWidth = 1;
      g.beginPath(); g.moveTo(left, hy(v)); g.lineTo(right, hy(v)); g.stroke();
      g.fillText(`${v}`, left - 6, hy(v) + 4);
    }
    g.textAlign = 'left'; g.font = '13px Inter, sans-serif';
    g.fillText('height at the cork (cm), last 3 s', left, 14);
    const lines: [(tau: number) => number, string, number, number[]][] = [];
    const s = (tau: number) => sourcesAt(spec, tau);
    lines.push([(tau) => singleHeight(s(tau)[0], pp, tau, TANK.lambda, TANK.freq), css('--color-ink-soft'), 1.4, []]);
    lines.push([(tau) => singleHeight(s(tau)[1], pp, tau, TANK.lambda, TANK.freq), css('--color-ink-soft'), 1.4, [5, 4]]);
    lines.push([(tau) => lines[0][0](tau) + lines[1][0](tau), css('--color-iris'), 3, []]);
    for (const [f, col, w, dash] of lines) {
      g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath();
      for (let i = 0; i <= 240; i++) { const tau = t - SPAN + (i / 240) * SPAN; const y = hy(f(tau)); if (i) g.lineTo(tx(tau), y); else g.moveTo(tx(tau), y); }
      g.stroke();
    }
    g.setLineDash([]);
    g.textAlign = 'right';
    g.fillStyle = css('--color-iris'); g.fillText('cork: the sum', right, 14);
    const w1 = g.measureText('cork: the sum').width;
    g.fillStyle = css('--color-ink-soft'); g.fillText('upper ripple ── lower - - -', right - w1 - 18, 14);
  };

  const clamp = (q: Vec): Vec => {
    let x = Math.max(1.2, Math.min(39, q[0]));
    const y = Math.max(-10.3, Math.min(10.3, q[1]));
    if (x < 2.5 && Math.abs(Math.abs(y) - 2.5) < 1.5) x = 2.5;
    return [x, y];
  };

  const still = amp <= QUIET;
  const waves = Math.abs(delta) / TANK.lambda;
  const hit = <>{`Here one ripple travels ${Math.abs(delta).toFixed(2)} cm farther than the other: ${waves.toFixed(2)} wavelengths. `}{explanation}</>;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Cork bobs up and down by" value={`±${amp.toFixed(2)}`} unit="cm" color={C.position} />
          <Meter label="Farther from one dipper by" value={Math.abs(delta).toFixed(2)} unit="cm" />
          <span className="hud-label" style={{ marginLeft: 'auto' }}><WaterKey /></span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(still, { p, amp })}
          miss={`The cork still bobs ±${amp.toFixed(2)} cm: its two ripples are not yet mirror images.`}
          hit={hit} />}
      </div>}>
      <RippleStage spec={spec} onFrame={onFrame} stage={(capture) =>
        <Stage x={[-1.5, 41]} y={[-11, 11]} height={340} equal
          label={`Ripple tank from above. Cork at ${p[0].toFixed(1)}, ${p[1].toFixed(1)} cm, bobbing ±${amp.toFixed(2)} cm.`}>
          {(s) => { capture(s); return <>
            <line x1={s.sx(-0.8)} x2={s.sx(-0.8)} y1={s.sy(-11)} y2={s.sy(11)} stroke={C.rule} strokeWidth={2} />
            <Dipper s={s} at={[upper.x, upper.y]} />
            <Dipper s={s} at={[lower.x, lower.y]} />
            <LambdaBar s={s} at={[1, -9.6]} lambda={TANK.lambda} unit="cm" />
            <Handle s={s} at={p} color={C.position} step={0.1} r={13} label="The cork: drag it"
              onChange={(q) => { setP(clamp(q)); task.touch(); }} />
            <circle ref={bob} cx={s.sx(p[0])} cy={s.sy(p[1])} r={8} fill={C.position} opacity={0.9} pointerEvents="none" />
          </>; }}
        </Stage>} />
      <canvas ref={trace} style={{ width: '100%', height: 130, display: 'block', marginTop: 10 }}
        aria-label="The two ripples at the cork and their sum over the last three seconds" />
    </SceneCard>
  );
}
