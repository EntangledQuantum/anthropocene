import { describe, expect, it } from 'vitest';
import { solveDense } from '../linalg.ts';
import {
  HAT_SKETCH_INDEX,
  HAT_SKETCH_NODES,
  LOADS,
  assembleLoad,
  assembleStiffness,
  blendNodes,
  chebyshevNodes,
  elementStiffness,
  femStencil,
  hat,
  interiorStiffness,
  isSpd,
  isSymmetric,
  l2Error,
  maxNodalError,
  maxSpacing,
  meshStencilsMatch,
  naiveFdPoisson,
  naiveFdToFemL2Ratio,
  partitionOfUnity,
  reduceDirichlet,
  solvePoisson,
  spacings,
  stencilsMatch,
  uniformNodes,
} from '../fem1d.ts';

/* Pedagogical claims of the hat-functions lesson. If the lesson says hats
   partition unity, that assembled 1D Poisson is SPD, that uniform FEM is
   central FD, or that irregular nodes still converge, this file pins it. */

const constLoad = LOADS.const;
const sineLoad = LOADS.sine;

describe('piecewise-linear hats', () => {
  const meshes = [
    uniformNodes(6),
    chebyshevNodes(6),
    HAT_SKETCH_NODES,
    blendNodes(8, 0.7),
  ];

  it('are cardinal: φᵢ(xⱼ) = δᵢⱼ', () => {
    for (const nodes of meshes) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < nodes.length; j++) {
          const got = hat(nodes, i, nodes[j]!);
          expect(got).toBeCloseTo(i === j ? 1 : 0, 12);
        }
      }
    }
  });

  it('form a partition of unity on every mesh, at nodes and between them', () => {
    for (const nodes of meshes) {
      const xs = [
        ...nodes,
        ...spacings(nodes).map((h, e) => nodes[e]! + 0.5 * h),
        ...spacings(nodes).map((h, e) => nodes[e]! + 0.25 * h),
      ];
      for (const x of xs) {
        expect(partitionOfUnity(nodes, x)).toBeCloseTo(1, 12);
      }
    }
  });

  it('have compact support: φᵢ vanishes beyond the neighbouring nodes', () => {
    const nodes = HAT_SKETCH_NODES;
    const i = HAT_SKETCH_INDEX; // peak at 0.5, support (0.2, 0.9)
    expect(hat(nodes, i, 0.1)).toBe(0);
    expect(hat(nodes, i, 0.95)).toBe(0);
    expect(hat(nodes, i, 0.2)).toBe(0);
    expect(hat(nodes, i, 0.9)).toBe(0);
    expect(hat(nodes, i, 0.5)).toBe(1);
    expect(hat(nodes, i, 0.35)).toBeCloseTo(0.5, 12); // halfway up the left slope
  });

  it('the sketch hat is not isosceles — left slope is steeper than right', () => {
    const nodes = HAT_SKETCH_NODES;
    const i = HAT_SKETCH_INDEX;
    const hL = nodes[i]! - nodes[i - 1]!; // 0.3
    const hR = nodes[i + 1]! - nodes[i]!; // 0.4
    expect(hL).toBeCloseTo(0.3, 12);
    expect(hR).toBeCloseTo(0.4, 12);
    expect(hL).toBeLessThan(hR);
    // φ(0.5 − 0.15) = 0.5 on the left; the same distance on the right is not.
    expect(hat(nodes, i, 0.35)).toBeCloseTo(0.5, 12);
    expect(hat(nodes, i, 0.65)).toBeCloseTo((0.9 - 0.65) / 0.4, 12);
    expect(hat(nodes, i, 0.65)).toBeGreaterThan(0.5);
  });
});

describe('element matrix and assembly', () => {
  it('the local 2×2 is (1/h) [[1, −1], [−1, 1]]', () => {
    const ke = elementStiffness(0.5);
    expect(ke[0]![0]).toBeCloseTo(2, 12);
    expect(ke[0]![1]).toBeCloseTo(-2, 12);
    expect(ke[1]![0]).toBeCloseTo(-2, 12);
    expect(ke[1]![1]).toBeCloseTo(2, 12);
  });

  it('two equal elements assemble a middle diagonal of 4 — the 2×2s overlap', () => {
    const nodes = uniformNodes(2);
    const K = assembleStiffness(nodes);
    // Each element contributes 2 to the middle diagonal; they add.
    expect(K[1]![1]).toBeCloseTo(4, 12);
    expect(K[1]![0]).toBeCloseTo(-2, 12);
    expect(K[1]![2]).toBeCloseTo(-2, 12);
    expect(K[0]![0]).toBeCloseTo(2, 12);
    expect(K[2]![2]).toBeCloseTo(2, 12);
    expect(K[0]![2]).toBeCloseTo(0, 12);
  });

  it('assembly of n−1 local 2×2s is the global tridiagonal stiffness', () => {
    const nodes = chebyshevNodes(5);
    const K = assembleStiffness(nodes);
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (Math.abs(i - j) > 1) expect(K[i]![j]).toBeCloseTo(0, 12);
      }
    }
    // Rebuild from element 2×2s and demand equality.
    const rebuilt = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let e = 0; e < n - 1; e++) {
      const ke = elementStiffness(nodes[e + 1]! - nodes[e]!);
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) rebuilt[e + a]![e + b]! += ke[a]![b]!;
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) expect(K[i]![j]).toBeCloseTo(rebuilt[i]![j]!, 12);
    }
  });
});

describe('uniform mesh: FEM is central FD', () => {
  it('interior rows are (1/h)(−1, 2, −1)', () => {
    const h = 0.25;
    const nodes = uniformNodes(4);
    expect(spacings(nodes).every((s) => Math.abs(s - h) < 1e-12)).toBe(true);
    const Kr = interiorStiffness(nodes);
    for (let r = 0; r < Kr.length; r++) {
      for (let c = 0; c < Kr.length; c++) {
        const want = r === c ? 2 / h : Math.abs(r - c) === 1 ? -1 / h : 0;
        expect(Kr[r]![c]).toBeCloseTo(want, 12);
      }
    }
  });

  it('those rows match the FEM stencil helper, and stencilsMatch is true', () => {
    const nodes = uniformNodes(5);
    expect(meshStencilsMatch(nodes)).toBe(true);
    const s = femStencil(nodes, 2);
    const h = 0.2;
    expect(s.left).toBeCloseTo(-1 / h, 12);
    expect(s.diag).toBeCloseTo(2 / h, 12);
    expect(s.right).toBeCloseTo(-1 / h, 12);
  });

  it('for −u″ = 2, FEM and skip-neighbour FD produce the same nodes (both exact)', () => {
    const nodes = uniformNodes(6);
    const fem = solvePoisson(nodes, constLoad.f);
    const fd = naiveFdPoisson(nodes, constLoad.f);
    for (let i = 0; i < nodes.length; i++) {
      expect(fem.u[i]).toBeCloseTo(fd[i]!, 12);
      expect(fem.u[i]).toBeCloseTo(constLoad.exact(nodes[i]!), 12);
    }
  });

  it('the two-element problem is K = [4], F = 1, so u(½) = 1/4', () => {
    // −u″ = 2 ⇒ u = x(1−x). Area of φ₁ is 1/2, so F = 1 and 1/4 = 0.25.
    const nodes = uniformNodes(2);
    const fem = solvePoisson(nodes, constLoad.f);
    expect(fem.Kr[0]![0]).toBeCloseTo(4, 12);
    expect(fem.Fr[0]).toBeCloseTo(1, 10);
    expect(fem.u[1]).toBeCloseTo(0.25, 10);
    expect(constLoad.exact(0.5)).toBeCloseTo(0.25, 12);
  });
});

describe('assembled 1D Poisson is SPD', () => {
  it('interior K is symmetric positive definite on a uniform mesh', () => {
    const Kr = interiorStiffness(uniformNodes(7));
    expect(isSymmetric(Kr)).toBe(true);
    expect(isSpd(Kr)).toBe(true);
  });

  it('interior K is SPD on Chebyshev-mapped and blended irregular nodes', () => {
    for (const nodes of [chebyshevNodes(6), blendNodes(9, 0.85), HAT_SKETCH_NODES]) {
      const Kr = interiorStiffness(nodes);
      expect(isSpd(Kr)).toBe(true);
    }
  });

  it('a nonzero interior field has strictly positive energy uᵀ K u = ∫ (u′)²', () => {
    const nodes = chebyshevNodes(5);
    const Kr = interiorStiffness(nodes);
    const x = [0.4, -0.2, 0.7];
    let q = 0;
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < x.length; j++) q += x[i]! * Kr[i]![j]! * x[j]!;
    }
    expect(q).toBeGreaterThan(0);
  });
});

describe('1D P1 Poisson is nodally exact (exact load)', () => {
  it('hits every node of x(1−x) on a uniform mesh', () => {
    const nodes = uniformNodes(5);
    const fem = solvePoisson(nodes, constLoad.f);
    expect(maxNodalError(nodes, fem.u, constLoad.exact)).toBeLessThan(1e-11);
  });

  it('hits every node of x(1−x) on an irregular mesh too', () => {
    const nodes = chebyshevNodes(7);
    const fem = solvePoisson(nodes, constLoad.f);
    expect(maxNodalError(nodes, fem.u, constLoad.exact)).toBeLessThan(1e-10);
  });

  it('hits every node of sin(πx) once the load is integrated accurately', () => {
    const nodes = blendNodes(8, 0.6);
    const fem = solvePoisson(nodes, sineLoad.f);
    expect(maxNodalError(nodes, fem.u, sineLoad.exact)).toBeLessThan(1e-9);
  });
});

describe('irregular nodes: variational still works, skip-a-neighbour does not', () => {
  it('stencilsMatch is false as soon as a neighbour moves', () => {
    const nodes = uniformNodes(4);
    expect(meshStencilsMatch(nodes)).toBe(true);
    const shifted = nodes.slice();
    shifted[2] = 0.42;
    expect(stencilsMatch(shifted, 2)).toBe(false);
    expect(meshStencilsMatch(shifted)).toBe(false);
  });

  it('naive FD misses the parabola on a Chebyshev mesh; FEM does not', () => {
    const nodes = chebyshevNodes(6);
    const fem = solvePoisson(nodes, constLoad.f);
    const fd = naiveFdPoisson(nodes, constLoad.f);
    expect(maxNodalError(nodes, fem.u, constLoad.exact)).toBeLessThan(1e-10);
    expect(maxNodalError(nodes, fd, constLoad.exact)).toBeGreaterThan(1e-3);
    expect(l2Error(nodes, fd, constLoad.exact)).toBeGreaterThan(
      2 * l2Error(nodes, fem.u, constLoad.exact),
    );
  });

  it('the FEM stiffness on an irregular mesh is still the variational 2×2 assembly', () => {
    const nodes = chebyshevNodes(4);
    const Kr = interiorStiffness(nodes);
    // First interior node: neighbours at nodes[0] and nodes[2].
    const s = femStencil(nodes, 1);
    expect(Kr[0]![0]).toBeCloseTo(s.diag, 12);
    expect(Kr[0]![1]).toBeCloseTo(s.right, 12);
  });
});

describe('irregular nodes still converge', () => {
  it('L² error of P1 Galerkin on Chebyshev-mapped nodes falls like h²', () => {
    const ns = [8, 16, 32];
    const errors = ns.map((n) => {
      const nodes = chebyshevNodes(n);
      const fem = solvePoisson(nodes, sineLoad.f);
      return { n, h: maxSpacing(nodes), e: l2Error(nodes, fem.u, sineLoad.exact) };
    });
    expect(errors[1]!.e).toBeLessThan(errors[0]!.e);
    expect(errors[2]!.e).toBeLessThan(errors[1]!.e);
    const p01 = Math.log(errors[0]!.e / errors[1]!.e) / Math.log(errors[0]!.h / errors[1]!.h);
    const p12 = Math.log(errors[1]!.e / errors[2]!.e) / Math.log(errors[1]!.h / errors[2]!.h);
    expect(p01).toBeGreaterThan(1.7);
    expect(p12).toBeGreaterThan(1.7);
  });

  it('the same refinement with naive FD stays worse than FEM, and is not second order', () => {
    const femE: number[] = [];
    const fdE: number[] = [];
    const hs: number[] = [];
    for (const n of [8, 16, 32]) {
      const nodes = chebyshevNodes(n);
      hs.push(maxSpacing(nodes));
      femE.push(l2Error(nodes, solvePoisson(nodes, constLoad.f).u, constLoad.exact));
      fdE.push(l2Error(nodes, naiveFdPoisson(nodes, constLoad.f), constLoad.exact));
    }
    expect(fdE[0]!).toBeGreaterThan(2 * femE[0]!);
    expect(fdE[2]!).toBeGreaterThan(2 * femE[2]!);
    const pFd = Math.log(fdE[1]! / fdE[2]!) / Math.log(hs[1]! / hs[2]!);
    // Skip-a-neighbour on a stretched mesh does not recover the uniform-grid
    // order-2 of central differences. FEM on the same nodes does.
    expect(pFd).toBeLessThan(1.6);
    const pFem = Math.log(femE[1]! / femE[2]!) / Math.log(hs[1]! / hs[2]!);
    expect(pFem).toBeGreaterThan(1.7);
  });
});

describe('the estimate scenario is a real ratio, not a typed constant', () => {
  it('naive FD is several times worse than FEM in L² on the 8-element Chebyshev mesh', () => {
    const ratio = naiveFdToFemL2Ratio();
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(200);
    expect(Number.isFinite(ratio)).toBe(true);
  });
});

describe('Dirichlet reduction leaves a solvable interior system', () => {
  it('the reduced two-element system is the 1×1 [4] u = F', () => {
    const nodes = uniformNodes(2);
    const K = assembleStiffness(nodes);
    const F = assembleLoad(nodes, constLoad.f);
    const { K: Kr, F: Fr } = reduceDirichlet(K, F);
    expect(Kr.length).toBe(1);
    expect(Kr[0]![0]).toBeCloseTo(4, 12);
    const u = solveDense(Kr, Fr);
    expect(u).not.toBeNull();
    expect(u![0]).toBeCloseTo(0.25, 10);
  });
});
