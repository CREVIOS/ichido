// Isometric stack: one plane per step (machine, caller, operator, next step), joined by dashed risers.
// Each plane carries a small tile pattern; the black tile is the thing that step adds to the case.
const W = 300;
const H = 150;
const CX = 200;
const GAP = 120;
const TOP = 90;

const rhombus = (cx: number, cy: number, w: number, h: number) => `M${cx},${cy - h / 2} L${cx + w / 2},${cy} L${cx},${cy + h / 2} L${cx - w / 2},${cy} Z`;
// Position of tile (i, j) on a plane whose centre is (cx, cy), on a 5×5 isometric grid.
const tile = (cx: number, cy: number, i: number, j: number) => ({ x: cx + (i - j) * (W / 12), y: cy + (i + j - 4) * (H / 12) });

const TILES: { on: [number, number][]; key: [number, number] }[] = [
  { on: [[2, 2]], key: [2, 2] },
  { on: [[1, 1], [1, 2], [2, 1], [3, 3]], key: [1, 2] },
  { on: [[0, 1], [1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]], key: [2, 3] },
  { on: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]], key: [4, 4] },
];

export function HowDiagram({ labels }: { labels: string[] }) {
  const height = TOP + GAP * (TILES.length - 1) + H / 2 + 20;
  return (
    <svg viewBox={`0 0 420 ${height}`} className="h-auto w-full max-w-[460px] text-foreground" role="img" aria-label={labels.join(" → ")}>
      {TILES.slice(1).map((_, k) => {
        const y1 = TOP + GAP * k;
        return [-W / 2, 0, W / 2].map((dx) => (
          <line key={`${k}-${dx}`} x1={CX + dx} x2={CX + dx} y1={y1 + (dx ? 0 : H / 2)} y2={y1 + GAP + (dx ? 0 : -H / 2)} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="2 4" />
        ));
      })}
      {TILES.map((t, k) => {
        const cy = TOP + GAP * k;
        return (
          <g key={labels[k]}>
            <path d={rhombus(CX, cy, W, H)} fill="var(--card)" stroke="currentColor" strokeOpacity="0.22" />
            {t.on.map(([i, j]) => {
              const p = tile(CX, cy, i, j);
              const key = i === t.key[0] && j === t.key[1];
              return <path key={`${i}${j}`} d={rhombus(p.x, p.y, W / 7, H / 7)} fill={key ? "currentColor" : "none"} stroke="currentColor" strokeOpacity={key ? 1 : 0.35} />;
            })}
            <text x={CX + W / 2 + 14} y={cy + 4} className="fill-current font-mono text-[11px]" fillOpacity="0.5">{labels[k]}</text>
          </g>
        );
      })}
    </svg>
  );
}
