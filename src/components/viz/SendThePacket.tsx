import { useRef, useState } from 'react';
import { HB2M_E, createPacket, flatBarrier, packetProbability, stepPacket, type Packet } from '../../lib/physics/quantum1d.ts';
import { C, Meter, SceneCard, Stage, type StageApi } from './scene.tsx';
import { EnergyLine, useFrame } from './quantum-kit.tsx';

/**
 * An electron wave packet with 1 eV of energy, thrown at a wall 2 eV tall and
 * `width` nm thick. The shaded hump is |ψ|², where the electron would be found.
 * It is stepped by Crank–Nicolson (`stepPacket`), which keeps the total at
 * exactly one, and the two meters integrate |ψ|² on each side of the wall.
 * Most of the packet bounces; a ghost comes out the far side at the same
 * speed. Ungraded: the payoff of the chapter's opening bet.
 */
export interface SendThePacketProps {
  prompt?: string;
  /** Barrier thickness, nm. */
  width?: number;
}

const V0 = 2, E = 1, SIGMA = 1.5, X0 = -7, T_END = 26, DT = 0.02, STEPS_PER_S = 260;
const VIEW: [number, number] = [-13, 13];
const HUMP = 4; // picture height per unit of |ψ|² (nm⁻¹)

export default function SendThePacket({ prompt, width = 0.3 }: SendThePacketProps) {
  const make = () => createPacket({ from: -30, to: 30, n: 3001, x0: X0, k0: Math.sqrt(E / HB2M_E), sigma: SIGMA, U: flatBarrier(V0, width) });
  const packet = useRef<Packet>(make());
  const running = useRef(false);
  const acc = useRef(0);
  const api = useRef<StageApi | null>(null);
  const hump = useRef<SVGPolygonElement | null>(null);
  const lastShown = useRef(0);
  const [shown, setShown] = useState({ back: 1, through: 0, t: 0, done: false, running: false });

  const read = (p: Packet, isRunning: boolean) => setShown({
    back: packetProbability(p, -Infinity, 0),
    through: packetProbability(p, width, Infinity),
    t: p.t,
    done: p.t >= T_END - 1e-9,
    running: isRunning,
  });

  useFrame((dt) => {
    const p = packet.current, s = api.current;
    if (running.current) {
      acc.current += dt * STEPS_PER_S;
      const n = Math.floor(acc.current);
      acc.current -= n;
      if (n > 0) stepPacket(p, DT, n);
      if (p.t >= T_END) { running.current = false; read(p, false); }
    }
    if (s && hump.current) {
      let d = `${s.sx(VIEW[0]).toFixed(1)},${s.sy(0).toFixed(1)} `;
      for (let j = 0; j < p.xs.length; j += 3) {
        const x = p.xs[j];
        if (x < VIEW[0] || x > VIEW[1]) continue;
        d += `${s.sx(x).toFixed(1)},${s.sy((p.re[j] ** 2 + p.im[j] ** 2) * HUMP).toFixed(1)} `;
      }
      d += `${s.sx(VIEW[1]).toFixed(1)},${s.sy(0).toFixed(1)}`;
      hump.current.setAttribute('points', d);
    }
    const now = performance.now();
    if (running.current && now - lastShown.current > 120) { lastShown.current = now; read(p, true); }
  });

  const send = () => { packet.current = make(); acc.current = 0; running.current = true; read(packet.current, true); };
  const reset = () => { packet.current = make(); running.current = false; read(packet.current, false); };

  const pctOf = (v: number) => `${(v * 100).toFixed(1)}`;
  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" onClick={send} disabled={shown.running}>{shown.running ? 'Flying…' : 'Send it'}</button>
        <button type="button" className="anth-btn" onClick={reset}>Start over</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
          <Meter label="Before the wall" value={pctOf(shown.back)} unit="%" color={C.position} />
          <Meter label="Beyond the wall" value={pctOf(shown.through)} unit="%" color={C.position} />
          <Meter label="Time" value={shown.t.toFixed(1)} unit="fs" color={C.soft} />
        </span>
      </div>}>
      <Stage x={VIEW} y={[-0.35, 2.6]} height={300}
        label={`An electron wave packet and a wall ${width} nanometres thick. ${pctOf(shown.through)} percent is beyond the wall.`}>
        {(s) => {
          api.current = s;
          return <>
            <line x1={s.sx(VIEW[0])} x2={s.sx(VIEW[1])} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={1.5} />
            <polygon ref={(el) => { hump.current = el; }} fill={C.position} fillOpacity={0.3} stroke={C.position} strokeWidth={2} />
            <rect x={s.sx(0)} y={s.sy(V0)} width={Math.max(3, s.sx(width) - s.sx(0))} height={s.sy(0) - s.sy(V0)}
              fill="var(--color-surface)" fillOpacity={0.35} stroke={C.soft} strokeWidth={2} />
            <text x={s.sx(width) + 8} y={s.sy(V0) + 14} fontSize={13} fill={C.soft}>wall: {V0} eV tall, {width} nm thick</text>
            <EnergyLine s={s} E={E} from={-3.2} to={3.5} />
            <text x={s.sx(3.7)} y={s.sy(E) + 5} fontSize={13} fontWeight={600} fill={C.energy}>electron: {E} eV</text>
            {shown.done && <text x={s.sx(8.4)} y={s.sy(0.5)} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.position}>
              the ghost: {pctOf(shown.through)}%
            </text>}
            <line x1={s.sx(-12)} x2={s.sx(-7)} y1={s.sy(-0.22)} y2={s.sy(-0.22)} stroke={C.faint} strokeWidth={1.2} />
            <text x={s.sx(-9.5)} y={s.sy(-0.22) - 5} textAnchor="middle" fontSize={12} fill={C.faint}>5 nm</text>
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Shaded: where the electron would be found, |ψ|² · dashed: its energy, below the top of the wall
      </p>
    </SceneCard>
  );
}
