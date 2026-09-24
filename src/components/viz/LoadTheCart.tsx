import { useRef, useState } from 'react';
import { collide1D } from '../../lib/physics/momentum.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { H, RAIL, START, px, stackTop, useCartRun } from './cart-track.tsx';

/**
 * Cart A rolls into cart B, which waits at rest. One control: stack bricks
 * on B (drag the top of its stack, or use the arrow keys). Run it and see
 * what the load does to the rebound.
 *
 * A light target lets A follow through; a heavy one throws A back; only an
 * equal load stops A dead and hands its whole motion to B. The ledger shows
 * why: with a springy bumper both momentum and energy must balance, and two
 * laws leave no freedom. Physics: `collide1D` and the bumper contact model
 * in momentum.ts, via cart-track.tsx.
 *
 * With `id`, the scene grades itself: A must end at rest (within tolerance).
 */
export interface LoadTheCartProps {
  id?: string;
  prompt?: string;
  mA?: number;
  vA?: number;
  /** B's starting load, kg (a multiple of 0.5). */
  mB?: number;
  maxLoad?: number;
  e?: number;
  tolerance?: number;
  explanation?: string;
}

const BRICK = 0.5;

export default function LoadTheCart({
  id, prompt, mA = 2, vA = 3, mB: mB0 = 6, maxLoad = 8, e = 1, tolerance = 0.05, explanation,
}: LoadTheCartProps) {
  const task = useTask(id, 'load-the-cart');
  const [mB, setMB] = useState(mB0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const cart = useCartRun(canvas, { mA, vA, mB, vB: 0, e }, 'mB');

  const setFromY = (clientY: number) => {
    const el = canvas.current!;
    const n = Math.round((RAIL - 16 - (clientY - el.getBoundingClientRect().top)) / 9);
    setMB(Math.max(BRICK, Math.min(maxLoad, n * BRICK)));
    task.touch();
  };

  const o = collide1D(mA, vA, mB, 0, e);
  const hit = Math.abs(o.v1) <= tolerance;
  const ratio = mB / mA;
  const miss = !cart.ranThis
    ? 'Run it first: this load has not been tried yet.'
    : `A ${o.v1 > 0 ? 'follows through' : 'bounces back'} at ${Math.abs(o.v1).toFixed(2)} m/s. B is ${mB} kg, ${ratio < 1 ? `${(1 / ratio).toFixed(1)}× lighter than` : `${ratio.toFixed(1)}× as heavy as`} A.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => { cart.run(); task.touch(); }} disabled={cart.shown.running}>
            {cart.shown.running ? 'Running…' : 'Run'}
          </button>
          <button type="button" className="anth-btn" onClick={cart.reset}>Back to the start</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Total momentum" value={cart.shown.P.toFixed(2)} unit="kg·m/s" color={C.velocity} />
            <Meter label="Kinetic energy" value={cart.shown.KE.toFixed(2)} unit="J" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(cart.ranThis && hit, { mB })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: H, display: 'block', touchAction: 'none' }}
        aria-label={`Cart A, ${mA} kilograms at ${vA} metres per second, rolls toward cart B, loaded to ${mB} kilograms. Drag the top of B's stack, or use the up and down arrow keys.`}
        onPointerDown={(ev) => {
          if (cart.shown.running) return;
          if (!cart.atStart()) { cart.reset(); return; }
          const el = canvas.current!, r = el.getBoundingClientRect(), sx = px(el.clientWidth);
          const half = (sx(1) - sx(0)) * 0.6;
          if (Math.abs(ev.clientX - r.left - sx(START.b)) < half && ev.clientY - r.top < RAIL - 4 && ev.clientY - r.top > stackTop(maxLoad) - 30) {
            drag.current = true; el.setPointerCapture(ev.pointerId); setFromY(ev.clientY);
          }
        }}
        onPointerMove={(ev) => { if (drag.current) setFromY(ev.clientY); }}
        onPointerUp={() => { drag.current = false; }}
        onKeyDown={(ev) => {
          if (cart.shown.running) return;
          const d = ev.key === 'ArrowUp' ? BRICK : ev.key === 'ArrowDown' ? -BRICK : 0;
          if (!d) return;
          ev.preventDefault();
          setMB((m) => Math.max(BRICK, Math.min(maxLoad, m + d)));
          task.touch();
        }} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {e === 1 ? 'Springy bumper: nothing lost' : e === 0 ? 'Velcro bumper: the carts stick' : `Bumper returns ${Math.round(e * e * 100)}% of what it stores`} ·
        {' '}each brick 0.5 kg · played at half speed · white mark: total momentum before
      </p>
    </SceneCard>
  );
}
