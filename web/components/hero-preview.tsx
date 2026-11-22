import { Bell, ChartNoAxesColumn, ChevronsLeft, CircleDashed, Clock, Languages, Landmark, ListFilter, MapPin, MessageSquare, Plus, RadioTower, Search, Table2, Timer } from "lucide-react";
import { Dot } from "@/components/kit";
import { Mark } from "@/components/mark";
import { Pill, SegBar } from "@/components/charts";
import { DESK, HOME, LANG_NAME, NAV, STATUS, type Lang, type Status } from "@/content/catalogue";

const P = HOME.preview;
const statusText = (s: string) => (s === "alert" ? DESK.abandonedChip : STATUS[s as Status].ja);

// Static illustration of the console's case table, assembled from the catalogue; it bleeds off the right edge like a window.
export function HeroPreview() {
  return (
    <div aria-hidden className="pointer-events-none relative select-none lg:-mr-56">
      <div className="absolute -top-12 left-0 z-10 flex h-10 items-center gap-2.5 rounded-xl border bg-card px-3.5 text-[13px] shadow-sm">
        <MessageSquare className="size-3.5 stroke-[1.5]" />
        <span className="text-foreground">{P.badge}</span>
        <span className="text-muted-foreground">{P.badgeState}</span>
        <Dot s="live" className="ml-2" />
      </div>
      <div className="flex h-[640px] overflow-hidden rounded-xl border bg-[oklch(0.975_0_0)] shadow-[0_1px_2px_oklch(0_0_0/0.04),0_24px_48px_-24px_oklch(0_0_0/0.12)]"
        style={{ maskImage: "linear-gradient(to bottom, black 70%, transparent)" }}>
        <Sidebar />
        <Table />
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="flex w-[240px] shrink-0 flex-col gap-5 px-3 py-4 text-[14px]">
      <div className="flex items-center gap-2 px-2">
        <span className="grid size-5 place-items-center rounded-[5px] bg-primary text-primary-foreground"><Mark className="h-2.5 w-3" strokeWidth={2} /></span>
        <span className="flex-1 text-foreground">Ichido</span>
        <Bell className="size-3.5 stroke-[1.5]" /><Search className="size-3.5 stroke-[1.5]" /><ChevronsLeft className="size-3.5 stroke-[1.5]" />
      </div>
      <div className="flex flex-col gap-px">
        {[{ i: RadioTower, l: NAV.operator, n: P.queue.length }, { i: Table2, l: P.table, on: true }, { i: ChartNoAxesColumn, l: NAV.insights }, { i: MapPin, l: NAV.field }].map((x) => (
          <span key={x.l} className={`flex h-8 items-center gap-2.5 rounded-md px-2 ${x.on ? "bg-accent text-foreground" : ""}`}>
            <x.i className="size-4 stroke-[1.5]" /><span className="flex-1">{x.l}</span>
            {x.n && <span className="rounded bg-secondary px-1 text-[11px]">{x.n}</span>}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-px">
        <span className="px-2 pb-1 text-[12px] text-muted-foreground">{DESK.queue}</span>
        {P.queue.map((q) => (
          <span key={q.title} className="flex h-8 items-center gap-2 rounded-md px-2">
            <Dot s={q.status} /><span className="flex-1 truncate">{q.title}</span><span className="text-[11px] text-muted-foreground">{q.meta}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const COLS = [
  { icon: Landmark, w: "w-[230px]" }, { icon: Timer, w: "w-[170px]" }, { icon: CircleDashed, w: "w-[230px]" }, { icon: Languages, w: "w-[150px] whitespace-nowrap" }, { icon: Clock, w: "w-[110px]" },
];
const HEAD = P.head;

function Table() {
  return (
    <div className="flex min-w-[900px] flex-1 flex-col rounded-tl-xl border-t border-l bg-card">
      <div className="flex h-12 items-center gap-2 border-b px-4 text-[14px] text-foreground">
        <CircleDashed className="size-4 stroke-[1.5]" />{DESK.title}
        <span className="ml-1 inline-flex h-6 items-center gap-1.5 rounded-md bg-secondary px-2 text-[13px]"><Table2 className="size-3.5 stroke-[1.5]" />{P.table}</span>
        <Plus className="size-4 stroke-[1.5] text-muted-foreground" />
      </div>
      <div className="flex h-10 items-center gap-2 border-b px-4 text-[13px] text-foreground"><ListFilter className="size-3.5 stroke-[1.5]" />{P.filter}</div>
      <div className="flex h-10 items-center border-b text-[13px] text-muted-foreground">
        {COLS.map((c, i) => <span key={HEAD[i]} className={`flex h-full items-center gap-2 border-r px-4 ${c.w}`}><c.icon className="size-3.5 stroke-[1.5]" />{HEAD[i]}</span>)}
      </div>
      {P.rows.map((r) => (
        <div key={r.id} className="flex h-12 items-center border-b text-[14px]">
          <span className={`flex h-full items-center gap-2.5 border-r px-4 ${COLS[0].w}`}>
            <span className="grid size-5 place-items-center rounded-[5px] bg-secondary font-mono text-[9px] text-foreground">{r.id.slice(0, 2)}</span>
            <span className="flex-1 truncate text-foreground">{r.title}</span>
            {r.live && <span className="size-1.5 rounded-full bg-info" />}
          </span>
          <span className={`flex h-full items-center border-r px-4 ${COLS[1].w}`}><SegBar value={r.reply} label={r.time} /></span>
          <span className={`flex h-full items-center border-r px-4 ${COLS[2].w}`}><Pill tone={r.status}>{statusText(r.status)}</Pill></span>
          <span className={`flex h-full items-center border-r px-4 ${COLS[3].w}`}>{LANG_NAME[r.lang as Lang]}</span>
          <span className={`mono flex h-full items-center px-4 text-muted-foreground ${COLS[4].w}`}>{r.id}</span>
        </div>
      ))}
    </div>
  );
}
