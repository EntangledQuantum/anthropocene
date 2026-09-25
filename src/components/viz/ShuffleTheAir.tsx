import { useEffect, useRef, useState } from 'react';
import { CROWD_WAVE, displacement, pressure, pressureAmplitude } from '../../lib/physics/sound.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * Four metres of air in front of a loudspeaker playing a low note. Every dot
 * is a bit of air, moved from its home by the wave's displacement s(x, t);
 * the strip underneath is that same displacement against position.
 *
 * Ungraded, the note plays in slow motion and one dust speck is marked: it
 * shuffles back and forth about home while the crowding travels on.
 *
 * With `id`, the note is frozen at one instant and the learner drags a
 * pressure gauge to where the air is squeezed hardest. The trap is the peak
 * of the displacement strip; the squeeze sits a quarter-wave away, where the
 * displacement crosses zero. Once solved, the pressure strip appears.
 * Physics: `displacement` / `pressure` in src/lib/physics/sound.ts.
 */
export interface ShuffleTheAirProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const W = CROWD_WAVE;
const EXAG = 6000;          // drawn displacement = real × EXAG
const SLOW = 400;           // playback slower than life
const T_SNAP = 0.0011;      // s, the frozen instant when graded
const X_END = 4;            // m of air shown
const S_TOP = 25e-6;        // m, displacement strip half-height
const P_TOP = 10;           // Pa, pressure strip half-height
const HIT = 0.9;            // gauge must read ≥ 90% of the peak squeeze
const SPECK = 3;            // m, where the dust speck lives

// Dots: fixed, pseudo-random homes, so the air looks like air and not a lattice.
const DOTS = Array.from({ length: 560 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12345.678;
  return [((i + 0.5 + (a - Math.floor(a) - 0.5) * 0.9) / 560) * X_END, (b - Math.floor(b)) * 0.9 - 0.45] as const;
});

export default function ShuffleTheAir({ id, prompt, explanation }: ShuffleTheAirProps) {
  const graded = Boolean(id);
  const task = useTask(id, 'shuffle-the-air');
  const stage = useRef<StageApi | null>(null);
  const dots = useRef<SVGPathElement>(null);
  const strip = useRef<SVGPathElement>(null);
  const cone = useRef<SVGLineElement>(null);
  const speck = useRef<SVGCircleElement>(null);
  const clock = useRef({ t: graded ? T_SNAP : 0, playing: !graded });
  const [playing, setPlaying] = useState(!graded);
  const [speckUm, setSpeckUm] = useState(0);
  const [gx, setGx] = useState(1.9);

  const pose = (t: number) => {
    const s = stage.current;
    if (!s) return;
    let d = '';
    for (const [x0, y] of DOTS) {
      const x = s.sx(x0 + displacement(W, x0, t) * EXAG), yy = s.sy(y);
      d += `M${(x - 2.2).toFixed(1)},${yy.toFixed(1)}a2.2,2.2 0 1,0 4.4,0a2.2,2.2 0 1,0 -4.4,0`;
    }
    dots.current?.setAttribute('d', d);
    let p = '';
    for (let i = 0; i <= 200; i++) {
      const x = (i / 200) * X_END;
      p += `${i ? 'L' : 'M'}${s.sx(x).toFixed(1)},${s.sy(stripY(-1.35, displacement(W, x, t) / S_TOP)).toFixed(1)}`;
    }
    strip.current?.setAttribute('d', p);
    const c = s.sx(-0.06 + displacement(W, 0, t) * EXAG);
    cone.current?.setAttribute('x1', String(c));
    cone.current?.setAttribute('x2', String(c));
    speck.current?.setAttribute('cx', String(s.sx(SPECK + displacement(W, SPECK, t) * EXAG)));
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), shown = 0;
    const frame = (now: number) => {
      const c = clock.current;
      if (c.playing) c.t += (now - last) / 1000 / SLOW;
      last = now;
      pose(c.t);
      if (!graded && now - shown > 120) { shown = now; setSpeckUm(displacement(W, SPECK, c.t) * 1e6); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [graded]);

  const pMax = pressureAmplitude(W);
  const pg = pressure(W, gx, T_SNAP), sg = displacement(W, gx, T_SNAP);
  const hitNow = pg >= HIT * pMax;
  const fmt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;
  const miss = pg < 0
    ? `The gauge reads ${fmt(pg)} Pa: the air here is thinner than normal, not squeezed.`
    : Math.abs(sg) > 0.8 * W.s0
      ? `The gauge reads ${fmt(pg)} Pa. The air here has moved ${(Math.abs(sg) * 1e6).toFixed(0)} μm, near the most in the row, but so has the air on either side of it.`
      : `The gauge reads ${fmt(pg)} Pa, ${Math.round((pg / pMax) * 100)}% of the strongest squeeze in the row.`;

  const yLo = graded ? -3.2 : -2.0;
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        {!graded && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => { clock.current.playing = !playing; setPlaying(!playing); }}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <span style={{ marginLeft: 'auto' }}>
            <Meter label="Dust speck, from its home" value={fmt(speckUm)} unit="μm" color={C.position} />
          </span>
        </div>}
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { x: gx, p: pg })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.45, X_END + 0.05]} y={[yLo, 0.8]} height={graded ? 420 : 300}
        label={graded ? `A frozen instant of a sound wave in air. The pressure gauge is at ${gx.toFixed(2)} metres.` : 'Air in front of a loudspeaker playing a low note, in slow motion. A dust speck shuffles about its home.'}>
        {(s) => { stage.current = s; return <>
          {/* the loudspeaker */}
          <rect x={s.sx(-0.42)} y={s.sy(0.42)} width={s.len(0.3)} height={s.sy(-0.42) - s.sy(0.42)} rx={4} fill={C.surface} stroke={C.soft} strokeWidth={2} />
          <line ref={cone} x1={s.sx(-0.06)} x2={s.sx(-0.06)} y1={s.sy(0.3)} y2={s.sy(-0.3)} stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
          <text x={s.sx(-0.27)} y={s.sy(-0.62)} textAnchor="middle" fontSize={12} fill={C.faint}>speaker</text>
          <path ref={dots} fill={C.soft} opacity={0.75} />
          {!graded && <>
            <line x1={s.sx(SPECK)} x2={s.sx(SPECK)} y1={s.sy(0.58)} y2={s.sy(0.3)} stroke={C.position} strokeDasharray="3 3" />
            <text x={s.sx(SPECK)} y={s.sy(0.62)} textAnchor="middle" fontSize={12} fill={C.position}>speck’s home</text>
            <circle ref={speck} cx={s.sx(SPECK)} cy={s.sy(0.05)} r={6} fill={C.position} />
          </>}
          <Strip s={s} c={-1.35} label="displacement (μm)" ticks={[-20, 0, 20]} scale={S_TOP * 1e6} />
          <path ref={strip} fill="none" stroke={C.position} strokeWidth={2.5} />
          {graded && <>
            <Strip s={s} c={-2.55} label="pressure above normal (Pa)" ticks={[-8, 0, 8]} scale={P_TOP} />
            {task.done && <path fill="none" stroke={C.force} strokeWidth={2.5}
              d={Array.from({ length: 201 }, (_, i) => (i / 200) * X_END).map((x, i) =>
                `${i ? 'L' : 'M'}${s.sx(x).toFixed(1)},${s.sy(stripY(-2.55, pressure(W, x, T_SNAP) / P_TOP)).toFixed(1)}`).join('')} />}
            {!task.done && <text x={s.sx(X_END / 2)} y={s.sy(-2.55) + 4} textAnchor="middle" fontSize={13} fill={C.faint}>appears once you find the squeeze</text>}
            <line x1={s.sx(gx)} x2={s.sx(gx)} y1={s.sy(0.62)} y2={s.sy(-3.05)} stroke={C.force} strokeDasharray="4 4" opacity={0.8} />
            <text x={s.sx(gx) + 14} y={s.sy(0.62) + 5} fontSize={13} fill={C.force}>gauge</text>
            <Handle s={s} at={[gx, 0.62]} color={C.force} step={0.02} label="Pressure gauge position along the air, in metres"
              onChange={(p) => { setGx(Math.min(X_END - 0.05, Math.max(0.05, p[0]))); task.touch(); }} />
          </>}
          {[0, 1, 2, 3, 4].map((x) => <text key={x} x={s.sx(x)} y={s.sy(yLo) - 2} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{x} m</text>)}
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {W.f} Hz, one wavelength every 2 m · air motion drawn {EXAG.toLocaleString('en')}× larger{graded ? ' · one frozen instant' : ` · played ${SLOW}× slower`}
      </p>
    </SceneCard>
  );
}

/** A companion strip centred at world y = c, half-height 0.5, with its own scale. */
const stripY = (c: number, frac: number) => c + 0.5 * Math.max(-1.1, Math.min(1.1, frac));

function Strip({ s, c, label, ticks, scale }: { s: StageApi; c: number; label: string; ticks: number[]; scale: number }) {
  return <g>
    {ticks.map((v) => <g key={v}>
      <line x1={s.sx(0)} x2={s.sx(X_END)} y1={s.sy(stripY(c, v / scale))} y2={s.sy(stripY(c, v / scale))} stroke={v === 0 ? C.rule : C.grid} />
      <text x={s.sx(0) - 6} y={s.sy(stripY(c, v / scale)) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
    </g>)}
    <text x={s.sx(X_END)} y={s.sy(c + 0.5) - 4} textAnchor="end" fontSize={12} fill={C.soft}>{label}</text>
  </g>;
}
