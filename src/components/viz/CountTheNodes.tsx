import { useMemo, useState } from 'react';
import { energyEV, nodeCount, radius99, stateName } from '../../lib/physics/hydrogen.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { CloudKey, CloudStage, Nucleus, PmScaleBar } from './atom-kit-ch41.tsx';

/**
 * Step through hydrogen's standing waves with two controls, n and l (m = 0).
 * The cloud is a per-pixel slice, so every node shows as a sharp dark curve:
 * dark circles where R_nl changes sign, dark straight lines through the
 * nucleus where Y_l0 does. The view zooms to fit each cloud, and the scale bar
 * says by how much. The energy meter sits beside it and moves only with n.
 *
 * Graded (`id` + `target`): make a cloud with the target number of dark circles
 * and dark lines. Counts come from `nodeCount` (hydrogen.ts), pinned in
 * hydrogen.test.ts: n − l − 1 and l.
 */
export interface CountTheNodesProps {
  id?: string;
  prompt?: string;
  start?: [number, number];
  maxN?: number;
  /** Dark circles and dark lines the cloud must show. */
  target?: { radial: number; angular: number };
  explanation?: string;
}

const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

export default function CountTheNodes({ id, prompt, start = [1, 0], maxN = 4, target, explanation }: CountTheNodesProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'count-the-nodes');
  const [n, setN] = useState(start[0]);
  const [l, setL] = useState(start[1]);
  const half = useMemo(() => radius99(n, l) * 0.78, [n, l]);
  const nodes = nodeCount(n, l, 0);
  const good = !!target && nodes.radial === target.radial && nodes.angular === target.angular;

  const setState = (nn: number, ll: number) => {
    const n2 = Math.max(1, Math.min(maxN, nn));
    const l2 = Math.max(0, Math.min(n2 - 1, ll));
    setN(n2); setL(l2);
    task.touch();
  };

  const stepper = (label: string, value: number, dec: () => void, inc: () => void, decOk: boolean, incOk: boolean) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="hud-label">{label}</span>
      <button type="button" className="anth-btn" aria-label={`Lower ${label}`} disabled={!decOk} onClick={dec} style={{ padding: '6px 14px', fontSize: 16 }}>−</button>
      <span className="readout" style={{ fontSize: 20, minWidth: 18, textAlign: 'center' }}>{value}</span>
      <button type="button" className="anth-btn" aria-label={`Raise ${label}`} disabled={!incOk} onClick={inc} style={{ padding: '6px 14px', fontSize: 16 }}>+</button>
    </div>
  );

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          {stepper('n', n, () => setState(n - 1, l), () => setState(n + 1, l), n > 1, n < maxN)}
          {stepper('l', l, () => setState(n, l - 1), () => setState(n, l + 1), l > 0, l < n - 1)}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="State" value={stateName(n, l)} color={C.position} />
            <Meter label="Energy" value={energyEV(n).toFixed(2)} unit="eV" color={C.energy} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(good, { n, l })}
          miss={`This is ${stateName(n, l)}: ${plural(nodes.radial, 'dark circle', 'dark circles')} and ${plural(nodes.angular, 'dark line', 'dark lines')} through the nucleus.`}
          hit={explanation} />}
      </div>}>
      <CloudStage state={{ n, l }} half={half} stage={(capture) =>
        <Stage x={[-half, half]} y={[-half, half]} height={360} equal
          label={`Hydrogen ${stateName(n, l)} cloud, energy ${energyEV(n).toFixed(2)} electron-volts.`}>
          {(s) => { capture(s); return <>
            <Nucleus s={s} />
            <PmScaleBar s={s} />
            <text x={s.W - 14} y={24} textAnchor="end" fontSize={14} fill={C.soft}>hydrogen, n = {n}, l = {l}, m = 0</text>
            {target && <text x={s.W - 14} y={46} textAnchor="end" fontSize={13} fill={C.faint}>
              wanted: {plural(target.radial, 'dark circle', 'dark circles')}, {plural(target.angular, 'dark line', 'dark lines')}
            </text>}
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}><CloudKey /></p>
    </SceneCard>
  );
}
