import { circlePoint, shmPeriod, shmSamples, springOmega, pendulumPeriod, smallAnglePeriod, type Shm } from './oscillator.ts';
import { rollMarble, type Landscape } from './landscape.ts';

/** Chapter 14's controlled comparison: same spring, independently chosen release distance.
 * All coordinates and derivatives come from oscillator.ts; there is no second solver. */
export function springClock(amplitude = 0.5, mass = 1, stiffness = 4) {
  const motion: Shm = { A: amplitude, omega: springOmega(stiffness, mass), phase: 0 };
  return { motion, period: shmPeriod(motion), samples: shmSamples(motion, 0, 2 * Math.PI, 401) };
}
export function clockFrame(amplitude: number, mass: number, time: number) {
  return circlePoint({ A: amplitude, omega: springOmega(4, mass), phase: 0 }, time);
}

/** Unit-length pendulum with g/L=4 s^-2, matching the spring's small-swing clock.
 * A coordinate is angular: the effective inertia mL² is 1 kg m², not a linear mass.
 * Integrate the actual sine force; never draw a cosine with the exact period substituted. */
export function pendulumClock(degrees: number) {
  const angle = degrees * Math.PI / 180;
  const landscape: Landscape = {
    id: 'ch14-pendulum', label: 'pendulum', domain: [-Math.PI, Math.PI],
    U: theta => 4 * (1 - Math.cos(theta)), dU: theta => 4 * Math.sin(theta),
  };
  const period = pendulumPeriod(angle, 1, 4);
  const referencePeriod = smallAnglePeriod(1, 4);
  const samples = rollMarble(landscape, angle, 0, { dt: 0.002, steps: 4000 });
  return { angle, period, referencePeriod, excessPercent: 100 * (period / referencePeriod - 1), samples };
}

/** Transfer: a new spring, released on the LEFT, so copying the original cosine fails. */
export function leftReleaseVelocity() {
  return shmSamples({ A: 0.4, omega: springOmega(9, 1), phase: Math.PI }, 0, 2 * Math.PI / 3, 161)
    .map(s => ({ x: s.t, y: s.v }));
}
