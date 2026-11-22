import { MarkGlyph } from "@/components/mark";

// Exploded isometric stack, one plate per step, drawn on a 2:1 dimetric grid.
// 1 alerts land as points · 2 the caller's words become stacked records · 3 the operator fans out to approved replies and a guard · 4 one hub connects everyone.
const S = 260;            // half-width of a plate
const CX = 330;
const GAP = 205;
const TOP = 150;
const DEPTH = 7;          // plate thickness

// Map plate coordinates (u, v in -1..1) to screen for the plate centred at cy.
const at = (cy: number, u: number, v: number) => ({ x: CX + (u - v) * S * 0.5 * 1.0, y: cy + (u + v) * S * 0.25 });
const pt = (cy: number, u: number, v: number) => { const p = at(cy, u, v); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; };
const poly = (cy: number, pts: [number, number][]) => pts.map(([u, v]) => pt(cy, u, v)).join(" ");

function Plate({ cy }: { cy: number }) {
  const edge: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const grid = [-0.6, -0.2, 0.2, 0.6];
  return (
    <g>
      <polygon points={poly(cy + DEPTH, edge)} fill="var(--background)" stroke="currentColor" strokeOpacity="0.28" />
      <polygon points={poly(cy, edge)} fill="var(--background)" stroke="currentColor" strokeOpacity="0.4" />
      {grid.map((g) => (
        <g key={g} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="2 3">
          <line x1={at(cy, g, -1).x} y1={at(cy, g, -1).y} x2={at(cy, g, 1).x} y2={at(cy, g, 1).y} />
          <line x1={at(cy, -1, g).x} y1={at(cy, -1, g).y} x2={at(cy, 1, g).x} y2={at(cy, 1, g).y} />
        </g>
      ))}
      {edge.map(([u, v]) => { const p = at(cy, u * 0.94, v * 0.94); return <ellipse key={`${u}${v}`} cx={p.x} cy={p.y} rx="3.2" ry="1.8" fill="none" stroke="currentColor" strokeOpacity="0.5" />; })}
    </g>
  );
}

// A small isometric slab (a record / a tile), optionally stacked.
function Slab({ cy, u, v, s = 0.12, layers = 1 }: { cy: number; u: number; v: number; s?: number; layers?: number }) {
  return (
    <g>
      {Array.from({ length: layers }, (_, k) => {
        const lift = -k * 3.5;
        const sq: [number, number][] = [[u - s, v - s], [u + s, v - s], [u + s, v + s], [u - s, v + s]];
        return <polygon key={k} points={poly(cy + lift, sq)} fill="var(--card)" stroke="currentColor" strokeOpacity="0.55" />;
      }).reverse()}
    </g>
  );
}

const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend = 0.35) =>
  `M${a.x},${a.y} Q${(a.x + b.x) / 2},${Math.min(a.y, b.y) - Math.abs(a.x - b.x) * bend} ${b.x},${b.y}`;

function Alerts({ cy }: { cy: number }) {
  return <g fill="currentColor">{[[-0.4, -0.5], [0.45, -0.3], [-0.55, 0.3], [0.5, 0.45], [0.05, 0.6]].map(([u, v]) => { const p = at(cy, u, v); return <circle key={`${u}${v}`} cx={p.x} cy={p.y} r="2.6" />; })}</g>;
}

function Records({ cy }: { cy: number }) {
  const spots: [number, number, number][] = [[-0.55, -0.25, 1], [0.1, -0.55, 3], [-0.1, 0.15, 4], [0.55, 0.05, 2], [0.15, 0.6, 3]];
  return (
    <g>
      <g fill="none" stroke="currentColor" strokeOpacity="0.45">
        <line x1={at(cy, -1, -0.4).x} y1={at(cy, -1, -0.4).y} x2={at(cy, 1, 0.4).x} y2={at(cy, 1, 0.4).y} />
        {spots.slice(1).map(([u, v]) => <path key={`${u}${v}`} d={curve(at(cy, -0.1, 0.15), at(cy, u, v), 0.15)} />)}
      </g>
      {spots.map(([u, v, n]) => <Slab key={`${u}${v}`} cy={cy} u={u} v={v} s={0.13} layers={n} />)}
    </g>
  );
}

function Fan({ cy }: { cy: number }) {
  const from = at(cy, -0.75, -0.75);
  const nodes = Array.from({ length: 7 }, (_, i) => [-0.65 + i * 0.22, 0.65 - i * 0.22] as [number, number]);
  return (
    <g>
      <g fill="none" stroke="currentColor" strokeOpacity="0.4">
        {nodes.map(([u, v]) => <path key={`c${u}`} d={curve(from, at(cy, u, v), 0.2)} />)}
        {nodes.map(([u, v]) => { const a = at(cy, u, v); const b = at(cy, 1, v + (1 - u)); return <line key={`l${u}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
      </g>
      {nodes.map(([u, v]) => <Slab key={u} cy={cy} u={u} v={v} s={0.07} layers={2} />)}
    </g>
  );
}

function Hub({ cy }: { cy: number }) {
  const ends: [number, number][] = [[-1.25, 0], [1.25, 0], [0, -1.25], [0, 1.25]];
  const c = at(cy, 0, 0);
  return (
    <g>
      <g stroke="currentColor" strokeOpacity="0.5" markerEnd="url(#how-arrow)">
        {ends.map(([u, v]) => { const p = at(cy, u, v); return <line key={`${u}${v}`} x1={c.x} y1={c.y} x2={p.x} y2={p.y} />; })}
      </g>
      <Slab cy={cy} u={0} v={0} s={0.42} layers={3} />
      <g transform={`translate(${c.x - 20} ${c.y - 24}) scale(2)`} className="text-foreground"><MarkGlyph strokeWidth={1.1} /></g>
    </g>
  );
}

const LAYERS = [Alerts, Records, Fan, Hub];

export function HowDiagram({ labels }: { labels: string[] }) {
  const height = TOP + GAP * (LAYERS.length - 1) + S * 0.5 + 40;
  return (
    <svg viewBox={`0 0 660 ${height}`} className="h-auto w-full text-foreground" role="img" aria-label={labels.join(" → ")}>
      <defs><marker id="how-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L7,4 L0,7" fill="none" stroke="currentColor" strokeOpacity="0.6" /></marker></defs>
      {LAYERS.map((Layer, k) => {
        const cy = TOP + GAP * k;
        return <g key={labels[k] ?? k}><Plate cy={cy} /><Layer cy={cy} /></g>;
      }).reverse()}
    </svg>
  );
}
