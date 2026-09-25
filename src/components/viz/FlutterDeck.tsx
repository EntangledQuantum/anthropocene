import { useEffect, useRef, useState } from 'react';
import { FLUTTER, deg, flutterOnset, flutterStep, growthPerCycle } from '../../lib/physics/periodic-ch14.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A model bridge deck, end on, in a steady wind. One control: the wind speed.
 * Every change of wind gives the deck the same small twist to start.
 *
 * The wind here has no rhythm. Its twisting push is proportional to how fast
 * the deck is already twisting (`flutterStep`: θ'' = −ω₀²θ − (2β − κU)θ'), so
 * it acts as damping whose sign the wind speed sets. Below the onset the twist
 * dies; above it, it grows at the deck's own frequency. The dashed band on the
 * strip is the starting twist, so growth and decay read at a glance.
 *
 * Graded (`id`): find the slowest wind at which the twist grows.
 */
export interface FlutterDeckProps {
  id?: string;
  prompt?: string;
  /** Starting wind, m/s. */
  start?: number;
  /** m/s either side of the onset that count. */
  tolerance?: number;
  explanation?: string;
}

const SUB = 1 / 1000, SPAN = 20, KICK = 0.25, LIMIT = 25;
const START_DEG = deg(KICK / (2 * Math.PI * FLUTTER.f0));
const TR = { x0: -1.3, x1: 1.45, y0: -1.42, y1: -0.62, amp: 28 };

export default function FlutterDeck({ id, prompt, start = 8, tolerance = 1.5, explanation }: FlutterDeckProps) {
  const task = useTask(id, 'flutter-deck');
  const [wind, setWind] = useState(start);
  const windRef = useRef(start);
  const [shown, setShown] = useState({ twist: START_DEG, broke: false });
  const stage = useRef<StageApi | null>(null);
  const sim = useRef({ th: 0, w: KICK, t: 0, flow: 0, broke: false });
  const hist = useRef<{ t: number; th: number }[]>([]);
  const els = useRef<Record<string, SVGElement | null>>({});

  const nudge = () => { sim.current = { ...sim.current, th: 0, w: KICK, t: 0, broke: false }; hist.current = []; };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const m = sim.current;
      if (!m.broke) {
        for (let k = 0; k < Math.round(dt / SUB); k++) [m.th, m.w] = flutterStep(m.th, m.w, windRef.current, SUB);
        m.t += dt;
        if (Math.abs(deg(m.th)) > LIMIT) m.broke = true;
        hist.current.push({ t: m.t, th: deg(m.th) });
        while (hist.current.length && hist.current[0].t < m.t - SPAN) hist.current.shift();
      }
      m.flow += windRef.current * dt;
      const s = stage.current;
      if (s) {
        els.current.deck?.setAttribute('transform', `rotate(${-deg(m.th)} ${s.sx(0)} ${s.sy(0.15)})`);
        els.current.flow?.setAttribute('stroke-dashoffset', String(-m.flow * 6));
        const tx = (t: number) => s.sx(TR.x1 - ((m.t - t) / SPAN) * (TR.x1 - TR.x0));
        const ty = (y: number) => s.sy((TR.y0 + TR.y1) / 2 + (y / TR.amp) * ((TR.y1 - TR.y0) / 2));
        els.current.trace?.setAttribute('points', hist.current.filter((_, i) => i % 2 === 0).map((p) => `${tx(p.t).toFixed(1)},${ty(p.th).toFixed(1)}`).join(' '));
      }
      if (now - lastShown > 125) {
        lastShown = now;
        const win = 1.02 / FLUTTER.f0;
        let mx = 0;
        for (const p of hist.current) if (p.t > m.t - win) mx = Math.max(mx, Math.abs(p.th));
        setShown({ twist: mx, broke: m.broke });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onset = flutterOnset();
  const g = growthPerCycle(wind);
  const hit = Math.abs(wind - onset) <= tolerance;
  const pct = Math.abs(100 * (g - 1));

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 240px' }}>
            <span className="hud-label">Wind speed</span>
            <input type="range" className="anth-slider" min={0} max={FLUTTER.maxWind} step={0.5} value={wind} aria-label="Wind speed, metres per second"
              onChange={(e) => { const v = +e.target.value; setWind(v); windRef.current = v; nudge(); task.touch(); }} />
          </label>
          <button type="button" className="anth-btn" onClick={nudge}>Nudge again</button>
          <span style={{ display: 'flex', gap: 22 }}>
            <Meter label="Wind" value={wind.toFixed(1)} unit="m/s" color={C.velocity} />
            <Meter label="Twisting to" value={shown.broke ? `>${LIMIT}°` : `±${shown.twist.toFixed(1)}°`} color={C.position} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { wind })}
          miss={g < 1
            ? `At ${wind.toFixed(1)} m/s each twist is ${pct.toFixed(1)}% smaller than the one before, so it dies away.`
            : `At ${wind.toFixed(1)} m/s each twist is ${pct.toFixed(1)}% bigger than the one before, so it grows. It would still grow in a gentler wind.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.5, 1.5]} y={[-1.55, 0.95]} height={360} equal label={`Model bridge deck in a ${wind} metre per second wind, twisting about ${shown.twist.toFixed(0)} degrees`}>
        {(s) => {
          stage.current = s;
          return <>
            <g ref={(el) => { els.current.flow = el; }} stroke={C.velocity} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="14 18">
              {[0.75, 0.55, -0.25, -0.45].map((y) => <line key={y} x1={s.sx(-1.6)} x2={s.sx(1.6)} y1={s.sy(y)} y2={s.sy(y)} />)}
            </g>
            <text x={s.sx(-1.45)} y={s.sy(0.85)} fontSize={13} fill={C.velocity}>wind {wind.toFixed(1)} m/s →</text>
            <line x1={s.sx(-1.15)} x2={s.sx(1.15)} y1={s.sy(0.15)} y2={s.sy(0.15)} stroke={C.grid} strokeDasharray="3 5" />
            <g ref={(el) => { els.current.deck = el; }}>
              <rect x={s.sx(-1)} y={s.sy(0.19)} width={s.len(2)} height={s.len(0.08)} rx={2} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              {[-0.92, 0.92].map((x) => <rect key={x} x={s.sx(x) - s.len(0.03)} y={s.sy(0.11)} width={s.len(0.06)} height={s.len(0.22)} fill={C.surface} stroke={C.soft} strokeWidth={2} />)}
            </g>
            <circle cx={s.sx(0)} cy={s.sy(0.15)} r={3.5} fill={C.soft} />
            {/* strip: twist against time, with the starting twist as a dashed band */}
            {[-20, 0, 20].map((v) => {
              const y = s.sy((TR.y0 + TR.y1) / 2 + (v / TR.amp) * ((TR.y1 - TR.y0) / 2));
              return <g key={v}>
                <line x1={s.sx(TR.x0)} x2={s.sx(TR.x1)} y1={y} y2={y} stroke={v === 0 ? C.rule : C.grid} />
                <text x={s.sx(TR.x0) - 6} y={y + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v}°</text>
              </g>;
            })}
            {[-START_DEG, START_DEG].map((v) => {
              const y = s.sy((TR.y0 + TR.y1) / 2 + (v / TR.amp) * ((TR.y1 - TR.y0) / 2));
              return <line key={v} x1={s.sx(TR.x0)} x2={s.sx(TR.x1)} y1={y} y2={y} stroke={C.ink} strokeDasharray="4 5" strokeWidth={1} />;
            })}
            <text x={s.sx(TR.x0)} y={s.sy(TR.y1) - 8} fontSize={13} fill={C.soft}>twist, last 20 s <tspan fill={C.faint}>(dashed: the starting twist)</tspan></text>
            <polyline ref={(el) => { els.current.trace = el; }} points="" fill="none" stroke={C.position} strokeWidth={2} />
            {shown.broke && <text x={s.sx(0)} y={s.sy(-0.2)} textAnchor="middle" fontSize={14} fill={C.warn}>Stopped: the twist passed {LIMIT}°.</text>}
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}
