import { ArrowUp, Check, ChartLine, CircleDashed, Download, GripVertical, Link2, ListFilter, Lock, MessageSquare, Paperclip, Plus, Search, Workflow } from "lucide-react";
import { DailyArea, HourBars } from "@/components/insight-charts";
import { Dot } from "@/components/kit";
import { Mark } from "@/components/mark";
import { ENTERPRISE, HOME, LANGS, MANUAL_VERSION, REPLIES, pick, type ReplySlots } from "@/content/catalogue";

const P = ENTERPRISE.preview;
const Y = ENTERPRISE.yours;
const daily = P.received.map((n, i) => ({ day: `${i + 1}`, received: n, guided: P.guided[i] }));

// A soft light field behind the composition; pure CSS, no imagery.
export const FIELD = "radial-gradient(50% 40% at 20% 15%, oklch(0.9 0.03 75) 0%, transparent 70%), radial-gradient(55% 50% at 85% 80%, oklch(0.72 0.04 240) 0%, transparent 70%), radial-gradient(40% 35% at 60% 35%, oklch(0.86 0.025 200) 0%, transparent 70%), linear-gradient(160deg, oklch(0.8 0.03 70), oklch(0.68 0.035 235))";

const glass = "rounded-xl border border-white/60 bg-[oklch(0.985_0_0/0.92)] shadow-[0_1px_2px_oklch(0_0_0/0.04),0_24px_48px_-24px_oklch(0_0_0/0.25)] backdrop-blur";

// Hero: the insights board with the Ichido Bot panel over a soft field. Sample numbers, labelled as such.
export function EnterpriseHero() {
  return (
    <div aria-hidden className="pointer-events-none relative h-[340px] select-none overflow-hidden rounded-xl sm:h-[620px] lg:h-[860px]">
      <div className="absolute inset-0 scale-110 blur-2xl" style={{ background: FIELD }} />
      <span className="absolute top-4 right-5 font-mono text-[10px] tracking-wide text-white/80 uppercase">{P.sample}</span>
      <div className="absolute top-12 left-4 h-[760px] w-[1140px] origin-top-left scale-[0.36] sm:top-16 sm:left-10 sm:scale-[0.56] lg:top-36 lg:left-[8%] lg:scale-[0.86] xl:scale-100">
        <Board />
        <BotPanel />
      </div>
    </div>
  );
}

function Board() {
  return (
    <div className={`absolute top-0 left-0 flex w-[920px] flex-col ${glass}`}>
      <div className="flex h-11 items-center gap-2 border-b px-4 text-[13px] text-foreground">
        <ChartLine className="size-4 stroke-[1.5]" />{P.board}<span className="text-muted-foreground">· {P.range}</span>
        <span className="ml-auto flex items-center gap-2 text-muted-foreground"><Link2 className="size-3.5 stroke-[1.5]" /><span className="inline-flex h-6 items-center gap-1 rounded-md border bg-card px-2 text-[12px] text-foreground"><Download className="size-3 stroke-[1.5]" />{P.download}</span></span>
      </div>
      <div className="flex h-9 items-center gap-2 border-b px-4 text-[12px] text-foreground"><ListFilter className="size-3.5 stroke-[1.5]" />{P.filter}</div>
      <div className="grid grid-cols-4 gap-3 p-4">
        {P.tiles.map((t) => (
          <div key={t.t} className="flex h-32 flex-col rounded-lg border bg-card p-3">
            <span className="flex items-center gap-1.5 text-[13px] text-foreground"><GripVertical className="size-3.5 stroke-[1.5] text-faint" />{t.t}</span>
            <span className="num mt-auto text-center text-[26px] tracking-[-0.03em] text-foreground">{t.v}</span>
            <span className="mb-auto text-center text-[11px] text-muted-foreground">{t.d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1.4fr_1fr] gap-3 px-4 pb-4">
        <div className="rounded-lg border bg-card p-3"><span className="text-[13px] text-foreground">{P.daily}</span><DailyArea labels={P.series} data={daily} /></div>
        <div className="rounded-lg border bg-card p-3"><span className="text-[13px] text-foreground">{P.hours}</span><HourBars label={P.series.hours} data={P.slots} /></div>
      </div>
    </div>
  );
}

function BotPanel() {
  const b = P.bot;
  return (
    <div className={`absolute top-24 right-0 flex w-[380px] flex-col gap-4 p-4 ${glass}`}>
      <span className="flex items-center gap-2 text-[13px] text-foreground"><Workflow className="size-4 stroke-[1.5]" />{b.title}<Dot s="live" className="ml-auto" /></span>
      <span className="flex items-center gap-2 text-[12px] text-muted-foreground"><Mark className="h-3 w-3.5" />{b.case}</span>
      <ol className="flex flex-col gap-2.5">
        {b.steps.map((s) => (
          <li key={s.t} className="flex items-center gap-2.5 text-[13px]">
            {s.s === "done" ? <Check className="size-3.5 stroke-[2] text-ok" /> : <CircleDashed className="size-3.5 stroke-[1.5] text-faint" />}
            <span className={s.s === "done" ? "text-foreground" : "text-muted-foreground"}>{s.t}</span>
            <span className="num ml-auto font-mono text-[11px] text-faint">{s.at}</span>
          </li>
        ))}
      </ol>
      <p className="text-[13px] leading-5 text-soft">{b.note}</p>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <span className="text-[13px] text-faint">{b.input}</span>
        <span className="flex items-center gap-2 text-faint"><Paperclip className="size-3.5 stroke-[1.5]" /><span className="ml-auto grid size-6 place-items-center rounded-md bg-[oklch(0.75_0.1_250)] text-white"><ArrowUp className="size-3.5" /></span></span>
      </div>
    </div>
  );
}

// "Make it yours" fragments: small, static slices of the real screens and data.
const card = "rounded-lg border bg-card shadow-[0_1px_2px_oklch(0_0_0/0.04),0_12px_32px_-16px_oklch(0_0_0/0.15)]";

export function CatalogueFragment() {
  // The sample station has three languages; pick() falls back to English, as for any older station row.
  const a3 = REPLIES.HELD_WAIT_OR_LEAVE.text(HOME.preview.slots as ReplySlots);
  return (
    <div aria-hidden className="relative mx-auto h-[300px] w-full max-w-[640px] select-none">
      <div className={`absolute inset-x-0 top-8 sm:right-16 ${card}`}>
        <div className="flex h-10 items-center gap-2 border-b px-3 text-[12px] text-foreground">
          <MessageSquare className="size-3.5 stroke-[1.5]" />{Y.catalogue.head}
          <span className="ml-auto rounded-[5px] bg-secondary px-1.5 font-mono text-[10px] text-soft">{MANUAL_VERSION}</span>
        </div>
        <div className="flex h-9 items-center gap-2 border-b px-3 text-[12px] text-faint"><Search className="size-3.5 stroke-[1.5]" />{Y.catalogue.filter}</div>
        {Object.values(REPLIES).map((r, i) => (
          <div key={r.code} className={`flex h-11 items-center gap-3 border-b px-3 text-[13px] last:border-b-0 ${i === 0 ? "bg-accent" : ""}`}>
            <span className="w-8 font-mono text-[11px] text-muted-foreground">{r.code}</span>
            <span lang="ja" className="flex-1 truncate text-foreground">{r.title}</span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">{LANGS.join(" · ")}</span>
          </div>
        ))}
      </div>
      <div className={`absolute right-0 bottom-0 hidden w-[300px] p-3 text-[12px] leading-[1.45] text-foreground sm:block ${card}`}>{pick(a3, "en")}</div>
    </div>
  );
}

export function RuleFragment() {
  const r = Y.rules;
  return (
    <div aria-hidden className={`w-full max-w-[380px] select-none p-4 text-[12px] ${card}`}>
      <span className="text-[13px] text-foreground">{r.name}</span>
      <div className="mt-3 flex flex-col gap-2">
        {r.conditions.map(([f, op, v], i) => (
          <span key={f} className="flex items-center gap-2">
            <span className="w-9 text-muted-foreground">{i === 0 ? r.when : r.and}</span>
            <span className="flex h-7 min-w-0 items-center divide-x rounded-md border">
              <span className="truncate px-2 text-foreground">{f}</span><span className="px-2 text-muted-foreground">{op}</span><span className="truncate px-2 text-foreground">{v}</span>
            </span>
          </span>
        ))}
        <span className="mt-1 flex items-center gap-2">
          <span className="w-9 text-muted-foreground">{r.allow}</span>
          <span className="flex h-7 items-center divide-x rounded-md border bg-[oklch(0.97_0.02_150)]">
            <span className="px-2 text-foreground">{r.result[0]}</span><span className="px-2 text-[oklch(0.45_0.1_150)]">{r.result[1]}</span>
          </span>
        </span>
      </div>
    </div>
  );
}

export function TargetsFragment() {
  const t = Y.targets;
  return (
    <div aria-hidden className={`w-full max-w-[340px] select-none text-[13px] ${card}`}>
      <div className="flex h-9 items-center justify-between border-b px-3 text-[12px] text-muted-foreground"><span>{t.head[0]}</span><span>{t.head[1]}</span></div>
      {t.rows.map(([k, v], i) => (
        <div key={k} className="flex h-11 items-center gap-2 border-b px-3 last:border-b-0">
          <Dot s={["received", "review", "field"][i]} /><span className="flex-1 text-foreground">{k}</span><span className="num font-mono text-[12px] text-soft">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function BotFragment() {
  const b = Y.bot;
  return (
    <div aria-hidden className={`w-full max-w-[340px] select-none p-4 text-[13px] ${card}`}>
      <span className="flex items-center gap-2 text-foreground"><Workflow className="size-3.5 stroke-[1.5]" />{b.name}<span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><Dot s="live" />{b.state}</span></span>
      <ol className="mt-4 flex flex-col">
        {b.steps.map((s, i) => (
          <li key={s} className="relative flex items-center gap-3 pb-3 last:pb-0">
            <span className={`grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px] ${i < 2 ? "border-transparent bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{i + 1}</span>
            <span className={i < 2 ? "text-foreground" : "text-muted-foreground"}>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AccessFragment() {
  const roles = Y.access.roles;
  return (
    <div aria-hidden className="relative w-full max-w-[340px] select-none pt-[72px]">
      {[roles[3], roles[2]].map((r, i) => (
        <div key={r.r} className={`absolute top-0 flex h-20 items-start justify-between px-3 pt-2 text-[12px] text-muted-foreground ${i ? "inset-x-3 top-9" : "inset-x-6"} ${card}`}><span>{r.r}</span><span>{r.a}</span></div>
      ))}
      <div className={`relative text-[13px] ${card}`}>
        {roles.slice(0, 2).map((r) => (
          <div key={r.r} className="flex h-14 items-center gap-3 border-b px-3 last:border-b-0">
            <span className="grid size-7 place-items-center rounded-full bg-secondary"><Lock className="size-3.5 stroke-[1.5] text-soft" /></span>
            <span className="flex flex-1 flex-col"><span className="text-foreground">{r.r}</span><span className="text-[11px] text-muted-foreground">{r.n}</span></span>
            <span className="text-[12px] text-soft">{r.a}</span>
          </div>
        ))}
        <div className="flex h-10 items-center gap-2 px-3 text-[12px] text-faint"><Plus className="size-3.5 stroke-[1.5]" />{Y.access.add}</div>
      </div>
    </div>
  );
}
