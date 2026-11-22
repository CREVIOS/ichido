import type { Metadata } from "next";
import { ArrowRight, Fingerprint, Languages, Link2, MessageSquareQuote, ScrollText, SlidersHorizontal } from "lucide-react";
import { AccessFragment, BotFragment, CatalogueFragment, EnterpriseHero, FIELD, RuleFragment, TargetsFragment } from "@/components/enterprise-preview";
import { McpTabs } from "@/components/mcp-tabs";
import { Faq, Footer, Section, TopNav, dark, light } from "@/components/site";
import { cn } from "@/lib/utils";
import { CONTACT, ENTERPRISE } from "@/content/catalogue";

const E = ENTERPRISE;
export const metadata: Metadata = E.meta;

const ICON = { customize: SlidersHorizontal, control: Fingerprint, connect: Link2, record: ScrollText, lang: Languages, words: MessageSquareQuote } as const;
const tile = "flex flex-col gap-2 overflow-hidden rounded-xl bg-[oklch(0.945_0_0)] p-6";

export default function Enterprise() {
  return (
    <div className="overflow-x-clip">
      <TopNav />
      <Hero />
      <Why />
      <Yours />
      <Specs />
      <Open />
      <Rollout />
      <Cta />
      <Questions />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 pt-32 lg:px-12">
      <h1 className="text-[28px] leading-[1.2] tracking-[-0.03em] sm:text-[32px]">{E.title}<span className="block text-muted-foreground">{E.sub}</span></h1>
      <a href={E.start.href} className={`${dark} mt-8`}>{E.start.label}</a>
      <div className="mt-16 grid gap-8 sm:grid-cols-3 lg:mt-20">
        {E.pillars.map((p) => {
          const Icon = ICON[p.icon as keyof typeof ICON];
          return (
            <div key={p.t} className="flex max-w-sm flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[15px] text-foreground"><Icon className="size-3.5 stroke-[1.5]" />{p.t}</span>
              <span className="text-[15px] leading-6 text-muted-foreground">{p.b}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-8"><EnterpriseHero /></div>
      <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {E.facts.map((f) => (
          <div key={f.v} className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
            <span className="num text-[22px] tracking-[-0.03em] text-foreground">{f.v}</span>
            <span className="max-w-xs text-[13px] leading-5 text-soft">{f.t}</span>
            <span className="font-mono text-[10px] tracking-wide text-faint uppercase">{f.s}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Why() {
  const w = E.why;
  return (
    <Section id="why" title={w.title} sub={w.sub} tag={{ right: w.tag }}>
      <div className="grid gap-3 md:grid-cols-3">
        {w.items.map((it) => {
          const Icon = ICON[it.icon as keyof typeof ICON];
          return (
            <div key={it.t} className={`${tile} min-h-56`}>
              <span className="text-[15px] text-foreground">{it.t}</span>
              <span className="max-w-sm text-[15px] leading-6 text-muted-foreground">{it.b}</span>
              <Icon className="mt-auto size-9 stroke-[1] text-soft" />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Tile({ t, b, children, className }: { t: string; b: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${tile} min-h-[440px] ${className ?? ""}`}>
      <span className="text-[15px] text-foreground">{t}</span>
      <span className="max-w-md text-[15px] leading-6 text-muted-foreground">{b}</span>
      <div className="mt-auto flex justify-center pt-8">{children}</div>
    </div>
  );
}

function Yours() {
  const y = E.yours;
  return (
    <Section id="yours" title={y.title} sub={y.sub} tag={{ right: y.tag }}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Tile t={y.catalogue.t} b={y.catalogue.b} className="md:col-span-2"><CatalogueFragment /></Tile>
        <Tile t={y.rules.t} b={y.rules.b}><RuleFragment /></Tile>
        <Tile t={y.targets.t} b={y.targets.b}><TargetsFragment /></Tile>
        <Tile t={y.bot.t} b={y.bot.b}><BotFragment /></Tile>
        <Tile t={y.access.t} b={y.access.b}><AccessFragment /></Tile>
      </div>
    </Section>
  );
}

function Specs() {
  const s = E.specs;
  return (
    <Section id="specs" title={s.title} sub={s.sub} tag={{ right: s.tag }}>
      <div className="flex flex-col">
        {s.groups.map((g) => (
          <div key={g.name} className="grid gap-6 border-t pt-4 pb-12 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,0.65fr))] lg:gap-6">
            <span className="text-[17px] text-foreground">{g.name}</span>
            {g.cols.map((c) => (
              <ul key={c.h} className="flex flex-col text-[15px]">
                <li className="border-b pb-2 text-foreground">{c.h}</li>
                {c.items.map((it) => {
                  const x = typeof it === "string" ? { t: it, tag: "" } : it;
                  return (
                    <li key={x.t} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b py-2 text-muted-foreground last:border-b-0">
                      {x.t}{x.tag && <span className="rounded-[4px] border px-1.5 font-mono text-[9px] tracking-[0.08em] whitespace-nowrap uppercase">{x.tag}</span>}
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Open() {
  const o = E.open;
  return (
    <Section id="open" title={o.title} sub={o.sub} tag={{ right: o.tag }}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-10">
        <div className="relative flex min-h-[420px] items-start overflow-hidden rounded-xl p-5 sm:p-28 lg:min-h-[620px]">
          <div aria-hidden className="absolute inset-0 scale-110 blur-2xl" style={{ background: FIELD }} />
          <div className="relative w-full"><McpTabs tabs={o.tabs} copy={o.copy} /></div>
        </div>
        <div className="flex flex-col gap-6 lg:pt-2">
          {o.items.map((it) => (
            <div key={it.t} className="flex max-w-sm flex-col gap-1">
              <span className="text-[15px] text-foreground">{it.t}</span>
              <span className="text-[15px] leading-6 text-muted-foreground">{it.b}</span>
            </div>
          ))}
          <a href={o.docs.href} className={cn(light, "w-44 justify-between")}>{o.docs.label}<ArrowRight className="size-3.5 stroke-[1.5]" /></a>
        </div>
      </div>
    </Section>
  );
}

function Rollout() {
  const r = E.rollout;
  return (
    <Section id="pilot" title={r.title} sub={r.sub} tag={{ right: r.tag }}>
      <p className="-mt-4 mb-14 max-w-sm text-[15px] leading-6 text-muted-foreground">{r.lead}</p>
      <ol className="grid gap-8 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
        {r.steps.map((s, i) => (
          <li key={s.t} className="flex flex-col gap-1">
            <span className={`mb-4 h-5 rounded-[3px] ${i === r.steps.length - 1 ? "bg-[oklch(0.75_0.12_250)]" : "bg-foreground/[0.05]"}`} />
            <span className="font-mono text-[11px] text-muted-foreground">{s.d}</span>
            <span className="text-[17px] text-foreground">{s.t}</span>
            <span className="max-w-64 text-[14px] leading-5 text-muted-foreground">{s.b}</span>
          </li>
        ))}
      </ol>
      <h3 className="mt-20 border-b pb-4 text-[17px] tracking-[-0.01em]">{r.team.title}</h3>
      <div className="grid gap-8 pt-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
        {r.team.roles.map((t) => (
          <div key={t.t} className="flex flex-col gap-1">
            <span className="text-[15px] text-foreground">{t.t}</span>
            <span className="max-w-72 text-[14px] leading-5 text-muted-foreground">{t.b}</span>
          </div>
        ))}
      </div>
      <h3 className="mt-20 pb-4 text-[17px] tracking-[-0.01em]">{r.questions.title}</h3>
      <Faq items={r.questions.items} />
    </Section>
  );
}

function Cta() {
  const c = E.cta;
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-20 lg:px-12">
      <div className="grid gap-8 border-t pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
        <h2 className="text-[28px] leading-[1.2] tracking-[-0.03em]">{c.title[0]}<span className="block text-muted-foreground">{c.title[1]}</span></h2>
        <div className="flex flex-col gap-6 rounded-xl bg-[oklch(0.945_0_0)] p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-md flex-col gap-1.5">
            <span className="text-[15px] text-foreground">{c.card.t}</span>
            <span className="text-[15px] leading-6 text-muted-foreground">{c.card.b}</span>
          </div>
          <a href={CONTACT.href} className={`${dark} gap-2 self-start`}>{c.card.button}<ArrowRight className="size-3.5 stroke-[1.5]" /></a>
        </div>
      </div>
    </section>
  );
}

function Questions() {
  const f = E.faq;
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-20 lg:px-12 lg:pb-28">
      <div className="grid gap-10 border-t pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
        <h2 className="text-[28px] leading-[1.2] tracking-[-0.03em]">{f.title}</h2>
        <div className="flex flex-col gap-14">
          {f.groups.map((g) => (
            <div key={g.name} className="flex flex-col">
              <span className="pb-3 text-[15px] text-foreground">{g.name}</span>
              <Faq items={g.items} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
