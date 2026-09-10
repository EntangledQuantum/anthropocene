import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
  type Simulation,
} from 'd3-force';
import { loadIndex, type ContentIndex } from '../../lib/search-index.ts';
import { Button } from '../viz/controls.tsx';

/* ─────────────────────────────────────────────────────────────────────────
   The concept graph, as an actual graph.

   This page used to be a sorted list of cards that called itself a graph.
   The structure it described — which idea depends on which — was invisible,
   which is exactly the failure the thesis names for visualizations generally:
   an illustration you read is not a model you can interrogate.

   Now: a force-directed map that indexes itself from /index.json, so adding a
   lesson adds its concepts and edges with no extra step. Hovering a node
   isolates its neighbourhood — what it needs, and what needs it — and
   clicking opens the lesson that owns it.

   Nodes are CONCEPTS rather than lessons on purpose. A lesson teaching four
   ideas would otherwise collapse four distinct dependencies into one fat
   node, which is precisely the structure worth seeing.
   ───────────────────────────────────────────────────────────────────────── */

interface Node {
  id: string;
  title: string;
  blurb: string;
  ownerUrl: string | null;
  ownerTitle: string | null;
  tag: string;
  written: boolean;
  degree: number;
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null;
}
interface Link { source: Node | string; target: Node | string }

/* Chapter tags map onto the series ramp, in reading order, so position in the
   curriculum is legible as hue without leaving the palette. */
const TAG_COLOR: Record<string, string> = {
  ch1: '#7ff0e4',
  ch2: '#4fd8e8',
  ch3: '#8f9cf5',
  ch4: '#cf7ce8',
  ch5: '#ff4d9e',
};
const UNWRITTEN = '#5a5273';

export default function ConceptGraph() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<Node, Link> | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);

  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const fittedRef = useRef(false);
  const hoverRef = useRef<Node | null>(null);
  const dragRef = useRef<{ node: Node | null; panning: boolean; lastX: number; lastY: number }>({
    node: null, panning: false, lastX: 0, lastY: 0,
  });

  const [index, setIndex] = useState<ContentIndex | null>(null);
  const [hovered, setHovered] = useState<Node | null>(null);
  const [failed, setFailed] = useState(false);
  const [showUnwritten, setShowUnwritten] = useState(true);
  const [size, setSize] = useState({ w: 900, h: 620 });

  useEffect(() => { loadIndex().then(setIndex).catch(() => setFailed(true)); }, []);

  /* ── build the graph ───────────────────────────────────────────────────── */
  const built = useMemo(() => {
    if (!index) return null;
    const lessonTitle = new Map(index.lessons.map((l) => [l.id, l.title]));

    const degree = new Map<string, number>();
    for (const e of index.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }

    const nodes: Node[] = index.concepts
      .filter((c) => showUnwritten || c.ownerId)
      .map((c) => ({
        id: c.id,
        title: c.title,
        blurb: c.blurb,
        ownerUrl: c.ownerUrl,
        ownerTitle: c.ownerId ? (lessonTitle.get(c.ownerId) ?? null) : null,
        tag: c.tags[0] ?? '',
        written: Boolean(c.ownerId),
        degree: degree.get(c.id) ?? 0,
      }));

    const present = new Set(nodes.map((n) => n.id));
    const links: Link[] = index.edges
      .filter((e) => present.has(e.from) && present.has(e.to))
      .map((e) => ({ source: e.from, target: e.to }));

    return { nodes, links };
  }, [index, showUnwritten]);

  /** Centres and scales the view so the whole graph is comfortably inside. */
  const fitToView = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    if (!Number.isFinite(minX)) return;

    // Pad for node radii and the labels that hang below them.
    const pad = 64;
    const w = Math.max(maxX - minX, 1) + pad * 2;
    const h = Math.max(maxY - minY, 1) + pad * 2;
    const k = Math.max(0.35, Math.min(1.6, Math.min(size.w / w, size.h / h)));

    // Centre the bounding box rather than the force origin: disconnected
    // components pull the centroid away from where the mass actually is.
    viewRef.current = {
      k,
      x: -((minX + maxX) / 2) * k,
      y: -((minY + maxY) / 2) * k,
    };
  }, [size]);

  /* ── size ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: Math.max(520, Math.min(760, window.innerHeight * 0.68)) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── simulation ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!built) return;
    nodesRef.current = built.nodes;
    linksRef.current = built.links;

    simRef.current?.stop();
    const sim = forceSimulation<Node, Link>(built.nodes)
      .force('link', forceLink<Node, Link>(built.links).id((d) => d.id).distance(78).strength(0.42))
      // Repulsion scaled by degree so hubs claim room and the map stays legible.
      .force('charge', forceManyBody<Node>().strength((d) => -190 - d.degree * 26))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<Node>().radius((d) => 16 + d.degree * 0.9))
      // Gentle pull toward the axes stops disconnected components drifting away.
      .force('x', forceX(0).strength(0.045))
      .force('y', forceY(0).strength(0.055))
      .alpha(1)
      .alphaDecay(0.022);

    // Frame the result once it settles. A force layout has no idea how big
    // the viewport is, and arriving zoomed past the edges makes the map look
    // broken even though the structure is fine.
    fittedRef.current = false;
    sim.on('tick', () => {
      if (!fittedRef.current && sim.alpha() < 0.09) {
        fittedRef.current = true;
        fitToView();
      }
    });

    simRef.current = sim;
    return () => { sim.on('tick', null); sim.stop(); };
  }, [built, fitToView]);

  /* ── rendering ─────────────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }

    const view = viewRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(size.w / 2 + view.x, size.h / 2 + view.y);
    ctx.scale(view.k, view.k);

    const hover = hoverRef.current;
    const nodes = nodesRef.current;
    const links = linksRef.current;

    // Neighbourhood of the hovered node: what it needs, and what needs it.
    const near = new Set<string>();
    if (hover) {
      near.add(hover.id);
      for (const l of links) {
        const s = l.source as Node;
        const t = l.target as Node;
        if (s.id === hover.id) near.add(t.id);
        if (t.id === hover.id) near.add(s.id);
      }
    }

    /* edges */
    for (const l of links) {
      const s = l.source as Node;
      const t = l.target as Node;
      if (s.x == null || t.x == null) continue;

      const lit = hover ? near.has(s.id) && near.has(t.id) : false;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y!);
      ctx.lineTo(t.x, t.y!);
      ctx.strokeStyle = lit ? 'rgba(255,138,196,0.75)' : 'rgba(68,58,99,0.5)';
      ctx.lineWidth = (lit ? 1.6 : 0.8) / view.k;
      ctx.stroke();

      // Arrowhead on lit edges only — direction matters but every edge
      // carrying one would be noise at this density.
      if (lit) {
        const dx = t.x! - s.x!, dy = t.y! - s.y!;
        const len = Math.hypot(dx, dy) || 1;
        const r = 7 + (t.degree ?? 0) * 0.5;
        const hx = t.x! - (dx / len) * r;
        const hy = t.y! - (dy / len) * r;
        const a = Math.atan2(dy, dx);
        const head = 7 / view.k;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - head * Math.cos(a - 0.42), hy - head * Math.sin(a - 0.42));
        ctx.lineTo(hx - head * Math.cos(a + 0.42), hy - head * Math.sin(a + 0.42));
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,138,196,0.85)';
        ctx.fill();
      }
    }

    /* nodes */
    for (const n of nodes) {
      if (n.x == null) continue;
      const r = 5.5 + n.degree * 0.55;
      const dim = hover ? !near.has(n.id) : false;
      const color = n.written ? (TAG_COLOR[n.tag] ?? '#8f9cf5') : UNWRITTEN;

      ctx.globalAlpha = dim ? 0.16 : 1;

      if (!dim) {
        ctx.shadowColor = color;
        ctx.shadowBlur = (hover && near.has(n.id) ? 22 : 12) / view.k;
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y!, r, 0, Math.PI * 2);
      if (n.written) {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        // Unwritten concepts read as outlines — present in the structure,
        // absent as content.
        ctx.fillStyle = '#0c0a15';
        ctx.fill();
        ctx.lineWidth = 1.4 / view.k;
        ctx.strokeStyle = color;
        ctx.setLineDash([3 / view.k, 3 / view.k]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.shadowBlur = 0;

      // Label hubs always, everything else only when the neighbourhood is lit.
      const label = hover ? near.has(n.id) : n.degree >= 8;
      if (label && !dim) {
        ctx.globalAlpha = 1;
        ctx.font = `${12 / view.k}px "Inter Variable", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(6,5,10,0.85)';
        const w = ctx.measureText(n.title).width;
        ctx.fillRect(n.x - w / 2 - 4 / view.k, n.y! + r + 3 / view.k, w + 8 / view.k, 16 / view.k);
        ctx.fillStyle = n.id === hover?.id ? '#f6f2fb' : '#c9c1dc';
        ctx.fillText(n.title, n.x, n.y! + r + 15 / view.k);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [size]);

  /* ── animation loop ────────────────────────────────────────────────────── */
  useEffect(() => {
    let raf = 0;
    const frame = () => { draw(); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  /* ── pointer ───────────────────────────────────────────────────────────── */
  const toWorld = (clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - r.left - size.w / 2 - v.x) / v.k,
      y: (clientY - r.top - size.h / 2 - v.y) / v.k,
    };
  };

  const nodeAt = (wx: number, wy: number): Node | null => {
    let best: Node | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current) {
      if (n.x == null) continue;
      const d = Math.hypot(n.x - wx, n.y! - wy);
      const r = 5.5 + n.degree * 0.55 + 7;
      if (d < r && d < bestD) { best = n; bestD = d; }
    }
    return best;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;

    if (drag.node) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      drag.node.fx = x;
      drag.node.fy = y;
      simRef.current?.alphaTarget(0.28).restart();
      return;
    }
    if (drag.panning) {
      viewRef.current.x += e.clientX - drag.lastX;
      viewRef.current.y += e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }

    const { x, y } = toWorld(e.clientX, e.clientY);
    const found = nodeAt(x, y);
    if (found?.id !== hoverRef.current?.id) {
      hoverRef.current = found;
      setHovered(found);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toWorld(e.clientX, e.clientY);
    const found = nodeAt(x, y);
    if (found) {
      dragRef.current.node = found;
      found.fx = found.x;
      found.fy = found.y;
    } else {
      dragRef.current.panning = true;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (drag.node) {
      // Release the pin so the layout can relax around the new position.
      drag.node.fx = null;
      drag.node.fy = null;
      simRef.current?.alphaTarget(0);
    }
    drag.node = null;
    drag.panning = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    const v = viewRef.current;
    const next = Math.max(0.35, Math.min(3.2, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    v.k = next;
  };

  const reheat = () => {
    for (const n of nodesRef.current) { n.fx = null; n.fy = null; }
    fittedRef.current = false;
    simRef.current?.alpha(1).restart();
  };

  // Refit when the container resizes, so the map stays framed.
  useEffect(() => { fitToView(); }, [size, fitToView]);

  const written = built?.nodes.filter((n) => n.written).length ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Button active={showUnwritten} onClick={() => setShowUnwritten(!showUnwritten)} accent="orchid">
          {showUnwritten ? 'hiding nothing' : 'written only'}
        </Button>
        <Button onClick={reheat}>re-centre</Button>
        <span className="hud-label" style={{ marginLeft: 'auto' }}>
          {written} written · {(built?.nodes.length ?? 0) - written} outlined · {built?.links.length ?? 0} links
        </span>
      </div>

      <div
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => { endDrag(); hoverRef.current = null; setHovered(null); }}
        onWheel={onWheel}
        onClick={() => { if (hovered?.ownerUrl) window.location.href = hovered.ownerUrl; }}
        style={{
          position: 'relative', height: size.h, touchAction: 'none',
          cursor: hovered ? (hovered.ownerUrl ? 'pointer' : 'not-allowed') : 'grab',
          border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)',
          background:
            'radial-gradient(70% 70% at 50% 45%, color-mix(in oklab, var(--color-surface) 55%, transparent), transparent 75%), color-mix(in oklab, var(--color-abyss) 80%, transparent)',
          overflow: 'hidden',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block' }} />

        {failed && (
          <p style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--sig-warn)' }}>
            Could not load the graph index.
          </p>
        )}
        {!index && !failed && (
          <p className="hud-label" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            building the map…
          </p>
        )}

        {/* hover card */}
        {hovered && (
          <div
            className="hud"
            style={{
              position: 'absolute', left: 16, bottom: 16, maxWidth: 380,
              padding: '14px 16px', pointerEvents: 'none',
            }}
          >
            <span className="hud-label" style={{ color: hovered.written ? (TAG_COLOR[hovered.tag] ?? 'var(--color-iris)') : 'var(--color-ink-ghost)' }}>
              {hovered.written ? hovered.tag || 'concept' : 'not yet written'}
            </span>
            <h3 style={{ margin: '7px 0 6px', fontSize: '1.12rem' }}>{hovered.title}</h3>
            <p style={{ margin: '0 0 10px', fontSize: '0.94rem', lineHeight: 1.55, color: 'var(--color-ink-soft)' }}>
              {hovered.blurb}
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', borderTop: '1px solid var(--color-rule)', paddingTop: 9 }}>
              <span className="hud-label">{hovered.degree} connections</span>
              {hovered.ownerTitle
                ? <span className="hud-label" style={{ color: 'var(--color-cyan)' }}>click → {hovered.ownerTitle}</span>
                : <span className="hud-label" style={{ color: 'var(--sig-warn)' }}>no lesson yet</span>}
            </div>
          </div>
        )}

        <span className="hud-label" style={{ position: 'absolute', right: 14, bottom: 12, color: 'var(--color-ink-ghost)', pointerEvents: 'none' }}>
          drag to pan · scroll to zoom · drag a node to pull it
        </span>
      </div>
    </div>
  );
}
