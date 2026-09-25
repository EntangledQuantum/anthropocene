import { useRef, useState } from 'react';
import { AIR_BOX, boyleVolumeFraction, createGas, setPiston, thermostat, type Gas } from '../../lib/physics/gas.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { BoxWalls, Ledger, dots, ticks, useGasLoop, useGauge, useTicker } from './gas-kit-ch18.tsx';

/**
 * The same box of air, held at 20 °C by the room, and one control: the
 * piston. Push it in and the gauge climbs; the ledger under it says why —
 * more hits on the piston per nanosecond, each exactly as hard as before.
 *
 * With `id` and `target`, the scene grades itself: squeeze until the
 * pressure is `target` times the start. The truth is Boyle's volume,
 * `boyleVolumeFraction`, and the tolerance is wide enough to cover the
 * few percent by which hard discs are not an ideal gas.
 * Ungraded, the piston goes in as far as `minVolume`, which is where that
 * few percent stops being few.
 * Physics: src/lib/physics/gas.ts.
 */
export interface SqueezeThePistonProps {
  id?: string;
  prompt?: string;
  /** Pressure ratio to reach. Grades the scene when set with `id`. */
  target?: number;
  /** Volume-fraction tolerance. */
  tolerance?: number;
  /** Smallest volume the piston allows, as a fraction of the start. */
  minVolume?: number;
  explanation?: string;
}

const B = AIR_BOX;
const make = () => createGas({ w: B.w, h: B.h, seed: 18, species: [{ count: B.count, mass: B.mass, radius: B.radius, T: B.T }] });

export default function SqueezeThePiston({ id, prompt, target, tolerance = 0.07, minVolume = 0.25, explanation }: SqueezeThePistonProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'squeeze-the-piston');
  const { start, gauge } = useGauge(make);
  const gas = useRef<Gas>(make());
  const running = useRef(true);
  const [w, setW] = useState<number>(B.w);
  const stage = useRef<StageApi | null>(null);
  const dotPath = useRef<SVGPathElement>(null);
  const tickPath = useRef<SVGPathElement>(null);
  const recent = useRef<number[][]>([]);
  const [, tick] = useTicker();

  useGasLoop(gas, {
    psPerSecond: 40, running,
    // denser gas, more collisions per nm travelled: shorter steps
    maxDt: (g) => (g.w < B.w * 0.3 ? 0.02 : 0.04),
    // the room holds the box at 20 °C
    each: (g, dt) => thermostat(g, B.T, 1 - Math.exp(-dt / 5)),
    frame: (g) => {
      const s = stage.current;
      if (!s) return;
      gauge.current.read(g);
      dotPath.current?.setAttribute('d', dots(g, s));
      tickPath.current?.setAttribute('d', ticks(g, s, recent.current));
    },
    tick,
  });

  const r = gauge.current.value;
  const frac = w / B.w;
  const truth = target ? boyleVolumeFraction(target) : 0;
  const hitNow = graded && Math.abs(frac - truth) <= tolerance;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <Ledger r={r} start={start} />
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { volume: frac })}
          miss={`The box is at ${pct(frac)} of its starting volume and the gauge reads ${r && start ? (r.p / start.p).toFixed(2) : '…'}× the start. ${frac > truth ? 'The molecules still have too much room.' : 'That is past the target.'}`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.6, 27.6]} y={[-1.4, 17.4]} height={380} equal
        label={`A box of air held at 20 degrees Celsius, squeezed to ${pct(frac)} of its volume. ${r ? `The pressure reads ${r.p.toFixed(0)} kilopascals.` : ''}`}>
        {(s) => { stage.current = s; return <>
          <BoxWalls s={s} w={w} h={B.h} />
          {/* the rod and the ghost of where the piston started */}
          <line x1={s.sx(w) + 5} x2={s.sx(B.w + 3)} y1={s.sy(B.h / 2)} y2={s.sy(B.h / 2)} stroke={C.ink} strokeWidth={4} />
          {w < B.w - 0.05 && <line x1={s.sx(B.w)} x2={s.sx(B.w)} y1={s.sy(0)} y2={s.sy(B.h)} stroke={C.ghost} strokeDasharray="4 5" />}
          <path ref={dotPath} fill={C.soft} />
          <path ref={tickPath} stroke={C.force} strokeWidth={2} />
          <text x={s.sx(w / 2)} y={s.sy(-0.9)} textAnchor="middle" fontSize={13} fill={C.soft}>volume {pct(frac)} of the start</text>
          <Handle s={s} at={[w, B.h / 2]} color={C.ink} step={B.w / 100} label="Piston position, as a fraction of the starting volume"
            onChange={(p) => {
              const nw = Math.min(B.w, Math.max(B.w * minVolume, p[0]));
              setPiston(gas.current, nw); setW(nw); task.touch();
            }} />
          <text x={s.sx(0)} y={s.sy(B.h) - 8} fontSize={12} fill={C.faint}>300 molecules of air, held at 20 °C · played about 25 billion times slower</text>
        </>; }}
      </Stage>
    </SceneCard>
  );
}
