import { useMemo, useState } from 'react';
import { boxEnergy, normalise, shootBox } from '../../lib/physics/quantum1d.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { EnergyLine, Wall, pts, useSvgId } from './quantum-kit.tsx';

/**
 * The electron in its lowest level in a 1 nm box, and one control: the
 * right-hand wall. Set the wall where you think the lowest level will be
 * `factor` times higher, then squeeze. The level is hidden while you drag, so
 * the placement is a prediction; each squeeze leaves its result on the
 * picture, so a miss shows how far off and which way.
 *
 * The level is `boxEnergy` (h²/8mL², which the tests hold to the shooting
 * solution) and the wave drawn on it is shot at that energy.
 */
export interface SqueezeTheBoxProps {
  id?: string;
  prompt?: string;
  /** Graded: the multiple of the 1 nm ground level to reach. */
  factor?: number;
  explanation?: string;
}

const L0 = 1, L_MIN = 0.24, L_MAX = 1.2, SCALE = 0.3;
const Y: [number, number] = [-0.7, 7.7];

export default function SqueezeTheBox({ id, prompt, factor = 4, explanation }: SqueezeTheBoxProps) {
  const task = useTask(id, 'squeeze-the-box');
  const uid = useSvgId('stb');
  const [L, setL] = useState(L0);
  const [squeezed, setSqueezed] = useState<number | null>(L0);
  const [tries, setTries] = useState<{ L: number; E: number }[]>([]);
  const E0 = boxEnergy(1, L0);
  const shownL = squeezed ?? L0;
  const E = boxEnergy(1, shownL);
  const ratio = boxEnergy(1, L) / E0;
  const wave = useMemo(() => { const s = shootBox(E, shownL, 200); return { xs: s.xs, psi: normalise(s.xs, s.psi) }; }, [E, shownL]);
  const good = Math.abs(ratio / factor - 1) <= 0.04;
  const Etarget = factor * E0;
  const showing = squeezed !== null;

  const squeeze = () => {
    setSqueezed(L);
    setTries((t) => [...t.filter((q) => Math.abs(q.L - L) > 0.004), { L, E: boxEnergy(1, L) }]);
    task.check(good, { L });
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Box width" value={L.toFixed(2)} unit="nm" color={C.position} />
          <Meter label="Lowest level" value={showing ? E.toFixed(2) : '?'} unit="eV" color={C.energy} />
          <Meter label="Compared with 1 nm" value={showing ? `${(E / E0).toFixed(2)}×` : '?'} color={C.ink} />
        </div>
        {id ? <CheckBar verdict={task.verdict} done={task.done} label="Squeeze" onCheck={squeeze}
          miss={`At ${L.toFixed(2)} nm the lowest level is ${boxEnergy(1, L).toFixed(2)} eV, ${ratio.toFixed(1)} times the 1 nm level, not ${factor}.`}
          hit={explanation} />
          : <button type="button" className="anth-btn" onClick={squeeze}>Squeeze</button>}
      </div>}>
      <Stage x={[-0.25, 1.85]} y={Y} height={380} axes={{ x: 'position (nm)', y: 'energy (eV)', xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 1, 2, 3, 4, 5, 6, 7] }}
        label={`A box ${L.toFixed(2)} nanometres wide.${showing ? ` Its lowest level is ${E.toFixed(2)} electronvolts.` : ''}`}>
        {(s) => <>
          <Wall s={s} id={`${uid}-l`} x0={-0.12} x1={0} y0={Y[0]} y1={Y[1]} />
          <Wall s={s} id={`${uid}-r`} x0={L + 0.12} x1={L} y0={Y[0]} y1={Y[1]} />
          <line x1={s.sx(0)} x2={s.sx(1.34)} y1={s.sy(Etarget)} y2={s.sy(Etarget)} stroke={C.ink} strokeWidth={1.2} strokeDasharray="2 5" />
          <text x={s.sx(1.37)} y={s.sy(Etarget) + 4} fontSize={12} fill={C.ink}>target: {factor}×</text>
          <line x1={s.sx(0)} x2={s.sx(1.34)} y1={s.sy(E0)} y2={s.sy(E0)} stroke={C.faint} strokeWidth={1.2} strokeDasharray="3 5" />
          <text x={s.sx(1.37)} y={s.sy(E0) + 4} fontSize={12} fill={C.faint}>1 nm box: {E0.toFixed(2)} eV</text>
          {tries.filter((q) => q.L !== squeezed).map((q) => (
            <g key={q.L} opacity={0.55}>
              <line x1={s.sx(q.L)} x2={s.sx(q.L)} y1={s.sy(0)} y2={s.sy(Math.min(q.E, Y[1]))} stroke={C.faint} strokeWidth={1} strokeDasharray="2 3" />
              <circle cx={s.sx(q.L)} cy={s.sy(Math.min(q.E, Y[1] - 0.1))} r={4} fill={C.energy} />
              <text x={s.sx(q.L) + 7} y={s.sy(Math.min(q.E, Y[1] - 0.1)) + 4} fontSize={12} fill={C.soft}>{q.E.toFixed(2)} eV</text>
            </g>
          ))}
          {showing && <>
            <EnergyLine s={s} E={E} from={0} to={shownL} />
            <polyline points={pts(s, wave.xs, wave.psi.map((v) => E + SCALE * v))} fill="none" stroke={C.position} strokeWidth={3} />
          </>}
          <Handle s={s} at={[L, 7.1]} step={0.005} color={C.soft} label="Right-hand wall: drag in or out"
            clamp={(p) => [Math.min(L_MAX, Math.max(L_MIN, p[0])), 7.1]}
            onChange={(p) => {
              const nl = Math.round(p[0] * 1000) / 1000;
              setL(nl);
              if (Math.abs(nl - (squeezed ?? -1)) > 1e-9) setSqueezed(null);
              task.touch();
            }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Electron in its lowest level · the wave is drawn on its energy line · drag the right-hand wall, then squeeze · dots: your earlier squeezes
      </p>
    </SceneCard>
  );
}
