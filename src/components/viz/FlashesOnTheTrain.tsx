import { useRef, useState } from 'react';
import {
  CH37_TRAIN, addVelocity, arrivalGapOnWatchUs, boost, ctToUs, flashArrivals, trainStrikes, usToCt, type Event,
} from '../../lib/physics/relativity.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { fmtSigned, useFrame } from './relativity-kit-ch37.tsx';

/**
 * Lightning hits both ends of a train moving at 0.6c; a passenger sits halfway
 * along. The flashes run toward her and the scene marks which reaches her
 * first. One toggle replays the same events from the platform or from the
 * train: every object is drawn by Lorentz-transforming its worldline, so the
 * train view is computed, not redrawn by hand.
 *
 * Ungraded: strikes simultaneous on the platform. Graded (id): the learner
 * delays the front strike (platform clock) until both flashes reach her together.
 * Physics: `trainStrikes`, `flashArrivals`, `boost` in src/lib/physics/relativity.ts.
 */
export interface FlashesOnTheTrainProps {
  id?: string;
  prompt?: string;
  /** Watch-gap tolerance, µs. */
  tolerance?: number;
  explanation?: string;
}

type Frame = 'platform' | 'train';
const B = CH37_TRAIN.beta;
const PLAY = 170;        // metres of ct per second of screen time
const SPAN_M = 900;      // metres across the canvas
const DELAY_US: [number, number] = [-0.5, 2];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function FlashesOnTheTrain({ id, prompt, tolerance = 0.04, explanation }: FlashesOnTheTrainProps) {
  const task = useTask(id, 'flashes-on-the-train');
  const [frame, setFrame] = useState<Frame>('platform');
  const [delayUs, setDelayUs] = useState(0);
  const cfg = useRef({ frame, delayUs });
  cfg.current = { frame, delayUs };
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef({ T: NaN, hold: 0, key: '' });
  const colors = useRef<Record<string, string> | null>(null);

  useFrame((dt) => {
    const el = canvas.current;
    if (!el) return;
    if (!colors.current) colors.current = {
      ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'), rule: cssVar('--color-rule-bright'),
      grid: cssVar('--color-rule'), v: cssVar('--color-cyan'), pos: cssVar('--color-iris'), surf: cssVar('--color-surface'), ok: cssVar('--color-ok'),
    };
    const c = colors.current;
    const { frame: fr, delayUs: dUs } = cfg.current;
    const bf = fr === 'platform' ? 0 : B;
    const d = usToCt(dUs);
    const { L, rear, front } = trainStrikes(d);
    const arr = flashArrivals(d);
    const E = { rear: boost(rear, bf), front: boost(front, bf), aRear: boost(arr.rear, bf), aFront: boost(arr.front, bf) };
    const tMin = Math.min(E.rear.ct, E.front.ct) - 110, tMax = Math.max(E.aRear.ct, E.aFront.ct) + 140;
    const k = clock.current;
    const key = `${fr}:${dUs.toFixed(4)}`;
    if (k.key !== key || !Number.isFinite(k.T)) { k.key = key; k.T = tMin; k.hold = 0; }
    if (k.T < tMax) k.T = Math.min(tMax, k.T + dt * PLAY);
    else if ((k.hold += dt) > 1.4) { k.T = tMin; k.hold = 0; }
    const T = k.T;

    const wT = addVelocity(B, -bf), wP = -bf;
    const along = (e0: Event, w: number) => { const e = boost(e0, bf); return e.x + w * (T - e.ct); };
    const midP = boost({ x: L / 2, ct: 0 }, bf);
    const center = midP.x + wT * ((tMin + tMax) / 2 - midP.ct);

    const dpr = window.devicePixelRatio || 1;
    const Wd = el.clientWidth, Ht = el.clientHeight;
    if (el.width !== Math.round(Wd * dpr)) { el.width = Math.round(Wd * dpr); el.height = Math.round(Ht * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);
    const px = (x: number) => Wd / 2 + ((x - center) / SPAN_M) * Wd;
    const yTop = 118, yBot = 158, yTrack = 170, yPulse = 138;

    // header
    g.font = '15px Inter, sans-serif'; g.fillStyle = c.ink; g.textAlign = 'left';
    g.fillText(fr === 'platform' ? 'Seen from the platform' : 'Seen from the train', 12, 18);
    g.font = '14px ui-monospace, monospace'; g.fillStyle = c.soft; g.textAlign = 'right';
    g.fillText(`${fr} clock  ${ctToUs(T).toFixed(2)} µs`, Wd - 12, 18);

    // platform: track and ticks every 50 m, labelled every 100 m, moving at wP
    g.strokeStyle = c.rule; g.lineWidth = 2; g.beginPath(); g.moveTo(0, yTrack); g.lineTo(Wd, yTrack); g.stroke();
    g.font = '11.5px ui-monospace, monospace'; g.textAlign = 'center';
    for (let p = -600; p <= 1400; p += 50) {
      const x = px(along({ x: p, ct: 0 }, wP));
      if (x < -20 || x > Wd + 20) continue;
      g.strokeStyle = c.faint; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, yTrack); g.lineTo(x, yTrack + (p % 100 ? 5 : 9)); g.stroke();
      if (p % 100 === 0) { g.fillStyle = c.faint; g.fillText(`${p}`, x, yTrack + 22); }
    }
    g.textAlign = 'left'; g.fillStyle = c.faint; g.font = '12px Inter, sans-serif';
    g.fillText('platform, metres', 12, yTrack + 40);

    // scorch marks on the platform, where each strike landed
    for (const s of [rear, front]) {
      const e = boost(s, bf);
      if (T < e.ct) continue;
      const x = px(e.x + wP * (T - e.ct));
      g.strokeStyle = c.soft; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 5, yTrack - 5); g.lineTo(x + 5, yTrack + 5); g.moveTo(x + 5, yTrack - 5); g.lineTo(x - 5, yTrack + 5); g.stroke();
    }

    // the train
    const xr = px(along({ x: 0, ct: 0 }, wT)), xf = px(along({ x: L, ct: 0 }, wT)), xp = px(along({ x: L / 2, ct: 0 }, wT));
    g.fillStyle = c.surf; g.strokeStyle = c.soft; g.lineWidth = 2;
    g.beginPath(); g.roundRect(xr, yTop, xf - xr, yBot - yTop, 6); g.fill(); g.stroke();
    g.fillStyle = c.pos; g.beginPath(); g.arc(xp, yPulse - 8, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = c.pos; g.lineWidth = 2.5; g.beginPath(); g.moveTo(xp, yPulse - 3); g.lineTo(xp, yBot - 4); g.stroke();

    // who is moving
    const moverY = fr === 'platform' ? yTop - 14 : yTrack + 60;
    const mx0 = fr === 'platform' ? xr + 8 : Math.min(Wd * 0.3, xp - 120), dir = fr === 'platform' ? 1 : -1;
    g.strokeStyle = c.v; g.fillStyle = c.v; g.lineWidth = 3;
    g.beginPath(); g.moveTo(mx0, moverY); g.lineTo(mx0 + dir * 44, moverY); g.stroke();
    g.beginPath(); g.moveTo(mx0 + dir * 54, moverY); g.lineTo(mx0 + dir * 42, moverY - 6); g.lineTo(mx0 + dir * 42, moverY + 6); g.closePath(); g.fill();
    g.font = '600 13px Inter, sans-serif'; g.textAlign = dir > 0 ? 'left' : 'right';
    g.fillText(fr === 'platform' ? `train ${B}c` : `platform ${B}c`, mx0 + dir * 60, moverY + 4);

    // strikes and their flashes
    const shots: [Event, Event, number, string][] = [[E.rear, E.aRear, 1, 'rear'], [E.front, E.aFront, -1, 'front']];
    for (const [e, a, sgn, name] of shots) {
      const x = px(e.x);
      g.font = '13px Inter, sans-serif'; g.textAlign = 'center';
      if (T >= e.ct) {
        if (T < e.ct + 70) {
          g.strokeStyle = c.ink; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x - 6, 68); g.lineTo(x + 6, 88); g.lineTo(x - 5, 96); g.lineTo(x + 2, yTop); g.stroke();
        }
        g.fillStyle = c.ink; g.fillText(`${name} strike`, x, 44);
        g.fillStyle = c.soft; g.font = '12.5px ui-monospace, monospace';
        g.fillText(`t = ${fmtSigned(ctToUs(e.ct))} µs`, x, 60);
        const tEnd = Math.min(T, a.ct);
        const xe = px(e.x + sgn * (tEnd - e.ct));
        g.strokeStyle = c.ink; g.globalAlpha = 0.35; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, yPulse); g.lineTo(xe, yPulse); g.stroke(); g.globalAlpha = 1;
        if (T < a.ct) { g.fillStyle = c.ink; g.beginPath(); g.arc(xe, yPulse, 5, 0, Math.PI * 2); g.fill(); }
      }
    }
    // arrivals at the passenger
    const got = [E.aRear, E.aFront].filter((a) => T >= a.ct).length;
    if (got > 0) {
      const gap = Math.abs(E.aRear.ct - E.aFront.ct);
      const first = E.aFront.ct < E.aRear.ct ? 'front' : 'rear';
      g.textAlign = 'center'; g.font = '600 13.5px Inter, sans-serif';
      g.fillStyle = gap < usToCt(tolerance) ? c.ok : c.ink;
      g.fillText(gap < usToCt(tolerance) ? 'both flashes reach her together' : `${first} flash reaches her first`, xp, yTrack + 60);
    }
  });

  const gapUs = arrivalGapOnWatchUs(usToCt(delayUs));
  const strikesOnTrainUs = ctToUs(boost(trainStrikes(usToCt(delayUs)).front, B).ct - boost(trainStrikes(usToCt(delayUs)).rear, B).ct);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        {id && <Stage x={[DELAY_US[0] - 0.1, DELAY_US[1] + 0.1]} y={[-1, 1]} height={62} label="Delay of the front strike on the platform clock">
          {(s) => <g>
            <line x1={s.sx(DELAY_US[0])} x2={s.sx(DELAY_US[1])} y1={s.sy(0.25)} y2={s.sy(0.25)} stroke={C.rule} strokeWidth={3} strokeLinecap="round" />
            {[-0.5, 0, 0.5, 1, 1.5, 2].map((v) => <g key={v}>
              <line x1={s.sx(v)} x2={s.sx(v)} y1={s.sy(0.25) + 5} y2={s.sy(0.25) + 11} stroke={C.faint} />
              <text x={s.sx(v)} y={s.sy(0.25) + 26} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v} µs</text>
            </g>)}
            <text x={s.sx(DELAY_US[0])} y={s.sy(0.25) - 14} fontSize={13} fill={C.soft}>Front strike comes this long after the rear one, by the platform clock</text>
            <Handle s={s} at={[delayUs, 0.25]} step={0.01} label="Delay of the front strike" color={C.ink}
              clamp={(p) => [Math.min(DELAY_US[1], Math.max(DELAY_US[0], p[0])), 0.25]}
              onChange={(p) => { setDelayUs(Math.round(p[0] * 1000) / 1000); task.touch(); }} />
          </g>}
        </Stage>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" aria-pressed={frame === 'platform'} onClick={() => setFrame('platform')}
            style={frame === 'platform' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}>From the platform</button>
          <button type="button" className="anth-btn" aria-pressed={frame === 'train'} onClick={() => setFrame('train')}
            style={frame === 'train' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}>From the train</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Her watch: rear flash after front" value={fmtSigned(gapUs)} unit="µs" color={C.position} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(gapUs) <= tolerance, { delayUs, gapUs, strikesOnTrainUs })}
          miss={gapUs > 0
            ? `The front flash still reaches her ${gapUs.toFixed(2)} µs before the rear one, by her watch.`
            : `Now the rear flash reaches her ${(-gapUs).toFixed(2)} µs before the front one, by her watch.`}
          hit={explanation} />}
      </div>}>
      <canvas ref={canvas} style={{ width: '100%', height: 256, display: 'block' }}
        aria-label={`Lightning strikes both ends of a train moving at ${B}c, seen from the ${frame}. Her watch puts the rear flash ${gapUs.toFixed(2)} microseconds after the front one.`} />
    </SceneCard>
  );
}

