import { useRef, useState } from 'react';
import { MU_H, MU_HE, balmerLinesNm, bandOf, levelEV, photonEV, spectralRgb, transitionWavelength } from '../../lib/physics/matterwaves.ts';
import { C, CheckBar, SceneCard, useTask } from './scene.tsx';

/**
 * The allowed energies of a one-electron atom, drawn to scale, and one jump.
 * Two handles on the right choose where the electron starts and where it
 * lands; a drop sends out one photon whose wavelength is hc/ΔE, drawn as a
 * wiggle whose period is to scale and coloured as the eye would see it. The
 * strip below is the visible spectrum with a hydrogen lamp's lines on it.
 *
 * `Z = 2` gives He⁺ (the nucleus pulls twice as hard; every level is four
 * times deeper). Graded (`id` + `targetNm`): make the photon that matches the
 * marked line, to within 1 nm.
 * Physics: levelEV / photonEV / transitionWavelength in matterwaves.ts.
 */
export interface JumpTheLadderProps {
  id?: string;
  prompt?: string;
  Z?: 1 | 2;
  /** [start, land]. */
  start?: [number, number];
  /** Graded: the line to match, nm. */
  targetNm?: number;
  /** Mark the hydrogen lamp's visible lines on the strip. */
  lamp?: boolean;
  explanation?: string;
}

const W = 640, HT = 420;
const LAD = { x0: 64, x1: 236, top: 40, bot: 392 };
const COL = { from: 336, to: 386, top: 60, bot: 392 };
const SPEC = { x0: 432, x1: 624, y: 300, lo: 380, hi: 750 };
const sxNm = (nm: number) => SPEC.x0 + ((nm - SPEC.lo) / (SPEC.hi - SPEC.lo)) * (SPEC.x1 - SPEC.x0);
const rgb = (nm: number) => { const c = spectralRgb(nm); return c ? `rgb(${c[0]},${c[1]},${c[2]})` : C.faint; };

export default function JumpTheLadder({ id, prompt, Z = 1, start = [2, 1], targetNm, lamp = true, explanation }: JumpTheLadderProps) {
  const graded = Boolean(id && targetNm);
  const task = useTask(graded ? id : undefined, 'jump-the-ladder');
  const maxN = Z === 1 ? 6 : 7;
  const mu = Z === 1 ? MU_H : MU_HE;
  const [up, setUp] = useState(start[0]);
  const [low, setLow] = useState(start[1]);
  const drag = useRef<null | 'from' | 'to'>(null);

  const Emin = levelEV(1, Z, mu) * 1.04;
  const yE = (e: number) => LAD.top + (e / Emin) * (LAD.bot - LAD.top);
  const yCol = (n: number) => COL.bot - ((n - 1) / (maxN - 1)) * (COL.bot - COL.top);
  const nAt = (y: number) => Math.max(1, Math.min(maxN, Math.round(1 + ((COL.bot - y) / (COL.bot - COL.top)) * (maxN - 1))));
  const tick = Z === 1 ? 2 : 10;

  const falls = up > low;
  const ev = falls ? photonEV(up, low, Z, mu) : 0;
  const nm = falls ? transitionWavelength(up, low, Z, mu) * 1e9 : NaN;
  const band = falls ? bandOf(nm) : null;
  const targetEV = targetNm ? 1239.841984 / targetNm : 0;
  const hit = graded && falls && Math.abs(nm - targetNm!) <= 1;
  const lines = balmerLinesNm(MU_H);

  const move = (which: 'from' | 'to', n: number) => { (which === 'from' ? setUp : setLow)(Math.max(1, Math.min(maxN, n))); task.touch(); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const svg = (e.target as SVGElement).ownerSVGElement!, ctm = svg.getScreenCTM();
    if (!ctm) return;
    move(drag.current, nAt(new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).y));
  };

  // photon wiggle: period to scale, 1 px per 16 nm
  const per = falls ? Math.max(5, nm / 16) : 0;
  const wig = falls ? Array.from({ length: 241 }, (_, k) => {
    const x = 432 + (k / 240) * 192;
    return `${k ? 'L' : 'M'}${x.toFixed(1)},${(150 + 12 * Math.sin((2 * Math.PI * (x - 432)) / per)).toFixed(1)}`;
  }).join('') : '';

  const handle = (which: 'from' | 'to', n: number, x: number) => <g>
    <circle cx={x} cy={yCol(n)} r={which === 'from' ? 8 : 9} fill={which === 'from' ? C.position : C.surface} stroke={C.position} strokeWidth={2.5} pointerEvents="none" />
    <circle cx={x} cy={yCol(n)} r={20} fill="transparent" style={{ cursor: 'grab' }} tabIndex={0} role="slider"
      aria-label={which === 'from' ? 'Level the electron starts on' : 'Level the electron lands on'} aria-valuetext={`n = ${n}`}
      onPointerDown={(e) => { drag.current = which; (e.target as Element).setPointerCapture(e.pointerId); }}
      onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}
      onKeyDown={(e) => {
        const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
        if (d === undefined) return;
        e.preventDefault(); move(which, n + d);
      }} />
  </g>;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={graded ? <CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => task.check(hit, { up, low })}
        miss={!falls ? `The electron ${up === low ? 'stays on' : 'climbs from'} n = ${up}${up === low ? '' : ` to n = ${low}`}; it has to land on a lower level to give out light.`
          : `${up} → ${low} gives a ${nm.toFixed(0)} nm photon${band === 'visible' ? '' : `, ${band}`}, carrying ${ev.toFixed(2)} eV. The line you want carries ${targetEV.toFixed(2)} eV.`}
        hit={explanation} /> : undefined}>
      <svg viewBox={`0 0 ${W} ${HT}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`${Z === 1 ? 'Hydrogen' : 'Helium ion'} energy levels. Electron drops from n = ${up} to n = ${low}${falls ? `, giving a ${nm.toFixed(0)} nanometre photon` : ''}.`}>
        {/* energy axis */}
        {Array.from({ length: Math.floor(-Emin / tick) + 1 }, (_, k) => -k * tick).map((e) => <g key={e}>
          <line x1={LAD.x0 - 5} x2={LAD.x0} y1={yE(e)} y2={yE(e)} stroke={C.faint} />
          <text x={LAD.x0 - 8} y={yE(e) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{e}</text>
        </g>)}
        <line x1={LAD.x0} x2={LAD.x0} y1={LAD.top} y2={LAD.bot} stroke={C.rule} />
        <text x={LAD.x0 - 40} y={LAD.top - 16} fontSize={12} fill={C.soft}>energy (eV)</text>
        <text x={LAD.x0 + 70} y={LAD.top - 16} fontSize={12} fill={C.soft}>{Z === 1 ? 'hydrogen' : 'helium ion, He⁺'}</text>
        <line x1={LAD.x0} x2={LAD.x1} y1={yE(0)} y2={yE(0)} stroke={C.faint} strokeDasharray="3 4" />
        <text x={LAD.x1} y={yE(0) - 6} textAnchor="end" fontSize={11} fill={C.faint}>free</text>

        {/* levels and their leader lines to the handle column */}
        {Array.from({ length: maxN }, (_, k) => k + 1).map((n) => {
          const on = n === up || n === low;
          return <g key={n}>
            <line x1={LAD.x0} x2={LAD.x1} y1={yE(levelEV(n, Z, mu))} y2={yE(levelEV(n, Z, mu))} stroke={on ? C.ink : C.soft} strokeWidth={on ? 2.2 : 1.3} />
            <path d={`M${LAD.x1},${yE(levelEV(n, Z, mu))} C${LAD.x1 + 30},${yE(levelEV(n, Z, mu))} ${COL.from - 60},${yCol(n)} ${COL.from - 40},${yCol(n)}`} fill="none" stroke={C.grid} />
            <text x={COL.from - 36} y={yCol(n) + 4} fontSize={12} fill={on ? C.ink : C.faint}>n={n}</text>
            <line x1={COL.from} x2={COL.to} y1={yCol(n)} y2={yCol(n)} stroke={C.grid} />
          </g>;
        })}
        <text x={COL.from} y={COL.top - 26} textAnchor="middle" fontSize={11} fill={C.soft}>start</text>
        <text x={COL.to} y={COL.top - 26} textAnchor="middle" fontSize={11} fill={C.soft}>land</text>

        {/* the jump */}
        {up !== low && <g>
          <line x1={170} x2={170} y1={yE(levelEV(up, Z, mu))} y2={yE(levelEV(low, Z, mu)) + (falls ? -10 : 10)} stroke={C.energy} strokeWidth={3} />
          <path d={falls ? `M170,${yE(levelEV(low, Z, mu))} l-6,-11 l12,0 Z` : `M170,${yE(levelEV(low, Z, mu))} l-6,11 l12,0 Z`} fill={C.energy} />
          {falls && <text x={180} y={(yE(levelEV(up, Z, mu)) + yE(levelEV(low, Z, mu))) / 2 + 4} fontSize={12} fill={C.energy}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{ev.toFixed(2)} eV</text>}
        </g>}
        {handle('to', low, COL.to)}
        {handle('from', up, COL.from)}

        {/* the photon */}
        <text x={432} y={70} fontSize={12} fill={C.soft}>the photon it gives out</text>
        {falls ? <>
          <path d={wig} fill="none" stroke={rgb(nm)} strokeWidth={2.5} />
          <text x={432} y={206} fontSize={20} fill={band === 'visible' ? rgb(nm) : C.ink} fontFamily="var(--font-mono)">{nm >= 1000 ? nm.toFixed(0) : nm.toFixed(1)} nm</text>
          <text x={432} y={228} fontSize={12} fill={C.faint}>{band === 'visible' ? 'visible' : `${band}: the eye cannot see it`}</text>
        </> : <text x={432} y={150} fontSize={12} fill={C.faint}>{up === low ? 'none: the electron has not moved' : 'none: a climb takes energy in'}</text>}

        {/* the visible strip */}
        {Array.from({ length: 74 }, (_, k) => SPEC.lo + k * 5).map((l) => (
          <rect key={l} x={sxNm(l)} y={SPEC.y} width={sxNm(l + 5) - sxNm(l) + 0.5} height={16} fill={rgb(l + 2.5)} opacity={0.8} />
        ))}
        {[400, 500, 600, 700].map((l) => <text key={l} x={sxNm(l)} y={SPEC.y + 30} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{l}</text>)}
        <text x={SPEC.x1} y={SPEC.y + 46} textAnchor="end" fontSize={11} fill={C.faint}>wavelength (nm)</text>
        {lamp && lines.map((l) => <line key={l} x1={sxNm(l)} x2={sxNm(l)} y1={SPEC.y - 12} y2={SPEC.y} stroke={C.ink} strokeWidth={1.5} />)}
        {lamp && <text x={SPEC.x0} y={SPEC.y - 18} fontSize={11} fill={C.soft}>hydrogen lamp's lines</text>}
        {targetNm && <text x={sxNm(targetNm)} y={SPEC.y - 18} textAnchor="middle" fontSize={11} fill={C.ink}>▼ match</text>}
        {falls && band === 'visible' && <path d={`M${sxNm(nm)},${SPEC.y + 17} l-6,10 l12,0 Z`} fill={C.ink} />}
        {falls && band === 'ultraviolet' && <text x={SPEC.x0} y={SPEC.y + 64} fontSize={11} fill={C.ink}>← yours is off the strip, in the ultraviolet</text>}
        {falls && band === 'infrared' && <text x={SPEC.x1} y={SPEC.y + 64} textAnchor="end" fontSize={11} fill={C.ink}>yours is off the strip, in the infrared →</text>}
      </svg>
    </SceneCard>
  );
}
