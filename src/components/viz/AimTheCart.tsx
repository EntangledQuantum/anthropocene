import { useRef, useState } from 'react';
import { approaching, collide1D } from '../../lib/physics/momentum.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { H, START, V_SCALE, px, stackTop, useCartRun } from './cart-track.tsx';

/**
 * Two carts on a track, A already moving. One control: drag the tip of B's
 * velocity arrow to choose how B comes in. Run it and watch the ledger: the
 * momentum arrows rearrange through the flash but keep reaching the same
 * white total, while the energy bar drains into the bumper and beyond.
 *
 * With `id`, the scene grades itself: after the run, the carts must end up
 * moving at `targetV` (a stuck pair at rest, by default). The answer matches
 * momenta, not speeds. Physics: `collide1D` and the bumper contact model in
 * momentum.ts, via cart-track.tsx.
 */
export interface AimTheCartProps {
  id?: string;
  prompt?: string;
  mA?: number;
  vA?: number;
  mB?: number;
  /** B's starting velocity, m/s. */
  vB?: number;
  /** Coefficient of restitution of the bumper: 0 velcro, 1 perfectly springy. */
  e?: number;
  /** Largest speed you can give B, m/s. */
  vMax?: number;
  /** Graded: both carts must end at this velocity. */
  targetV?: number;
  tolerance?: number;
  explanation?: string;
}

export default function AimTheCart({
  id, prompt, mA = 1, vA = 4, mB = 3, vB: vB0 = 0, e = 0, vMax = 6, targetV = 0, tolerance = 0.1, explanation,
}: AimTheCartProps) {
  const task = useTask(id, 'aim-the-cart');
  const [vB, setVB] = useState(vB0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const setup = { mA, vA, mB, vB, e };
  const cart = useCartRun(canvas, setup, 'vB');

  const tip = (W: number) => {
    const sx = px(W), m2px = sx(1) - sx(0);
    return { x: sx(START.b) + vB * V_SCALE * m2px, y: stackTop(mB) - 12, x0: sx(START.b), m2px };
  };
  const setFromX = (clientX: number) => {
    const el = canvas.current!;
    const g = tip(el.clientWidth);
    const v = (clientX - el.getBoundingClientRect().left - g.x0) / (V_SCALE * g.m2px);
    setVB(Math.round(Math.max(-vMax, Math.min(vMax, v)) * 10) / 10);
    task.touch();
  };

  const o = collide1D(mA, vA, mB, vB, e);
  const meet = approaching(vA, vB);
  const P = mA * vA + mB * vB;
  const hit = meet && Math.abs(o.v1 - targetV) <= tolerance && Math.abs(o.v2 - targetV) <= tolerance;
  const side = (v: number) => (v > 0 ? 'right' : 'left');
  const miss = !cart.ranThis
    ? 'Run it first: this aim has not been tried yet.'
    : !meet
      ? `B is running away from A, ${Math.abs(vB - vA).toFixed(1)} m/s faster, so they never touch.`
      : e === 0
        ? `The stuck pair ${Math.abs(o.v1) < 0.05 ? 'stops' : `drifts ${side(o.v1)} at ${Math.abs(o.v1).toFixed(2)} m/s`}: the total momentum is ${P.toFixed(1)} kg·m/s.`
        : `A ends at ${o.v1.toFixed(2)} m/s and B at ${o.v2.toFixed(2)} m/s; the total momentum is ${P.toFixed(1)} kg·m/s.`;

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
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(cart.ranThis && hit, { vB })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: H, display: 'block', touchAction: 'none', cursor: 'default' }}
        aria-label={`Cart A, ${mA} kilograms at ${vA} metres per second, and cart B, ${mB} kilograms at ${vB} metres per second. Drag B's velocity arrow, or use the arrow keys.`}
        onPointerDown={(ev) => {
          if (cart.shown.running) return;
          const el = canvas.current!, r = el.getBoundingClientRect(), g = tip(el.clientWidth);
          const dx = ev.clientX - r.left - g.x, dy = ev.clientY - r.top - g.y;
          const reach = vMax * V_SCALE * g.m2px + 20;
          if (dx * dx + dy * dy < 28 * 28 || (Math.abs(dy) < 16 && Math.abs(ev.clientX - r.left - g.x0) < reach)) {
            drag.current = true; el.setPointerCapture(ev.pointerId); setFromX(ev.clientX);
          }
        }}
        onPointerMove={(ev) => { if (drag.current) setFromX(ev.clientX); }}
        onPointerUp={() => { drag.current = false; }}
        onKeyDown={(ev) => {
          if (cart.shown.running) return;
          const d = ev.key === 'ArrowRight' ? 0.1 : ev.key === 'ArrowLeft' ? -0.1 : 0;
          if (!d) return;
          ev.preventDefault();
          setVB((v) => Math.round(Math.max(-vMax, Math.min(vMax, v + d)) * 10) / 10);
          task.touch();
        }} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {e === 0 ? 'Velcro bumper: the carts stick' : e === 1 ? 'Springy bumper: nothing lost' : `Bumper returns ${Math.round(e * e * 100)}% of what it stores`} ·
        {' '}each brick 0.5 kg · played at half speed · white mark: total momentum before
      </p>
    </SceneCard>
  );
}

