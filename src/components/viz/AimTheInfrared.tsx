import { useEffect, useRef, useState } from 'react';
import { HCL, ISOTOPES, absorbed, absorptionTHz, cellTransmission, thzToMicron } from '../../lib/physics/solids.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * An infrared lamp, a cell of D–Cl gas and a detector. The lamp is off while
 * you set its frequency on the scale, where H–Cl's absorption line is
 * already marked. Check switches it on: if the frequency matches the D–Cl
 * vibration the molecules ring hard and the detector goes dark; anywhere
 * else they barely stir and the light walks through.
 *
 * Graded with `id`. Physics: absorptionTHz / absorbed / cellTransmission in
 * src/lib/physics/solids.ts.
 */
export interface AimTheInfraredProps {
  id?: string;
  prompt?: string;
  /** THz either side of the line that counts. */
  tolerance?: number;
  explanation?: string;
}

const F_HCL = absorptionTHz(HCL, ISOTOPES.H, ISOTOPES.Cl35);
const F_DCL = absorptionTHz(HCL, ISOTOPES.D, ISOTOPES.Cl35);
const XR: [number, number] = [30, 100];
const MOLS = [[170, 60], [230, 102], [290, 52], [340, 96], [400, 64], [445, 108], [200, 140], [380, 140]];

export default function AimTheInfrared({ id, prompt, tolerance = 2, explanation }: AimTheInfraredProps) {
  const task = useTask(id, 'aim-the-infrared');
  const [f, setF] = useState(45);
  const [lit, setLit] = useState<number | null>(null);
  const litRef = useRef<number | null>(null);
  const mols = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const on = litRef.current;
      const amp = 1.5 + (on === null ? 0 : 13 * absorbed(on, F_DCL));
      MOLS.forEach((_, i) => {
        const s = amp * Math.cos(now / 160 + i * 1.7);
        mols.current[i]?.querySelector('.d')?.setAttribute('cx', (-17 + s).toFixed(2));
        mols.current[i]?.querySelector('.bond')?.setAttribute('x1', (-17 + s).toFixed(2));
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const move = (x: number) => {
    setF(Math.min(XR[1] - 2, Math.max(XR[0] + 2, Math.round(x * 10) / 10)));
    setLit(null); litRef.current = null; task.touch();
  };
  const shine = () => {
    setLit(f); litRef.current = f;
    task.check(Math.abs(f - F_DCL) <= tolerance, { f });
  };
  const through = lit === null ? null : cellTransmission(lit, F_DCL);
  const beam = lit === null ? 0 : 0.35;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Lamp set to" value={f.toFixed(1)} unit="THz" />
          <Meter label="Wavelength" value={thzToMicron(f).toFixed(2)} unit="µm" />
          <Meter label="Light through the gas" value={through === null ? 'lamp off' : `${(through * 100).toFixed(0)}`} unit={through === null ? undefined : '%'} color={C.energy} />
        </div>
        {id && <CheckBar label="Switch on" verdict={task.verdict} done={task.done} onCheck={shine}
          miss={lit !== null && `At ${lit.toFixed(1)} THz, ${(cellTransmission(lit, F_DCL) * 100).toFixed(0)}% of the light walks through: the D–Cl molecules barely stir.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 175" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`Infrared lamp at ${f.toFixed(1)} terahertz shining through D–Cl gas${through === null ? ', lamp off' : `, ${(through! * 100).toFixed(0)} percent gets through`}.`}>
        <rect x={20} y={70} width={60} height={40} rx={6} fill={C.surface} stroke={C.soft} strokeWidth={2} />
        <text x={50} y={128} textAnchor="middle" fontSize={12} fill={C.faint}>IR lamp</text>
        <rect x={80} y={78} width={440} height={24} fill={C.force} opacity={beam} />
        <rect x={520} y={78} width={60} height={24} fill={C.force} opacity={through === null ? 0 : beam * through} />
        <rect x={120} y={20} width={360} height={150} rx={14} fill="none" stroke={C.rule} strokeWidth={2} />
        <text x={130} y={40} fontSize={13} fill={C.soft}>D–Cl gas</text>
        {MOLS.map(([x, y], i) => <g key={i} ref={(el) => { mols.current[i] = el; }} transform={`translate(${x},${y})`}>
          <line className="bond" x1={-17} x2={0} y1={0} y2={0} stroke={C.soft} strokeWidth={2} />
          <circle cx={4} r={11} fill={C.surface} stroke={C.soft} strokeWidth={1.8} />
          <circle className="d" cx={-17} r={6} fill={C.surface} stroke={C.position} strokeWidth={2} />
        </g>)}
        <rect x={580} y={66} width={40} height={48} rx={4} fill={C.surface} stroke={C.soft} strokeWidth={2} />
        <text x={600} y={128} textAnchor="middle" fontSize={12} fill={C.faint}>detector</text>
      </svg>
      <Stage x={XR} y={[0, 1]} height={110} label="Lamp frequency scale" axes={{ x: 'lamp frequency (THz)', yTicks: [] }}>
        {(s) => <>
          <line x1={s.sx(F_HCL)} x2={s.sx(F_HCL)} y1={s.sy(0)} y2={s.sy(0.9)} stroke={C.position} strokeWidth={2} strokeDasharray="4 3" />
          <text x={s.sx(F_HCL) + 6} y={s.sy(0.72)} fontSize={13} fill={C.position}>H–Cl absorbs, {F_HCL.toFixed(1)}</text>
          {task.done && <>
            <line x1={s.sx(F_DCL)} x2={s.sx(F_DCL)} y1={s.sy(0)} y2={s.sy(0.9)} stroke={C.position} strokeWidth={2} />
            <text x={s.sx(F_DCL) - 6} y={s.sy(0.72)} textAnchor="end" fontSize={13} fill={C.position}>D–Cl, {F_DCL.toFixed(1)}</text>
          </>}
          <Handle s={s} at={[f, 0.3]} step={0.5} r={10} color={C.force} label="Lamp frequency: drag along the scale"
            clamp={(p) => [p[0], 0.3]} onChange={(p) => move(p[0])} />
        </>}
      </Stage>
    </SceneCard>
  );
}
