import { useState } from 'react';
import {
  HCL, ISOTOPES, curvatureAt, evPerA2ToSI, morseU, reducedMass, toTHz, vibrationOmega, wellBottom,
} from '../../lib/physics/solids.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * The energy of the H–Cl bond against the distance between the atoms, and a
 * dashed parabola: a spring's energy, ½k(r − r_e)². Drag the parabola's wall
 * until it hugs the bottom of the well. The stiffness you settle on is the
 * bond's spring constant, and once it is right the scene says what frequency
 * that spring rings at. Away from the bottom the two curves part company:
 * the real well flattens toward breaking, the spring never lets go.
 *
 * Graded with `id`. Physics: morseU / curvatureAt / vibrationOmega in
 * src/lib/physics/solids.ts.
 */
export interface HugTheWellProps {
  id?: string;
  prompt?: string;
  /** Fractional error in k that counts as a hug. */
  tolerance?: number;
  explanation?: string;
}

const U = (r: number) => morseU(HCL, r);
const RE = wellBottom(U, 0.6, 3);
const K_TRUE = curvatureAt(U, RE); // eV/Å²
const H_HANDLE = 0.5;              // eV above the bottom where the handle rides
const XR: [number, number] = [0.9, 2.3];
const YR: [number, number] = [-4.75, -2.6];

export default function HugTheWell({ id, prompt, tolerance = 0.15, explanation }: HugTheWellProps) {
  const task = useTask(id, 'hug-the-well');
  const [xw, setXw] = useState(0.34); // Å from r_e to the parabola's right wall at H_HANDLE
  const k = (2 * H_HANDLE) / (xw * xw);
  const err = k / K_TRUE - 1;
  const kSI = evPerA2ToSI(k);
  const f = toTHz(vibrationOmega(evPerA2ToSI(K_TRUE), reducedMass(ISOTOPES.H, ISOTOPES.Cl35)));

  const path = (fn: (r: number) => number, a: number, b: number, s: { sx: (v: number) => number; sy: (v: number) => number }) => {
    const pts: string[] = [];
    for (let i = 0; i <= 300; i++) {
      const r = a + ((b - a) * i) / 300;
      const u = fn(r);
      if (u <= YR[1] + 0.05 && u >= YR[0] - 0.05) pts.push(`${s.sx(r).toFixed(1)},${s.sy(u).toFixed(1)}`);
    }
    return pts.length ? `M${pts.join('L')}` : '';
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Your spring" value={kSI.toFixed(0)} unit="N/m" color={C.position} />
          {task.done && <Meter label="It rings at" value={f.toFixed(1)} unit="THz" />}
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(err) <= tolerance, { k: kSI })}
          miss={`Your parabola is ${Math.abs(err * 100).toFixed(0)}% ${err > 0 ? 'stiffer' : 'softer'} than the well is curved at the bottom: it is ${err > 0 ? 'narrower' : 'wider'} than the well just above the bottom.`}
          hit={explanation} />}
      </div>}>
      <Stage x={XR} y={YR} height={320} label={`Bond energy of H–Cl and a spring parabola of stiffness ${kSI.toFixed(0)} newtons per metre`}
        axes={{ x: 'distance between the atoms (Å)', y: 'energy (eV)', xTicks: [1, 1.5, 2], yTicks: [-4.5, -4, -3.5, -3] }}>
        {(s) => <>
          <path d={path(U, XR[0], XR[1], s)} fill="none" stroke={C.energy} strokeWidth={3} />
          <path d={path((r) => -HCL.De + 0.5 * k * (r - RE) ** 2, XR[0], XR[1], s)} fill="none" stroke={C.position} strokeWidth={2.2} strokeDasharray="7 5" />
          <text x={s.sx(2.25)} y={s.sy(U(2.25)) + 22} textAnchor="end" fontSize={13} fill={C.energy}>H–Cl bond</text>
          <text x={s.sx(RE) + 8} y={s.sy(-HCL.De) + 20} fontSize={12} fill={C.faint}>r_e = {RE.toFixed(2)} Å</text>
          <line x1={s.sx(RE)} x2={s.sx(RE)} y1={s.sy(-HCL.De)} y2={s.sy(YR[0])} stroke={C.faint} strokeDasharray="3 4" />
          <Handle s={s} at={[RE + xw, -HCL.De + H_HANDLE]} step={0.01} color={C.position} label="Wall of the spring parabola: drag sideways"
            clamp={(p) => [p[0], -HCL.De + H_HANDLE]}
            onChange={(p) => { setXw(Math.min(1.2, Math.max(0.08, p[0] - RE))); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Aqua: the bond&apos;s energy · dashed iris: a spring, ½k(r − r_e)², with its bottom on the well&apos;s
      </p>
    </SceneCard>
  );
}
