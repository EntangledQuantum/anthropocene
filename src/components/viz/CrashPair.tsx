import { useEffect, useMemo, useRef, useState } from 'react';
import { crashHistory, type CrashSample } from '../../lib/physics/pairs-ch04.ts';
import { C, Meter, SceneCard } from './scene.tsx';

/**
 * A car and a truck meet head on, played back slowly. Two force arrows, one on
 * each vehicle, and a trace underneath where the two force curves are drawn on
 * top of each other: they are one curve, because they are one interaction.
 * The acceleration arrows are the ones that differ, by the mass ratio.
 *
 * One slider (the truck's mass) and one button. Physics: `crashHistory` from
 * src/lib/physics/pairs-ch04.ts, where the car-on-truck force is never
 * computed separately: it is `thirdLawPartner` of the truck-on-car force.
 */
export interface CrashPairProps {
  prompt?: string;
  mCar?: number;
  mTruck?: number;
  /** Car's speed to the right and truck's to the left, m/s. */
  vCar?: number;
  vTruck?: number;
  /** Playback is this many times slower than real time. */
  slow?: number;
}

const F_MAX = 1.5e6; // N, top of the trace
const A_PX = 0.15; // px per m/s²
const F_PX = 1.4e-4; // px per N

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function CrashPair({
  prompt, mCar = 1200, mTruck: mTruck0 = 14000, vCar = 15, vTruck = 10, slow = 40,
}: CrashPairProps) {
  const [mTruck, setMTruck] = useState(mTruck0);
  const hist = useMemo(() => crashHistory({ mCar, mTruck, vCar, vTruck: -vTruck }), [mCar, mTruck, vCar, vTruck]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const play = useRef({ t: 0, running: false });
  const [peak, setPeak] = useState({ f1: 0, f2: 0, a1: 0, a2: 0, running: false });

  useEffect(() => { play.current = { t: 0, running: false }; setPeak({ f1: 0, f2: 0, a1: 0, a2: 0, running: false }); }, [hist]);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const col = {
      ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'),
      rule: cssVar('--color-rule-bright'), grid: cssVar('--color-rule'), surf: cssVar('--color-surface'),
      f: cssVar('--color-amber'), a: cssVar('--color-magenta'), v: cssVar('--color-cyan'),
    };
    const dtH = hist[1].t - hist[0].t;
    const pk = { f1: 0, f2: 0, a1: 0, a2: 0 };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = play.current;
      if (p.running) {
        p.t += dt / slow;
        if (p.t >= hist[hist.length - 1].t) { p.t = hist[hist.length - 1].t; p.running = false; }
      }
      const i = Math.min(hist.length - 1, Math.round(p.t / dtH));
      if (p.t === 0) { pk.f1 = pk.f2 = pk.a1 = pk.a2 = 0; }
      for (let j = Math.max(0, i - Math.ceil(dt / slow / dtH) - 1); j <= i; j++) {
        const s = hist[j];
        pk.f1 = Math.max(pk.f1, Math.abs(s.fOnCar)); pk.f2 = Math.max(pk.f2, Math.abs(s.fOnTruck));
        pk.a1 = Math.max(pk.a1, Math.abs(s.aCar)); pk.a2 = Math.max(pk.a2, Math.abs(s.aTruck));
      }
      if (canvas.current) draw(canvas.current, hist, i, col);
      if (now - lastShown > 120) { lastShown = now; setPeak({ ...pk, running: p.running }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hist, slow]);

  const draw = (el: HTMLCanvasElement, h: CrashSample[], i: number, c: Record<string, string>) => {
    const dpr = window.devicePixelRatio || 1;
    const Wd = el.clientWidth, Ht = el.clientHeight;
    if (el.width !== Math.round(Wd * dpr)) { el.width = Math.round(Wd * dpr); el.height = Math.round(Ht * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);
    const s = h[i];

    // ── the road: 24 m across, the crash at the centre
    const road = 170, px = Wd / 24, X = (x: number) => Wd / 2 + x * px;
    g.strokeStyle = c.rule; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, road); g.lineTo(Wd, road); g.stroke();

    const k = (m: number) => Math.cbrt(m / mCar);
    const Lc = 4.5, Hc = 1.5, Lt = Math.min(10, 4.5 * k(mTruck)), Ht2 = Math.min(4, 1.5 * k(mTruck));
    const mid = s.xCar > s.xTruck ? (s.xCar + s.xTruck) / 2 : null;
    const carFront = mid ?? s.xCar, truckFront = mid ?? s.xTruck;
    const box = (x0: number, x1: number, hgt: number, label: string) => {
      g.fillStyle = c.surf; g.strokeStyle = c.soft; g.lineWidth = 2;
      g.beginPath(); g.roundRect(X(x0), road - hgt * px, X(x1) - X(x0), hgt * px, 4); g.fill(); g.stroke();
      g.fillStyle = c.soft; g.font = '13px Inter, sans-serif'; g.textAlign = 'center';
      g.fillText(label, (X(x0) + X(x1)) / 2, road - hgt * px / 2 + 5);
    };
    box(s.xCar - Lc, carFront, Hc, `car ${mCar} kg`);
    box(truckFront, s.xTruck + Lt, Ht2, `truck ${Math.round(mTruck)} kg`);
    if (mid !== null) { // the crushed metal: the overlap the spring model says has been squeezed
      g.strokeStyle = c.faint; g.lineWidth = 1;
      for (let y = road - 4; y > road - Hc * px; y -= 6) { g.beginPath(); g.moveTo(X(mid) - 5, y); g.lineTo(X(mid) + 5, y - 4); g.stroke(); }
    }

    // ── arrows above each vehicle: force (amber), acceleration (magenta)
    const yF = road - Ht2 * px - 26, yA = yF - 34;
    arrowH(g, X(carFront) - 4, yF, X(carFront) - 4 + s.fOnCar * F_PX, c.f, 'truck on car');
    arrowH(g, X(truckFront) + 4, yF, X(truckFront) + 4 + s.fOnTruck * F_PX, c.f, 'car on truck');
    arrowH(g, X(carFront) - 4, yA, X(carFront) - 4 + s.aCar * A_PX, c.a, 'car’s a', true);
    arrowH(g, X(truckFront) + 4, yA, X(truckFront) + 4 + s.aTruck * A_PX, c.a, 'truck’s a', true);
    if (Math.abs(s.fOnCar) < 2000) { // not touching: show where each is going
      arrowH(g, X(s.xCar - Lc / 2), road - Hc * px - 16, X(s.xCar - Lc / 2) + s.vCar * 5, c.v, `${Math.abs(s.vCar).toFixed(0)} m/s`);
      arrowH(g, X(s.xTruck + Lt / 2), road - Ht2 * px - 16, X(s.xTruck + Lt / 2) + s.vTruck * 5, c.v, `${Math.abs(s.vTruck).toFixed(0)} m/s`);
    }

    // ── the trace: both force magnitudes against time, one drawn over the other
    const top = 222, bot = Ht - 26, left = 52, right = Wd - 12, T = h[h.length - 1].t;
    const tx = (t: number) => left + (t / T) * (right - left);
    const ty = (f: number) => bot - (f / F_MAX) * (bot - top);
    g.font = '12px ui-monospace, monospace'; g.fillStyle = c.faint; g.textAlign = 'right';
    for (const f of [0, 500e3, 1000e3, 1500e3]) {
      g.strokeStyle = c.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(left, ty(f)); g.lineTo(right, ty(f)); g.stroke();
      g.fillText(String(f / 1000), left - 6, ty(f) + 4);
    }
    g.textAlign = 'center';
    for (let t = 0; t <= T + 1e-9; t += 0.05) g.fillText(String(Math.round(t * 1000)), tx(t), bot + 16);
    g.font = '13px Inter, sans-serif'; g.textAlign = 'left'; g.fillStyle = c.faint;
    g.fillText('force (kN)', left + 4, top - 8);
    g.textAlign = 'right'; g.fillText('time (ms)', right, bot - 6);
    g.fillStyle = c.f; g.fillText('truck on car', right - 150, top - 8);
    g.fillStyle = c.ink; g.fillText('- - car on truck', right, top - 8);
    const curve = (key: 'fOnCar' | 'fOnTruck', color: string, w: number, dash: number[]) => {
      g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash); g.beginPath();
      for (let j = 0; j <= i; j += 10) { const x = tx(h[j].t), y = ty(Math.abs(h[j][key])); j ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); g.setLineDash([]);
    };
    curve('fOnCar', c.f, 5, []);
    curve('fOnTruck', c.ink, 1.5, [5, 4]);
  };

  const kN = (f: number) => (f / 1000).toFixed(0);
  return (
    <SceneCard prompt={prompt}
      footer={
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Peak push, truck on car" value={kN(peak.f1)} unit="kN" color={C.force} />
            <Meter label="Peak push, car on truck" value={kN(peak.f2)} unit="kN" color={C.force} />
            <Meter label="Car’s peak acceleration" value={peak.a1.toFixed(0)} unit="m/s²" color={C.accel} />
            <Meter label="Truck’s peak acceleration" value={peak.a2.toFixed(0)} unit="m/s²" color={C.accel} />
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
            <button type="button" className="anth-btn" style={{ padding: '10px 20px' }}
              onClick={() => { play.current = { t: 0, running: true }; }}>
              {peak.running ? 'Crashing…' : 'Crash'}
            </button>
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span className="hud-label">Truck’s mass</span>
                  <span className="readout" style={{ fontSize: 13, color: C.ink }}>{mTruck.toLocaleString('en')}<span style={{ color: C.faint }}> kg</span></span>
                </span>
                <input type="range" className="anth-slider" min={1200} max={40000} step={200} value={mTruck}
                  aria-label="Truck's mass, kilograms" onChange={(e) => setMTruck(+e.target.value)} />
              </label>
            </div>
          </div>
        </div>
      }>
      <canvas ref={canvas} style={{ width: '100%', height: 400, display: 'block' }}
        aria-label={`A ${mCar} kilogram car and a ${Math.round(mTruck)} kilogram truck collide. Peak force on each: ${kN(peak.f1)} and ${kN(peak.f2)} kilonewtons.`} />
    </SceneCard>
  );
}

function arrowH(g: CanvasRenderingContext2D, x1: number, y: number, x2: number, color: string, label: string, dashed = false) {
  if (Math.abs(x2 - x1) < 3) return;
  const dir = Math.sign(x2 - x1);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 3;
  if (dashed) g.setLineDash([7, 5]);
  g.beginPath(); g.moveTo(x1, y); g.lineTo(x2 - dir * 10, y); g.stroke(); g.setLineDash([]);
  g.beginPath(); g.moveTo(x2, y); g.lineTo(x2 - dir * 12, y - 6); g.lineTo(x2 - dir * 12, y + 6); g.closePath(); g.fill();
  g.font = '600 13px Inter, sans-serif'; g.textAlign = dir > 0 ? 'left' : 'right';
  g.fillText(label, x1 + dir * 2, y - 9);
}
