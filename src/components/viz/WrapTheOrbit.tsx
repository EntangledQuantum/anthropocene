import { useEffect, useRef, useState } from 'react';
import { allowedRadius, lapSum, lapSurvival, lapWave, orbitEnergy, orbitWavelength, wavesPerOrbit, EV } from '../../lib/physics/matterwaves.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * Bohr's orbit as a standing wave. An electron on a circular orbit round a
 * proton has the speed the Coulomb pull allows there, and so a wavelength
 * λ = h/μv. The ring shows that wave after twelve trips round, added up
 * (`lapSum`): where a whole number of wavelengths fits, every trip lands on
 * the last and the ring swings as a standing wave; anywhere else the trips
 * cancel and the ring goes nearly still, with a visible jump where the wave
 * fails to meet itself. One control: the orbit's radius, on the ruler.
 *
 * The ring is drawn magnified to one size; the ruler under it is to scale.
 * Graded (`id` + `target`): find the orbit with exactly `target` wavelengths.
 */
export interface WrapTheOrbitProps {
  id?: string;
  prompt?: string;
  /** Starting radius, nm. */
  startNm?: number;
  /** Graded: the whole number of wavelengths to find. */
  target?: number;
  explanation?: string;
}

const W = 640, HT = 400;
const RING = { x: 320, y: 172, R: 118, amp: 26 };
const RULE = { x0: 60, x1: 600, y: 352, max: 0.5 }; // nm
const K = 12, TOL = 0.04, SAMPLES = 480;
const rx = (nm: number) => RULE.x0 + (nm / RULE.max) * (RULE.x1 - RULE.x0);

export default function WrapTheOrbit({ id, prompt, startNm = 0.12, target, explanation }: WrapTheOrbitProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'wrap-the-orbit');
  const [nm, setNm] = useState(startNm);
  const nmRef = useRef(nm);
  nmRef.current = nm;
  const path = useRef<SVGPathElement>(null);
  const drag = useRef(false);

  const r = nm * 1e-9;
  const nu = wavesPerOrbit(r);
  const left = lapSurvival(nu, K);
  const whole = Math.round(nu);
  const locked = Math.abs(nu - whole) <= TOL && whole >= 1;
  const hit = graded && Math.abs(nu - target!) <= TOL;
  const set = (v: number) => { setNm(Math.max(0.02, Math.min(RULE.max, Math.round(v * 2000) / 2000))); task.touch(); };

  // the loop redraws only the wave's path; React hears nothing per frame
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const n = wavesPerOrbit(nmRef.current * 1e-9);
      const S = lapSum(n, K);
      const swing = Math.cos(2 * Math.PI * 0.7 * (now / 1000));
      let d = '';
      for (let i = 0; i <= SAMPLES; i++) {
        // φ = 0 at the top, going clockwise; i = SAMPLES is the end of the lap
        const phi = (i / SAMPLES) * 2 * Math.PI - (i === SAMPLES ? 1e-9 : 0);
        const rr = RING.R + RING.amp * lapWave(n, phi, K, S) * swing;
        d += `${i ? 'L' : 'M'}${(RING.x + rr * Math.sin(phi)).toFixed(1)},${(RING.y - rr * Math.cos(phi)).toFixed(1)}`;
      }
      path.current?.setAttribute('d', d);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seamGap = Math.abs(lapWave(nu, 2 * Math.PI - 1e-9, K) - lapWave(nu, 0, K)) * RING.amp;
  const energyEV = orbitEnergy(r) / EV;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Meter label="Orbit radius" value={nm.toFixed(3)} unit="nm" />
          <Meter label="Wavelengths round the orbit" value={nu.toFixed(2)} color={C.position} />
          <Meter label="Wave left after 12 trips" value={(left * 100).toFixed(0)} unit="%" color={locked ? C.energy : C.soft} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { nm })}
          miss={locked
            ? `That orbit holds exactly ${whole} wavelength${whole === 1 ? '' : 's'}, not ${target}.`
            : `At ${nm.toFixed(3)} nm, ${nu.toFixed(2)} wavelengths fit round the orbit; after 12 trips the wave has cancelled to ${(left * 100).toFixed(0)} %.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox={`0 0 ${W} ${HT}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Orbit of radius ${nm.toFixed(3)} nanometres holding ${nu.toFixed(2)} wavelengths; ${(left * 100).toFixed(0)} percent of the wave survives.`}>
        <circle cx={RING.x} cy={RING.y} r={RING.R} fill="none" stroke={C.rule} strokeDasharray="2 5" />
        <path ref={path} fill="none" stroke={locked ? C.energy : C.position} strokeWidth={locked ? 3.2 : 2} strokeOpacity={locked ? 1 : 0.85} />
        <circle cx={RING.x} cy={RING.y} r={7} fill={C.surface} stroke={C.force} strokeWidth={2} />
        <text x={RING.x} y={RING.y + 4} textAnchor="middle" fontSize={11} fill={C.force}>+</text>
        <text x={RING.x} y={RING.y + 24} textAnchor="middle" fontSize={11} fill={C.faint}>proton</text>
        <line x1={RING.x} x2={RING.x} y1={RING.y - RING.R - 34} y2={RING.y - RING.R - 18} stroke={C.faint} />
        <text x={RING.x + 6} y={RING.y - RING.R - 22} fontSize={11} fill={C.faint}>{seamGap > 2 ? 'the wave misses itself here' : 'start of each trip'}</text>
        <text x={24} y={26} fontSize={12} fill={C.soft}>the electron's wave after 12 trips round, added up</text>
        <text x={24} y={44} fontSize={12} fill={C.faint}>λ here = {(orbitWavelength(r) * 1e9).toFixed(3)} nm · ring magnified</text>
        {locked && <text x={W - 24} y={26} textAnchor="end" fontSize={13} fill={C.energy}>standing wave · {energyEV.toFixed(2)} eV</text>}

        {/* the ruler, to scale */}
        <line x1={RULE.x0} x2={RULE.x1} y1={RULE.y} y2={RULE.y} stroke={C.rule} strokeWidth={2} />
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => <g key={v}>
          <line x1={rx(v)} x2={rx(v)} y1={RULE.y} y2={RULE.y + 7} stroke={C.faint} />
          <text x={rx(v)} y={RULE.y + 22} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v.toFixed(1)}</text>
        </g>)}
        <text x={RULE.x1} y={RULE.y + 38} textAnchor="end" fontSize={11} fill={C.faint}>orbit radius (nm)</text>
        {task.done && [1, 2, 3].map((n) => {
          const x = rx(allowedRadius(n) * 1e9);
          return <g key={n}>
            <line x1={x} x2={x} y1={RULE.y - 14} y2={RULE.y} stroke={C.energy} strokeWidth={2} />
            <text x={x} y={RULE.y - 18} textAnchor="middle" fontSize={11} fill={C.energy}>n = {n}</text>
          </g>;
        })}
        <line x1={rx(0)} x2={rx(nm)} y1={RULE.y} y2={RULE.y} stroke={C.position} strokeWidth={3} />
        <circle cx={rx(nm)} cy={RULE.y} r={22} fill="transparent" style={{ cursor: 'grab' }}
          tabIndex={0} role="slider" aria-label="Orbit radius" aria-valuetext={`${nm.toFixed(3)} nanometres`}
          onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const svg = (e.target as SVGElement).ownerSVGElement!, ctm = svg.getScreenCTM();
            if (!ctm) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
            set(((p.x - RULE.x0) / (RULE.x1 - RULE.x0)) * RULE.max);
          }}
          onPointerUp={() => { drag.current = false; }}
          onKeyDown={(e) => {
            const d = { ArrowRight: 0.001, ArrowUp: 0.001, ArrowLeft: -0.001, ArrowDown: -0.001 }[e.key];
            if (d === undefined) return;
            e.preventDefault(); set(nm + (e.shiftKey ? 10 * d : d));
          }} />
        <circle cx={rx(nm)} cy={RULE.y} r={9} fill={C.surface} stroke={C.position} strokeWidth={2.5} pointerEvents="none" />
      </svg>
    </SceneCard>
  );
}
