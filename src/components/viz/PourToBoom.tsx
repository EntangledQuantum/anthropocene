import { useEffect, useRef, useState } from 'react';
import {
  BOOM_TUBE, closedTubeDisplacement, closedTubeResonantLengths, closedTubeResponse, responseDb,
} from '../../lib/physics/sound.ts';
import { startTones, type Tones } from './sound-tones.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A glass tube, closed at the bottom by water, with a 440 Hz tuning fork
 * humming over its mouth. One control: the water level. Pour, and the air
 * column shortens; at a length that fits the fork's wave, the column booms.
 *
 * The air inside is drawn as layers, each shuffling up and down by the
 * standing-wave amplitude at its height: still at the water (a wall), widest
 * at the mouth. Off resonance they barely stir.
 *
 * With `id`, graded: find the shortest air column that booms. There are two
 * booms in this tube, a quarter-wave and three quarter-waves, and the longer
 * one arrives first as you pour.
 * Physics: `closedTubeDisplacement` / `closedTubeResponse` in sound.ts.
 */
export interface PourToBoomProps {
  id?: string;
  prompt?: string;
  /** Starting air column, cm. */
  start?: number;
  explanation?: string;
}

const { f: F, v: V, alpha: ALPHA, height, tolerance } = BOOM_TUBE;
const TUBE = height * 100;   // cm
const R = 5;                 // tube half-width, cm
const WIGGLE = 1.5;          // Hz, drawn oscillation (slowed)

export default function PourToBoom({ id, prompt, start = 66, explanation }: PourToBoomProps) {
  const task = useTask(id, 'pour-to-boom');
  const [air, setAir] = useState(start); // cm of air column
  const airRef = useRef(start);
  const stage = useRef<StageApi | null>(null);
  const layers = useRef<SVGPathElement>(null);
  const tones = useRef<Tones | null>(null);
  const [sound, setSound] = useState(false);

  const L = air / 100;
  const resp = closedTubeResponse(L, F, V, ALPHA);
  const db = responseDb(resp);
  const [first, second] = closedTubeResonantLengths(F, V, height);

  useEffect(() => { tones.current?.set([F], Math.min(1, 0.08 + resp / 10)); }, [resp]);
  useEffect(() => () => tones.current?.stop(), []);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const s = stage.current;
      if (s) {
        const a = airRef.current, Lm = a / 100, water = TUBE - a;
        const phase = Math.sin(2 * Math.PI * WIGGLE * now / 1000);
        let d = '';
        for (let y = 1; y < a; y += 2) {
          const amp = Math.min(2.4, 0.22 * closedTubeDisplacement(y / 100, Lm, F, V, ALPHA));
          const yy = s.sy(water + y + amp * phase);
          d += `M${s.sx(-R + 0.6).toFixed(1)},${yy.toFixed(1)}H${s.sx(R - 0.6).toFixed(1)}`;
        }
        layers.current?.setAttribute('d', d);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setLevel = (cm: number) => {
    const a = Math.round(Math.min(TUBE - 2, Math.max(2, cm)) * 2) / 2;
    airRef.current = a; setAir(a); task.touch();
  };
  const toggleSound = () => {
    if (sound) { tones.current?.stop(); tones.current = null; setSound(false); return; }
    tones.current = startTones(1);
    tones.current?.set([F], Math.min(1, 0.08 + resp / 10));
    setSound(true);
  };

  const hitNow = Math.abs(L - first) <= tolerance;
  const dbText = `${db >= 0 ? '+' : '−'}${Math.abs(db).toFixed(0)} dB`;
  const miss = Math.abs(L - second) <= 0.03
    ? `It booms, ${dbText}, with ${air.toFixed(1)} cm of air. That is not the shortest column that booms.`
    : `${air.toFixed(1)} cm of air reads ${dbText}. A booming column reads above +10 dB.`;
  const glow = Math.min(1, Math.max(0, (db - 2) / 16));
  const water = TUBE - air;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={toggleSound}>{sound ? 'Sound off' : 'Sound on'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Air column" value={air.toFixed(1)} unit="cm" />
            <Meter label="Loudness at the mouth" value={dbText} color={glow > 0.5 ? C.energy : C.ink} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { air })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-30, 30]} y={[-5, 92]} height={440} equal
        label={`A glass tube with ${air.toFixed(1)} centimetres of air above the water, under a 440 hertz fork. Loudness ${dbText}.`}>
        {(s) => { stage.current = s; return <>
          {/* ruler: air column measured down from the mouth */}
          {Array.from({ length: 8 }, (_, i) => i * 10).map((c) => <g key={c}>
            <line x1={s.sx(R + 1)} x2={s.sx(R + 2.5)} y1={s.sy(TUBE - c)} y2={s.sy(TUBE - c)} stroke={C.faint} />
            <text x={s.sx(R + 3.5)} y={s.sy(TUBE - c) + 4} fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{c}</text>
          </g>)}
          <text x={s.sx(R + 9)} y={s.sy(TUBE) + 4} fontSize={12} fill={C.faint}>cm below the mouth</text>
          {/* water */}
          <rect x={s.sx(-R)} y={s.sy(water)} width={s.len(2 * R)} height={s.sy(0) - s.sy(water)} fill={C.soft} opacity={0.2} />
          <line x1={s.sx(-R)} x2={s.sx(R)} y1={s.sy(water)} y2={s.sy(water)} stroke={C.ink} strokeWidth={2} />
          {/* the air, layer by layer */}
          <path ref={layers} stroke={C.position} strokeWidth={1.6} opacity={0.85} />
          {/* glass */}
          <path d={`M${s.sx(-R)},${s.sy(TUBE)}V${s.sy(0)}H${s.sx(R)}V${s.sy(TUBE)}`} fill="none" stroke={C.soft} strokeWidth={2.5} />
          {/* the fork over the mouth */}
          <g stroke={C.ink} strokeWidth={2.5} fill="none" strokeLinecap="round">
            <path d={`M${s.sx(-2)},${s.sy(74)}V${s.sy(80)}Q${s.sx(-2)},${s.sy(82)} ${s.sx(0)},${s.sy(82)}Q${s.sx(2)},${s.sy(82)} ${s.sx(2)},${s.sy(80)}V${s.sy(74)}`} />
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(82)} y2={s.sy(90)} />
          </g>
          <text x={s.sx(4)} y={s.sy(84)} fontSize={13} fill={C.soft}>440 Hz fork</text>
          {/* sound leaving the mouth, as strong as the column sings */}
          {[6, 11, 16].map((r, i) => <path key={r} d={`M${s.sx(-r)},${s.sy(TUBE + 1)}A${s.len(r)},${s.len(r)} 0 0,1 ${s.sx(-R - 1)},${s.sy(TUBE + r * 0.8)}`}
            fill="none" stroke={C.energy} strokeWidth={2} opacity={glow * (1 - i * 0.25)} />)}
          <Handle s={s} at={[0, water]} color={C.ink} step={0.5} label="Water level: pour up or drain down"
            onChange={(p) => setLevel(TUBE - p[1])} />
          <text x={s.sx(-R - 2)} y={s.sy(water) + 4} textAnchor="end" fontSize={13} fill={C.soft}>drag the water</text>
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>Violet lines: layers of air, their motion exaggerated and slowed · 0 dB is a column one-eighth of a wavelength long</p>
    </SceneCard>
  );
}
