import { useEffect, useRef, useState } from 'react';
import { G, intoPage, wireForce } from '../../lib/physics/magnetism.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { FieldMarks } from './magnet-kit-ch27.tsx';

/**
 * A copper rod lies across two upright rails in a field into the page. The
 * rails feed it current, and it can slide freely up and down them. One
 * control: the current, dragged along the track (negative sends it left).
 * Checking lets go of the rod: it falls, rises, or hangs where it is.
 *
 * The two amber arrows are its weight and the magnetic push I L × B from
 * `wireForce`; the rod moves under their sum. Graded with `id`: hang it still.
 */
export interface FloatTheRodProps {
  id?: string;
  prompt?: string;
  /** Rod mass, kg; length, m; field, T. */
  mass?: number;
  length?: number;
  field?: number;
  /** Starting current, A. */
  start?: number;
  /** Net force that counts as balanced, as a fraction of the weight. */
  tolerance?: number;
  explanation?: string;
}

const IMAX = 8;
const TRACK: [number, number] = [-12, 12];
const TRACK_Y = -13.5;
const PER_N = 16; // cm of arrow per newton
const CM = 0.01;
const ROOM = 6; // the rod can travel ±6 cm before it hits the stops

export default function FloatTheRod({
  id, prompt, mass = 0.02, length = 0.2, field = 0.25, start = 1.5, tolerance = 0.02, explanation,
}: FloatTheRodProps) {
  const task = useTask(id, 'float-the-rod');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [I, setI] = useState(start);
  const [released, setReleased] = useState(false);
  const rod = useRef<SVGGElement>(null);
  const api = useRef<StageApi | null>(null);
  const y = useRef(0), vy = useRef(0);

  const W = mass * G;
  const Fm = wireForce(I, [length, 0, 0], intoPage(field))[1];
  const net = Fm - W;
  const ok = Math.abs(net) <= tolerance * W;

  useEffect(() => {
    y.current = 0; vy.current = 0;
    if (!released) { rod.current?.setAttribute('transform', 'translate(0,0)'); return; }
    let raf = 0, last = performance.now();
    const a = net / mass; // m/s²
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)) * 0.35; // slowed so the start of the fall reads
      last = now;
      vy.current += a * dt;
      y.current += vy.current * dt;
      if (Math.abs(y.current) > ROOM * CM) { y.current = Math.sign(y.current) * ROOM * CM; vy.current = 0; }
      const s = api.current;
      if (s && rod.current) rod.current.setAttribute('transform', `translate(0,${s.sy(y.current / CM) - s.sy(0)})`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [released, net, mass]);

  const dir = (f: number) => (f >= 0 ? 'up' : 'down');
  const miss = `At ${I < 0 ? '−' : ''}${Math.abs(I).toFixed(2)} A the magnetic push is ${Math.abs(Fm).toFixed(3)} N ${dir(Fm)}; the rod weighs ${W.toFixed(3)} N, so it ${Fm < 0 ? 'is driven down' : net < 0 ? 'falls' : 'rises'}.`;
  const xOf = (i: number) => TRACK[0] + ((i + IMAX) / (2 * IMAX)) * (TRACK[1] - TRACK[0]);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Current" value={`${I < 0 ? '−' : ''}${Math.abs(I).toFixed(2)}`} unit={`A, flowing ${I >= 0 ? 'right' : 'left'}`} />
          <Meter label="Magnetic push" value={`${Math.abs(Fm).toFixed(3)}`} unit={`N ${dir(Fm)}`} color={C.force} />
          <Meter label="Weight" value={W.toFixed(3)} unit="N down" color={C.force} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done} label="Let go and check"
          onCheck={() => { setReleased(true); task.check(ok, { I }); }} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-16, 16]} y={[-16, 11]} height={410} equal
        label={`A rod on vertical rails in a field into the page, carrying ${I.toFixed(2)} amps.`}>
        {(s) => {
          api.current = s;
          const half = (length / CM) / 2;
          return <>
            <FieldMarks s={s} x={[-15, 15]} y={[-8, 10]} into strength={0.4} gap={3} label={`B into the page, ${field.toFixed(2)} T`} />
            {[-1, 1].map((k) => <g key={k}>
              <line x1={s.sx(k * (half + 0.6))} x2={s.sx(k * (half + 0.6))} y1={s.sy(9)} y2={s.sy(-8)} stroke={C.soft} strokeWidth={4} />
              {[ROOM + 0.7, -ROOM - 0.7].map((yy) => <line key={yy} x1={s.sx(k * (half + 0.6)) - 9} x2={s.sx(k * (half + 0.6)) + 9}
                y1={s.sy(yy)} y2={s.sy(yy)} stroke={C.faint} strokeWidth={3} />)}
            </g>)}
            <g ref={rod}>
              <text x={s.sx(-half)} y={s.sy(0.9)} fontSize={12} fill={C.faint}>copper rod, {(mass * 1000).toFixed(0)} g, {(length * 100).toFixed(0)} cm</text>
              <rect x={s.sx(-half)} y={s.sy(0.45)} width={s.len(2 * half)} height={s.len(0.9)} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={2} />
              {Math.abs(I) > 0.02 && [-6, 0, 6].map((x) => <Arrow key={x} s={s} from={[x - Math.sign(I) * 1.2, 0]} to={[x + Math.sign(I) * 1.2, 0]}
                color={C.ink} width={2} />)}
              <Arrow s={s} from={[-2.5, -0.5]} to={[-2.5, -0.5 - W * PER_N]} color={C.force} label={`weight ${W.toFixed(2)} N`} labelSide={1} />
              {Math.abs(Fm) > 1e-3 && <Arrow s={s} from={[2.5, Math.sign(Fm) * 0.5]} to={[2.5, Math.sign(Fm) * 0.5 + Fm * PER_N]} color={C.force}
                label={`I L × B ${Math.abs(Fm).toFixed(2)} N`} labelSide={-1} />}
            </g>
            <line x1={s.sx(TRACK[0])} x2={s.sx(TRACK[1])} y1={s.sy(TRACK_Y)} y2={s.sy(TRACK_Y)} stroke={C.rule} strokeWidth={3} strokeLinecap="round" />
            {[-IMAX, 0, IMAX].map((i) => <text key={i} x={s.sx(xOf(i))} y={s.sy(TRACK_Y) + 22} textAnchor="middle" fontSize={12}
              fill={C.faint} fontFamily="var(--font-mono)">{i} A</text>)}
            <Handle s={s} at={[xOf(I), TRACK_Y]} color={C.ink} step={((TRACK[1] - TRACK[0]) / (2 * IMAX)) * 0.05}
              label="Current: drag along the track"
              onChange={(p) => {
                const i = ((p[0] - TRACK[0]) / (TRACK[1] - TRACK[0])) * 2 * IMAX - IMAX;
                setI(Math.round(Math.max(-IMAX, Math.min(IMAX, i)) * 20) / 20);
                setReleased(false); task.touch();
              }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Seen from the front · the rod slides freely on the rails, which carry the current in and out · white: current · amber: forces on the rod
      </p>
    </SceneCard>
  );
}
