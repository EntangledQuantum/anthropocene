/** Discrete reverse-mode through a short ODE, and the inverse problem it unlocks.
 *
 *  No tape, no framework. The reverse sweep is the chain rule written on the
 *  same Euler / RK4 step the rest of the platform runs. A scalar loss against
 *  a target trajectory has a gradient; one reverse pass produces it, however
 *  many parameters the right-hand side carries.
 */

import { centralDifference, complexStep } from './diff.ts';

export interface DecayOpts {
  y0: number;
  span: number;
  h: number;
}

export const DECAY_INV: DecayOpts = { y0: 1, span: 4, h: 0.05 };

export interface DecayRun {
  t: number[];
  y: number[];
}

export type DecayStepper = 'euler' | 'rk4';

const resolved = (opts?: Partial<DecayOpts>): DecayOpts => ({ ...DECAY_INV, ...opts });

/* ── forward: y' = −λ y ─────────────────────────────────────────────────── */

function eulerStep(lambda: number, y: number, h: number): number {
  return y + h * (-lambda * y);
}

/** Stages of one RK4 step on y' = −λy. Recomputed on the reverse pass so the
 *  adjoint does not have to store them — checkpointing at every step, which
 *  for a scalar ODE is free. */
function rk4Stages(lambda: number, y: number, h: number) {
  const k1 = -lambda * y;
  const y2 = y + (h / 2) * k1;
  const k2 = -lambda * y2;
  const y3 = y + (h / 2) * k2;
  const k3 = -lambda * y3;
  const y4 = y + h * k3;
  const k4 = -lambda * y4;
  const yNext = y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  return { k1, k2, k3, k4, y2, y3, y4, yNext };
}

function rk4Step(lambda: number, y: number, h: number): number {
  return rk4Stages(lambda, y, h).yNext;
}

const stepOf = (method: DecayStepper) => (method === 'rk4' ? rk4Step : eulerStep);

export function decayForward(
  lambda: number,
  opts?: Partial<DecayOpts>,
  method: DecayStepper = 'rk4',
): DecayRun {
  const { y0, span, h } = resolved(opts);
  const steps = Math.max(1, Math.round(span / h));
  const t: number[] = [0];
  const y: number[] = [y0];
  const step = stepOf(method);
  for (let i = 0; i < steps; i++) {
    y.push(step(lambda, y[i], h));
    t.push((i + 1) * h);
  }
  return { t, y };
}

/** Mean-square mismatch. Zero when the guess was integrated with the same
 *  stepper that produced the observations — so the bowl really does touch
 *  the axis at the true λ. */
export function decayLoss(y: number[], yObs: number[]): number {
  const m = y.length;
  let s = 0;
  for (let i = 0; i < m; i++) {
    const e = y[i] - yObs[i];
    s += e * e;
  }
  return s / (2 * m);
}

/* ── reverse: discrete adjoint ──────────────────────────────────────────── */

export interface DecayGrad {
  loss: number;
  dLambda: number;
  dY0: number;
  run: DecayRun;
  /** dL/dy_n after the reverse sweep. */
  adjoint: number[];
}

/** Reverse through one RK4 step. `yBarNext` is dL/dy_{n+1}; returns the
 *  contribution to dL/dy_n and dL/dλ from this step alone. */
function rk4Reverse(lambda: number, y: number, h: number, yBarNext: number): { yBar: number; lambdaBar: number } {
  const { y2, y3, y4 } = rk4Stages(lambda, y, h);

  let yBar = yBarNext;
  let k1Bar = yBarNext * (h / 6);
  let k2Bar = yBarNext * (h / 3);
  let k3Bar = yBarNext * (h / 3);
  let k4Bar = yBarNext * (h / 6);
  let lambdaBar = 0;

  // k4 = −λ y4 ;  y4 = y + h k3
  lambdaBar += k4Bar * (-y4);
  const y4Bar = k4Bar * (-lambda);
  yBar += y4Bar;
  k3Bar += y4Bar * h;

  // k3 = −λ y3 ;  y3 = y + (h/2) k2
  lambdaBar += k3Bar * (-y3);
  const y3Bar = k3Bar * (-lambda);
  yBar += y3Bar;
  k2Bar += y3Bar * (h / 2);

  // k2 = −λ y2 ;  y2 = y + (h/2) k1
  lambdaBar += k2Bar * (-y2);
  const y2Bar = k2Bar * (-lambda);
  yBar += y2Bar;
  k1Bar += y2Bar * (h / 2);

  // k1 = −λ y
  lambdaBar += k1Bar * (-y);
  yBar += k1Bar * (-lambda);

  return { yBar, lambdaBar };
}

export function decayAdjoint(
  lambda: number,
  yObs: number[],
  opts?: Partial<DecayOpts>,
  method: DecayStepper = 'rk4',
): DecayGrad {
  const { h } = resolved(opts);
  const run = decayForward(lambda, opts, method);
  const { y } = run;
  const m = y.length;
  const adj = y.map((yi, i) => (yi - yObs[i]) / m);
  let dLambda = 0;

  if (method === 'euler') {
    for (let n = m - 2; n >= 0; n--) {
      dLambda += adj[n + 1] * (-h * y[n]);
      adj[n] += adj[n + 1] * (1 - h * lambda);
    }
  } else {
    for (let n = m - 2; n >= 0; n--) {
      const back = rk4Reverse(lambda, y[n], h, adj[n + 1]);
      dLambda += back.lambdaBar;
      adj[n] += back.yBar;
    }
  }

  return { loss: decayLoss(y, yObs), dLambda, dY0: adj[0], run, adjoint: adj };
}

/* ── independent checks of the same derivative ──────────────────────────── */

type C = readonly [number, number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cscale = (s: number, a: C): C => [s * a[0], s * a[1]];

function decayForwardComplex(
  lambda: C,
  opts: DecayOpts,
  method: DecayStepper,
): C[] {
  const steps = Math.max(1, Math.round(opts.span / opts.h));
  const h = opts.h;
  const out: C[] = [[opts.y0, 0]];
  for (let i = 0; i < steps; i++) {
    const y = out[i];
    if (method === 'euler') {
      out.push(cadd(y, cscale(h, cmul(cscale(-1, lambda), y))));
    } else {
      const k1 = cmul(cscale(-1, lambda), y);
      const y2 = cadd(y, cscale(h / 2, k1));
      const k2 = cmul(cscale(-1, lambda), y2);
      const y3 = cadd(y, cscale(h / 2, k2));
      const k3 = cmul(cscale(-1, lambda), y3);
      const y4 = cadd(y, cscale(h, k3));
      const k4 = cmul(cscale(-1, lambda), y4);
      const slope = cadd(cadd(k1, cscale(2, k2)), cadd(cscale(2, k3), k4));
      out.push(cadd(y, cscale(h / 6, slope)));
    }
  }
  return out;
}

/** Complex-step of the trajectory, then the chain rule through the real loss.
 *  L itself is not holomorphic (it squares a real residual), so we differentiate
 *  the state and apply dL/dλ = Σ (y − y*) dy/dλ. */
export function decayGradComplexStep(
  lambda: number,
  yObs: number[],
  opts?: Partial<DecayOpts>,
  method: DecayStepper = 'rk4',
  eps = 1e-20,
): number {
  const o = resolved(opts);
  const ys = decayForwardComplex([lambda, eps], o, method);
  const m = ys.length;
  let d = 0;
  for (let i = 0; i < m; i++) {
    const dy = ys[i][1] / eps;
    d += ((ys[i][0] - yObs[i]) / m) * dy;
  }
  return d;
}

export function decayGradFiniteDifference(
  lambda: number,
  yObs: number[],
  opts?: Partial<DecayOpts>,
  method: DecayStepper = 'rk4',
  delta = 1e-6,
): number {
  return centralDifference(
    (x) => decayLoss(decayForward(x, opts, method).y, yObs),
    lambda,
    delta,
  );
}

/** Exposed so a test can pin that the complex-step helper in diff.ts agrees
 *  with the trajectory-level version on a holomorphic probe (the endpoint). */
export function decayEndpointComplexStep(lambda: number, opts?: Partial<DecayOpts>, method: DecayStepper = 'rk4'): number {
  const o = resolved(opts);
  return complexStep((re, im) => {
    const ys = decayForwardComplex([re, im], o, method);
    const last = ys[ys.length - 1];
    return [last[0], last[1]];
  }, lambda, 1e-20);
}

/* ── gradient descent ───────────────────────────────────────────────────── */

export interface RecoverTrace {
  lambda: number;
  loss: number;
  dLambda: number;
}

export interface RecoverResult {
  lambda: number;
  history: RecoverTrace[];
}

export function recoverDecayLambda(
  lambdaTrue: number,
  lambdaGuess: number,
  opts?: Partial<DecayOpts> & { steps?: number; lr?: number; method?: DecayStepper; clamp?: [number, number] },
): RecoverResult {
  const method = opts?.method ?? 'rk4';
  const steps = opts?.steps ?? 80;
  const lr = opts?.lr ?? 8;
  const clamp = opts?.clamp ?? [0.08, 6];
  const yObs = decayForward(lambdaTrue, opts, method).y;
  let lambda = lambdaGuess;
  const history: RecoverTrace[] = [];
  for (let i = 0; i < steps; i++) {
    const g = decayAdjoint(lambda, yObs, opts, method);
    history.push({ lambda, loss: g.loss, dLambda: g.dLambda });
    lambda = Math.min(clamp[1], Math.max(clamp[0], lambda - lr * g.dLambda));
    if (Math.abs(g.dLambda) < 1e-10 && g.loss < 1e-14) break;
  }
  const last = decayAdjoint(lambda, yObs, opts, method);
  history.push({ lambda, loss: last.loss, dLambda: last.dLambda });
  return { lambda, history };
}

export function decayLossLandscape(
  yObs: number[],
  lambdas: number[],
  opts?: Partial<DecayOpts>,
  method: DecayStepper = 'rk4',
): { lambda: number; loss: number }[] {
  return lambdas.map((lambda) => ({ lambda, loss: decayLoss(decayForward(lambda, opts, method).y, yObs) }));
}

/* ── oscillator: recover ω in q̈ = −ω² q ─────────────────────────────────── */

export interface OscOpts {
  q0: number;
  v0: number;
  span: number;
  h: number;
}

export const OSC_INV: OscOpts = { q0: 1, v0: 0, span: 3, h: 0.04 };

export interface OscRun {
  t: number[];
  q: number[];
  v: number[];
}

const oscResolved = (opts?: Partial<OscOpts>): OscOpts => ({ ...OSC_INV, ...opts });

/** Forward Euler on [q, v]. Written out so the reverse sweep below is the
 *  same four multiplies, backwards. */
export function oscillatorForward(omega: number, opts?: Partial<OscOpts>): OscRun {
  const { q0, v0, span, h } = oscResolved(opts);
  const steps = Math.max(1, Math.round(span / h));
  const t: number[] = [0];
  const q: number[] = [q0];
  const v: number[] = [v0];
  const w2 = omega * omega;
  for (let i = 0; i < steps; i++) {
    const qn = q[i] + h * v[i];
    const vn = v[i] + h * (-w2 * q[i]);
    q.push(qn);
    v.push(vn);
    t.push((i + 1) * h);
  }
  return { t, q, v };
}

export function oscillatorLoss(q: number[], qObs: number[]): number {
  const m = q.length;
  let s = 0;
  for (let i = 0; i < m; i++) {
    const e = q[i] - qObs[i];
    s += e * e;
  }
  return s / (2 * m);
}

export interface OscGrad {
  loss: number;
  dOmega: number;
  run: OscRun;
}

export function oscillatorAdjoint(omega: number, qObs: number[], opts?: Partial<OscOpts>): OscGrad {
  const { h } = oscResolved(opts);
  const run = oscillatorForward(omega, opts);
  const { q } = run;
  const m = q.length;
  const adjQ = q.map((qi, i) => (qi - qObs[i]) / m);
  const adjV = q.map(() => 0);
  let dOmega = 0;
  const w2 = omega * omega;

  for (let n = m - 2; n >= 0; n--) {
    // q_{n+1} = q_n + h v_n
    // v_{n+1} = v_n − h ω² q_n
    dOmega += adjV[n + 1] * (-h * 2 * omega * q[n]);
    adjQ[n] += adjQ[n + 1] + adjV[n + 1] * (-h * w2);
    adjV[n] += adjQ[n + 1] * h + adjV[n + 1];
  }

  return { loss: oscillatorLoss(q, qObs), dOmega, run };
}

export function oscillatorGradFiniteDifference(
  omega: number,
  qObs: number[],
  opts?: Partial<OscOpts>,
  delta = 1e-6,
): number {
  return centralDifference(
    (w) => oscillatorLoss(oscillatorForward(w, opts).q, qObs),
    omega,
    delta,
  );
}

export function recoverOscillatorOmega(
  omegaTrue: number,
  omegaGuess: number,
  opts?: Partial<OscOpts> & { steps?: number; lr?: number; clamp?: [number, number] },
): { omega: number; history: { omega: number; loss: number; dOmega: number }[] } {
  const steps = opts?.steps ?? 80;
  const lr = opts?.lr ?? 0.4;
  const clamp = opts?.clamp ?? [0.2, 4];
  const qObs = oscillatorForward(omegaTrue, opts).q;
  let omega = omegaGuess;
  const history: { omega: number; loss: number; dOmega: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const g = oscillatorAdjoint(omega, qObs, opts);
    history.push({ omega, loss: g.loss, dOmega: g.dOmega });
    omega = Math.min(clamp[1], Math.max(clamp[0], omega - lr * g.dOmega));
    if (Math.abs(g.dOmega) < 1e-10 && g.loss < 1e-14) break;
  }
  const last = oscillatorAdjoint(omega, qObs, opts);
  history.push({ omega, loss: last.loss, dOmega: last.dOmega });
  return { omega, history };
}
