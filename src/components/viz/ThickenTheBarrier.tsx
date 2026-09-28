import { useMemo, useRef, useState } from 'react';
import { barrierTransmission, flatBarrier, scatterNumeric, scatterWaveAt } from '../../lib/physics/quantum1d.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { EnergyLine, pct, pts, useFrame } from './quantum-kit.tsx';

/**
 * A flat wall 2 eV tall and a steady stream of 1 eV electrons from the left.
 * One control: the wall's far edge. The wave is the stationary solution
 * (`scatterNumeric`), drawn at true scale on its energy line: a partly
 * standing wave in front, a decay inside, and a faint travelling wave beyond.
 * The fraction through is hidden while you drag; "Send 10 000" counts how
 * many get through, from the exact T (`barrierTransmission`, which the tests
 * hold to the numerical one), and drops a dot on the log strip below. The
 * dots fall on a straight line: the loss is exponential in thickness.
 */
export interface ThickenTheBarrierProps {
  id?: string;
  prompt?: string;
  /** Fraction to let through. */
  target?: number;
  start?: number;
  explanation?: string;
}

const V0 = 2, E = 1, SCALE = 0.28, N_SENT = 10000;
const X: [number, number] = [-3, 3.4];
const A_RANGE: [number, number] = [0.1, 1.3];
const LOG: [number, number] = [-5.5, 0];
const TICKS: [number, string][] = [[-4, '0.01%'], [-2, '1%'], [0, '100%']];

export default function ThickenTheBarrier({ id, prompt, target = 0.01, start = 0.3, explanation }: ThickenTheBarrierProps) {
  const task = useTask(id, 'thicken-the-barrier');
  const [a, setA] = useState(start);
  const [sent, setSent] = useState<{ a: number; T: number }[]>([]);
  const T = barrierTransmission(E, V0, a);
  const last = sent.length && Math.abs(sent[sent.length - 1].a - a) < 1e-9 ? sent[sent.length - 1] : null;
  const good = T >= target / 1.25 && T <= target * 1.25;

  const wave = useMemo(() => {
    const sc = scatterNumeric(flatBarrier(V0, a), E, 0, a, 400);
    const xs = Array.from({ length: 641 }, (_, i) => X[0] + (i / 640) * (X[1] - X[0]));
    return { xs, psi: xs.map((x) => scatterWaveAt(sc, x)) };
  }, [a]);
  const live = useRef(wave);
  live.current = wave;

  const api = useRef<StageApi | null>(null);
  const line = useRef<SVGPolylineElement | null>(null);
  const phase = useRef(0);
  useFrame((dt) => {
    const s = api.current, el = line.current, w = live.current;
    if (!s || !el) return;
    phase.current += dt * 2.2;
    const c = Math.cos(phase.current), sn = Math.sin(phase.current);
    el.setAttribute('points', pts(s, w.xs, w.psi.map((v) => E + SCALE * (v.re * c + v.im * sn))));
  });

  const send = () => {
    setSent((q) => [...q.filter((p) => Math.abs(p.a - a) > 1e-9), { a, T }]);
    task.check(good, { a, T });
  };
  const count = (t: number) => Math.round(t * N_SENT);
  const far = T < target;
  const factor = far ? target / T : T / target;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Wall thickness" value={a.toFixed(2)} unit="nm" color={C.position} />
          <Meter label={`Through, of ${N_SENT.toLocaleString('en-GB')}`} value={last ? `${count(last.T)}` : '?'} color={C.position} />
          <Meter label="Fraction through" value={last ? pct(last.T) : '?'} color={C.position} />
        </div>
        {id ? <CheckBar verdict={task.verdict} done={task.done} label={`Send ${N_SENT.toLocaleString('en-GB')}`} onCheck={send}
          miss={`At ${a.toFixed(2)} nm, ${count(T)} of ${N_SENT.toLocaleString('en-GB')} get through (${pct(T)}): ${factor.toFixed(1)} times too ${far ? 'few' : 'many'}.`}
          hit={explanation} />
          : <button type="button" className="anth-btn" onClick={send}>Send {N_SENT.toLocaleString('en-GB')}</button>}
      </div>}>
      <Stage x={X} y={[-0.3, 2.6]} height={300} axes={{ x: 'position (nm)', y: 'energy (eV)', yTicks: [0, 1, 2], xTicks: [-3, -2, -1, 0, 1, 2, 3] }}
        label={`A wall two electronvolts tall and ${a.toFixed(2)} nanometres thick, with one electronvolt electrons arriving from the left.`}>
        {(s) => {
          api.current = s;
          return <>
            <rect x={s.sx(0)} y={s.sy(V0)} width={s.sx(a) - s.sx(0)} height={s.sy(0) - s.sy(V0)}
              fill="var(--color-surface)" fillOpacity={0.5} stroke={C.soft} strokeWidth={2} />
            <EnergyLine s={s} E={E} from={X[0]} to={X[1] - 0.05} />
            <text x={s.sx(X[0]) + 4} y={s.sy(E) - 42} fontSize={13} fontWeight={600} fill={C.energy}>electrons: {E} eV</text>
            <polyline ref={(el) => { line.current = el; }} fill="none" stroke={C.position} strokeWidth={3} strokeLinejoin="round" />
            <Handle s={s} at={[a, V0]} step={0.01} color={C.ink} label="Far edge of the wall: drag to thicken or thin it"
              clamp={(p) => [Math.min(A_RANGE[1], Math.max(A_RANGE[0], p[0])), V0]}
              onChange={(p) => { setA(Math.round(p[0] * 100) / 100); task.touch(); }} />
          </>;
        }}
      </Stage>
      <Stage x={[0, 1.4]} y={LOG} height={170} axes={{ x: 'wall thickness (nm)', xTicks: [0, 0.25, 0.5, 0.75, 1, 1.25], yTicks: [] }}
        label={`Fraction through against thickness, on a log scale. ${sent.length} sends so far.`}>
        {(s) => <>
          {/* the y axis reads as percentages, not as logs */}
          {TICKS.map(([v, t]) => (
            <g key={v}>
              <line x1={s.sx(0)} x2={s.sx(1.4)} y1={s.sy(v)} y2={s.sy(v)} stroke={C.grid} />
              <text x={s.sx(0) - 8} y={s.sy(v) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>
            </g>
          ))}
          <line x1={s.sx(0)} x2={s.sx(1.4)} y1={s.sy(Math.log10(target))} y2={s.sy(Math.log10(target))} stroke={C.ink} strokeDasharray="5 5" strokeWidth={1} />
          <text x={s.sx(1.38)} y={s.sy(Math.log10(target)) - 6} textAnchor="end" fontSize={12} fill={C.ink}>target {pct(target)}</text>
          {task.done && <polyline fill="none" stroke={C.position} strokeWidth={1.5} opacity={0.7}
            points={pts(s, Array.from({ length: 49 }, (_, i) => 0.1 + i * 0.025), Array.from({ length: 49 }, (_, i) => Math.max(LOG[0], Math.log10(barrierTransmission(E, V0, 0.1 + i * 0.025)))))} />}
          {sent.map((p) => (
            <circle key={p.a} cx={s.sx(p.a)} cy={s.sy(Math.max(LOG[0], Math.log10(p.T)))} r={5} fill={C.position} />
          ))}
        </>}
      </Stage>
    </SceneCard>
  );
}
