import { useEffect, useState } from 'react';
import { GLASS, atVoltage, cap, chargeSplit, si, voltage } from '../../lib/physics/capacitor.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { CapacitorPicture, GapLabel, PLATE_H } from './capacitor-kit-ch24.tsx';

/**
 * A charged capacitor with nothing connected to it, and a sheet of glass
 * below the gap. Drag the glass up into the gap. Its molecules turn to line
 * up with the field as they enter, bound charge appears on its faces, and the
 * plates' own charge slides along the plates to crowd beside the glass. The
 * total charge never changes (the glass makes none); the voltage falls.
 *
 * Graded with `id` + `targetShare`: slide until that fraction of the plates'
 * charge sits beside the glass. With κ = 5, half the charge needs only a
 * sixth of the plate covered. Physics: chargeSplit / voltage from capacitor.ts.
 */
export interface SlideTheGlassProps {
  id?: string;
  prompt?: string;
  /** Voltage before any glass goes in, V. */
  volts?: number;
  /** Fraction of the charge that must sit beside the glass. */
  targetShare?: number;
  explanation?: string;
}

const AREA = 0.01;
const GAP = 1e-3;
const LINE_E = 1e5;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function SlideTheGlass({ id, prompt, volts = 1000, targetShare, explanation }: SlideTheGlassProps) {
  const graded = Boolean(id && targetShare !== undefined);
  const task = useTask(graded ? id : undefined, 'slide-the-glass');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [fill, setFill] = useState(0);

  const q = atVoltage(cap(AREA, GAP), volts).q; // charged, then disconnected
  const c = cap(AREA, GAP, q, GLASS.kappa, fill);
  const V = voltage(c);
  const split = chargeSplit(c);
  const share = split.glass / (split.glass + split.air);
  const hit = graded && Math.abs(share - targetShare!) <= 0.04;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Meter label="Voltage" value={`${V.toFixed(0)} V`} color={C.ink} />
          <Meter label="Charge on the + plate" value={si(q, 'C')} color={C.ink} />
          <Meter label="Of it, beside the glass" value={pct(share)} color={C.ink} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={live && task.done}
          onCheck={() => task.check(hit, { fill, share })}
          miss={`The glass covers ${pct(fill)} of the plates and holds ${pct(share)} of the charge beside it.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-4, 5]} y={[-11.6, 12]} height={400}
        label={`A disconnected capacitor at ${V.toFixed(0)} volts. Glass covers ${pct(fill)} of the plates and ${pct(share)} of the charge sits beside it.`}>
        {(s) => {
          const gapMm = GAP * 1000;
          const bottom = fill * PLATE_H - PLATE_H;
          return <>
            <CapacitorPicture s={s} c={c} lineE={LINE_E} />
            <GapLabel s={s} gap={gapMm} y={PLATE_H + 0.45} above />
            <text x={s.sx(gapMm) + 44} y={s.sy(bottom + 1.4)} fontSize={13} fill={C.soft}>glass, κ = {GLASS.kappa}</text>
            <line x1={s.sx(gapMm / 2)} x2={s.sx(gapMm / 2)} y1={s.sy(bottom)} y2={s.sy(bottom - 0.9)} stroke={C.ghost} strokeWidth={4} />
            <Handle s={s} at={[gapMm / 2, bottom - 0.9]} color={C.ink} step={0.25} label="The glass: drag up into the gap"
              clamp={(p) => [gapMm / 2, Math.min(-0.9, Math.max(-PLATE_H - 0.9, Math.round(p[1] * 4) / 4))]}
              onChange={(p) => { setFill((p[1] + 0.9 + PLATE_H) / PLATE_H); task.touch(); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        10 cm plates, 1 mm gap drawn enlarged, nothing connected · rose dots: +, violet: − · orchid: field lines · inside the glass, each molecule is a − and + pair
      </p>
    </SceneCard>
  );
}
