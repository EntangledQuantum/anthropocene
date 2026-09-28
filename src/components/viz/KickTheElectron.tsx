import { useState } from 'react';
import { COMPTON, comptonEvent } from '../../lib/physics/photons.ts';
import { Arrow, C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * Compton's collision, as momentum arrows. An X-ray photon comes in from the
 * left carrying h/λ, strikes a free electron at rest, and leaves straight up
 * with h/λ'. Drag the electron's recoil momentum until momentum before equals
 * momentum after. Once it balances, the arrows laid tip to tail close, and
 * the energy bookkeeping appears: the electron's kinetic energy is exactly
 * what the photon lost.
 *
 * Units on the stage are 10⁻²⁴ kg·m/s. Physics: comptonEvent in photons.ts.
 */
export interface KickTheElectronProps {
  id?: string;
  prompt?: string;
  /** Incoming wavelength, pm. */
  lambdaPm?: number;
  /** Scattering angle, degrees. */
  thetaDeg?: number;
  /** Mismatch that counts as balanced, as a fraction of the incoming momentum. */
  tolerance?: number;
  explanation?: string;
}

const U = 1e-24;

function wiggle(s: StageApi, from: Vec, to: Vec, waves: number): string {
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ux = (to[0] - from[0]) / L, uy = (to[1] - from[1]) / L;
  let d = '';
  for (let k = 0; k <= 80; k++) {
    const t = k / 80, a = 0.45 * Math.sin(2 * Math.PI * waves * t);
    const x = from[0] + ux * L * t - uy * a, y = from[1] + uy * L * t + ux * a;
    d += `${k ? 'L' : 'M'}${s.sx(x).toFixed(1)},${s.sy(y).toFixed(1)}`;
  }
  return d;
}

export default function KickTheElectron({
  id, prompt, lambdaPm = COMPTON.lambda * 1e12, thetaDeg = 90, tolerance = 0.04, explanation,
}: KickTheElectronProps) {
  const task = useTask(id, 'kick-the-electron');
  const ev = comptonEvent(lambdaPm * 1e-12, (thetaDeg * Math.PI) / 180);
  const pIn: Vec = [ev.pIn[0] / U, 0];
  const pOut: Vec = [ev.pOut[0] / U, ev.pOut[1] / U];
  const [pe, setPe] = useState<Vec>([6, 0]);
  const after: Vec = [pOut[0] + pe[0], pOut[1] + pe[1]];
  const miss: Vec = [after[0] - pIn[0], after[1] - pIn[1]];
  const off = Math.hypot(miss[0], miss[1]);
  const ok = off <= tolerance * pIn[0];
  const dir = (v: Vec) => {
    const deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    return ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'][((Math.round(deg / 45) % 8) + 8) % 8];
  };
  const R = 16;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => task.check(ok, { pe })}
        miss={`Photon out plus electron add to ${Math.hypot(after[0], after[1]).toFixed(1)} × 10⁻²⁴ kg·m/s pointing ${dir(after)}; the photon brought ${pIn[0].toFixed(1)} pointing right. ${off.toFixed(1)} is missing, pointing ${dir([-miss[0], -miss[1]])}.`}
        hit={explanation?.replace('{ke}', (ev.electronKeV * 1000).toFixed(0)).replace('{lout}', (ev.lambdaOut * 1e12).toFixed(1))} />}>
      <Stage x={[-R, R]} y={[-R * 0.72, R * 0.72]} height={380} equal
        label={`Momentum diagram. Electron recoil ${Math.hypot(pe[0], pe[1]).toFixed(1)} units; mismatch ${off.toFixed(1)}.`}>
        {(s) => <>
          <path d={wiggle(s, [-pIn[0] - 1.5, 0], [-1.2, 0], 7)} fill="none" stroke={C.field} strokeWidth={1.2} opacity={0.5} />
          <path d={wiggle(s, [0, 1.2], [pOut[0], pOut[1] + 1.5], 7 * (ev.lambdaOut / (lambdaPm * 1e-12)) ** -1)} fill="none" stroke={C.field} strokeWidth={1.2} opacity={0.5} />
          <Arrow s={s} from={[-pIn[0], -1.4]} to={[0, -1.4]} color={C.field} label={`X-ray in, ${lambdaPm.toFixed(1)} pm`} labelSide={-1} />
          <Arrow s={s} from={[1.4, 0]} to={[pOut[0] + 1.4, pOut[1]]} color={C.field} label={`X-ray out, ${(ev.lambdaOut * 1e12).toFixed(1)} pm`} labelSide={-1} />
          <circle cx={s.sx(0)} cy={s.sy(0)} r={7} fill={C.surface} stroke={C.velocity} strokeWidth={2} />
          <text x={s.sx(0) - 12} y={s.sy(0) + 22} textAnchor="end" fontSize={13} fill={C.soft}>electron</text>
          <Arrow s={s} from={[0, 0]} to={pe} color={C.velocity} width={3.5} label="electron" />
          {task.done && (() => {
            // tip to tail: photon out, then electron, closes onto photon in
            const o: Vec = [R * 0.52, R * 0.12];
            const sc = 0.45;
            const a: Vec = [o[0] + pOut[0] * sc, o[1] + pOut[1] * sc];
            const b: Vec = [a[0] + pe[0] * sc, a[1] + pe[1] * sc];
            return <g>
              <Arrow s={s} from={o} to={[o[0] + pIn[0] * sc, o[1]]} color={C.field} width={2} dash="5 4" />
              <Arrow s={s} from={o} to={a} color={C.field} width={2} />
              <Arrow s={s} from={a} to={b} color={C.velocity} width={2} />
            </g>;
          })()}
          <Handle s={s} at={pe} color={C.velocity} step={0.2} label="Electron's momentum: drag its tip"
            clamp={(p) => { const m = Math.hypot(p[0], p[1]); return m > R * 0.95 ? [p[0] / m * R * 0.95, p[1] / m * R * 0.95] : p; }}
            onChange={(p) => { setPe(p); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        arrows are momenta in 10⁻²⁴ kg·m/s · orchid: the X-ray photon, h/λ · cyan: the electron
      </p>
    </SceneCard>
  );
}
