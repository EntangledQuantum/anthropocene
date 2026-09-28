import { useState } from 'react';
import { centreAt, fanCrossing, fanFrom, heightAt, principalRays, spreadAt, type LensRay } from '../../lib/physics/optics.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ArrowMark, AxisScale, Beam, Lens } from './optics-kit-ch34.tsx';

/**
 * A candle (an arrow), a converging lens and a screen you slide along the
 * axis. A fan of rays from the candle's tip is traced through the lens
 * (`fanFrom`); where it lands on the screen is the blur spot, and its width is
 * measured, not drawn to taste (`spreadAt`). The small card on the right is
 * what you would see on the screen: the candle's image, blurred by that much.
 *
 * Graded with `objects`: focus the screen for each candle distance in turn.
 * Each sharp position is written into the table; after the last, the table
 * gains a column of 1/dₒ + 1/dᵢ and the three principal rays are drawn over
 * the last fan. With `cover`, part of the lens is blocked by a card.
 */
export interface FocusTheScreenProps {
  id?: string;
  prompt?: string;
  f?: number;
  /** Half-height of the lens, cm. */
  R?: number;
  /** Candle height, cm. */
  h?: number;
  /** Candle distances to focus, in order, cm. */
  objects?: number[];
  screen?: number;
  cover?: 'top' | 'bottom';
  /** Widest blur spot that counts as sharp, cm. */
  tolerance?: number;
  explanation?: string;
}

const XR = 44, YR = 4.8, N = 16;

export default function FocusTheScreen({
  id, prompt, f = 10, R = 3.5, h = 1.5, objects = [30, 20, 15], screen = 38, cover, tolerance = 0.15, explanation,
}: FocusTheScreenProps) {
  const task = useTask(id, 'focus-the-screen');
  const [x, setX] = useState(screen);
  const [k, setK] = useState(0);
  const [log, setLog] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const dObj = objects[Math.min(k, objects.length - 1)];

  const tip = fanFrom(dObj, h, f, R, N, cover ?? 'none');
  const foot = fanFrom(dObj, 0, f, R, N, cover ?? 'none');
  const blocked = cover ? fanFrom(dObj, h, f, R, N).filter((r) => (cover === 'top' ? r.y > 0 : r.y < 0)) : [];
  const blur = spreadAt(tip, x);
  const cross = fanCrossing(tip);
  const sharp = blur <= tolerance;
  const light = tip.length / N;
  const done = task.done;
  const pr = done ? principalRays(dObj, h, f) : null;

  const onCheck = () => {
    if (!sharp) { task.check(false, { dObj, x }); return; }
    const next = [...log, x];
    setLog(next);
    if (k + 1 < objects.length) {
      setNote(`Sharp at ${x.toFixed(1)} cm. The candle now moves to ${objects[k + 1]} cm.`);
      setK(k + 1);
    } else {
      setNote('');
      task.check(true, { found: next });
    }
  };
  const dx = cross.x - x;
  const miss = `The spot from the candle's tip is ${(blur * 10).toFixed(1)} mm across: its rays cross ${Math.abs(dx).toFixed(1)} cm ${dx > 0 ? 'beyond' : 'in front of'} your screen.`;

  // What the screen shows: the candle's image, blurred by the measured spot.
  const cardH = 110, px = 16; // px per cm on the card
  const tipY = centreAt(tip, x), footY = centreAt(foot, x);
  const sigma = Math.max(0.01, (blur * px) / 4);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Meter label="Candle to lens" value={dObj.toFixed(0)} unit="cm" color={C.position} />
          <Meter label="Screen to lens" value={x.toFixed(1)} unit="cm" />
          <Meter label="Blur spot" value={(blur * 10).toFixed(1)} unit="mm" color={C.energy} />
          {id && <table className="readout" style={{ marginLeft: 'auto', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: C.faint }}>
              <td style={{ padding: '0 10px' }}>dₒ (cm)</td><td style={{ padding: '0 10px' }}>sharp at dᵢ (cm)</td>
              {done && <td style={{ padding: '0 10px' }}>1/dₒ + 1/dᵢ (1/cm)</td>}
            </tr></thead>
            <tbody>{objects.map((o, i) => <tr key={o} style={{ color: i === k && !done ? C.ink : C.soft }}>
              <td style={{ padding: '0 10px' }}>{o}</td>
              <td style={{ padding: '0 10px' }}>{log[i] !== undefined ? log[i].toFixed(1) : '?'}</td>
              {done && <td style={{ padding: '0 10px', color: C.energy }}>{(1 / o + 1 / log[i]).toFixed(3)}</td>}
            </tr>)}</tbody>
          </table>}
        </div>
        {id && <CheckBar verdict={task.verdict} done={done} onCheck={onCheck} miss={miss} hit={explanation} />}
        {note && !done && <p style={{ margin: 0, color: C.ok, fontSize: '0.96rem' }}>{note}</p>}
      </div>}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Stage x={[-34, XR]} y={[-YR, YR]} height={300}
            label={`A candle ${dObj} centimetres from a lens of focal length ${f} centimetres, and a screen ${x.toFixed(1)} centimetres behind it. The blur spot is ${(blur * 10).toFixed(1)} millimetres across.`}>
            {(s) => {
              const lit = (r: LensRay): Vec => [x, heightAt(r, x)];
              return <>
                <AxisScale s={s} from={-34} to={XR} step={5} every={10} unit="cm" />
                {tip.map((r, i) => <g key={i}>
                  <Beam s={s} from={[-dObj, h]} to={[0, r.y]} opacity={done ? 0.25 : 0.55} width={1} />
                  <Beam s={s} from={[0, r.y]} to={lit(r)} opacity={done ? 0.25 : 0.55} width={1} />
                </g>)}
                {blocked.map((r, i) => <Beam key={`b${i}`} s={s} from={[-dObj, h]} to={[0, r.y]} opacity={0.25} width={1} />)}
                {pr && ([['1', pr.parallel], ['2', pr.centre], ['3', pr.focal]] as const).map(([n, r]) => <g key={n}>
                  <Beam s={s} from={[-dObj, h]} to={[0, r.y]} color={C.field} opacity={1} width={2} />
                  <Beam s={s} from={[0, r.y]} to={lit(r)} color={C.field} opacity={1} width={2} />
                  <text x={s.sx(-dObj / 2) } y={s.sy(h + ((r.y - h) / 2)) - 6} fontSize={13} fill={C.field} textAnchor="middle"
                    stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{n}</text>
                </g>)}
                <Lens s={s} R={R} f={f} cover={cover} />
                <ArrowMark s={s} x={-dObj} h={h} label="candle" />
                {(done || !id) && sharp && <ArrowMark s={s} x={x} h={tipY} label="image" />}
                <rect x={s.sx(x) - 3} y={s.sy(YR - 0.9)} width={6} height={s.sy(-YR + 0.2) - s.sy(YR - 0.9)} fill={C.soft} opacity={0.55} rx={2} />
                <line x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(heightAt(tip[0], x))} y2={s.sy(heightAt(tip[tip.length - 1], x))}
                  stroke={C.energy} strokeWidth={7} strokeLinecap="round" opacity={0.9} />
                <Handle s={s} at={[x, YR - 0.6]} step={0.5} label="Screen: drag along the axis"
                  clamp={(p) => [Math.max(3, Math.min(XR - 1, p[0])), YR - 0.6]}
                  onChange={(p) => { setX(Math.round(p[0] * 10) / 10); task.touch(); }} />
              </>;
            }}
          </Stage>
        </div>
        <div style={{ width: 118, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="hud-label">On the screen</span>
          <svg viewBox={`0 0 110 ${cardH}`} style={{ width: '100%', background: 'var(--color-abyss)', borderRadius: 4, border: '1px solid var(--color-rule)' }}
            role="img" aria-label={`The screen shows the candle's image, blurred by ${(blur * 10).toFixed(1)} millimetres.`}>
            <defs><filter id={`blur-${id ?? 'free'}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={sigma} /></filter></defs>
            <g filter={`url(#blur-${id ?? 'free'})`} opacity={0.25 + 0.75 * light}>
              <line x1={55} x2={55} y1={cardH / 2 - footY * px} y2={cardH / 2 - tipY * px} stroke={C.position} strokeWidth={4} strokeLinecap="round" />
              <circle cx={55} cy={cardH / 2 - tipY * px} r={5} fill={C.position} />
            </g>
          </svg>
          <span style={{ fontSize: 12, color: C.faint, lineHeight: 1.4 }}>{Math.round(light * 100)}% of the light</span>
        </div>
      </div>
    </SceneCard>
  );
}
