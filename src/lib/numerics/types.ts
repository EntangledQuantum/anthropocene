/** State vector. Plain arrays: lessons display this code, so it stays readable. */
export type State = number[];

/** Right-hand side of an autonomous-or-not first-order system: dy/dt = f(t, y). */
export type Deriv = (t: number, y: State) => State;

/** One integrator step: advance (t, y) by h and return the new state. */
export type Stepper = (f: Deriv, t: number, y: State, h: number) => State;

export interface Integrator {
  key: string;
  label: string;
  /** Classical order of accuracy of the GLOBAL error. */
  order: number;
  /** Does it preserve phase-space volume / bounded energy on Hamiltonian systems? */
  symplectic: boolean;
  /** f-evaluations per step — the honest cost axis for comparing methods. */
  cost: number;
  step: Stepper;
}

/* Small vector helpers. Written out rather than pulled from a library so the
   lesson code reads as the math, and so a learner can step through it. */
export const add = (a: State, b: State): State => a.map((v, i) => v + b[i]);
export const sub = (a: State, b: State): State => a.map((v, i) => v - b[i]);
export const scale = (a: State, s: number): State => a.map((v) => v * s);
export const axpy = (s: number, a: State, b: State): State => b.map((v, i) => v + s * a[i]);
export const norm2 = (a: State): number => Math.hypot(...a);
