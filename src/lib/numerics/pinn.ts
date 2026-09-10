/** A tiny physics-informed network on y' + λ y = 0.
 *
 *  The point is not to compete with RK4. It is to make the residual a number
 *  you can plot: a pretty interpolant of e^{−t} can match the values and still
 *  fail y' + y = 0, and a network whose loss *is* that residual drives it down.
 */

export interface MlpParams {
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number;
}

export const PINN_LAMBDA = 1;
export const PINN_HIDDEN = 8;

/** Deterministic small init, so tests and the widget agree. */
export function seedMlp(seed = 1, hidden = PINN_HIDDEN): MlpParams {
  let s = seed | 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
  const scale = 0.6;
  return {
    w1: Array.from({ length: hidden }, () => rnd() * scale),
    b1: Array.from({ length: hidden }, () => rnd() * scale),
    w2: Array.from({ length: hidden }, () => rnd() * scale),
    b2: rnd() * 0.2,
  };
}

export function copyMlp(p: MlpParams): MlpParams {
  return { w1: p.w1.slice(), b1: p.b1.slice(), w2: p.w2.slice(), b2: p.b2 };
}

export interface MlpEval {
  y: number;
  yt: number;
  h: number[];
  s: number[];
}

/** ŷ(t) = w2 · tanh(w1 t + b1) + b2, with analytic ŷ'(t). */
export function mlpEval(p: MlpParams, t: number): MlpEval {
  const n = p.w1.length;
  const h = new Array<number>(n);
  const s = new Array<number>(n);
  let y = p.b2;
  let yt = 0;
  for (let i = 0; i < n; i++) {
    const z = p.w1[i] * t + p.b1[i];
    const hi = Math.tanh(z);
    const si = 1 - hi * hi;
    h[i] = hi;
    s[i] = si;
    y += p.w2[i] * hi;
    yt += p.w2[i] * si * p.w1[i];
  }
  return { y, yt, h, s };
}

export function pinnResidualAt(p: MlpParams, t: number, lambda = PINN_LAMBDA): number {
  const { y, yt } = mlpEval(p, t);
  return yt + lambda * y;
}

export function meanSquare(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x * x;
  return s / xs.length;
}

export function residualRms(p: MlpParams, ts: number[], lambda = PINN_LAMBDA): number {
  return Math.sqrt(meanSquare(ts.map((t) => pinnResidualAt(p, t, lambda))));
}

export function dataMse(p: MlpParams, ts: number[], ys: number[]): number {
  return meanSquare(ts.map((t, i) => mlpEval(p, t).y - ys[i]));
}

export interface PinnLoss {
  total: number;
  residual: number;
  ic: number;
}

export function residualLoss(
  p: MlpParams,
  ts: number[],
  lambda = PINN_LAMBDA,
  icWeight = 4,
): PinnLoss {
  const residual = meanSquare(ts.map((t) => pinnResidualAt(p, t, lambda)));
  const y0 = mlpEval(p, 0).y - 1;
  const ic = y0 * y0;
  return { residual, ic, total: residual + icWeight * ic };
}

/* ── reverse-mode through residual + IC ─────────────────────────────────── */

export interface MlpGrad {
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number;
}

function zeroGrad(n: number): MlpGrad {
  return { w1: new Array(n).fill(0), b1: new Array(n).fill(0), w2: new Array(n).fill(0), b2: 0 };
}

function accumulateResidualGrad(p: MlpParams, t: number, lambda: number, rBar: number, g: MlpGrad): void {
  const { h, s } = mlpEval(p, t);
  // r = yt + λ y
  const ytBar = rBar;
  const yBar = rBar * lambda;

  g.b2 += yBar;
  const n = p.w1.length;
  for (let i = 0; i < n; i++) {
    // y += w2_i h_i
    g.w2[i] += yBar * h[i];
    const hBarFromY = yBar * p.w2[i];
    // yt += w2_i s_i w1_i
    g.w2[i] += ytBar * s[i] * p.w1[i];
    const sBar = ytBar * p.w2[i] * p.w1[i];
    const w1BarFromYt = ytBar * p.w2[i] * s[i];
    // s = 1 − h²  →  hBar += sBar * (−2 h)
    const hBar = hBarFromY + sBar * (-2 * h[i]);
    // h = tanh(z), z = w1 t + b1  →  zBar = hBar * s
    const zBar = hBar * s[i];
    g.w1[i] += zBar * t + w1BarFromYt;
    g.b1[i] += zBar;
  }
}

function accumulateDataGrad(p: MlpParams, t: number, yBar: number, g: MlpGrad): void {
  const { h, s } = mlpEval(p, t);
  g.b2 += yBar;
  const n = p.w1.length;
  for (let i = 0; i < n; i++) {
    g.w2[i] += yBar * h[i];
    const hBar = yBar * p.w2[i];
    const zBar = hBar * s[i];
    g.w1[i] += zBar * t;
    g.b1[i] += zBar;
  }
}

export function residualGrad(
  p: MlpParams,
  ts: number[],
  lambda = PINN_LAMBDA,
  icWeight = 4,
): { loss: PinnLoss; grad: MlpGrad } {
  const n = p.w1.length;
  const m = ts.length;
  const g = zeroGrad(n);
  const rs = ts.map((t) => pinnResidualAt(p, t, lambda));
  const residual = meanSquare(rs);
  for (let i = 0; i < m; i++) {
    accumulateResidualGrad(p, ts[i], lambda, (2 * rs[i]) / m, g);
  }
  const y0err = mlpEval(p, 0).y - 1;
  const ic = y0err * y0err;
  accumulateDataGrad(p, 0, icWeight * 2 * y0err, g);
  return { loss: { residual, ic, total: residual + icWeight * ic }, grad: g };
}

export function dataGrad(p: MlpParams, ts: number[], ys: number[]): { mse: number; grad: MlpGrad } {
  const n = p.w1.length;
  const m = ts.length;
  const g = zeroGrad(n);
  const es = ts.map((t, i) => mlpEval(p, t).y - ys[i]);
  const mse = meanSquare(es);
  for (let i = 0; i < m; i++) accumulateDataGrad(p, ts[i], (2 * es[i]) / m, g);
  return { mse, grad: g };
}

function applyGrad(p: MlpParams, g: MlpGrad, lr: number): void {
  const n = p.w1.length;
  for (let i = 0; i < n; i++) {
    p.w1[i] -= lr * g.w1[i];
    p.b1[i] -= lr * g.b1[i];
    p.w2[i] -= lr * g.w2[i];
  }
  p.b2 -= lr * g.b2;
}

export interface TrainResult {
  params: MlpParams;
  history: number[];
}

export function collocation(n = 40, span = 2.5): number[] {
  return Array.from({ length: n }, (_, i) => (span * i) / (n - 1));
}

export function trainOnResidual(
  start: MlpParams,
  opts?: { steps?: number; lr?: number; ts?: number[]; lambda?: number; icWeight?: number },
): TrainResult {
  const p = copyMlp(start);
  const steps = opts?.steps ?? 250;
  const lr = opts?.lr ?? 0.08;
  const ts = opts?.ts ?? collocation();
  const history: number[] = [];
  for (let i = 0; i < steps; i++) {
    const { loss, grad } = residualGrad(p, ts, opts?.lambda, opts?.icWeight);
    history.push(loss.total);
    applyGrad(p, grad, lr);
  }
  history.push(residualLoss(p, ts, opts?.lambda, opts?.icWeight).total);
  return { params: p, history };
}

export function trainOnData(
  start: MlpParams,
  ts: number[],
  ys: number[],
  opts?: { steps?: number; lr?: number },
): TrainResult {
  const p = copyMlp(start);
  const steps = opts?.steps ?? 400;
  const lr = opts?.lr ?? 0.12;
  const history: number[] = [];
  for (let i = 0; i < steps; i++) {
    const { mse, grad } = dataGrad(p, ts, ys);
    history.push(mse);
    applyGrad(p, grad, lr);
  }
  history.push(dataMse(p, ts, ys));
  return { params: p, history };
}

/* ── the pretty interpolant that is not a solution ──────────────────────── */

export interface Sample {
  t: number;
  y: number;
}

/** Lagrange polynomial through the nodes, with analytic derivative. */
export function lagrangeEval(nodes: Sample[], t: number): { y: number; dy: number } {
  const n = nodes.length;
  let y = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    let li = 1;
    let dli = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      li *= (t - nodes[j].t) / (nodes[i].t - nodes[j].t);
    }
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      let term = 1 / (nodes[i].t - nodes[k].t);
      for (let j = 0; j < n; j++) {
        if (j === i || j === k) continue;
        term *= (t - nodes[j].t) / (nodes[i].t - nodes[j].t);
      }
      dli += term;
    }
    y += nodes[i].y * li;
    dy += nodes[i].y * dli;
  }
  return { y, dy };
}

export function interpolantNodes(span = 2.5): Sample[] {
  // Three points of e^{−t}: close in value, wrong in slope. That is the
  // failure mode — interpolation is not a residual check.
  const ts = [0, span / 2, span];
  return ts.map((t) => ({ t, y: Math.exp(-t) }));
}

export function interpolantResidualRms(nodes: Sample[], ts: number[], lambda = PINN_LAMBDA): number {
  return Math.sqrt(meanSquare(ts.map((t) => {
    const { y, dy } = lagrangeEval(nodes, t);
    return dy + lambda * y;
  })));
}

export function interpolantMaxValueError(nodes: Sample[], ts: number[]): number {
  let m = 0;
  for (const t of ts) {
    m = Math.max(m, Math.abs(lagrangeEval(nodes, t).y - Math.exp(-t)));
  }
  return m;
}
