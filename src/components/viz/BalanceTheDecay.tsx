import { useEffect, useRef, useState } from 'react';
import {
  PARTICLES, betaOf, broken, burstMomentum, ledger, type Law, type ParticleKey,
} from '../../lib/physics/particles.ts';
import { C, CheckBar, SceneCard, useTask } from './scene.tsx';

/**
 * A decay and its books. On the left, the parent particle; on the right, the
 * ledger: charge, baryon number, lepton number and rest energy, before and
 * after. A row lights green when it balances.
 *
 * If every row balances, the parent decays on screen: the products burst out
 * with zero total momentum, each at the speed `burstMomentum` gives it, so a
 * heavy proton barely recoils while the light ones streak away. If any row
 * fails, nothing happens: the parent sits there and the products stay ghosts.
 *
 * With `tray`, one product is missing and the learner picks it. With `id`
 * the scene grades itself. Physics: src/lib/physics/particles.ts.
 */
export interface BalanceTheDecayProps {
  id?: string;
  prompt?: string;
  parent: ParticleKey;
  /** Products already written down. */
  known: ParticleKey[];
  /** Candidates for the one missing product. Omit to show `known` as the whole proposal. */
  tray?: ParticleKey[];
  explanation?: string;
}

const CX = 160, CY = 160, PERIOD = 3.2, HOLD = 0.7, PX_PER_C = 150;
const LAW_NAME: Record<Law, string> = { charge: 'Charge', baryon: 'Baryon number', lepton: 'Lepton number', energy: 'Rest energy' };
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const radius = (k: ParticleKey) => (PARTICLES[k].B !== 0 ? 15 : PARTICLES[k].mass > 50 ? 11 : PARTICLES[k].mass > 0 ? 8 : 6);

export default function BalanceTheDecay({ id, prompt, parent, known, tray, explanation }: BalanceTheDecayProps) {
  const task = useTask(id, 'balance-the-decay');
  const [pick, setPick] = useState<ParticleKey | null>(null);
  const after: ParticleKey[] = tray ? (pick ? [...known, pick] : known) : known;
  const book = ledger([parent], after);
  const fails = broken([parent], after);
  const ok = fails.length === 0 && (!tray || pick !== null);

  // The decay plays in refs: positions are written straight to the SVG.
  const groups = useRef<(SVGGElement | null)[]>([]);
  const parentDot = useRef<SVGGElement | null>(null);
  const live = useRef({ ok, after });
  live.current = { ok, after };

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const { ok: go, after: prod } = live.current;
      const t = ((now - t0) / 1000) % PERIOD;
      const masses = prod.map((k) => PARTICLES[k].mass);
      const p = burstMomentum(masses, PARTICLES[parent].mass);
      const flying = go && t > HOLD;
      if (parentDot.current) parentDot.current.setAttribute('opacity', flying ? '0' : '1');
      prod.forEach((k, i) => {
        const el = groups.current[i];
        if (!el) return;
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / prod.length + 0.35;
        let x: number, y: number;
        if (flying) {
          const r = Math.min(PX_PER_C * betaOf(p, PARTICLES[k].mass) * (t - HOLD), 150);
          x = CX + Math.cos(ang) * (r + 2); y = CY + Math.sin(ang) * (r + 2);
        } else {
          // ghosts: the proposal, parked beside the parent
          x = CX + Math.cos(ang) * 62; y = CY + Math.sin(ang) * 62;
        }
        el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        el.setAttribute('opacity', go ? (flying ? '1' : '0') : '0.55');
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [parent]);

  const rows: { law: Law; before: string; after: string; good: boolean }[] = [
    { law: 'charge', before: signed(book.charge.before), after: signed(book.charge.after), good: book.charge.ok },
    { law: 'baryon', before: signed(book.baryon.before), after: signed(book.baryon.after), good: book.baryon.ok },
    { law: 'lepton', before: signed(book.lepton.before), after: signed(book.lepton.after), good: book.lepton.ok && book.flavour.ok },
    { law: 'energy', before: book.energy.before.toFixed(1), after: book.energy.after.toFixed(1), good: book.energy.ok },
  ];

  const missLine = (): string => {
    if (tray && !pick) return 'The slot is empty. Pick a particle from the tray.';
    const f = fails[0];
    if (!f) return '';
    const r = rows.find((x) => x.law === f)!;
    if (f === 'energy') return `The products weigh ${r.after} MeV and the ${PARTICLES[parent].name} only ${r.before} MeV. It stays put.`;
    return `${LAW_NAME[f]} reads ${r.before} before and ${r.after} after. The ${PARTICLES[parent].name} stays put.`;
  };

  const reaction = `${PARTICLES[parent].symbol} → ${after.map((k) => PARTICLES[k].symbol).join(' + ')}${tray && !pick ? (after.length ? ' + ?' : '?') : ''}`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        {tray && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="hud-label" style={{ marginRight: 4 }}>Tray</span>
          {tray.map((k) => (
            <button key={k} type="button" className="anth-btn" data-active={pick === k ? 'true' : undefined}
              aria-pressed={pick === k} aria-label={`Add ${PARTICLES[k].name}`}
              style={{ display: 'inline-flex', justifyContent: 'center', fontSize: 17, minWidth: 52, padding: '8px 14px', fontFamily: 'var(--font-sans)', textTransform: 'none', letterSpacing: 0 }}
              onClick={() => { setPick(k); task.touch(); }}>
              {PARTICLES[k].symbol}
            </button>
          ))}
        </div>}
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { pick })} miss={missLine()} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 320" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`${reaction}. ${ok ? 'Every count balances and the decay happens.' : `Not allowed: ${fails.map((f) => LAW_NAME[f].toLowerCase()).join(', ')} does not balance.`}`}>
        <text x={CX} y={30} textAnchor="middle" fontSize={20} fill={C.ink}>{reaction}</text>
        <rect x={10} y={46} width={300} height={264} rx={10} fill="none" stroke={C.grid} />
        <g ref={(el) => { parentDot.current = el; }}>
          <circle cx={CX} cy={CY} r={radius(parent)} fill={C.surface} stroke={C.ink} strokeWidth={2} />
          <text x={CX} y={CY + 5} textAnchor="middle" fontSize={15} fill={C.ink}>{PARTICLES[parent].symbol}</text>
        </g>
        {after.map((k, i) => {
          const r = radius(k);
          return (
            <g key={`${k}-${i}`} ref={(el) => { groups.current[i] = el; }} opacity={0}>
              <circle r={r} fill={PARTICLES[k].anti ? 'none' : C.surface} stroke={C.soft} strokeWidth={2}
                strokeDasharray={PARTICLES[k].anti ? '3 3' : undefined} />
              <text x={r + 5} y={5} fontSize={15} fill={C.ink} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{PARTICLES[k].symbol}</text>
            </g>
          );
        })}
        <text x={160} y={296} textAnchor="middle" fontSize={13} fill={ok ? C.ok : C.warn}>
          {ok ? 'decays: the books balance' : tray && !pick ? 'one product missing' : 'never seen: the books do not balance'}
        </text>
        {/* the ledger */}
        <g fontSize={15}>
          <text x={526} y={70} textAnchor="end" fontSize={13} fill={C.faint}>before</text>
          <text x={590} y={70} textAnchor="end" fontSize={13} fill={C.faint}>after</text>
          {rows.map((r, i) => {
            const y = 112 + i * 52;
            const col = tray && !pick && r.law !== 'energy' && !r.good ? C.faint : r.good ? C.ok : C.warn;
            return (
              <g key={r.law}>
                <rect x={326} y={y - 26} width={304} height={42} rx={6} fill="none" stroke={r.good ? C.ok : C.grid} strokeOpacity={r.good ? 0.5 : 1} />
                <text x={338} y={y} fill={C.soft}>{r.law === 'energy' ? 'Rest energy, MeV' : LAW_NAME[r.law]}</text>
                <text x={526} y={y} textAnchor="end" fill={C.ink} fontFamily="var(--font-mono)">{r.before}</text>
                <text x={590} y={y} textAnchor="end" fill={C.ink} fontFamily="var(--font-mono)">{r.after}</text>
                <text x={614} y={y} textAnchor="middle" fill={col} fontSize={17}>{r.good ? '✓' : '✗'}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        dashed rings: antiparticles · rest energy passes if the products weigh no more than the parent · speeds drawn to scale
      </p>
    </SceneCard>
  );
}
