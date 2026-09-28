/**
 * Stern–Gerlach, Chapter 41: a beam of silver atoms through a magnet whose
 * field is stronger toward one pole.
 *
 * A magnetic dipole in a field that changes across the gap feels a force
 * F = μ_axis · dB/d(axis): the component of its moment along the magnet's axis
 * decides how hard it is pushed. Silver has one unpaired electron, so its
 * moment is one Bohr magneton.
 *
 *   classical   the moments point every which way, so μ_axis takes every value
 *               from −μ_B to +μ_B and the spots smear into one band;
 *   quantum     every atom, asked along any axis, answers ±μ_B: two spots.
 *
 * The numbers are those of the 1922 experiment, roughly: a 3.5 cm magnet,
 * 10³ T/m, atoms at 550 m/s from an oven. The screen sits at the magnet's exit.
 * Pinned in __tests__/stern-gerlach.test.ts.
 */

/** Bohr magneton, J/T. */
export const MU_B = 9.2740e-24;
/** Mass of a silver atom, kg (107.87 u). */
export const M_AG = 107.868 * 1.66054e-27;

export const SG = {
  /** Field gradient across the gap, T/m. */
  gradient: 1.0e3,
  /** Length of the pole pieces, m. */
  length: 0.035,
  /** Atom speed, m/s. */
  speed: 550,
  /** Beam width at the screen (standard deviation), mm. */
  spread: 0.012,
} as const;

/** Sideways deflection at the screen of an atom whose moment along the axis is
 *  μ_axis, in mm: ½ (μ_axis G / m) (L / v)². */
export function deflectionMM(muAxis = MU_B, g = SG): number {
  const a = (muAxis * g.gradient) / M_AG;
  const t = g.length / g.speed;
  return 0.5 * a * t * t * 1e3;
}

/** A small seeded generator, so a scene's first volley is the same for everyone. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-12), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Unit vector on the screen along the magnet's axis. 0° is straight up,
 *  90° is to the right. */
export const axisVector = (deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a), Math.cos(a)];
};

export type Beam = 'silver' | 'needles';

/**
 * Where `count` atoms land on the screen, in mm from the undeflected spot.
 *   'silver'   each atom's moment along the axis is +μ_B or −μ_B, half and half;
 *   'needles'  each is a little compass needle pointing in a random direction
 *              in 3D, so its component along the axis is uniform in [−μ_B, μ_B].
 */
export function fireAtoms(count: number, axisDeg: number, beam: Beam, seed = 1): [number, number][] {
  const r = rng(seed);
  const [ax, ay] = axisVector(axisDeg);
  const d = deflectionMM();
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    let along: number;
    if (beam === 'silver') {
      along = r() < 0.5 ? 1 : -1;
    } else {
      // A random direction on the sphere: cos of its angle to any fixed axis is uniform.
      const cz = 2 * r() - 1;
      along = cz;
    }
    const jx = gauss(r) * SG.spread, jy = gauss(r) * SG.spread;
    out.push([along * d * ax + jx, along * d * ay + jy]);
  }
  return out;
}

/** How many hits land inside a circular cup. */
export function countInCup(hits: readonly [number, number][], at: readonly [number, number], radius: number): number {
  let k = 0;
  for (const [x, y] of hits) if (Math.hypot(x - at[0], y - at[1]) <= radius) k++;
  return k;
}
