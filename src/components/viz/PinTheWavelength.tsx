import { useEffect, useRef, useState } from 'react';
import { C as LIGHT, meltedSpots, speedFromPins, standingField, wavelength } from '../../lib/physics/emwaves.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A bar of chocolate after twenty seconds in a microwave oven with the
 * turntable taken out. It melted in spots. Two pins go on the bar; the scene
 * multiplies their spacing by the frequency on the oven's label and calls the
 * answer the speed of light. Put them one wavelength apart and it is right.
 *
 * The trap is that each spot is not a wavelength: the heating goes as E², so
 * the up-loop and the down-loop of the standing wave both melt, and spots come
 * every half wavelength. After the first check the standing field itself is
 * drawn over the bar, so a miss shows its own reason.
 *
 * Graded with `id`. Physics: `wavelength` / `meltedSpots` / `standingField` /
 * `speedFromPins` in src/lib/physics/emwaves.ts — one standing wave along the
 * bar, zero at the oven's metal wall.
 */
export interface PinTheWavelengthProps {
  id?: string;
  prompt?: string;
  /** Oven frequency, GHz. */
  freqGHz?: number;
  explanation?: string;
}

const BAR: [number, number] = [2, 32]; // cm from the wall
const MELT = 0.72;                      // heating, as a fraction of the peak, that melts in the time cooked
const WAVE_Y = 4.2, WAVE_A = 1.6;

export default function PinTheWavelength({ id, prompt, freqGHz = 2.45, explanation }: PinTheWavelengthProps) {
  const task = useTask(id, 'pin-the-wavelength');
  const f = freqGHz * 1e9;
  const lam = wavelength(f) * 100; // cm
  const spots = meltedSpots(lam, BAR[0], BAR[1], MELT);
  const [pins, setPins] = useState<[number, number]>([8, 12]);
  const showField = task.attempts > 0 || task.done;
  const api = useRef<StageApi | null>(null);
  const curve = useRef<SVGPolylineElement | null>(null);

  useEffect(() => {
    if (!showField) return;
    let raf = 0;
    const frame = (now: number) => {
      const s = api.current;
      if (s && curve.current) {
        const ph = (now / 1000) * 2.4;
        const pts: string[] = [];
        for (let i = 0; i <= 240; i++) {
          const x = (34 * i) / 240;
          pts.push(`${s.sx(x).toFixed(1)},${s.sy(WAVE_Y + WAVE_A * standingField(x, lam, ph)).toFixed(1)}`);
        }
        curve.current.setAttribute('points', pts.join(' '));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [showField, lam]);

  const spacing = Math.abs(pins[1] - pins[0]);
  const v = speedFromPins(spacing / 100, f);
  const hit = Math.abs(spacing - lam) <= 0.04 * lam;
  const setPin = (i: 0 | 1, x: number) => {
    const next: [number, number] = [...pins];
    next[i] = Math.round(Math.max(BAR[0], Math.min(BAR[1], x)) * 10) / 10;
    setPins(next);
    task.touch();
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Pins apart" value={spacing.toFixed(1)} unit="cm" color={C.position} />
          <Meter label="Oven label" value={freqGHz.toFixed(2)} unit="GHz" color={C.soft} />
          <Meter label="Spacing × frequency" value={(v / 1e8).toFixed(2)} unit="× 10⁸ m/s" />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { spacing })}
          miss={`Pins ${spacing.toFixed(1)} cm apart make light ${(v / 1e8).toFixed(2)} × 10⁸ m/s, ${(v / LIGHT).toFixed(2)} times its measured speed.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.2, 34.5]} y={[-4.4, 6.6]} height={214} equal
        label={`A chocolate bar melted in ${spots.length} spots. Pins at ${pins[0].toFixed(1)} and ${pins[1].toFixed(1)} centimetres.`}>
        {(s) => {
          api.current = s;
          return <g>
            {/* the oven's metal wall */}
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(6.4)} y2={s.sy(-2.4)} stroke={C.soft} strokeWidth={5} />
            <text x={s.sx(0) + 6} y={s.sy(-2.4) + 2} fontSize={12} fill={C.soft}>metal wall</text>
            {/* the bar, its squares, and where it melted */}
            <rect x={s.sx(BAR[0])} y={s.sy(1.4)} width={s.len(BAR[1] - BAR[0])} height={s.len(2.8)} rx={4} fill={C.surface} stroke={C.faint} strokeWidth={1.5} />
            {Array.from({ length: 9 }, (_, k) => <line key={k} x1={s.sx(BAR[0] + (k + 1) * 3)} x2={s.sx(BAR[0] + (k + 1) * 3)} y1={s.sy(1.4)} y2={s.sy(-1.4)} stroke={C.rule} />)}
            {spots.map((m, k) => (
              <ellipse key={k} cx={s.sx(m.centre)} cy={s.sy(0)} rx={s.len((m.to - m.from) / 2)} ry={s.len(1.25)}
                fill={C.energy} opacity={0.38} stroke={C.energy} strokeWidth={1.2} />
            ))}
            {spots.length > 0 && <text x={s.sx(spots[0].centre)} y={s.sy(1.4) - 6} textAnchor="middle" fontSize={12} fill={C.energy}>melted</text>}
            {/* the standing field, once revealed */}
            {showField && <g>
              <line x1={s.sx(0)} x2={s.sx(34)} y1={s.sy(WAVE_Y)} y2={s.sy(WAVE_Y)} stroke={C.grid} />
              {[1, -1].map((sg) => <polyline key={sg} fill="none" stroke={C.field} strokeWidth={1} strokeDasharray="3 4" opacity={0.5}
                points={Array.from({ length: 241 }, (_, i) => { const x = (34 * i) / 240; return `${s.sx(x).toFixed(1)},${s.sy(WAVE_Y + sg * WAVE_A * Math.abs(standingField(x, lam, 0))).toFixed(1)}`; }).join(' ')} />)}
              <polyline ref={curve} fill="none" stroke={C.field} strokeWidth={2.2} />
              <text x={s.sx(34)} y={s.sy(WAVE_Y + WAVE_A) - 4} textAnchor="end" fontSize={12} fill={C.field}>E along the bar</text>
            </g>}
            {/* ruler */}
            <line x1={s.sx(0)} x2={s.sx(34)} y1={s.sy(-3.1)} y2={s.sy(-3.1)} stroke={C.faint} />
            {Array.from({ length: 35 }, (_, cm) => (
              <g key={cm}>
                <line x1={s.sx(cm)} x2={s.sx(cm)} y1={s.sy(-3.1)} y2={s.sy(cm % 5 === 0 ? -3.6 : -3.35)} stroke={C.faint} />
                {cm % 5 === 0 && <text x={s.sx(cm)} y={s.sy(-3.6) + 13} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{cm}</text>}
              </g>
            ))}
            <text x={s.sx(34.4)} y={s.sy(-3.6) + 13} textAnchor="end" fontSize={11} fill={C.faint}>cm</text>
            {/* the pins */}
            {([0, 1] as const).map((i) => <g key={i}>
              <line x1={s.sx(pins[i])} x2={s.sx(pins[i])} y1={s.sy(1.9)} y2={s.sy(-3.1)} stroke={C.position} strokeWidth={1.5} strokeDasharray="3 3" />
              <Handle s={s} at={[pins[i], 0]} step={0.1} color={C.position} label={`Pin ${i + 1}: drag along the bar`}
                onChange={(p) => setPin(i, p[0])} clamp={(p) => [p[0], 0]} />
            </g>)}
          </g>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Seen from above · turntable removed · aqua: where the chocolate took in enough energy to melt
      </p>
    </SceneCard>
  );
}
