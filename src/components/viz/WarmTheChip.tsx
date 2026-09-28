import { useEffect, useRef, useState } from 'react';
import {
  SILICON, copperConductanceRatio, intrinsicDensity, siliconConductanceRatio,
} from '../../lib/physics/solids.ts';
import { METALS } from '../../lib/physics/current.ts';
import { C, Handle, Meter, SceneCard, type StageApi } from './scene.tsx';

/**
 * A copper wire and a pure silicon chip on the same battery, and one
 * thermometer for both. Warm them. Copper's electrons are all there already;
 * the hotter lattice only shakes harder and gets in their way, so its
 * current sags. Silicon starts with almost no free electrons, and every few
 * tens of kelvin of warming frees ten times as many across its band gap, so
 * its current soars. The pictograms on the right are the two band pictures:
 * a half-full band, and a full band under an empty one.
 *
 * Ungraded. Physics: intrinsicDensity / siliconConductanceRatio /
 * copperConductanceRatio in src/lib/physics/solids.ts.
 */
export interface WarmTheChipProps {
  prompt?: string;
}

const ROOM = 293.15;
const TMIN = 250, TMAX = 450;
const TY0 = 250, TY1 = 40; // thermometer, screen y at TMIN and TMAX
const yOfT = (T: number) => TY0 - ((T - TMIN) / (TMAX - TMIN)) * (TY0 - TY1);
const tOfY = (y: number) => TMIN + ((TY0 - y) / (TY0 - TY1)) * (TMAX - TMIN);
const api: StageApi = { sx: (x) => x, sy: (y) => 300 - y, len: (d) => d, W: 640, H: 300, x: [0, 640], y: [0, 300] };
const CAP = 200;
const BAR = { x0: 110, x1: 450 };
const CU = { y0: 44, y1: 110 }, SI = { y0: 164, y1: 230 };
const N_CU = 110;

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
const rand = rng(42);
const cuE = Array.from({ length: N_CU }, () => [BAR.x0 + rand() * (BAR.x1 - BAR.x0), CU.y0 + 6 + rand() * (CU.y1 - CU.y0 - 12)]);
const siE = Array.from({ length: CAP }, () => [BAR.x0 + rand() * (BAR.x1 - BAR.x0), SI.y0 + 6 + rand() * (SI.y1 - SI.y0 - 12)]);
const siH = Array.from({ length: CAP }, () => [BAR.x0 + rand() * (BAR.x1 - BAR.x0), SI.y0 + 6 + rand() * (SI.y1 - SI.y0 - 12)]);
const ions = (y0: number) => Array.from({ length: 17 * 3 }, (_, i) => [BAR.x0 + 12 + (i % 17) * 19.5, y0 + 13 + Math.floor(i / 17) * 20, rand() * 6.28, 8 + rand() * 5]);
const cuIons = ions(CU.y0), siIons = ions(SI.y0);
const nRoom = intrinsicDensity(ROOM);
const perDot = nRoom; // free electrons per cm³ one dot stands for
const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sci = (v: number) => {
  const e = Math.floor(Math.log10(v));
  return `${Math.round(v / 10 ** e)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
};

export default function WarmTheChip({ prompt }: WarmTheChipProps) {
  const [T, setT] = useState(ROOM);
  const Tref = useRef(T);
  const g = useRef<SVGGElement>(null);

  const nDots = (t: number) => Math.round(intrinsicDensity(t) / perDot);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = Tref.current;
      const root = g.current;
      if (root) {
        const vCu = 38 * copperConductanceRatio(t);
        const vSi = 38 * (t / ROOM) ** -1.5;
        const jig = 1.5 * Math.sqrt(t / ROOM);
        const shown = Math.min(CAP, nDots(t));
        const cu = root.querySelectorAll<SVGCircleElement>('.cu-e');
        cuE.forEach((p, i) => {
          p[0] += vCu * dt + (Math.random() - 0.5) * 3;
          if (p[0] > BAR.x1) p[0] -= BAR.x1 - BAR.x0;
          cu[i].setAttribute('cx', p[0].toFixed(1));
        });
        const se = root.querySelectorAll<SVGCircleElement>('.si-e'), sh = root.querySelectorAll<SVGCircleElement>('.si-h');
        for (let i = 0; i < CAP; i++) {
          const on = i < shown;
          se[i].setAttribute('visibility', on ? 'visible' : 'hidden');
          sh[i].setAttribute('visibility', on ? 'visible' : 'hidden');
          if (!on) continue;
          siE[i][0] += vSi * dt; if (siE[i][0] > BAR.x1) siE[i][0] -= BAR.x1 - BAR.x0;
          siH[i][0] -= (SILICON.muP300 / SILICON.muN300) * vSi * dt; if (siH[i][0] < BAR.x0) siH[i][0] += BAR.x1 - BAR.x0;
          se[i].setAttribute('cx', siE[i][0].toFixed(1));
          sh[i].setAttribute('cx', siH[i][0].toFixed(1));
        }
        const io = root.querySelectorAll<SVGCircleElement>('.ion');
        [...cuIons, ...siIons].forEach((q, i) => {
          io[i].setAttribute('cx', (q[0] + jig * Math.sin(now / 1000 * q[3] + q[2])).toFixed(1));
          io[i].setAttribute('cy', (q[1] + jig * Math.cos(now / 1000 * q[3] * 1.3 + q[2])).toFixed(1));
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const set = (y: number) => {
    const t = Math.min(TMAX, Math.max(TMIN, tOfY(y)));
    Tref.current = t; setT(t);
  };
  const shownNow = nDots(T);
  const bandDots = Math.min(10, shownNow);
  const cuRatio = (METALS.copper.n! / 1e6) / perDot;

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Meter label="Temperature" value={(T - 273.15).toFixed(0)} unit="°C" color={C.force} />
        <Meter label="Copper current" value={`×${copperConductanceRatio(T).toFixed(2)}`} color={C.velocity} />
        <Meter label="Silicon current" value={`×${siliconConductanceRatio(T) < 10 ? siliconConductanceRatio(T).toFixed(2) : siliconConductanceRatio(T).toFixed(0)}`} color={C.velocity} />
        <span className="hud-label" style={{ alignSelf: 'end' }}>currents compared with 20 °C</span>
      </div>}>
      <svg viewBox="0 0 640 300" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Copper wire and silicon chip at ${(T - 273.15).toFixed(0)} degrees Celsius. Copper current ${copperConductanceRatio(T).toFixed(2)} times its room value; silicon ${siliconConductanceRatio(T).toFixed(1)} times.`}>
        {/* thermometer */}
        <rect x={32} y={TY1 - 8} width={16} height={TY0 - TY1 + 20} rx={8} fill={C.surface} stroke={C.soft} strokeWidth={2} />
        <circle cx={40} cy={TY0 + 22} r={13} fill={C.force} stroke={C.soft} strokeWidth={2} />
        <rect x={36} y={yOfT(T)} width={8} height={TY0 + 12 - yOfT(T)} fill={C.force} />
        {[-20, 0, 50, 100, 150].map((c) => <g key={c}>
          <line x1={50} x2={58} y1={yOfT(c + 273.15)} y2={yOfT(c + 273.15)} stroke={C.faint} />
          <text x={62} y={yOfT(c + 273.15) + 4} fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{c}°</text>
        </g>)}
        <Handle s={api} at={[40, 300 - yOfT(T)]} step={5} r={9} color={C.force} label="Thermometer: drag up to warm both"
          clamp={(p) => [40, p[1]]} onChange={(p) => set(300 - p[1])} />

        <g ref={g}>
          {[CU, SI].map((b, k) => <rect key={k} x={BAR.x0} y={b.y0} width={BAR.x1 - BAR.x0} height={b.y1 - b.y0} rx={6} fill={k === 0 ? C.velocity : "none"} fillOpacity={k === 0 ? 0.28 : 0} stroke={C.rule} strokeWidth={2} />)}
          {[...cuIons, ...siIons].map((q, i) => <circle key={i} className="ion" cx={q[0]} cy={q[1]} r={4.5} fill="none" stroke={C.ghost} strokeWidth={1.5} />)}
          {cuE.map((p, i) => <circle key={i} className="cu-e" cx={p[0]} cy={p[1]} r={2.6} fill={C.velocity} />)}
          {siH.map((p, i) => <circle key={i} className="si-h" cx={p[0]} cy={p[1]} r={2.4} fill="none" stroke={C.accel} strokeWidth={1.2} visibility="hidden" />)}
          {siE.map((p, i) => <circle key={i} className="si-e" cx={p[0]} cy={p[1]} r={2.1} fill={C.velocity} visibility="hidden" />)}
        </g>
        <text x={BAR.x0} y={CU.y0 - 8} fontSize={14} fill={C.ink}>copper wire</text>
        <text x={BAR.x1} y={CU.y0 - 8} textAnchor="end" fontSize={13} fill={C.soft}>a sea: one free electron per atom</text>
        <text x={BAR.x0} y={SI.y0 - 8} fontSize={14} fill={C.ink}>pure silicon chip</text>
        <text x={BAR.x1} y={SI.y0 - 8} textAnchor="end" fontSize={13} fill={C.soft} fontFamily="var(--font-mono)">
          {shownNow > CAP ? `${shownNow} dots (${CAP} drawn)` : `${shownNow} dot${shownNow === 1 ? '' : 's'}`}
        </text>
        <text x={BAR.x0} y={SI.y1 + 20} fontSize={12} fill={C.faint}>
          each chip dot: {(perDot / 1e9).toFixed(0)} billion per cm³ · copper has {sci(cuRatio)} times as many, always
        </text>

        {/* band pictograms */}
        <text x={550} y={CU.y0 - 8} textAnchor="middle" fontSize={12} fill={C.faint}>its band</text>
        <rect x={500} y={CU.y0} width={100} height={60} fill="none" stroke={C.soft} strokeWidth={1.5} />
        <rect x={500} y={CU.y0 + 30} width={100} height={30} fill={C.velocity} opacity={0.35} />
        <text x={550} y={CU.y1 + 12} textAnchor="middle" fontSize={11} fill={C.faint}>half full</text>

        <text x={550} y={SI.y0 - 8} textAnchor="middle" fontSize={12} fill={C.faint}>its bands</text>
        <rect x={500} y={SI.y0} width={100} height={22} fill="none" stroke={C.soft} strokeWidth={1.5} />
        <rect x={500} y={SI.y1 - 22} width={100} height={22} fill={C.velocity} opacity={0.35} stroke={C.soft} strokeWidth={1.5} />
        <text x={550} y={(SI.y0 + SI.y1) / 2 + 4} textAnchor="middle" fontSize={11} fill={C.faint}>gap 1.12 eV</text>
        {Array.from({ length: bandDots }, (_, i) => <g key={i}>
          <circle cx={508 + i * 9.5} cy={SI.y0 + 11} r={2.8} fill={C.velocity} />
          <circle cx={508 + i * 9.5} cy={SI.y1 - 11} r={3} fill={C.surface} stroke={C.accel} strokeWidth={1.4} />
        </g>)}
      </svg>
      <p className="hud-label" style={{ margin: '4px 0 0' }}>
        Cyan dots: free electrons · magenta rings: the gaps they leave in silicon · grey rings: the atoms, shaking harder as it warms
      </p>
    </SceneCard>
  );
}
