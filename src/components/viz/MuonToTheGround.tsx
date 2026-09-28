import { useRef, useState } from 'react';
import {
  MUON, gamma, groundTimeFor, muonClockAfter, muonJustReaches, muonRange, muonRangeUndilated,
} from '../../lib/physics/relativity.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { SpeedStrip, fmtBeta, useFrame } from './relativity-kit-ch37.tsx';

/**
 * A cosmic-ray muon is made 15 km up and falls toward a detector on the
 * ground. It carries its own clock and decays when that clock reads its
 * 2.2 µs lifetime. A dimmed ghost falls beside it at the same speed with a
 * clock that keeps ground time, and dies less than a kilometre down: that is
 * the failure of the "time is universal" model, left on the screen.
 *
 * Ungraded (no id): a fixed fast muon and one Release button.
 * Graded: set the speed so the muon only just reaches the ground.
 * Physics: `muonRange`, `muonClockAfter`, `groundTimeFor` in src/lib/physics/relativity.ts.
 */
export interface MuonToTheGroundProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const H = MUON.height / 1000;          // km
const TAU_US = MUON.lifetime * 1e6;
const PLAY = 16;                        // ground µs of flight per second of screen time
const XM = 3.6, XG = 2.4;               // muon, ghost

export default function MuonToTheGround({ id, prompt, explanation }: MuonToTheGroundProps) {
  const task = useTask(id, 'muon-to-the-ground');
  const [beta, setBeta] = useState<number>(id ? 0.995 : MUON.betaShown);
  const betaRef = useRef(beta);
  betaRef.current = beta;
  const run = useRef({ on: false, tg: 0, released: NaN });
  const el = useRef<Record<string, SVGElement | null>>({});
  const put = (k: string) => (n: SVGElement | null) => { el.current[k] = n; };
  const sRef = useRef<{ sx: (x: number) => number; sy: (y: number) => number } | null>(null);
  const [shown, setShown] = useState({ tg: 0, tm: 0, state: 'waiting' as 'waiting' | 'falling' | 'decayed' | 'landed' });
  const last = useRef(0);

  const b = beta;
  const range = muonRange(b) / 1000;               // km, ground frame
  const ghostRange = muonRangeUndilated(b) / 1000;  // km
  const tLand = groundTimeFor(MUON.height, b) * 1e6; // µs
  const tDecay = gamma(b) * TAU_US;                 // ground µs
  const tEnd = Math.min(tLand, tDecay);

  const release = () => { run.current = { on: true, tg: 0, released: betaRef.current }; task.touch(); };
  const changeSpeed = (nb: number) => { setBeta(nb); run.current = { on: false, tg: 0, released: NaN }; setShown({ tg: 0, tm: 0, state: 'waiting' }); task.touch(); };

  useFrame((dt, now) => {
    const s = sRef.current;
    if (!s) return;
    const r = run.current;
    const bb = betaRef.current;
    const vKmUs = bb * 0.299792458;
    const land = groundTimeFor(MUON.height, bb) * 1e6, decay = gamma(bb) * TAU_US;
    const end = Math.min(land, decay);
    if (r.on) r.tg = Math.min(end, r.tg + dt * PLAY);
    const set = (k: string, a: Record<string, string | number>) => { const n = el.current[k]; if (n) for (const [kk, vv] of Object.entries(a)) n.setAttribute(kk, String(vv)); };
    const y = H - vKmUs * r.tg;
    set('muon', { cy: s.sy(y) });
    set('trail', { y2: s.sy(y) });
    
    const lbl = el.current.muonClock;
    if (lbl) { lbl.setAttribute('y', String(s.sy(y) - 12)); lbl.textContent = `its clock ${(r.tg / gamma(bb)).toFixed(2)} µs`; }
    // the ghost keeps ground time
    const tgG = Math.min(r.tg, TAU_US);
    const yG = H - vKmUs * tgG;
    set('ghost', { cy: s.sy(yG), opacity: r.tg >= TAU_US ? 0 : 0.5 });
    set('ghostBurst', { opacity: r.tg >= TAU_US ? 0.6 : 0, transform: `translate(0,${s.sy(yG) - s.sy(H)})` });
    const done = r.on && r.tg >= end - 1e-9;
    const state = !r.on ? 'waiting' : !done ? 'falling' : decay < land ? 'decayed' : 'landed';
    set('vArrow', { transform: `translate(0,${s.sy(y) - s.sy(H)})`, opacity: done ? 0 : 1 });
    set('burst', { opacity: state === 'decayed' ? 1 : 0, transform: `translate(0,${s.sy(y) - s.sy(H)})` });
    set('muon', { opacity: state === 'decayed' ? 0 : 1 });
    if (now - last.current > 120) { last.current = now; setShown({ tg: r.tg, tm: r.tg / gamma(bb), state }); }
  });

  const released = run.current.released === beta;
  const finished = shown.state === 'decayed' || shown.state === 'landed';
  const ok = muonJustReaches(beta);
  const clockAtGround = muonClockAfter(MUON.height, beta) * 1e6;
  const miss = !released || !finished
    ? 'Release it at this speed and let it finish first.'
    : range < H
      ? `Its clock reached 2.2 µs ${(H - range).toFixed(1)} km above the ground, after only ${range.toFixed(1)} km of air.`
      : `It reached the ground with its clock at ${clockAtGround.toFixed(2)} µs, ${(TAU_US - clockAtGround).toFixed(2)} µs to spare: a slower muon still makes it.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        {id && <SpeedStrip beta={beta} onChange={changeSpeed} label="Muon speed"
          scale={{ kind: 'log', lo: MUON.betaWindow[0], hi: MUON.betaWindow[1], ticks: [0.99, 0.995, 0.999, 0.9995, 0.9999] }} />}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={release}>{shown.state === 'waiting' ? 'Release' : 'Release again'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Speed" value={fmtBeta(beta)} color={C.velocity} />
            <Meter label="Ground clock" value={shown.tg.toFixed(1)} unit="µs" />
            <Meter label="Muon's clock" value={shown.tm.toFixed(2)} unit="µs" color={C.position} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(released && finished && ok, { beta, range })}
          miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[0, 10]} y={[-1.3, 16.9]} height={380} label={`A muon falling from 15 km at ${fmtBeta(beta)}`}>
        {(s) => {
          sRef.current = s;
          const burst = (x: number, r: number, col: string) => [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180);
            return <line key={a} x1={s.sx(x) + c * 5} y1={s.sy(H) + sn * 5} x2={s.sx(x) + c * r} y2={s.sy(H) + sn * r} stroke={col} strokeWidth={2} />;
          });
          return <g>
            <rect x={s.sx(1.6)} y={s.sy(H)} width={s.sx(6.4) - s.sx(1.6)} height={s.sy(0) - s.sy(H)} fill={C.velocity} fillOpacity={0.04} />
            {[0, 5, 10, 15].map((k) => <g key={k}>
              <line x1={s.sx(1.3)} x2={s.sx(1.6)} y1={s.sy(k)} y2={s.sy(k)} stroke={C.faint} />
              <text x={s.sx(1.2)} y={s.sy(k) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{k} km</text>
            </g>)}
            <line x1={s.sx(1.6)} x2={s.sx(1.6)} y1={s.sy(0)} y2={s.sy(H)} stroke={C.rule} />
            <line x1={s.sx(1.6)} x2={s.W} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
            <rect x={s.sx(XM) - 22} y={s.sy(0)} width={44} height={8} fill={C.soft} />
            <text x={s.sx(XM) - 30} y={s.sy(0) + 16} textAnchor="end" fontSize={13} fill={C.soft}>detector</text>
            <text x={s.sx(6.6)} y={s.sy(H) + 5} fontSize={13} fill={C.soft}>made here, {H} km up</text>

            {/* ghost: same speed, clock on ground time */}
            <line x1={s.sx(XG)} x2={s.sx(XG)} y1={s.sy(H)} y2={s.sy(H - ghostRange)} stroke={C.faint} strokeDasharray="3 4" />
            <line x1={s.sx(XG) + 10} x2={s.sx(6.5)} y1={s.sy(H - ghostRange)} y2={s.sy(H) + 26} stroke={C.faint} strokeDasharray="2 4" />
            <text x={s.sx(6.6)} y={s.sy(H) + 30} fontSize={12.5} fill={C.faint}>ghost: same speed, clock</text>
            <text x={s.sx(6.6)} y={s.sy(H) + 46} fontSize={12.5} fill={C.faint}>on ground time. Dies</text>
            <text x={s.sx(6.6)} y={s.sy(H) + 62} fontSize={12.5} fill={C.faint}>{(ghostRange * 1000).toFixed(0)} m down.</text>
            <circle ref={put('ghost')} cx={s.sx(XG)} cy={s.sy(H)} r={7} fill="none" stroke={C.faint} strokeWidth={2} opacity={0.5} />
            <g ref={put('ghostBurst')} opacity={0}>{burst(XG, 12, C.faint)}</g>

            {/* the muon */}
            <line ref={put('trail')} x1={s.sx(XM)} x2={s.sx(XM)} y1={s.sy(H)} y2={s.sy(H)} stroke={C.position} strokeWidth={2} strokeOpacity={0.5} />
            <g ref={put('vArrow')}>
              <line x1={s.sx(XM) - 26} x2={s.sx(XM) - 26} y1={s.sy(H) - 4} y2={s.sy(H) + 26} stroke={C.velocity} strokeWidth={3} />
              <path d={`M${s.sx(XM) - 26},${s.sy(H) + 36}l-6,-12l12,0Z`} fill={C.velocity} />
            </g>
            <circle ref={put('muon')} cx={s.sx(XM)} cy={s.sy(H)} r={8} fill={C.position} />
            <g ref={put('burst')} opacity={0}>{burst(XM, 16, C.position)}</g>
            <text ref={put('muonClock')} x={s.sx(XM) + 14} y={s.sy(H) - 12} fontSize={13.5} fill={C.position} fontFamily="var(--font-mono)"
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">its clock 0.00 µs</text>

            {finished && <text x={s.sx(6.6)} y={s.sy(8)} fontSize={14} fill={C.ink}>
              {shown.state === 'decayed' ? `decayed ${(H - range).toFixed(1)} km up` : 'reached the ground'}
            </text>}
            {finished && <text x={s.sx(6.6)} y={s.sy(8) + 20} fontSize={13} fill={C.soft}>{`ground clock ${tEnd.toFixed(1)} µs`}</text>}
            {finished && <text x={s.sx(6.6)} y={s.sy(8) + 38} fontSize={13} fill={C.position}>{`its clock ${(tEnd / gamma(b)).toFixed(2)} µs`}</text>}
          </g>;
        }}
      </Stage>
    </SceneCard>
  );
}
