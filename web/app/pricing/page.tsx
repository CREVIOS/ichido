import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Cpu, Fingerprint, History, ShieldCheck } from "lucide-react";
import { Faq, Footer, TopNav } from "@/components/site";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LANG_NAME, LANGS, PRICING } from "@/content/catalogue";

const P = PRICING;
export const metadata: Metadata = P.meta;

const ICON = { lock: ShieldCheck, audit: History, pin: Fingerprint, chip: Cpu } as const;
const surface = "rounded-xl border bg-[oklch(0.955_0_0)]";
const wide = (on?: boolean) => cn(buttonVariants({ variant: on ? "default" : "secondary", size: "sm" }), "h-9 w-full justify-between rounded-md px-3 text-[12px]", !on && "bg-foreground/[0.06]");

// Internal routes go through Link; mail and external links stay plain anchors.
function Cta({ href, label, on, className }: { href: string; label: string; on?: boolean; className?: string }) {
  const inner = <>{label}<ArrowRight className="size-3.5 stroke-[1.5]" /></>;
  return href.startsWith("/") ? <Link href={href} className={cn(wide(on), className)}>{inner}</Link> : <a href={href} className={cn(wide(on), className)}>{inner}</a>;
}

export default function Pricing() {
  return (
    <div className="overflow-x-clip">
      <TopNav />
      <main className="mx-auto max-w-[1440px] px-6 pt-32 lg:px-12">
        <div className="flex flex-col gap-3">
          <span className="self-start rounded-[5px] border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{P.note}</span>
          <h1 className="text-[32px] leading-[1.15] tracking-[-0.035em]">{P.title}</h1>
        </div>
        <Plans />
        <Langs />
        <Platform />
        <Trust />
        <section className="grid gap-10 py-20 lg:grid-cols-2 lg:py-28">
          <h2 className="text-[28px] leading-[1.2] tracking-[-0.03em]">{P.faq.title}</h2>
          <Faq items={P.faq.items} size="md" />
        </section>
        <section className="grid gap-3 pb-20 md:grid-cols-2">
          {P.cards.map((c) => (
            <div key={c.t} className={`${surface} flex min-h-52 flex-col gap-2 p-7`}>
              <span className="text-[19px] tracking-[-0.02em] text-foreground">{c.t}</span>
              <span className="text-[15px] leading-6 text-muted-foreground">{c.b}</span>
              <Cta href={c.cta.href} label={c.cta.label} on={c.dark} className="mt-auto w-60" />
            </div>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <ul className="flex flex-col gap-1.5 text-[13px] text-foreground">
        {items.map((i) => <li key={i} className="flex gap-2.5"><Check className="mt-0.5 size-3.5 shrink-0 stroke-[1.75]" />{i}</li>)}
      </ul>
    </div>
  );
}

function Plans() {
  return (
    <div className="mt-12 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {P.plans.map((p) => (
        <article key={p.name} className={`${surface} flex flex-col gap-5 p-4`}>
          <div className="flex flex-col">
            <h2 className="flex items-center gap-2 text-[17px] tracking-[-0.01em]">{p.name}{p.recommended && <span className="rounded-[4px] border px-1.5 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">{P.recommended}</span>}</h2>
            <span className="text-[13px] text-muted-foreground">{p.for}</span>
            <span className="mt-4 flex items-baseline gap-0.5"><span className="num text-[28px] tracking-[-0.03em] text-foreground">{p.price}</span><span className="text-[13px] text-muted-foreground">{p.unit}</span></span>
            <span className="text-[13px] text-muted-foreground">{p.per}</span>
          </div>
          <List label={p.includesLabel} items={p.includes} />
          <List label={P.limitLabel} items={[p.limit]} />
          <List label={P.supportLabel} items={p.support} />
          <Cta href={p.cta.href} label={p.cta.label} on={p.recommended} className="mt-auto" />
        </article>
      ))}
    </div>
  );
}

function Langs() {
  const l = P.langs;
  return (
    <section className="flex flex-col items-center gap-6 pt-16">
      <span className="text-[13px] text-muted-foreground">{l.title}</span>
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {LANGS.map((k) => <span key={k} lang={k} className="grid h-20 place-items-center rounded-lg border border-foreground/[0.05] text-[17px] text-foreground">{LANG_NAME[k]}</span>)}
      </div>
    </section>
  );
}

function Platform() {
  const p = P.platform;
  return (
    <section className="grid gap-10 pt-24 lg:grid-cols-2 lg:pt-36">
      <div className="flex max-w-sm flex-col gap-3">
        <span className="self-start rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{p.badge}</span>
        <h2 className="text-[24px] leading-[1.2] tracking-[-0.03em]">{p.title}</h2>
        <p className="text-[15px] leading-6 text-muted-foreground">{p.body}</p>
      </div>
      <ul className="border-t">
        {p.rows.map((r) => (
          <li key={r.t} className="grid gap-1 border-b py-5 sm:grid-cols-2 sm:gap-6">
            <span className="text-[15px] text-foreground">{r.t}</span>
            <span className="text-[15px] leading-6 text-muted-foreground">{r.b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Trust() {
  const t = P.trust;
  return (
    <section className="grid gap-10 pt-24 lg:grid-cols-2 lg:pt-36">
      <div className="flex flex-col gap-3">
        <span className="text-[12px] text-muted-foreground">{t.label}</span>
        <h2 className="text-[28px] leading-[1.2] tracking-[-0.03em]">{t.title}{t.sub.map((s) => <span key={s} className="block text-muted-foreground">{s}</span>)}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {t.tiles.map((x) => {
          const Icon = ICON[x.icon as keyof typeof ICON];
          return (
            <div key={x.t} className="flex aspect-square flex-col rounded-xl bg-[oklch(0.945_0_0)] p-4 text-[13px] sm:aspect-auto sm:min-h-80 sm:p-6 sm:text-[15px]">
              <span className="text-foreground">{x.t}{x.tag && <span className="ml-2 text-faint">{x.tag}</span>}</span>
              <Icon className="m-auto size-14 stroke-[0.6] text-soft sm:size-24 sm:stroke-[0.4]" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
