import { useEffect, useRef, useState } from 'react';
import { SHAKE, bestShakeHz, settledSwing, shakeOsc, shakenStep } from '../../lib/physics/periodic-ch14.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A cart on a spring, and a hand that shakes the spring's far end back and
 * forth by 1.5 cm. One control: how many times a second the hand shakes.
 *
 * The run is the driven damped oscillator (`shakenStep`, RK4, the drive
 * carried as a phase so changing the rate never makes the hand jump). The
 * strip underneath is the last six seconds of the hand (amber) and the cart
 * (iris): watch the swing build, settle, and slip a quarter-cycle behind the
 * hand at the peak. The swing readout is measured from the run itself.
 *
 * Graded (`id`): find the rate that gives the widest settled swing, within 4%.
 */
export interface ShakeToResonanceProps {
  id?: string;
  prompt?: string;
  /** Starting shake rate, Hz. */
  start?: number;
  explanation?: string;
}

const SUB = 1 / 2000, SPAN = 6, LO = 0.4, HI = 2.0;
const H = SHAKE.hand * 100; // cm
const HAND_X = -30;
const TR = { x0: -34, x1: 22, y0: -34, y1: -14, amp: 14 }; // strip, in stage cm

export default function ShakeToResonance({ id, prompt, start = 0.7, explanation }: ShakeToResonanceProps) {
  const task = useTask(id, 'shake-to-resonance');
  const [hz, setHz] = useState(start);
  const hzRef = useRef(start);
  const [shown, setShown] = useState({ swing: 0 });
  const stage = useRef<StageApi | null>(null);
  const sim = useRef({ x: 0, v: 0, ph: 0, t: 0 });
  const hist = useRef<{ t: number; x: number; h: number }[]>([]);
  const els = useRef<Record<string, SVGElement | null>>({});

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const m = sim.current, om = 2 * Math.PI * hzRef.current;
      for (let k = 0; k < Math.round(dt / SUB); k++) {
        [m.x, m.v] = shakenStep(shakeOsc, m.x, m.v, m.ph, om, SUB);
        m.ph += om * SUB; m.t += SUB;
      }
      const hand = H * Math.cos(m.ph), cart = m.x * 100;
      hist.current.push({ t: m.t, x: cart, h: hand });
      while (hist.current.length && hist.current[0].t < m.t - SPAN) hist.current.shift();
      const s = stage.current;
      if (s) {
        els.current.hand?.setAttribute('transform', `translate(${s.sx(HAND_X + hand)},${s.sy(0)})`);
        els.current.cart?.setAttribute('transform', `translate(${s.sx(cart)},${s.sy(0)})`);
        els.current.spring?.setAttribute('d', coil(s, HAND_X + hand + 0.2, cart - 3));
        const tx = (t: number) => s.sx(TR.x1 - ((m.t - t) / SPAN) * (TR.x1 - TR.x0));
        const ty = (y: number) => s.sy((TR.y0 + TR.y1) / 2 + (y / TR.amp) * ((TR.y1 - TR.y0) / 2));
        const pts = (k: 'x' | 'h') => hist.current.filter((_, i) => i % 2 === 0).map((p) => `${tx(p.t).toFixed(1)},${ty(p[k]).toFixed(1)}`).join(' ');
        els.current.tx?.setAttribute('points', pts('x'));
        els.current.th?.setAttribute('points', pts('h'));
      }
      if (now - lastShown > 125) {
        lastShown = now;
        // the swing, measured: the widest excursion over the last full cycle
        const win = 1.02 / Math.min(hzRef.current, SHAKE.f0);
        let mx = 0;
        for (const p of hist.current) if (p.t > m.t - win) mx = Math.max(mx, Math.abs(p.x));
        setShown({ swing: mx });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const best = bestShakeHz();
  const hit = Math.abs(hz - best) <= 0.04 * best;
  const settled = settledSwing(hz) * 100;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 240px' }}>
            <span className="hud-label">Shaking rate</span>
            <input type="range" className="anth-slider" min={LO} max={HI} step={0.01} value={hz} aria-label="Shaking rate, shakes per second"
              onChange={(e) => { const v = +e.target.value; setHz(v); hzRef.current = v; task.touch(); }} />
          </label>
          <span style={{ display: 'flex', gap: 22 }}>
            <Meter label="Hand shakes" value={hz.toFixed(2)} unit="per s" color={C.force} />
            <Meter label="Cart swings" value={`±${shown.swing.toFixed(1)}`} unit="cm" color={C.position} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { hz })}
          miss={`At ${hz.toFixed(2)} shakes a second the cart settles to ±${settled.toFixed(1)} cm, ${(settled / H).toFixed(1)}× the hand's ±${H} cm. The hand is shaking ${hz > best ? 'faster' : 'slower'} than the cart swings on its own.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-37, 25]} y={[-38, 9]} height={330} label={`Hand shaking a spring at ${hz.toFixed(2)} per second; cart swinging about ${shown.swing.toFixed(1)} centimetres`}>
        {(s) => {
          stage.current = s;
          return <>
            <line x1={s.sx(-37)} x2={s.sx(25)} y1={s.sy(-3.5)} y2={s.sy(-3.5)} stroke={C.rule} strokeWidth={2} />
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(6)} y2={s.sy(-3.5)} stroke={C.faint} strokeDasharray="3 5" />
            {[-10, 10].map((v) => <g key={v}>
              <line x1={s.sx(v)} x2={s.sx(v)} y1={s.sy(-3.5)} y2={s.sy(-5)} stroke={C.faint} />
              <text x={s.sx(v)} y={s.sy(-5) + 14} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v > 0 ? '+' : '−'}10 cm</text>
            </g>)}
            <path ref={(el) => { els.current.spring = el; }} d={coil(s, HAND_X + H + 0.2, -3)} fill="none" stroke={C.soft} strokeWidth={1.6} />
            <g ref={(el) => { els.current.hand = el; }} transform={`translate(${s.sx(HAND_X + H)},${s.sy(0)})`}>
              <rect x={-12} y={-20} width={14} height={40} rx={6} fill={C.surface} stroke={C.force} strokeWidth={2.2} />
              <text x={-5} y={-28} textAnchor="middle" fontSize={13} fill={C.force}>hand</text>
            </g>
            <g ref={(el) => { els.current.cart = el; }} transform={`translate(${s.sx(0)},${s.sy(0)})`}>
              <rect x={-30} y={-26} width={60} height={46} rx={5} fill={C.surface} stroke={C.position} strokeWidth={2.2} />
              <circle cx={-16} cy={24} r={5} fill={C.soft} /><circle cx={16} cy={24} r={5} fill={C.soft} />
            </g>
            {/* the strip: the last six seconds, hand and cart */}
            {[-10, 0, 10].map((v) => {
              const y = s.sy((TR.y0 + TR.y1) / 2 + (v / TR.amp) * ((TR.y1 - TR.y0) / 2));
              return <g key={v}>
                <line x1={s.sx(TR.x0)} x2={s.sx(TR.x1)} y1={y} y2={y} stroke={v === 0 ? C.rule : C.grid} />
                <text x={s.sx(TR.x0) - 6} y={y + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
              </g>;
            })}
            <text x={s.sx(TR.x0)} y={s.sy(TR.y1) - 8} fontSize={13} fill={C.soft}>position (cm), last 6 s</text>
            <text x={s.sx(TR.x1)} y={s.sy(TR.y1) - 8} textAnchor="end" fontSize={13}><tspan fill={C.force}>hand</tspan><tspan fill={C.faint}>  ·  </tspan><tspan fill={C.position}>cart</tspan></text>
            <text x={s.sx(TR.x1)} y={s.sy(TR.y0) + 16} textAnchor="end" fontSize={12} fill={C.faint}>now</text>
            <polyline ref={(el) => { els.current.th = el; }} points="" fill="none" stroke={C.force} strokeWidth={1.8} />
            <polyline ref={(el) => { els.current.tx = el; }} points="" fill="none" stroke={C.position} strokeWidth={2.2} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

function coil(s: StageApi, x0: number, x1: number) {
  const n = 12, pts = [`M${s.sx(x0)},${s.sy(0)}`];
  for (let i = 1; i < 2 * n; i++) pts.push(`L${s.sx(x0 + ((x1 - x0) * i) / (2 * n))},${s.sy(0) + (i % 2 ? -8 : 8)}`);
  pts.push(`L${s.sx(x1)},${s.sy(0)}`);
  return pts.join('');
}
