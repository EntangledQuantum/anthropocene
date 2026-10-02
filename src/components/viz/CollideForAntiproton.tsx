import { useEffect, useRef, useState } from 'react';
import {
  PARTICLES, PBAR_COLLIDER_K, PBAR_STATE, betaOf, burstMomentum, colliderEnergy, collisionOutcome, totals, type ParticleKey,
} from '../../lib/physics/particles.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * Two proton beams meet head on. One control: the kinetic energy of each beam.
 * Fire, and the collision makes whatever the counts and the energy allow:
 * `collisionOutcome` from particles.ts, which keeps charge +2 and baryon
 * number 2 in every event. An antiproton can only leave with a proton beside
 * it, so the least energy that makes one is a whole proton's worth per beam,
 * not half.
 *
 * Graded with `id`: fire at the least energy that makes an antiproton.
 */
export interface CollideForAntiprotonProps {
  id?: string;
  prompt?: string;
  /** Starting energy per beam, MeV. */
  start?: number;
  /** How far above the threshold still counts as "least", MeV. */
  tolerance?: number;
  explanation?: string;
}

const CX = 320, CY = 140, APPROACH = 0.6, PX_PER_C = 170, REACH = 128, KMAX = 2000;
const list = (keys: ParticleKey[]) => keys.map((k) => PARTICLES[k].symbol).join(' ');
const radius = (k: ParticleKey) => (PARTICLES[k].B !== 0 ? 13 : 9);
/** Angle slot for each product, so the heavy, slow baryons sit evenly round the ring rather than in a clump. */
function slots(out: ParticleKey[]): number[] {
  const n = out.length, heavy = out.map((k, i) => [k, i] as const).filter(([k]) => PARTICLES[k].B !== 0);
  const slot = new Array<number>(n).fill(-1), used = new Set<number>();
  heavy.forEach(([, i], j) => { const s = Math.round((j * n) / heavy.length) % n; slot[i] = s; used.add(s); });
  let free = 0;
  out.forEach((_, i) => { if (slot[i] < 0) { while (used.has(free)) free++; slot[i] = free; used.add(free); } });
  return slot;
}

export default function CollideForAntiproton({ id, prompt, start = 300, tolerance = 20, explanation }: CollideForAntiprotonProps) {
  const task = useTask(id, 'collide-for-antiproton');
  const [K, setK] = useState(start);
  const [shot, setShot] = useState<{ K: number; out: ParticleKey[]; n: number } | null>(null);
  const fired = useRef<{ t0: number; out: ParticleKey[]; sqrtS: number } | null>(null);
  const beams = useRef<(SVGGElement | null)[]>([]);
  const prods = useRef<(SVGGElement | null)[]>([]);

  const fire = () => {
    const out = collisionOutcome(K);
    fired.current = { t0: performance.now(), out, sqrtS: colliderEnergy(K) };
    setShot((s) => ({ K, out, n: (s?.n ?? 0) + 1 }));
    task.touch();
  };

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const ev = fired.current;
      const t = ev ? (now - ev.t0) / 1000 : 0;
      const approaching = !ev || t < APPROACH;
      beams.current.forEach((el, i) => {
        if (!el) return;
        const off = ev ? Math.max(0, 1 - t / APPROACH) * 270 : 270;
        el.setAttribute('transform', `translate(${CX + (i === 0 ? -1 : 1) * (off + 14)},${CY})`);
        el.setAttribute('opacity', approaching ? '1' : '0');
      });
      if (ev) {
        const p = burstMomentum(ev.out.map((k) => PARTICLES[k].mass), ev.sqrtS);
        const at = slots(ev.out);
        ev.out.forEach((k, i) => {
          const el = prods.current[i];
          if (!el) return;
          const ang = -Math.PI / 2 + (at[i] * 2 * Math.PI) / ev.out.length + 0.3;
          const r = approaching ? 0 : Math.min(REACH, 34 + PX_PER_C * betaOf(p, PARTICLES[k].mass) * (t - APPROACH));
          el.setAttribute('transform', `translate(${(CX + Math.cos(ang) * r).toFixed(1)},${(CY + Math.sin(ang) * r * 0.82).toFixed(1)})`);
          el.setAttribute('opacity', approaching ? '0' : '1');
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const out = shot?.out ?? [];
  const hasPbar = out.includes('pbar');
  const over = shot ? shot.K - PBAR_COLLIDER_K : 0;
  const hitNow = Boolean(shot && hasPbar && over <= tolerance);
  const pions = out.filter((k) => PARTICLES[k].B === 0).length;
  const t = totals(out);

  const miss = !shot
    ? 'Nothing has collided yet. Fire first: the check reads the last collision.'
    : !hasPbar && shot.K > 0.95 * PBAR_COLLIDER_K
      ? `${(colliderEnergy(shot.K) / 1000).toFixed(3)} GeV went in: ${(PBAR_STATE.mass - colliderEnergy(shot.K)).toFixed(1)} MeV short of three protons and an antiproton.`
    : !hasPbar
      ? `${(colliderEnergy(shot.K) / 1000).toFixed(2)} GeV went in; out came two protons${pions ? ` and ${pions} pion${pions > 1 ? 's' : ''}` : ''}, no p̄. A lone p̄ beside the two protons would leave charge +1 and baryon number 1.`
      : `Out came a p̄, but each beam carried ${over.toFixed(0)} MeV more than it needed.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '2 1 260px' }}>
            <span className="hud-label">Energy per beam: {K} MeV</span>
            <input type="range" className="anth-slider" min={0} max={KMAX} step={1} value={K}
              aria-label="Kinetic energy of each proton beam, MeV"
              onChange={(e) => { setK(+e.target.value); task.touch(); }} />
          </label>
          <button type="button" className="anth-btn" onClick={fire} style={{ padding: '10px 22px', fontSize: 15 }}>Fire</button>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Collision energy" value={(colliderEnergy(K) / 1000).toFixed(2)} unit="GeV" color={C.energy} />
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
            <span className="hud-label">Out came</span>
            <span style={{ fontSize: 20, color: C.ink, fontFamily: 'var(--font-sans)' }}>{shot ? list(out) : '—'}</span>
          </div>
          <Meter label="Charge, baryon number" value={shot ? `+${t.Q}, ${t.B}` : '+2, 2'} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { K: shot?.K })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 280" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={shot ? `Collision at ${shot.K} MeV per beam produced ${out.map((k) => PARTICLES[k].name).join(', ')}.` : 'Two proton beams, not yet fired.'}>
        <line x1={20} x2={620} y1={CY} y2={CY} stroke={C.grid} strokeDasharray="4 6" />
        <circle cx={CX} cy={CY} r={REACH + 14} fill="none" stroke={C.grid} />
        <text x={CX + REACH + 20} y={CY - REACH + 4} fontSize={13} fill={C.faint}>detector</text>
        <text x={34} y={CY - 18} fontSize={13} fill={C.faint}>beam</text>
        <text x={606} y={CY - 18} textAnchor="end" fontSize={13} fill={C.faint}>beam</text>
        {[0, 1].map((i) => (
          <g key={i} ref={(el) => { beams.current[i] = el; }}>
            <circle r={13} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <text y={5} textAnchor="middle" fontSize={14} fill={C.ink}>p</text>
          </g>
        ))}
        {out.map((k, i) => (
          <g key={`${shot!.n}-${i}`} ref={(el) => { prods.current[i] = el; }} opacity={0}>
            <circle r={radius(k)} fill={PARTICLES[k].anti ? 'none' : C.surface} stroke={k === 'pbar' ? C.ink : C.soft}
              strokeWidth={k === 'pbar' ? 2.5 : 1.8} strokeDasharray={PARTICLES[k].anti && PARTICLES[k].B !== 0 ? '4 3' : undefined} />
            <text x={radius(k) + 4} y={5} fontSize={15} fontWeight={k === 'pbar' ? 700 : 400} fill={C.ink}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{PARTICLES[k].symbol}</text>
          </g>
        ))}
        {shot && <text x={CX} y={270} textAnchor="middle" fontSize={14} fill={hasPbar ? C.ok : C.faint}>
          {hasPbar ? 'an antiproton' : 'no antiproton'}
        </text>}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        dashed ring: antiproton · products fly apart with zero total momentum, speeds to scale
      </p>
    </SceneCard>
  );
}
