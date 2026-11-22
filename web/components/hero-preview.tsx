import { ChartNoAxesColumn, MapPin, MessageSquare, RadioTower, Search } from "lucide-react";
import { Dot, Mark } from "@/components/kit";
import { ACTOR, DESK, FACTS, FAULTS, HOME, LANG_NAME, NAV, REPLIES, STATUS, eventText, type Lang, type Status } from "@/content/catalogue";

const P = HOME.preview;
const held = REPLIES.HELD_WAIT_OR_LEAVE;

// Static illustration of the console, assembled from the real catalogue; it bleeds off the right edge like a window.
export function HeroPreview() {
  return (
    <div aria-hidden className="pointer-events-none relative select-none lg:-mr-48">
      <div className="absolute -top-12 left-0 flex h-10 items-center gap-2.5 rounded-xl border bg-card px-3.5 text-[13px] shadow-sm">
        <MessageSquare className="size-3.5 stroke-[1.5]" />
        <span className="text-foreground">{P.badge}</span>
        <span className="text-muted-foreground">{P.badgeState}</span>
        <Dot s="live" className="ml-2" />
      </div>
      <div className="flex h-[600px] overflow-hidden rounded-xl border bg-[oklch(0.985_0_0)] shadow-[0_1px_2px_oklch(0_0_0/0.04),0_24px_48px_-24px_oklch(0_0_0/0.12)]"
        style={{ maskImage: "linear-gradient(to bottom, black 75%, transparent)" }}>
        <Sidebar />
        <CasePane />
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="flex w-[240px] shrink-0 flex-col gap-4 border-r px-3 py-4 text-[14px]">
      <div className="flex items-center justify-between px-2">
        <span className="flex items-center gap-2 text-foreground"><span className="grid size-5 place-items-center rounded-[5px] bg-primary text-primary-foreground"><Mark className="h-2 w-3.5" /></span>{DESK.title}</span>
        <Search className="size-3.5 stroke-[1.5]" />
      </div>
      <div className="flex flex-col gap-px">
        {[{ i: RadioTower, l: NAV.operator, n: P.queue.length }, { i: ChartNoAxesColumn, l: NAV.insights }, { i: MapPin, l: NAV.field }].map((x, k) => (
          <span key={x.l} className={`flex h-8 items-center gap-2.5 rounded-md px-2 ${k === 0 ? "bg-accent text-foreground" : ""}`}>
            <x.i className="size-4 stroke-[1.5]" /><span className="flex-1">{x.l}</span>
            {x.n && <span className="rounded bg-secondary px-1 text-[11px]">{x.n}</span>}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-px">
        <span className="px-2 pb-1 text-[12px] text-muted-foreground">{DESK.queue}</span>
        {P.queue.map((q, k) => (
          <span key={q.title} className={`flex flex-col gap-0.5 rounded-md px-2 py-1.5 ${k === 0 ? "bg-accent" : ""}`}>
            <span className="flex items-center gap-2"><Dot s={q.status} /><span className="flex-1 truncate text-foreground">{q.title}</span><span className="text-[11px] text-muted-foreground">{q.meta}</span></span>
            <span className="truncate pl-3.5 text-[12px] text-muted-foreground">{STATUS[q.status as Status].ja} · {LANG_NAME[q.lang as Lang]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CasePane() {
  const reply = held.text(P.slots);
  return (
    <div className="flex min-w-[560px] flex-1 flex-col bg-card">
      <div className="flex h-12 items-center gap-2 border-b px-5 text-[14px]">
        <span className="text-muted-foreground">{DESK.title}</span><span className="text-faint">/</span><span className="text-foreground">{P.queue[0].title}</span>
      </div>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[22px] tracking-[-0.03em] text-foreground">{FAULTS.card_retained.ja}</span>
          <span className="flex items-center gap-1.5 text-[13px]"><Dot s="review" />{STATUS.review.ja}</span>
        </div>
        <div className="grid max-w-[560px] grid-cols-2 gap-3">
          <div className="surface flex flex-col gap-1.5 p-3.5">
            <span className="label">{DESK.original(LANG_NAME.bn)}</span>
            <span lang="bn" className="text-[15px] leading-6 text-foreground">{P.words}</span>
          </div>
          <div className="surface flex flex-col gap-1.5 p-3.5">
            <span className="label">{DESK.confirmed}</span>
            <span className="text-[14px] text-foreground">{FACTS.card_back.no.ja}</span>
            <span className="text-[14px] text-foreground">{FACTS.cash_received.yes.ja}</span>
          </div>
        </div>
        <div className="flex max-w-[560px] flex-col gap-1.5 text-[13px]">
          {[["device", eventText("fault", { fault: "card_retained" })], ["caller", eventText("paired", { lang: "bn" })], ["operator", eventText("reply", { intent: "HELD_WAIT_OR_LEAVE" })]].map(([a, t]) => (
            <span key={t} className="flex gap-3"><span className="w-12 text-muted-foreground">{ACTOR[a]}</span><span className="text-foreground">{t}</span></span>
          ))}
        </div>
        <div className="inset flex max-w-[560px] flex-col gap-1.5 p-3.5 text-[14px] leading-6">
          <span className="text-foreground">{reply.ja}</span>
          <span lang="bn">{reply.bn}</span>
        </div>
      </div>
    </div>
  );
}
