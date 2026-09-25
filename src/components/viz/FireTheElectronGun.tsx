import { useEffect, useMemo, useRef, useState } from 'react';
import {
  E_CHARGE, M_ELECTRON, M_PROTON, inGap, kineticGain, speedAfter, toEV, transitTime,
} from '../../lib/physics/potential-ch23.ts';
import { sci } from '../../lib/physics/charges-ch21.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { NEG, POS } from './charge-kit-ch21.tsx';

/**
 * Two metal plates 1 cm apart in a vacuum tube, and one control: the voltage
 * between them, dragged along the track underneath. A particle leaves one
 * plate at rest, falls through the voltage, shoots out through a hole in the
 * other plate, and repeats.
 *
 * The equally spaced lines between the plates are equipotentials every 50 V:
 * a uniform field. Under each tube an aqua bar fills with the particle's
 * kinetic energy in eV on the same scale as the voltage track, so a particle
 * that falls through 284 V ends with a bar exactly as long as the 284 V mark.
 *
 * With two lanes (electron and proton) both fall through the same voltage in
 * the same slowed clock: the electron is across in a blink, the proton crawls
 * for 43 times as long, and both bars end at the same length.
 *
 * Graded (`id` + `target`): set the voltage so the electron arrives at the
 * target speed. Motion: `inGap`; numbers: `speedAfter`, `kineticGain`
 * (potential-ch23.ts, where a step-by-step integration pins them).
 */
export interface FireTheElectronGunProps {
  id?: string;
  prompt?: string;
  particles?: ('electron' | 'proton')[];
  /** Starting voltage, V. */
  voltage?: number;
  /** Largest voltage on the track, V. */
  vmax?: number;
  /** Gap between the plates, cm. */
  gap?: number;
  /** Graded: target arrival speed, m/s. */
  target?: number;
  /** Graded: fractional speed tolerance. */
  tolerance?: number;
  explanation?: string;
}

const P = {
  electron: { m: M_ELECTRON, q: -E_CHARGE, name: 'Electron', glyph: 'e⁻', color: NEG },
  proton: { m: M_PROTON, q: E_CHARGE, name: 'Proton', glyph: 'p⁺', color: POS },
} as const;

const LANE = 5.4;
const TRACK = 2.4;
const X0 = 2, X1 = 12, XT0 = 2, XT1 = 18;
const SHOW = 2.4; // display seconds for the slowest particle to cross at the starting voltage

export default function FireTheElectronGun({
  id, prompt, particles = ['electron'], voltage = 100, vmax = 500, gap = 1, target, tolerance = 0.02, explanation,
}: FireTheElectronGunProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'fire-the-electron-gun');
  const [V, setV] = useState(voltage);
  const vRef = useRef(voltage);
  const d = gap * 0.01;
  const lanes = particles.map((k) => P[k]);
  const heaviest = Math.max(...lanes.map((l) => l.m));
  const slow = useMemo(() => SHOW / transitTime(E_CHARGE, heaviest, voltage, d), [heaviest, voltage, d]);

  const dots = useRef<(SVGGElement | null)[]>([]);
  const bars = useRef<(SVGRectElement | null)[]>([]);
  const phase = useRef(0);
  const yTop = (i: number) => TRACK + LANE * (lanes.length - i);

  const kx = (ev: number) => XT0 + ((XT1 - XT0) * Math.min(ev, vmax)) / vmax;

  // One volley at a time: every lane fires together, and the next volley
  // leaves once the slowest particle is out of the tube. Refs only; React
  // re-renders when the voltage changes, never per frame.
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      phase.current += dt;
      const Vn = vRef.current;
      let allOut = true;
      lanes.forEach((l, i) => {
        const t = Math.max(0, phase.current) / slow;
        const g = inGap(E_CHARGE, l.m, Vn, d, t);
        let x: number, ev: number;
        if (!g.arrived) { x = X0 + ((X1 - X0) * g.x) / d; ev = (Vn * g.x) / d; }
        else {
          const after = t - transitTime(E_CHARGE, l.m, Vn, d);
          x = X1 + ((X1 - X0) * g.v * after) / d;
          ev = Vn;
        }
        const out = x > 19.6;
        if (!out) allOut = false;
        const el = dots.current[i];
        if (el) {
          el.setAttribute('transform', `translate(${api.current?.sx(x) ?? 0},${api.current?.sy(yTop(i) - 2.2) ?? 0})`);
          el.style.opacity = out ? '0' : '1';
        }
        const b = bars.current[i];
        if (b && api.current) b.setAttribute('width', `${Math.max(0, api.current.sx(kx(ev)) - api.current.sx(XT0))}`);
      });
      if (allOut) phase.current = -0.7;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slow, d, particles.join(',')]);

  const api = useRef<{ sx: (v: number) => number; sy: (v: number) => number } | null>(null);
  const setVolts = (x: number) => {
    const v = Math.max(1, Math.min(vmax, Math.round(((x - XT0) / (XT1 - XT0)) * vmax)));
    vRef.current = v;
    phase.current = 0;
    setV(v);
    task.touch();
  };

  const e = lanes[0];
  const vArr = speedAfter(e.q, e.m, e.q < 0 ? V : -V);
  const off = target ? vArr / target - 1 : 0;
  const nsShown = 1e-9 * slow;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        {lanes.map((l, i) => {
          const dV = l.q < 0 ? V : -V;
          return <div key={i} style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'end' }}>
            {lanes.length > 1 && <span className="hud-label" style={{ minWidth: 70, color: l.color }}>{l.name}</span>}
            <Meter label="Arrival speed" value={sci(speedAfter(l.q, l.m, dV), 'm/s')} color={C.velocity} />
            <Meter label="Kinetic energy" value={toEV(kineticGain(l.q, dV)).toFixed(0)} unit="eV" color={C.energy} />
            <Meter label="Time in the gap" value={(transitTime(E_CHARGE, l.m, V, d) * 1e9).toFixed(1)} unit="ns" color={C.soft} />
          </div>;
        })}
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(off) <= tolerance, { V })}
          miss={`At ${V} V the electron arrives at ${sci(vArr, 'm/s')}, ${Math.abs(off * 100).toFixed(0)}% ${off < 0 ? 'short of' : 'over'} ${sci(target!, 'm/s')}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[0, 20]} y={[0, TRACK + LANE * lanes.length]} height={130 + 150 * lanes.length}
        label={`Vacuum tube, plates ${gap} cm apart, ${V} volts between them.`}>
        {(s) => { api.current = s; return <>
          {lanes.map((l, i) => {
            const top = yTop(i), mid = top - 2.2;
            const hiLeft = l.q > 0;
            const lines = [];
            for (let k = 50; k < V; k += 50) {
              const f = k / V;
              lines.push(X0 + (X1 - X0) * (hiLeft ? 1 - f : f));
            }
            return <g key={i}>
              <defs>
                <linearGradient id={`gun-grad-${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="var(--color-rose)" stopOpacity={hiLeft ? 0.32 : 0.02} />
                  <stop offset="1" stopColor="var(--color-rose)" stopOpacity={hiLeft ? 0.02 : 0.32} />
                </linearGradient>
              </defs>
              <rect x={s.sx(X0)} y={s.sy(top - 0.6)} width={s.sx(X1) - s.sx(X0)} height={s.sy(top - 3.8) - s.sy(top - 0.6)} fill={`url(#gun-grad-${i})`} />
              {lines.map((x, j) => <line key={j} x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(top - 0.6)} y2={s.sy(top - 3.8)} stroke={C.faint} strokeWidth={1} strokeDasharray="3 4" />)}
              <line x1={s.sx(X1)} x2={s.sx(19.8)} y1={s.sy(mid)} y2={s.sy(mid)} stroke={C.grid} strokeDasharray="2 6" />
              <rect x={s.sx(X0) - 5} y={s.sy(top - 0.4)} width={10} height={s.sy(top - 4) - s.sy(top - 0.4)} rx={2} fill={C.soft} />
              <rect x={s.sx(X1) - 5} y={s.sy(top - 0.4)} width={10} height={s.sy(mid + 0.35) - s.sy(top - 0.4)} rx={2} fill={C.soft} />
              <rect x={s.sx(X1) - 5} y={s.sy(mid - 0.35)} width={10} height={s.sy(top - 4) - s.sy(mid - 0.35)} rx={2} fill={C.soft} />
              <text x={s.sx(X0)} y={s.sy(top - 0.4) - 8} textAnchor="middle" fontSize={13} fill={C.ink} fontFamily="var(--font-mono)">{hiLeft ? `+${V} V` : '0 V'}</text>
              <text x={s.sx(X1)} y={s.sy(top - 0.4) - 8} textAnchor="middle" fontSize={13} fill={C.ink} fontFamily="var(--font-mono)">{hiLeft ? '0 V' : `+${V} V`}</text>
              <text x={s.sx(X0 + 0.5)} y={s.sy(top - 0.4) - 8} fontSize={13} fill={l.color} dx={40}>{l.name.toLowerCase()} leaves at rest</text>
              <text x={s.sx(19.8)} y={s.sy(top - 0.4) - 8} textAnchor="end" fontSize={12} fill={C.faint}>{gap} cm gap · 1 ns shown as {nsShown < 0.1 ? nsShown.toFixed(3) : nsShown.toFixed(2)} s</text>
              {target && i === 0 && <text x={s.sx(19.8)} y={s.sy(mid) - 10} textAnchor="end" fontSize={13} fill={C.velocity}>target {sci(target, 'm/s')}</text>}
              <g ref={(el) => { dots.current[i] = el; }} style={{ opacity: 0 }}>
                <circle r={8} fill={C.surface} stroke={l.color} strokeWidth={2.5} />
                <line x1={-3.5} x2={3.5} stroke={l.color} strokeWidth={2} />
                {l.q > 0 && <line y1={-3.5} y2={3.5} stroke={l.color} strokeWidth={2} />}
              </g>
              <rect x={s.sx(XT0)} y={s.sy(top - 4.55)} width={s.sx(XT1) - s.sx(XT0)} height={s.sy(top - 5.05) - s.sy(top - 4.55)} fill="none" stroke={C.grid} />
              <rect ref={(el) => { bars.current[i] = el; }} x={s.sx(XT0)} y={s.sy(top - 4.55)} width={0} height={s.sy(top - 5.05) - s.sy(top - 4.55)} fill={C.energy} opacity={0.8} />
              <text x={s.sx(XT0) - 6} y={s.sy(top - 4.8) + 4} textAnchor="end" fontSize={12} fill={C.energy}>K</text>
            </g>;
          })}
          {/* the voltage track, on the same scale as the energy bars */}
          <line x1={s.sx(XT0)} x2={s.sx(XT1)} y1={s.sy(1.3)} y2={s.sy(1.3)} stroke={C.rule} strokeWidth={3} strokeLinecap="round" />
          {Array.from({ length: Math.floor(vmax / 100) + 1 }, (_, k) => k * 100).map((v) => <g key={v}>
            <line x1={s.sx(kx(v))} x2={s.sx(kx(v))} y1={s.sy(1.3) - 5} y2={s.sy(1.3) + 5} stroke={C.faint} />
            <text x={s.sx(kx(v))} y={s.sy(1.3) + 20} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
          </g>)}
          <text x={s.sx(XT1) + 8} y={s.sy(1.3) + 20} fontSize={12} fill={C.faint}>V · eV</text>
          <line x1={s.sx(kx(V))} x2={s.sx(kx(V))} y1={s.sy(1.3)} y2={s.sy(TRACK + 0.2)} stroke={C.ink} strokeDasharray="2 4" opacity={0.6} />
          <text x={s.sx(kx(V))} y={s.sy(1.3) - 16} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{V} V</text>
          <Handle s={s} at={[kx(V), 1.3]} step={((XT1 - XT0) / vmax) * 2} label="Voltage between the plates: drag along the track"
            onChange={(p) => setVolts(p[0])} />
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Dashed lines between the plates: equipotentials every 50 V · aqua bar: kinetic energy, eV, on the voltage scale
      </p>
    </SceneCard>
  );
}
