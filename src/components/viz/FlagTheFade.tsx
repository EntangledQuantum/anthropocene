import { useMemo, useRef, useState } from 'react';
import { hillTurningPoint, scatterNumeric, scatterWaveAt, smoothHill } from '../../lib/physics/quantum1d.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { EnergyLine, pts, useFrame } from './quantum-kit.tsx';

/**
 * A smooth hill 2 eV tall and an electron arriving from the left with 1 eV.
 * Plant a flag where you think the wave stops swinging and starts to fade,
 * then send the wave. The wave is the stationary solution of the Schrödinger
 * equation for this hill (`scatterNumeric`, marched backwards through it),
 * drawn on its energy line, with its phase ticking so the swing reads. It
 * swings with a longer and longer wavelength up the flank, and past the point
 * where the hill reaches 1 eV (`hillTurningPoint`) it only decays.
 */
export interface FlagTheFadeProps {
  id?: string;
  prompt?: string;
  explanation?: string;
  /** How close the flag must be, nm. */
  tolerance?: number;
}

const V0 = 2, W = 1.2, E = 1, SCALE = 0.3;
const X: [number, number] = [-3.6, 1.8];
const RANGE: [number, number] = [-3.3, 1.1];
const nm = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

export default function FlagTheFade({ id, prompt, explanation, tolerance = 0.1 }: FlagTheFadeProps) {
  const task = useTask(id, 'flag-the-fade');
  const [flag, setFlag] = useState(-2.2);
  const [sent, setSent] = useState(false);
  const U = useMemo(() => smoothHill(V0, W), []);
  const xt = hillTurningPoint(E, V0, W)!;
  const wave = useMemo(() => {
    const sc = scatterNumeric(U, E, -W, W, 1200);
    const xs = Array.from({ length: 541 }, (_, i) => X[0] + (i / 540) * (X[1] - X[0]));
    return { xs, psi: xs.map((x) => scatterWaveAt(sc, x)) };
  }, [U]);
  const hill = useMemo(() => wave.xs.map((x) => U(x)), [wave, U]);
  const good = Math.abs(flag - xt) <= tolerance;

  const api = useRef<StageApi | null>(null);
  const line = useRef<SVGPolylineElement | null>(null);
  const phase = useRef(0);
  useFrame((dt) => {
    const s = api.current, el = line.current;
    if (!s || !el) return;
    phase.current += dt * 2.2;
    const c = Math.cos(phase.current), sn = Math.sin(phase.current);
    // Re[ψ e^{−iφ}]
    el.setAttribute('points', pts(s, wave.xs, wave.psi.map((v) => E + SCALE * (v.re * c + v.im * sn))));
  });

  const env = wave.psi.map((v) => Math.hypot(v.re, v.im));
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Flag at" value={nm(flag)} unit="nm" color={C.position} />
          <Meter label="Hill height at the flag" value={U(flag).toFixed(2)} unit="eV" color={C.energy} />
        </div>
        {id ? <CheckBar verdict={task.verdict} done={task.done} label="Send the wave"
          onCheck={() => { setSent(true); task.check(good, { flag }); }}
          miss={`The wave swings until ${nm(xt)} nm, where the hill reaches the electron's ${E.toFixed(2)} eV. Your flag at ${nm(flag)} nm stands where the hill is ${U(flag).toFixed(2)} eV.`}
          hit={explanation} />
          : <button type="button" className="anth-btn" onClick={() => setSent(true)}>Send the wave</button>}
      </div>}>
      <Stage x={X} y={[-0.45, 2.7]} height={340} axes={{ x: 'position (nm)', y: 'energy (eV)', yTicks: [0, 1, 2] }}
        label={`A smooth hill two electronvolts tall. An electron arrives from the left with one electronvolt. The flag is at ${flag.toFixed(2)} nanometres.`}>
        {(s) => {
          api.current = s;
          const top = s.sy(2.45);
          return <>
            <polygon points={`${s.sx(X[0])},${s.sy(0)} ${pts(s, wave.xs, hill)} ${s.sx(X[1])},${s.sy(0)}`}
              fill="var(--color-surface)" fillOpacity={0.5} stroke={C.soft} strokeWidth={2} />
            <text x={s.sx(0)} y={s.sy(V0) - 8} textAnchor="middle" fontSize={13} fill={C.soft}>hill, {V0} eV</text>
            <EnergyLine s={s} E={E} from={X[0]} to={X[1]} />
            <text x={s.sx(X[1]) - 4} y={s.sy(E) - 10} textAnchor="end" fontSize={13} fontWeight={600} fill={C.energy}>electron: {E} eV</text>
            {sent && <>
              <polygon fill={C.position} opacity={0.1}
                points={`${pts(s, wave.xs, env.map((m) => E + SCALE * m))} ${pts(s, [...wave.xs].reverse(), [...env].reverse().map((m) => E - SCALE * m))}`} />
              <polyline ref={(el) => { line.current = el; }} fill="none" stroke={C.position} strokeWidth={3} strokeLinejoin="round" />
              <line x1={s.sx(xt)} x2={s.sx(xt)} y1={s.sy(0)} y2={s.sy(E)} stroke={C.ok} strokeWidth={1.5} strokeDasharray="3 3" />
              <circle cx={s.sx(xt)} cy={s.sy(E)} r={5} fill={C.ok} />
            </>}
            {/* the flag */}
            <line x1={s.sx(flag)} x2={s.sx(flag)} y1={s.sy(0)} y2={top} stroke={C.ink} strokeWidth={2} />
            <path d={`M${s.sx(flag)},${top} l22,7 l-22,7 Z`} fill={C.position} />
            <Handle s={s} at={[flag, 2.45]} step={0.02} color={C.ink} label="Flag: drag along the ground"
              clamp={(p) => [Math.min(RANGE[1], Math.max(RANGE[0], p[0])), 2.45]}
              onChange={(p) => { setFlag(Math.round(p[0] * 100) / 100); setSent(false); task.touch(); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        The wave is drawn on its energy line{sent ? ' · green: where the hill reaches the electron’s energy' : ''}
      </p>
    </SceneCard>
  );
}
