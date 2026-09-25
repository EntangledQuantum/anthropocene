import { useEffect, useRef, useState } from 'react';
import { WHISTLE, crests, dopplerShift, resonatorAmplitude, wavelength, wavelengthAhead, type Pass } from '../../lib/physics/sound.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A 700 Hz whistle and a wine glass that rings only at 800 Hz, on one
 * straight track, seen from above. One control: the speed of whatever moves.
 *
 * `mover="source"`: the train with the whistle drives at the glass. Its crests
 * bunch up ahead, and at the right speed they arrive 800 times a second and
 * the glass sings, the whole way in, not only near the end.
 *
 * `mover="listener"`: the whistle is parked and the glass rides toward it on
 * your train. The crests stay evenly spaced in the air; you only meet them
 * faster, which takes more speed for the same pitch.
 *
 * With `id`, graded: make the glass ring. Physics: `dopplerShift`, `crests`
 * and `resonatorAmplitude` in sound.ts.
 */
export interface RingTheGlassProps {
  id?: string;
  prompt?: string;
  mover?: 'source' | 'listener';
  /** Starting speed, m/s. */
  start?: number;
  explanation?: string;
}

const { f: F, v: V, glass: F_GLASS, Q } = WHISTLE;
const X0 = -300, X_STOP = -30;   // m: where the mover starts and loops back
const U_MAX = 60;
const RULER: [number, number] = [-300, -180]; // throttle ruler, world x for 0 and U_MAX
const EVERY = 100;

export default function RingTheGlass({ id, prompt, mover = 'source', start = 20, explanation }: RingTheGlassProps) {
  const task = useTask(id, 'ring-the-glass');
  const [u, setU] = useState(start);
  const uRef = useRef(start);
  const t0 = useRef(performance.now());
  const stage = useRef<StageApi | null>(null);
  const rings = useRef<SVGPathElement>(null);
  const movingG = useRef<SVGGElement>(null);
  const glassG = useRef<SVGGElement>(null);

  const fh = mover === 'source' ? dopplerShift(F, V, u, 0) : dopplerShift(F, V, 0, u);
  const amp = resonatorAmplitude(fh, F_GLASS, Q) / Q;   // 1 at exact resonance
  const ringing = amp >= Math.SQRT1_2;
  const ampRef = useRef(amp);
  ampRef.current = amp;

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const s = stage.current;
      const uu = uRef.current;
      let t = (now - t0.current) / 1000;
      if (uu > 0 && X0 + uu * t > X_STOP) { t0.current = now; t = 0; }
      if (s) {
        const pass: Pass = mover === 'source'
          ? { f: F, v: V, u: uu, x0: X0, d: 0 }
          : { f: F, v: V, u: 0, x0: 0, d: 0 };
        let d = '';
        for (const c of crests(pass, t, EVERY, 420)) {
          const cx = s.sx(c.cx), cy = s.sy(0), r = s.len(c.r);
          d += `M${(cx - r).toFixed(1)},${cy.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-2 * r).toFixed(1)},0`;
        }
        rings.current?.setAttribute('d', d);
        const dx = s.len(uu * t);
        movingG.current?.setAttribute('transform', `translate(${dx},0)`);
        // the glass trembles as hard as it is driven
        const shake = ampRef.current > 0.2 ? ampRef.current * 2.2 * Math.sin(now / 11) : 0;
        glassG.current?.setAttribute('transform', `translate(${(mover === 'listener' ? dx : 0) + shake},0)`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mover]);

  const setSpeed = (x: number) => {
    const val = Math.round(Math.min(U_MAX, Math.max(0, ((x - RULER[0]) / (RULER[1] - RULER[0])) * U_MAX)) * 2) / 2;
    uRef.current = val; setU(val); t0.current = performance.now(); task.touch();
  };

  const gap = EVERY * (mover === 'source' ? wavelengthAhead(F, V, u) : wavelength(F, V));
  const who = mover === 'source' ? 'train speed' : 'your speed';
  const glassHome = mover === 'source' ? 0 : X0 + 16;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Meter label={mover === 'source' ? 'Train speed' : 'Your speed'} value={u.toFixed(1)} unit="m/s" color={C.velocity} />
          <Meter label="Crest gap at the glass" value={gap.toFixed(1)} unit="m" color={C.energy} />
          <Meter label="Glass" value={ringing ? 'ringing' : amp > 0.25 ? 'humming' : 'silent'} color={ringing ? C.energy : C.faint} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ringing, { u, fh })}
          miss={`At ${u.toFixed(1)} m/s the crests reach the glass ${fh.toFixed(0)} times a second, ${fh.toFixed(0)} Hz. It rings at ${F_GLASS} Hz.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-320, 40]} y={[-60, 70]} height={260} equal
        label={`Top view. ${mover === 'source' ? 'A train with a 700 hertz whistle drives toward a wine glass' : 'A parked 700 hertz whistle; you ride toward it carrying a wine glass'} at ${u.toFixed(1)} metres per second. The glass is ${ringing ? 'ringing' : 'not ringing'}.`}>
        {(s) => { stage.current = s; return <>
          <line x1={0} x2={s.W} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
          <path ref={rings} fill="none" stroke={C.energy} strokeWidth={1.4} opacity={0.7} />
          {/* the parked whistle (listener mode) */}
          {mover === 'listener' && <g>
            <rect x={s.sx(-4)} y={s.sy(4)} width={s.len(8)} height={s.len(8)} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <text x={s.sx(0)} y={s.sy(-9)} textAnchor="middle" fontSize={12} fill={C.soft} stroke={C.surface} strokeWidth={4} paintOrder="stroke">parked whistle</text>
          </g>}
          {/* the mover */}
          <g ref={movingG}>
            <rect x={s.sx(X0 - 12)} y={s.sy(3.5)} width={s.len(24)} height={s.len(7)} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            {u > 0 && <><line x1={s.sx(X0 + 14)} x2={s.sx(X0 + 14 + u * 0.9 - 4)} y1={s.sy(-9)} y2={s.sy(-9)} stroke={C.velocity} strokeWidth={3} />
              <path d={`M${s.sx(X0 + 14 + u * 0.9)},${s.sy(-9)}l-10,-5v10Z`} fill={C.velocity} /></>}
            <text x={s.sx(X0)} y={s.sy(8)} textAnchor="middle" fontSize={12} fill={C.soft} stroke={C.surface} strokeWidth={4} paintOrder="stroke">{mover === 'source' ? 'whistle, 700 Hz' : 'you'}</text>
          </g>
          {/* the glass */}
          <g ref={glassG}>
            <path d={`M${s.sx(glassHome - 5)},${s.sy(30)}Q${s.sx(glassHome - 5)},${s.sy(18)} ${s.sx(glassHome)},${s.sy(18)}Q${s.sx(glassHome + 5)},${s.sy(18)} ${s.sx(glassHome + 5)},${s.sy(30)}Z`}
              fill={ringing ? C.energy : C.surface} fillOpacity={ringing ? 0.35 : 1} stroke={ringing ? C.energy : C.ink} strokeWidth={2} />
            <line x1={s.sx(glassHome)} x2={s.sx(glassHome)} y1={s.sy(18)} y2={s.sy(9)} stroke={C.ink} strokeWidth={2} />
            <line x1={s.sx(glassHome - 3.5)} x2={s.sx(glassHome + 3.5)} y1={s.sy(9)} y2={s.sy(9)} stroke={C.ink} strokeWidth={2} />
            <text x={s.sx(glassHome)} y={s.sy(34)} textAnchor="middle" fontSize={12} fill={ringing ? C.energy : C.soft} stroke={C.surface} strokeWidth={4} paintOrder="stroke">glass, rings at {F_GLASS} Hz</text>
          </g>
          {/* throttle */}
          <line x1={s.sx(RULER[0])} x2={s.sx(RULER[1])} y1={s.sy(60)} y2={s.sy(60)} stroke={C.rule} strokeWidth={2} />
          {[0, 10, 20, 30, 40, 50, 60].map((k) => { const x = RULER[0] + (k / U_MAX) * (RULER[1] - RULER[0]); return <g key={k}>
            <line x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(57)} y2={s.sy(63)} stroke={C.faint} />
            <text x={s.sx(x)} y={s.sy(66)} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)" stroke={C.surface} strokeWidth={4} paintOrder="stroke">{k}</text>
          </g>; })}
          <text x={s.sx(RULER[1] + 8)} y={s.sy(60) + 4} fontSize={12} fill={C.soft} stroke={C.surface} strokeWidth={4} paintOrder="stroke">{who} (m/s)</text>
          <Handle s={s} at={[RULER[0] + (u / U_MAX) * (RULER[1] - RULER[0]), 60]} color={C.velocity} step={1}
            label={`${who === 'train speed' ? 'Train speed' : 'Your speed'}, metres per second`} onChange={(p) => setSpeed(p[0])} />
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>Real time · every {EVERY}th crest drawn · still air, sound at {V} m/s</p>
    </SceneCard>
  );
}
