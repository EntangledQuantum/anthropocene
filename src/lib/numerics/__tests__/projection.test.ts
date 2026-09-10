import { describe, expect, it } from 'vitest';
import {
  addMac,
  cloneMac,
  curlZ,
  divergence,
  fillSink,
  fillUniform,
  fillVortex,
  jacobiItersUntil,
  kineticEnergy,
  leftoverMaxDiv,
  macGrid,
  macInner,
  maxAbs,
  maxAbsCurl,
  maxAbsDiv,
  meanDiv,
  meanOf,
  projectJacobi,
  projectSpectral,
  PROJ_N,
  runBlob,
  solvePoissonSpectral,
  subtractMeanVelocity,
} from '../projection.ts';

const N = PROJ_N;

describe('MAC identities', () => {
  it('discrete div of a vertex stream-function vortex is identically zero', () => {
    const g = macGrid(N);
    fillVortex(g);
    expect(maxAbsDiv(g)).toBeLessThan(1e-12);
    expect(maxAbsCurl(g)).toBeGreaterThan(0.5);
  });

  it('discrete curl of a cell-centred gradient sink is identically zero', () => {
    const g = macGrid(N);
    fillSink(g);
    expect(maxAbsCurl(g)).toBeLessThan(1e-12);
    expect(maxAbsDiv(g)).toBeGreaterThan(0.5);
  });

  it('mean discrete div of any periodic MAC field is zero (compatibility)', () => {
    const mixed = macGrid(N);
    fillVortex(mixed);
    const sink = macGrid(N);
    fillSink(sink);
    addMac(mixed, sink);
    expect(Math.abs(meanDiv(mixed))).toBeLessThan(1e-14);

    const noise = macGrid(N);
    for (let i = 0; i < noise.u.length; i++) {
      noise.u[i] = Math.sin(i * 1.7);
      noise.v[i] = Math.cos(i * 0.9);
    }
    expect(Math.abs(meanDiv(noise))).toBeLessThan(1e-14);
  });

  it('a uniform translation is divergence-free and curl-free', () => {
    const g = macGrid(N);
    fillUniform(g, 0.3, -0.2);
    expect(maxAbsDiv(g)).toBeLessThan(1e-15);
    expect(maxAbs(curlZ(g))).toBeLessThan(1e-15);
  });
});

describe('spectral Helmholtz projection', () => {
  it('sends max|div| of a mixed field to roundoff', () => {
    const g = macGrid(N);
    fillVortex(g);
    const sink = macGrid(N);
    fillSink(sink);
    addMac(g, sink);
    const before = maxAbsDiv(g);
    const p = projectSpectral(g);
    expect(before).toBeGreaterThan(0.5);
    expect(p.maxDivAfter).toBeLessThan(1e-10);
    expect(p.maxDivAfter).toBeLessThan(1e-8 * before);
  });

  it('is idempotent: a second projection does not move the field', () => {
    const g = macGrid(N);
    fillVortex(g);
    const sink = macGrid(N);
    fillSink(sink);
    addMac(g, sink);
    const once = projectSpectral(g).grid;
    const twice = projectSpectral(once).grid;
    let max = 0;
    for (let i = 0; i < once.u.length; i++) {
      max = Math.max(max, Math.abs(once.u[i]! - twice.u[i]!), Math.abs(once.v[i]! - twice.v[i]!));
    }
    expect(max).toBeLessThan(1e-12);
  });

  it('kills a pure sink and leaves a pure vortex', () => {
    const sink = macGrid(N);
    fillSink(sink);
    const keSink = kineticEnergy(sink);
    const pSink = projectSpectral(sink).grid;
    expect(kineticEnergy(pSink)).toBeLessThan(1e-18 * Math.max(keSink, 1));
    expect(maxAbs(pSink.u)).toBeLessThan(1e-12);
    expect(maxAbs(pSink.v)).toBeLessThan(1e-12);

    const vortex = macGrid(N);
    fillVortex(vortex);
    const pVortex = projectSpectral(vortex).grid;
    let max = 0;
    for (let i = 0; i < vortex.u.length; i++) {
      max = Math.max(max, Math.abs(vortex.u[i]! - pVortex.u[i]!), Math.abs(vortex.v[i]! - pVortex.v[i]!));
    }
    expect(max).toBeLessThan(1e-12);
  });

  it('the kept field is orthogonal to the removed gradient (discrete Hodge)', () => {
    const g = macGrid(N);
    fillVortex(g);
    const sink = macGrid(N);
    fillSink(sink);
    addMac(g, sink);
    const p = projectSpectral(g);
    const removed = cloneMac(g);
    for (let i = 0; i < g.u.length; i++) {
      removed.u[i]! -= p.grid.u[i]!;
      removed.v[i]! -= p.grid.v[i]!;
    }
    const inner = macInner(p.grid, removed);
    const scale = Math.sqrt(macInner(p.grid, p.grid) * macInner(removed, removed));
    expect(Math.abs(inner)).toBeLessThan(1e-10 * Math.max(scale, 1e-18));
  });

  it('Poisson recovers a mean-zero eigenmode of the 5-point Laplacian', () => {
    const n = 16;
    const h = 1 / n;
    const rhs = new Float64Array(n * n);
    const k = 2;
    const l = 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        rhs[i + j * n] = Math.cos((2 * Math.PI * (k * i + l * j)) / n);
      }
    }
    const phi = solvePoissonSpectral(rhs, n, h);
    const lap = new Float64Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = phi[i + j * n]!;
        const e = phi[((i + 1) % n) + j * n]!;
        const w = phi[((i - 1 + n) % n) + j * n]!;
        const nn = phi[i + ((j + 1) % n) * n]!;
        const s = phi[i + ((j - 1 + n) % n) * n]!;
        lap[i + j * n] = (e + w + nn + s - 4 * c) / (h * h);
      }
    }
    let err = 0;
    for (let i = 0; i < rhs.length; i++) err = Math.max(err, Math.abs(lap[i]! - rhs[i]!));
    expect(err).toBeLessThan(1e-10);
    expect(Math.abs(meanOf(phi))).toBeLessThan(1e-12);
  });
});

describe('tempting cleanups are not the projection', () => {
  it('subtracting the mean velocity leaves max|div| unchanged', () => {
    const g = macGrid(N);
    fillVortex(g);
    const sink = macGrid(N);
    fillSink(sink);
    addMac(g, sink);
    const before = maxAbsDiv(g);
    const after = maxAbsDiv(subtractMeanVelocity(g));
    expect(Math.abs(after - before)).toBeLessThan(1e-14);
  });

  it('eight Jacobi sweeps leave leftover div orders of magnitude above spectral', () => {
    const g = macGrid(N);
    fillVortex(g);
    const sink = macGrid(N);
    fillSink(sink);
    addMac(g, sink);
    const eight = projectJacobi(g, 8).maxDivAfter;
    const spec = projectSpectral(g).maxDivAfter;
    expect(eight).toBeGreaterThan(0.05);
    expect(spec).toBeLessThan(1e-10);
    expect(eight / Math.max(spec, 1e-18)).toBeGreaterThan(1e6);
  });

  it('more Jacobi iterations strictly reduce leftover max|div| on a mixed field', () => {
    const g = macGrid(16);
    fillVortex(g, 0.055);
    const sink = macGrid(16);
    fillSink(sink, 0.022);
    addMac(g, sink);
    const a = projectJacobi(g, 8).maxDivAfter;
    const b = projectJacobi(g, 40).maxDivAfter;
    const c = projectJacobi(g, 120).maxDivAfter;
    expect(b).toBeLessThan(a * 0.7);
    expect(c).toBeLessThan(b * 0.7);
  });

  it('leftoverMaxDiv ranks raw ≈ mean ≫ jacobi-8 ≫ spectral', () => {
    const raw = leftoverMaxDiv('mixed', 'raw');
    const mean = leftoverMaxDiv('mixed', 'mean');
    const jac = leftoverMaxDiv('mixed', 'jacobi-8');
    const spec = leftoverMaxDiv('mixed', 'spectral');
    expect(Math.abs(mean - raw) / raw).toBeLessThan(1e-12);
    expect(jac).toBeLessThan(raw * 0.9);
    expect(jac).toBeGreaterThan(raw * 0.05);
    expect(spec).toBeLessThan(1e-10);
    expect(spec).toBeLessThan(jac * 1e-6);
  });
});

describe('a dye blob measures incompressibility as area', () => {
  it('shrinks on a mixed field without projection', () => {
    const run = runBlob({ field: 'mixed', project: false, tEnd: 1 });
    const last = run[run.length - 1]!;
    expect(last.area / last.area0).toBeLessThan(0.72);
    expect(last.area / last.area0).toBeGreaterThan(0.15);
    expect(last.maxDiv).toBeGreaterThan(0.5);
  });

  it('holds area once the same field is projected', () => {
    const run = runBlob({ field: 'mixed', project: true, tEnd: 1 });
    const last = run[run.length - 1]!;
    expect(Math.abs(last.area / last.area0 - 1)).toBeLessThan(0.04);
    expect(last.maxDiv).toBeLessThan(1e-10);
  });

  it('a pure vortex holds area even without projection', () => {
    const run = runBlob({ field: 'vortex', project: false, tEnd: 1 });
    const last = run[run.length - 1]!;
    expect(Math.abs(last.area / last.area0 - 1)).toBeLessThan(0.04);
    expect(last.maxDiv).toBeLessThan(1e-12);
  });
});

describe('Jacobi hunt used by the Tune scenario', () => {
  it('reaches 1% leftover div in a few dozen to a few hundred sweeps on n = 16', () => {
    const k = jacobiItersUntil(0.01, 16, 'mixed');
    expect(k).toBeGreaterThan(20);
    expect(k).toBeLessThan(250);
  });
});
