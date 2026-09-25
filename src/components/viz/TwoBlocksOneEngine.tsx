import { useEffect, useRef, useState } from 'react';
import { contactTemperature, perfectMeetingTemperature, perfectStroke, type Blocks } from '../../lib/physics/entropy.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * A hot block and a cold block with a perfect engine between them. The
 * engine draws heat from the hot block, dumps the Carnot share into the cold
 * one and lifts a weight with the rest, stroke after stroke, until the two
 * share a temperature and there is nothing left to run on.
 *
 * Before running it, the learner drags a mark on the temperature scale to
 * where the two will meet. Almost everyone marks the average. A perfect
 * engine adds no entropy, so they meet at the geometric mean instead, lower
 * than the average by exactly the energy the weight carried away.
 *
 * Graded with `id`: the mark within 8 K of where they meet.
 * Physics: `perfectStroke` in src/lib/physics/entropy.ts.
 */
export interface TwoBlocksOneEngineProps {
  id?: string;
  prompt?: string;
  Th?: number;
  Tc?: number;
  /** Heat capacity of each block, J/K. */
  C?: number;
  explanation?: string;
}

const HOT = 'var(--color-rose)';
const TOL = 8;
// world: T axis on the right, y = 30 + 0.6 T
const SX = 500;
const yOf = (T: number) => 30 + 0.6 * T;
const TOf = (y: number) => (y - 30) / 0.6;

export default function TwoBlocksOneEngine({ id, prompt, Th = 400, Tc = 100, C: cap = 1000, explanation }: TwoBlocksOneEngineProps) {
  const task = useTask(id, 'two-blocks-one-engine');
  const start: Blocks = { Ch: cap, Cc: cap, Th, Tc, W: 0 };
  const sim = useRef<{ b: Blocks; running: boolean }>({ b: start, running: false });
  const [b, setB] = useState<Blocks>(start);
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const [mark, setMark] = useState(Math.round((Th + Tc) / 2 + 40));
  const wheel = useRef<SVGGElement>(null);
  const Tf = perfectMeetingTemperature(cap, Th, cap, Tc);
  const Wmax = cap * (Th + Tc - 2 * Tf);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0, ang = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const r = sim.current;
      if (r.running) {
        const gap = r.b.Th - r.b.Tc;
        r.b = perfectStroke(r.b, Math.min(60 * dt, gap * 0.04 + 0.02));
        ang = (ang + dt * 300 * Math.min(1, gap / 100 + 0.1)) % 360;
        wheel.current?.setAttribute('transform', `rotate(${ang.toFixed(1)})`);
        const finished = r.b.Th - r.b.Tc < 0.05;
        if (finished) r.running = false;
        if (finished || now - lastShown > 80) {
          lastShown = now;
          setB(r.b);
          if (finished) setPhase('done');
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const run = () => { sim.current = { b: start, running: true }; setB(start); setPhase('running'); task.touch(); };
  const reset = () => { sim.current = { b: start, running: false }; setB(start); setPhase('ready'); task.touch(); };

  const met = (b.Th + b.Tc) / 2;
  const off = mark - met;
  const miss = phase !== 'done'
    ? 'Run the engine first and let it finish.'
    : `They met at ${met.toFixed(0)} K, ${Math.abs(off).toFixed(0)} K ${off > 0 ? 'below' : 'above'} your mark, with ${(b.W / 1000).toFixed(0)} kJ lifted.`;
  const tint = (T: number) => `color-mix(in oklab, ${HOT} ${Math.round(4 + (T / Th) * 34)}%, var(--color-surface))`;
  const lift = (b.W / Math.max(Wmax, 1)) * 40;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }}
            onClick={phase === 'ready' ? run : reset} disabled={phase === 'running' || (task.done && Boolean(id))}>
            {phase === 'ready' ? 'Run the engine' : 'Reset the blocks'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Your mark" value={`${mark}`} unit="K" color={C.position} />
            <Meter label="Hot block" value={b.Th.toFixed(1)} unit="K" />
            <Meter label="Cold block" value={b.Tc.toFixed(1)} unit="K" />
            <Meter label="Work lifted" value={(b.W / 1000).toFixed(1)} unit="kJ" color={C.force} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(phase === 'done' && Math.abs(off) <= TOL, { mark, met })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[0, 640]} y={[0, 320]} height={320} label={`Hot block at ${b.Th.toFixed(0)} K, cold block at ${b.Tc.toFixed(0)} K, a perfect engine between them; your mark at ${mark} K.`}>
        {(s) => <>
          {/* blocks */}
          {([[10, b.Th, 'hot block'], [290, b.Tc, 'cold block']] as const).map(([x, T, name]) => <g key={name}>
            <rect x={s.sx(x)} y={s.sy(220)} width={s.len(110)} height={s.sy(100) - s.sy(220)} rx={6} fill={tint(T)} stroke={C.soft} strokeWidth={2} />
            <text x={s.sx(x + 55)} y={s.sy(172)} textAnchor="middle" fontSize={14} fill={C.soft}>{name}</text>
            <text x={s.sx(x + 55)} y={s.sy(148)} textAnchor="middle" fontSize={18} fontWeight={600} fill={C.ink} fontFamily="var(--font-mono)">{T.toFixed(0)} K</text>
            <text x={s.sx(x + 55)} y={s.sy(84)} textAnchor="middle" fontSize={12} fill={C.faint}>{cap / 1000} kJ per K</text>
          </g>)}
          {/* heat flows and work */}
          <line x1={s.sx(120)} x2={s.sx(170)} y1={s.sy(160)} y2={s.sy(160)} stroke={C.energy} strokeWidth={phase === 'running' ? 6 : 2} />
          <path d={`M${s.sx(180)},${s.sy(160)}l-12,-7v14z`} fill={C.energy} />
          <line x1={s.sx(233)} x2={s.sx(278)} y1={s.sy(160)} y2={s.sy(160)} stroke={C.energy} strokeWidth={phase === 'running' ? 3 : 2} />
          <path d={`M${s.sx(288)},${s.sy(160)}l-12,-7v14z`} fill={C.energy} />
          <text x={s.sx(150)} y={s.sy(172)} textAnchor="middle" fontSize={12} fill={C.energy}>heat</text>
          <text x={s.sx(258)} y={s.sy(172)} textAnchor="middle" fontSize={12} fill={C.energy}>dump</text>
          {/* the weight on a rope from the flywheel */}
          <line x1={s.sx(205)} x2={s.sx(205)} y1={s.sy(188)} y2={s.sy(236 + lift)} stroke={C.force} strokeWidth={2} />
          <rect x={s.sx(187)} y={s.sy(262 + lift)} width={s.len(36)} height={s.len(26)} rx={3} fill={C.surface} stroke={C.force} strokeWidth={2} />
          <text x={s.sx(233)} y={s.sy(246 + lift)} fontSize={12} fill={C.force}>weight</text>
          <circle cx={s.sx(205)} cy={s.sy(160)} r={s.len(28)} fill={C.surface} stroke={C.ink} strokeWidth={2.5} />
          <g transform={`translate(${s.sx(205)},${s.sy(160)})`}><g ref={wheel}>
            {[0, 60, 120].map((a) => <line key={a} x1={-s.len(22)} x2={s.len(22)} y1={0} y2={0} stroke={C.soft} strokeWidth={2} transform={`rotate(${a})`} />)}
          </g></g>
          <text x={s.sx(205)} y={s.sy(118)} textAnchor="middle" fontSize={13} fill={C.soft}>perfect engine</text>
          {/* the temperature scale */}
          <line x1={s.sx(SX)} x2={s.sx(SX)} y1={s.sy(yOf(0))} y2={s.sy(yOf(450))} stroke={C.rule} strokeWidth={2} />
          {[0, 100, 200, 300, 400].map((T) => <g key={T}>
            <line x1={s.sx(SX - 5)} x2={s.sx(SX + 5)} y1={s.sy(yOf(T))} y2={s.sy(yOf(T))} stroke={C.faint} />
            <text x={s.sx(SX + 10)} y={s.sy(yOf(T)) + 4} fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{T}</text>
          </g>)}
          <text x={s.sx(SX)} y={s.sy(yOf(450)) - 4} textAnchor="middle" fontSize={12} fill={C.faint}>K</text>
          <circle cx={s.sx(SX)} cy={s.sy(yOf(b.Th))} r={5} fill={HOT} />
          <circle cx={s.sx(SX)} cy={s.sy(yOf(b.Tc))} r={5} fill={C.soft} />
          {phase === 'done' && <g>
            <line x1={s.sx(SX)} x2={s.sx(SX + 26)} y1={s.sy(yOf(contactTemperature(cap, Th, cap, Tc)))} y2={s.sy(yOf(contactTemperature(cap, Th, cap, Tc)))}
              stroke={C.faint} strokeDasharray="4 4" />
            <text x={s.sx(SX + 30)} y={s.sy(yOf(contactTemperature(cap, Th, cap, Tc))) + 4} fontSize={12} fill={C.faint}>
              touching: {contactTemperature(cap, Th, cap, Tc).toFixed(0)} K
            </text>
          </g>}
          <text x={s.sx(SX - 16)} y={s.sy(yOf(mark)) + 4} fontSize={12} fill={C.position} textAnchor="end">your mark</text>
          <Handle s={s} at={[SX, yOf(mark)]} color={C.position} step={0.6 * 5} label="Where the two blocks will meet, kelvin"
            onChange={(p) => { if (phase === 'ready') { setMark(Math.round(Math.min(450, Math.max(0, TOf(p[1]))))); task.touch(); } }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Scale: kelvin · rose dot the hot block, grey dot the cold one
      </p>
    </SceneCard>
  );
}
