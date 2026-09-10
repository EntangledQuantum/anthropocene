import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  CS,
  D1Q3_E,
  D1Q3_Q,
  channelHeight,
  channelProfile,
  channelUmax,
  collideD1Q3,
  createChannel,
  createPulseD1Q3,
  isFiniteD2Q9,
  kinematicViscosity,
  massD1Q3,
  massD2Q9,
  momentsD1Q3,
  momentsD2Q9,
  poiseuilleAnalytic,
  stepD2Q9,
  streamD1Q3,
  type D1Q3State,
  type D2Q9State,
} from '../../lib/numerics/lbm.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Two costumes of one kinetic gas.

   D1Q3: populations as three bars per site, moments ρ and u as the other
   view. Stream and collide are separate buttons so a rest bump can split.

   D2Q9 channel: velocity field, and the same numbers as a u_x(y) profile
   against the NS parabola. Bounce-back walls, Guo force, τ is viscosity.
   ───────────────────────────────────────────────────────────────────────── */

const READOUT_MS = 125;
const D1_N = 16;
const D2_NX = 22;
const D2_NY = 17;
const D2_GX = 1e-4;

export type LbmMode = 'd1q3' | 'poiseuille';

export interface LbmLabProps {
  mode?: LbmMode;
  collide?: boolean;
  tau?: number;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface D1Stats {
  t: number;
  mass: number;
  mass0: number;
  rhoMax: number;
  uMax: number;
  last: 'collide' | 'stream' | 'idle';
}

interface D2Stats {
  t: number;
  mass: number;
  mass0: number;
  umax: number;
  analytic: number;
  nu: number;
  blown: boolean;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function seedD1(tau: number): D1Q3State {
  return createPulseD1Q3({ n: D1_N, tau, amp: 0.85, width: 0.65, center: 5 });
}

function seedD2(tau: number): D2Q9State {
  return createChannel({ nx: D2_NX, ny: D2_NY, tau, gx: D2_GX });
}

function d1Stats(s: D1Q3State, mass0: number, last: D1Stats['last']): D1Stats {
  let rhoMax = 0, uMax = 0;
  for (let k = 0; k < s.n; k++) {
    const { rho, u } = momentsD1Q3(s.f, k);
    if (rho > rhoMax) rhoMax = rho;
    if (Math.abs(u) > uMax) uMax = Math.abs(u);
  }
  return { t: s.t, mass: massD1Q3(s), mass0, rhoMax, uMax, last };
}

function d2Stats(s: D2Q9State, mass0: number, blown: boolean): D2Stats {
  const H = channelHeight(s.ny);
  const nu = kinematicViscosity(s.tau);
  return {
    t: s.t,
    mass: massD2Q9(s),
    mass0,
    umax: channelUmax(s),
    analytic: (s.gx * H * H) / (8 * Math.max(nu, 1e-12)),
    nu,
    blown,
  };
}

export default function LbmLab({
  mode = 'd1q3',
  collide: collide0 = true,
  tau: tau0 = 1,
  height = 240,
  caption,
  autoPlay,
}: LbmLabProps) {
  const play0 = autoPlay ?? mode === 'poiseuille';
  const reduced = usePrefersReducedMotion();
  const [collideOn, setCollideOn] = useState(collide0);
  const [tau, setTau] = useState(tau0);
  const [running, setRunning] = useState(false);
  const [d1, setD1] = useState<D1Stats>(() => d1Stats(seedD1(tau0), 1, 'idle'));
  const [d2, setD2] = useState<D2Stats>(() => d2Stats(seedD2(tau0), 1, false));

  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLCanvasElement>(null);
  const momRef = useRef<HTMLCanvasElement>(null);
  const popSize = useRef({ w: 480, h: height });
  const momSize = useRef({ w: 260, h: height });

  const d1Ref = useRef<D1Q3State | null>(null);
  const d2Ref = useRef<D2Q9State | null>(null);
  const mass0Ref = useRef(1);
  const tauRef = useRef(tau);
  const collideRef = useRef(collideOn);
  const runningRef = useRef(running);
  const blownRef = useRef(false);
  const lastRef = useRef<D1Stats['last']>('idle');

  useEffect(() => { tauRef.current = tau; }, [tau]);
  useEffect(() => { collideRef.current = collideOn; }, [collideOn]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const seed = useCallback(() => {
    blownRef.current = false;
    lastRef.current = 'idle';
    if (mode === 'd1q3') {
      const s = seedD1(tauRef.current);
      d1Ref.current = s;
      d2Ref.current = null;
      mass0Ref.current = massD1Q3(s);
      setD1(d1Stats(s, mass0Ref.current, 'idle'));
    } else {
      const s = seedD2(tauRef.current);
      d2Ref.current = s;
      d1Ref.current = null;
      mass0Ref.current = massD2Q9(s);
      setD2(d2Stats(s, mass0Ref.current, false));
    }
  }, [mode]);

  useEffect(() => { seed(); }, [seed]);

  const paintPop = useCallback(() => {
    const canvas = popRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = popSize.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const ink = ACCENTS.faint;
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;
    const iris = ACCENTS.iris;
    const aqua = ACCENTS.aqua;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    if (mode === 'd1q3') {
      const s = d1Ref.current;
      if (!s) return;
      const padL = 36, padR = 10, padT = 18, padB = 28;
      const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
      const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
      ctx.strokeStyle = rule;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

      const cellW = plotW / s.n;
      const yMid = (y0 + y1) / 2;
      ctx.beginPath();
      ctx.moveTo(x0, yMid);
      ctx.lineTo(x1, yMid);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;

      let fMax = 0.05;
      for (let i = 0; i < s.f.length; i++) fMax = Math.max(fMax, s.f[i]!);

      for (let k = 0; k < s.n; k++) {
        const cx = x0 + (k + 0.5) * cellW;
        const drawBar = (q: number, color: string, yOff: number) => {
          const fq = s.f[k * D1Q3_Q + q]!;
          const len = (fq / fMax) * (cellW * 0.42);
          const y = yMid + yOff;
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx + D1Q3_E[q]! * len, y);
          ctx.stroke();
          if (q === 1) {
            ctx.beginPath();
            ctx.arc(cx, y, Math.max(2.2, 5.5 * (fq / fMax)), 0, Math.PI * 2);
            ctx.fill();
          } else {
            const dir = D1Q3_E[q]!;
            const tip = cx + dir * len;
            ctx.beginPath();
            ctx.moveTo(tip, y);
            ctx.lineTo(tip - dir * 5, y - 3.5);
            ctx.lineTo(tip - dir * 5, y + 3.5);
            ctx.closePath();
            ctx.fill();
          }
        };
        drawBar(0, magenta, -10);
        drawBar(1, iris, 0);
        drawBar(2, cyan, 10);

        ctx.strokeStyle = rule;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(x0 + k * cellW, y0);
        ctx.lineTo(x0 + k * cellW, y1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = ink;
      ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const tick of [0, 4, 8, 12, 16]) {
        if (tick > s.n) continue;
        ctx.fillText(String(tick), x0 + (tick / s.n) * plotW, y1 + 6);
      }
      ctx.textBaseline = 'bottom';
      ctx.fillText('site', (x0 + x1) / 2, h - 2);
      ctx.textAlign = 'left';
      ctx.font = '10px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = magenta;
      ctx.fillText('f₋₁', x0 + 6, y0 + 14);
      ctx.fillStyle = iris;
      ctx.fillText('f₀', x0 + 40, y0 + 14);
      ctx.fillStyle = cyan;
      ctx.fillText('f₊₁', x0 + 66, y0 + 14);
      return;
    }

    const s = d2Ref.current;
    if (!s) return;
    const padL = 36, padR = 8, padT = 16, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    const { nx, ny } = s;
    const cw = plotW / nx;
    const ch = plotH / ny;
    let uPeak = 1e-6;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 0; i < nx; i++) {
        const ux = Math.abs(momentsD2Q9(s, i, j).ux);
        if (ux > uPeak) uPeak = ux;
      }
    }

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const px = x0 + i * cw;
        const py = y1 - (j + 1) * ch;
        if (s.solid[i + j * nx]) {
          ctx.fillStyle = magenta;
          ctx.globalAlpha = 0.28;
          ctx.fillRect(px, py, cw + 0.5, ch + 0.5);
          ctx.globalAlpha = 1;
          continue;
        }
        const { ux, uy } = momentsD2Q9(s, i, j);
        const t = Math.min(1, Math.abs(ux) / uPeak);
        ctx.fillStyle = cyan;
        ctx.globalAlpha = 0.12 + 0.78 * t;
        ctx.fillRect(px, py, cw + 0.5, ch + 0.5);
        ctx.globalAlpha = 1;
        if (cw > 6 && Math.hypot(ux, uy) > 1e-6) {
          const cx = px + cw / 2, cy = py + ch / 2;
          const scale = (0.42 * cw) / uPeak;
          ctx.strokeStyle = aqua;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + ux * scale, cy - uy * scale);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('0', x0, y1 + 6);
    ctx.fillText(String(nx), x1, y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', x0 - 6, y1);
    ctx.fillText(String(ny - 1), x0 - 6, y0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', (x0 + x1) / 2, h - 2);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('y', 0, 0);
    ctx.restore();
  }, [mode]);

  const paintMom = useCallback(() => {
    const canvas = momRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = momSize.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const ink = ACCENTS.faint;
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 40, padR = 10, padT = 22, padB = 32;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    if (mode === 'd1q3') {
      const s = d1Ref.current;
      if (!s) return;
      let rhoMin = 0.7, rhoMax = 1.4, uAbs = 0.05;
      const rhos: number[] = [];
      const us: number[] = [];
      for (let k = 0; k < s.n; k++) {
        const m = momentsD1Q3(s.f, k);
        rhos.push(m.rho);
        us.push(m.u);
        if (m.rho < rhoMin) rhoMin = m.rho;
        if (m.rho > rhoMax) rhoMax = m.rho;
        if (Math.abs(m.u) > uAbs) uAbs = Math.abs(m.u);
      }
      rhoMin = Math.min(rhoMin, 0.85);
      rhoMax = Math.max(rhoMax, 1.15);
      const X = (k: number) => x0 + ((k + 0.5) / s.n) * plotW;
      const Yrho = (r: number) => y1 - ((r - rhoMin) / (rhoMax - rhoMin)) * plotH;
      const Yu = (u: number) => y1 - ((u + uAbs) / (2 * uAbs)) * plotH;

      ctx.beginPath();
      ctx.moveTo(x0, Yu(0));
      ctx.lineTo(x1, Yu(0));
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.beginPath();
      for (let k = 0; k < s.n; k++) {
        const px = X(k), py = Yrho(rhos[k]!);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = cyan;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      for (let k = 0; k < s.n; k++) {
        const px = X(k), py = Yu(us[k]!);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = magenta;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.font = '10px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = cyan;
      ctx.fillText('ρ', x0 + 6, y0 - 6);
      ctx.fillStyle = magenta;
      ctx.fillText('u', x0 + 22, y0 - 6);
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('0', X(-0.5) > x0 ? x0 : x0, y1 + 6);
      ctx.fillText(String(s.n), x1, y1 + 6);
      ctx.textBaseline = 'bottom';
      ctx.fillText('x', (x0 + x1) / 2, h - 2);
      return;
    }

    const s = d2Ref.current;
    if (!s) return;
    const H = channelHeight(s.ny);
    const nu = Math.max(kinematicViscosity(s.tau), 1e-9);
    const profile = channelProfile(s);
    let uMax = 1e-5;
    for (const p of profile) if (Math.abs(p.ux) > uMax) uMax = Math.abs(p.ux);
    uMax = Math.max(uMax, poiseuilleAnalytic(H / 2, H, s.gx, nu), 1e-5);
    const X = (u: number) => x0 + (u / uMax) * plotW;
    const Y = (y: number) => y1 - (y / H) * plotH;

    ctx.beginPath();
    ctx.moveTo(X(0), y0);
    ctx.lineTo(X(0), y1);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    const nAna = 40;
    for (let k = 0; k <= nAna; k++) {
      const y = (H * k) / nAna;
      const u = poiseuilleAnalytic(y, H, s.gx, nu);
      const px = X(u), py = Y(y);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    for (let k = 0; k < profile.length; k++) {
      const p = profile[k]!;
      const px = X(p.ux), py = Y(p.y);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    for (const p of profile) {
      ctx.beginPath();
      ctx.arc(X(p.ux), Y(p.y), 2.4, 0, Math.PI * 2);
      ctx.fillStyle = cyan;
      ctx.fill();
    }

    ctx.fillStyle = ink;
    ctx.font = '10px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = cyan;
    ctx.fillText('u_x', x0 + 6, y0 - 6);
    ctx.fillStyle = magenta;
    ctx.fillText('NS', x0 + 34, y0 - 6);
    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', x0 - 6, Y(0));
    ctx.fillText('H', x0 - 6, Y(H));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('0', X(0), y1 + 6);
    ctx.fillText(formatValue(uMax, 2), x1, y1 + 6);
    ctx.textBaseline = 'bottom';
    ctx.fillText('u_x', (x0 + x1) / 2, h - 2);
  }, [mode]);

  const paintPopRef = useRef(paintPop);
  const paintMomRef = useRef(paintMom);
  useEffect(() => { paintPopRef.current = paintPop; }, [paintPop]);
  useEffect(() => { paintMomRef.current = paintMom; }, [paintMom]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pop = wrap.querySelector('[data-pane="pop"]') as HTMLElement | null;
    const mom = wrap.querySelector('[data-pane="mom"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (pop) popSize.current = { w: pop.clientWidth || 480, h: pop.clientHeight || height };
      if (mom) momSize.current = { w: mom.clientWidth || 260, h: mom.clientHeight || height };
      paintPopRef.current();
      paintMomRef.current();
    });
    if (pop) ro.observe(pop);
    if (mom) ro.observe(mom);
    paintPopRef.current();
    paintMomRef.current();
    return () => ro.disconnect();
  }, [height, mode]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastReadout = 0;
    const period = mode === 'd1q3' ? 1 / 10 : 1 / 60;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (runningRef.current && !blownRef.current) {
        acc += dt;
        let budget = mode === 'd1q3' ? 4 : 10;
        while (acc >= period && budget-- > 0) {
          if (mode === 'd1q3') {
            const s = d1Ref.current;
            if (s) {
              s.tau = tauRef.current;
              if (collideRef.current) collideD1Q3(s);
              streamD1Q3(s);
              s.t += 1;
              s.steps += 1;
              lastRef.current = collideRef.current ? 'stream' : 'stream';
            }
          } else {
            const s = d2Ref.current;
            if (s) {
              s.tau = tauRef.current;
              const inner = 8;
              for (let k = 0; k < inner; k++) stepD2Q9(s);
              if (!isFiniteD2Q9(s) || Math.abs(channelUmax(s)) > 2) {
                blownRef.current = true;
                runningRef.current = false;
                setRunning(false);
              }
            }
          }
          acc -= period;
        }
        if (now - lastReadout > READOUT_MS) {
          lastReadout = now;
          if (mode === 'd1q3' && d1Ref.current) {
            setD1(d1Stats(d1Ref.current, mass0Ref.current, lastRef.current));
          } else if (d2Ref.current) {
            setD2(d2Stats(d2Ref.current, mass0Ref.current, blownRef.current));
          }
        }
      }
      paintPopRef.current();
      paintMomRef.current();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  useEffect(() => {
    if (play0 && !reduced) {
      runningRef.current = true;
      setRunning(true);
    }
  }, [play0, reduced]);

  const onTau = (v: number) => {
    setTau(v);
    tauRef.current = v;
    if (d1Ref.current) d1Ref.current.tau = v;
    if (d2Ref.current) d2Ref.current.tau = v;
  };

  const onCollideStep = () => {
    const s = d1Ref.current;
    if (!s || runningRef.current) return;
    s.tau = tauRef.current;
    collideD1Q3(s);
    lastRef.current = 'collide';
    setD1(d1Stats(s, mass0Ref.current, 'collide'));
  };

  const onStreamStep = () => {
    const s = d1Ref.current;
    if (!s || runningRef.current) return;
    streamD1Q3(s);
    s.t += 1;
    s.steps += 1;
    lastRef.current = 'stream';
    setD1(d1Stats(s, mass0Ref.current, 'stream'));
  };

  const onD2Step = () => {
    const s = d2Ref.current;
    if (!s || runningRef.current || blownRef.current) return;
    s.tau = tauRef.current;
    stepD2Q9(s);
    if (!isFiniteD2Q9(s)) blownRef.current = true;
    setD2(d2Stats(s, mass0Ref.current, blownRef.current));
  };

  const massRatio = mode === 'd1q3'
    ? d1.mass / Math.max(d1.mass0, 1e-12)
    : d2.mass / Math.max(d2.mass0, 1e-12);
  const massOk = Math.abs(massRatio - 1) < 1e-6;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={mode === 'd1q3' ? 'D1Q3 gas' : 'D2Q9 channel'}
        right={
          <span className="hud-label" style={{ color: mode === 'poiseuille' && d2.blown ? 'var(--sig-warn)' : 'var(--sig-ok)' }}>
            {mode === 'd1q3'
              ? (d1.last === 'idle' ? 'ready' : d1.last)
              : d2.blown ? 'blew up' : `Ma ${formatValue(d2.umax / CS, 2)}`}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          {mode === 'd1q3' && (
            <Toggle
              options={[
                { key: 'off', label: 'stream only', accent: 'magenta' },
                { key: 'on', label: 'collide + stream', accent: 'cyan' },
              ]}
              value={[collideOn ? 'on' : 'off']}
              onChange={(next) => setCollideOn(next[0] === 'on')}
            />
          )}
          <Button onClick={() => { seed(); setRunning(play0 && !reduced); }} accent="cyan">reset</Button>
          <Button
            onClick={() => setRunning((r) => !r)}
            accent="magenta"
            active={running}
            disabled={mode === 'poiseuille' && d2.blown}
          >
            {running ? 'pause' : 'play'}
          </Button>
          {mode === 'd1q3' ? (
            <>
              <Button onClick={onCollideStep} accent="iris" disabled={running}>collide</Button>
              <Button onClick={onStreamStep} accent="aqua" disabled={running}>stream</Button>
            </>
          ) : (
            <Button onClick={onD2Step} accent="iris" disabled={running || d2.blown}>step</Button>
          )}
        </div>

        <div
          ref={wrapRef}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(180px,1fr)', gap: 10, alignItems: 'stretch' }}
        >
          <div data-pane="pop" style={{ height, minWidth: 0 }}>
            <canvas ref={popRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          <div data-pane="mom" style={{ height, minWidth: 0 }}>
            <canvas ref={momRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Slider
            spec={{
              key: 'tau', label: 'relaxation time', symbol: 'τ', min: 0.55, max: 2.2, step: 0.01, value: tau0,
              hint: 'ν = c_s² (τ − 1/2). τ → 1/2 is inviscid and the stability wall.',
            }}
            value={tau}
            onChange={onTau}
          />
        </div>

        {mode === 'd1q3' ? (
          <ReadoutRow>
            <Readout label="t" value={String(d1.t)} />
            <Readout label="M / M₀" value={formatValue(massRatio, 6)} accent={massOk ? 'ok' : 'warn'} />
            <Readout label="ρ max" value={formatValue(d1.rhoMax, 3)} accent="cyan" />
            <Readout label="|u| max" value={formatValue(d1.uMax, 3)} accent="magenta" />
            <Readout label="τ" value={formatValue(tau, 2)} />
            <Readout label="ν" value={formatValue(kinematicViscosity(tau), 3)} />
          </ReadoutRow>
        ) : (
          <ReadoutRow>
            <Readout label="t" value={String(d2.t)} />
            <Readout label="M / M₀" value={d2.blown ? '—' : formatValue(massRatio, 6)} accent={massOk ? 'ok' : 'warn'} />
            <Readout label="u_max" value={formatValue(d2.umax, 4)} accent="cyan" />
            <Readout label="NS peak" value={formatValue(d2.analytic, 4)} accent="magenta" />
            <Readout label="ν" value={formatValue(d2.nu, 3)} />
            <Readout label="c_s" value={formatValue(CS, 3)} />
          </ReadoutRow>
        )}
      </Panel>
      {caption && (
        <figcaption className="hud-label" style={{ marginTop: 8, lineHeight: 1.6, letterSpacing: '0.06em', textTransform: 'none' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
