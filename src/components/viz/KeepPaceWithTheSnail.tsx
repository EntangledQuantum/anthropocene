import { useRef, useState } from 'react';
import { currentForDrift, driftSpeed, mm2 } from '../../lib/physics/current.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ElectronWindow, cssVar, type WindowApi } from './circuit-kit-ch25.tsx';

/**
 * Five millimetres of copper wire, magnified, with a garden snail crawling
 * along it at 1 mm/s. One control: the current from the supply. Turn it up
 * until the tagged electron keeps pace with the snail.
 *
 * The answer is a kettle's worth of current, which is the point: copper holds
 * so many free electrons that even a large current is a slow crawl.
 *
 * Graded with `id`: the drift within `tolerance` mm/s of the snail.
 * Physics: `driftSpeed` / `currentForDrift` in src/lib/physics/current.ts.
 */
export interface KeepPaceWithTheSnailProps {
  id?: string;
  prompt?: string;
  /** Copper cross-section, mm². */
  area?: number;
  /** Snail speed, mm/s. */
  snail?: number;
  /** Starting current, A. */
  I0?: number;
  tolerance?: number;
  explanation?: string;
}

const MAX_I = 20, SPAN = 5, START = 0.12 * SPAN;

export default function KeepPaceWithTheSnail({
  id, prompt, area = 1, snail = 1, I0 = 2, tolerance = 0.08, explanation,
}: KeepPaceWithTheSnailProps) {
  const task = useTask(id, 'keep-pace-with-the-snail');
  const [I, setI] = useState(I0);
  const vd = driftSpeed(I, mm2(area)) * 1000;   // mm/s
  const drift = useRef(vd);
  const api = useRef<WindowApi | null>(null);
  const need = currentForDrift(snail / 1000, mm2(area));

  const set = (p: Vec) => {
    const next = Math.round(Math.max(0, Math.min(MAX_I, p[0])) * 10) / 10;
    setI(next);
    drift.current = driftSpeed(next, mm2(area)) * 1000;
    api.current?.reset();
    task.touch();
  };

  const colours = useRef<{ ink: string; body: string } | null>(null);
  const overlay = (g: CanvasRenderingContext2D, o: { pxPerMm: number; t: number; left: number; bot: number; W: number }) => {
    colours.current ??= { ink: cssVar('--color-ink'), body: cssVar('--color-ink-soft') };
    const x = o.left + (START + snail * o.t) * o.pxPerMm;
    if (START + snail * o.t > SPAN - 0.35) { api.current?.reset(); return; }
    // a snail riding the bottom wall: shell, body, two stalks
    const y = o.bot - 2;
    g.strokeStyle = colours.current.ink; g.fillStyle = colours.current.body; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(x - 2, y - 3, 16, 4, 0, 0, 2 * Math.PI); g.fill();
    g.beginPath(); g.moveTo(x + 10, y - 6); g.lineTo(x + 16, y - 16); g.moveTo(x + 13, y - 5); g.lineTo(x + 21, y - 14); g.stroke();
    g.beginPath(); g.arc(x - 6, y - 14, 10, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.arc(x - 5, y - 13, 5, 0, 2 * Math.PI); g.stroke();
    g.fillStyle = colours.current.ink; g.font = '13px Inter, sans-serif'; g.textAlign = 'center';
    g.fillText('snail', x - 4, y - 30);
  };

  const off = vd - snail;
  const ok = Math.abs(off) <= tolerance;
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Current" value={I.toFixed(1)} unit="A" />
          <Meter label="Electron drift" value={vd.toFixed(2)} unit="mm/s" color={C.velocity} />
          <Meter label="Snail" value={snail.toFixed(2)} unit="mm/s" />
        </span>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { I })}
          miss={`At ${I.toFixed(1)} A the electrons drift at ${vd.toFixed(2)} mm/s, ${off < 0 ? `and the snail pulls ${(-off).toFixed(2)} mm ahead every second` : `${off.toFixed(2)} mm/s faster than the snail`}.`}
          hit={explanation} />}
      </div>}>
      <ElectronWindow drift={drift} spanMm={SPAN} scaleMm={1} height={190} api={api} overlay={overlay}
        label={`Magnified copper wire, ${area} square millimetre. Electrons drift at ${vd.toFixed(2)} millimetres per second; the snail crawls at ${snail}.`} />
      <Stage x={[0, MAX_I]} y={[0, 1]} height={84} axes={{ x: 'current from the supply (A)', xTicks: [0, 5, 10, 15, 20], yTicks: [] }}
        label={`Current dial at ${I.toFixed(1)} amps`}>
        {(s) => <>
          <line x1={s.sx(0)} x2={s.sx(MAX_I)} y1={s.sy(0.5)} y2={s.sy(0.5)} stroke={C.rule} strokeWidth={6} strokeLinecap="round" />
          <line x1={s.sx(0)} x2={s.sx(I)} y1={s.sy(0.5)} y2={s.sy(0.5)} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
          <Handle s={s} at={[I, 0.5]} onChange={set} step={0.1} label="Current: drag along the dial" clamp={(p) => [p[0], 0.5]} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Copper, {area} mm² · 5 mm of wire magnified · drift to scale · the random darting drawn slowed
        {task.done ? ` · ${need.toFixed(1)} A to match the snail` : ''}
      </p>
    </SceneCard>
  );
}
