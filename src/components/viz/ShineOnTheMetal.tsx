import { useEffect, useRef, useState } from 'react';
import { METALS, electronRate, electronSpeed, emits, kMaxEv, type Metal } from '../../lib/physics/photons.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { sci, spectrumColour, spectrumGradient } from './photon-colour.ts';

/**
 * A lamp shines on a clean metal plate inside a vacuum tube. Two controls:
 * the colour of the light and its brightness. Electrons leave the plate as
 * cyan dots, as many per second as the light can free, each with a speed
 * drawn from its kinetic energy (spread from zero up to hf − φ).
 *
 * Below the metal's cutoff nothing leaves at any brightness. Above it,
 * brightness changes how many dots stream off, and colour changes how fast.
 *
 * With `id` and `targetEv` the scene grades itself: get the fastest electron
 * to that kinetic energy. Physics: src/lib/physics/photons.ts.
 */
export interface ShineOnTheMetalProps {
  id?: string;
  prompt?: string;
  metal?: Metal;
  /** Starting wavelength, nm. */
  nm?: number;
  /** Starting brightness, 1–10 (× 1 µW on the plate). */
  bright?: number;
  /** Graded: the fastest electron's kinetic energy to reach, eV. */
  targetEv?: number;
  tolerance?: number;
  explanation?: string;
}

const NM_MIN = 300, NM_MAX = 700, POOL = 90;
const PLATE_X = 250, TUBE = { x0: 150, x1: 610, y0: 34, y1: 236 };
/** Drawn speed: px per second for an electron of 1 eV. */
const PX_PER_EV = 230;

export default function ShineOnTheMetal({
  id, prompt, metal = 'sodium', nm: nm0 = 650, bright: b0 = 1, targetEv, tolerance = 0.03, explanation,
}: ShineOnTheMetalProps) {
  const graded = Boolean(id && targetEv !== undefined);
  const task = useTask(graded ? id : undefined, 'shine-on-the-metal');
  const [nm, setNm] = useState(nm0);
  const [bright, setBright] = useState(b0);
  const cfg = useRef({ nm: nm0, bright: b0 });
  cfg.current = { nm, bright };
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const phi = METALS[metal].phi;

  useEffect(() => {
    const e = Array.from({ length: POOL }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0 }));
    let raf = 0, last = performance.now(), due = 0, next = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { nm: w, bright: b } = cfg.current;
      const k = kMaxEv(w, phi);
      // Drawn emission rate grows with brightness; below cutoff it is zero.
      if (emits(w, phi)) due += 5 * b * dt; else due = 0;
      while (due >= 1) {
        due -= 1;
        const p = e[next]; next = (next + 1) % POOL;
        const K = k * Math.random(); // uniform on [0, K_max]
        const sp = PX_PER_EV * (electronSpeed(K) / electronSpeed(1));
        const ang = (Math.random() - 0.5) * 1.1;
        Object.assign(p, { on: true, x: PLATE_X + 6, y: 72 + Math.random() * 126, vx: sp * Math.cos(ang), vy: sp * Math.sin(ang) });
      }
      e.forEach((p, i) => {
        const el = dots.current[i];
        if (p.on) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x > TUBE.x1 - 8 || p.y < TUBE.y0 + 6 || p.y > TUBE.y1 - 6 || (p.vx < 3 && p.x > PLATE_X + 40)) p.on = false;
        }
        if (el) {
          el.setAttribute('cx', p.x.toFixed(1)); el.setAttribute('cy', p.y.toFixed(1));
          el.setAttribute('opacity', p.on ? '1' : '0');
        }
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phi]);

  const k = kMaxEv(nm, phi);
  const rate = electronRate(bright * 1e-6, nm, phi);
  const col = spectrumColour(nm);
  const uv = nm < 380;
  const off = targetEv === undefined ? 0 : k - targetEv;
  const hitNow = graded && emits(nm, phi) && Math.abs(off) <= tolerance;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '2 1 240px' }}>
            <span className="hud-label">Colour: {nm} nm{uv ? ', ultraviolet' : ''}</span>
            <div style={{ height: 6, borderRadius: 3, marginTop: 6, background: spectrumGradient(NM_MIN, NM_MAX) }} />
            <input type="range" className="anth-slider" min={NM_MIN} max={NM_MAX} step={1} value={nm}
              aria-label="Colour of the light, wavelength in nanometres"
              onChange={(ev) => { setNm(+ev.target.value); task.touch(); }} />
          </label>
          <label style={{ flex: '1 1 150px' }}>
            <span className="hud-label">Brightness: ×{bright}</span>
            <input type="range" className="anth-slider" min={1} max={10} step={1} value={bright}
              aria-label="Brightness of the lamp"
              onChange={(ev) => { setBright(+ev.target.value); task.touch(); }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Electrons out" value={sci(rate)} unit="per second" color={C.velocity} />
          <Meter label="Fastest electron" value={emits(nm, phi) ? k.toFixed(2) : 'none'} unit={emits(nm, phi) ? 'eV' : undefined} color={C.energy} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { nm, bright })}
          miss={!emits(nm, phi)
            ? `At ${nm} nm nothing leaves the ${metal}, at brightness ×${bright} or any other.`
            : `The fastest electron leaves with ${k.toFixed(2)} eV, ${Math.abs(off).toFixed(2)} eV ${off < 0 ? 'short of' : 'past'} ${targetEv!.toFixed(2)} eV. Brightness ×${bright} sets how many leave, not how fast.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 262" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`${nm} nanometre light at brightness ${bright} on ${metal}. ${emits(nm, phi) ? `Electrons leave with up to ${k.toFixed(2)} electron-volts.` : 'No electrons leave.'}`}>
        {/* the vacuum tube */}
        <rect x={TUBE.x0} y={TUBE.y0} width={TUBE.x1 - TUBE.x0} height={TUBE.y1 - TUBE.y0} rx={40}
          fill="none" stroke={C.rule} strokeWidth={1.5} />
        <text x={TUBE.x1 - 18} y={TUBE.y1 - 14} textAnchor="end" fontSize={13} fill={C.faint}>vacuum</text>
        {/* the lamp and its beam */}
        <polygon points={`62,122 62,148 ${PLATE_X - 4},196 ${PLATE_X - 4},74`} fill={col}
          opacity={0.1 + 0.055 * bright} />
        <circle cx={46} cy={135} r={20} fill={C.surface} stroke={col} strokeWidth={3} />
        <text x={46} y={180} textAnchor="middle" fontSize={13} fill={C.soft}>lamp</text>
        {uv && <text x={150} y={112} textAnchor="middle" fontSize={13} fill={C.soft}>ultraviolet</text>}
        {/* the plate */}
        <rect x={PLATE_X - 4} y={66} width={10} height={138} rx={2} fill={C.soft} />
        <text x={PLATE_X + 1} y={224} textAnchor="middle" fontSize={13} fill={C.soft}>{metal}</text>
        {/* electrons */}
        {Array.from({ length: POOL }, (_, i) => (
          <circle key={i} ref={(el) => { dots.current[i] = el; }} r={3.2} fill={C.velocity} opacity={0} cx={0} cy={0} />
        ))}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        cyan dots: electrons leaving the plate, drawn at a rate that grows with the real one
      </p>
    </SceneCard>
  );
}
