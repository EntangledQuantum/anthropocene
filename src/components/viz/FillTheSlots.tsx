import { useState } from 'react';
import { ELEMENTS, aufbau, configString, fillingOrder, shellCapacity } from '../../lib/physics/aufbau.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * The filling diagram. Every box is one standing wave (n, l, m); its two halves
 * are the two spins. Click a half to put an electron there or take it away.
 * Columns are shells (n); rows climb in the order the slots fill in a real
 * atom (`fillingOrder`, the Madelung rule, pinned against H…Ca in
 * aufbau.test.ts), so 3d sits above 4s. The notation under the diagram is
 * written live from your boxes, and each shell counts itself against 2n².
 *
 * Graded (`id`): place the ground state of element `z`. Any arrangement inside
 * a half-full subshell is accepted; what is checked is the count and that no
 * lower slot has a hole while a higher one is used.
 */
export interface FillTheSlotsProps {
  id?: string;
  prompt?: string;
  z?: number;
  explanation?: string;
}

const ORDER = fillingOrder().slice(0, 7); // 1s 2s 2p 3s 3p 4s 3d
const SHELLS = [1, 2, 3, 4];

export default function FillTheSlots({ id, prompt, z = 11, explanation }: FillTheSlotsProps) {
  const task = useTask(id, 'fill-the-slots');
  const [on, setOn] = useState<Set<string>>(new Set());
  const el = ELEMENTS[z - 1];

  const toggle = (key: string) => {
    setOn((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    task.touch();
  };

  const count = (label: string) => [...on].filter((k) => k.startsWith(`${label}:`)).length;
  const occ = ORDER.map((s) => ({ ...s, count: count(s.label) }));
  const total = occ.reduce((a, o) => a + o.count, 0);

  let hole: { lower: string; empty: number; higher: string } | null = null;
  for (let i = 0; i < occ.length && !hole; i++) {
    if (occ[i].count >= occ[i].capacity) continue;
    const higher = occ.slice(i + 1).find((o) => o.count > 0);
    if (higher) hole = { lower: occ[i].label, empty: occ[i].capacity - occ[i].count, higher: higher.label };
  }
  const good = total === z && !hole;
  const truth = configString(aufbau(z));

  const miss = total !== z
    ? `${total} electron${total === 1 ? '' : 's'} placed. A neutral ${el.name.toLowerCase()} atom has ${z}.`
    : hole
      ? `${hole.lower} still has ${hole.empty} empty place${hole.empty === 1 ? '' : 's'} while an electron sits in ${hole.higher}, higher up. That electron would drop down and give off light.`
      : '';

  const rows = ORDER.length;
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Electrons placed" value={`${total} of ${z}`} color={total === z ? C.ok : C.ink} />
          <Meter label="Your configuration" value={configString(occ) || '—'} color={C.position} />
          <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }} onClick={() => { setOn(new Set()); task.touch(); }}>Empty the atom</button>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(good, { config: configString(occ) })}
          miss={miss}
          hit={explanation ? `${el.name}: ${truth}. ${explanation}` : `${el.name}: ${truth}.`} />}
      </div>}>
      <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${SHELLS.length}, minmax(0, auto))`, gridTemplateRows: `repeat(${rows}, 44px) auto`,
        columnGap: 26, rowGap: 6, alignItems: 'center', justifyContent: 'center', padding: '6px 0 2px' }}>
        <div style={{ gridColumn: 1, gridRow: `1 / ${rows + 1}`, display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch', gap: 6 }}>
          <span className="hud-label" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>fills from the bottom up</span>
          <span aria-hidden="true" style={{ flex: 1, width: 2, background: 'var(--color-rule-bright)' }} />
        </div>
        {ORDER.map((s, i) => (
          <div key={s.label} style={{ gridColumn: s.n + 1, gridRow: rows - i, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="readout" style={{ width: 26, fontSize: 15, color: C.soft }}>{s.label}</span>
            {Array.from({ length: 2 * s.l + 1 }, (_, m) => (
              <span key={m} style={{ display: 'inline-flex', border: '1.5px solid var(--color-rule-bright)', borderRadius: 4, overflow: 'hidden' }}>
                {(['up', 'down'] as const).map((spin) => {
                  const key = `${s.label}:${m}:${spin}`;
                  const filled = on.has(key);
                  return <button key={spin} type="button" onClick={() => toggle(key)}
                    aria-label={`${s.label} box ${m + 1}, spin ${spin}: ${filled ? 'remove electron' : 'add electron'}`}
                    aria-pressed={filled}
                    style={{ width: 22, height: 32, border: 'none', borderLeft: spin === 'down' ? '1px solid var(--color-rule)' : 'none',
                      background: filled ? 'color-mix(in srgb, var(--color-iris) 22%, var(--color-surface))' : 'transparent',
                      color: C.position, fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: 0 }}>
                    {filled ? (spin === 'up' ? '↑' : '↓') : ''}
                  </button>;
                })}
              </span>
            ))}
          </div>
        ))}
        {SHELLS.map((n) => {
          const inShell = occ.filter((o) => o.n === n).reduce((a, o) => a + o.count, 0);
          const shown = ORDER.filter((o) => o.n === n).reduce((a, o) => a + o.capacity, 0);
          const full = shown === shellCapacity(n) && inShell === shown;
          return <div key={n} className="hud-label" style={{ gridColumn: n + 1, gridRow: rows + 1, paddingTop: 6, borderTop: '1px solid var(--color-rule)', color: full ? C.ok : undefined }}>
            shell n = {n}: {inShell} of {shown === shellCapacity(n) ? shown : `${shown} shown`}{full ? ', full' : ''}
          </div>;
        })}
      </div>
    </SceneCard>
  );
}
