import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Logo } from "@/components/kit";
import { HeroPreview } from "@/components/hero-preview";
import { HowDiagram } from "@/components/how-diagram";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HOME } from "@/content/catalogue";

const dark = cn(buttonVariants({ size: "sm" }), "h-[30px] rounded-md px-2.5 text-[12px]");
const light = cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-[30px] rounded-md px-2.5 text-[12px]");

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <TopNav />
      <Hero />
      <How />
      <Screens />
      <Rules />
      <Cta />
      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <div className="fixed inset-x-0 top-4 z-30 flex justify-center px-4">
      <nav className="flex h-[38px] items-center gap-1 rounded-[10px] bg-[oklch(0.95_0_0/0.85)] py-1 pr-1 pl-3.5 backdrop-blur-md" aria-label="Main">
        <Logo className="mr-3" />
        <div className="hidden items-center sm:flex">
          {HOME.nav.map((n) => <a key={n.href} href={n.href} className="rounded-md px-2 py-1 text-[13px] text-soft transition-colors hover:text-foreground">{n.label}</a>)}
          <a href={HOME.repo.href} className="rounded-md px-2 py-1 text-[13px] text-soft transition-colors hover:text-foreground">{HOME.repo.label}</a>
        </div>
        <span className="mx-2 hidden h-4 w-px bg-border sm:block" />
        <Link href="/operator" className="hidden px-2 text-[13px] text-soft hover:text-foreground md:block">{HOME.signIn}</Link>
        <Link href={HOME.primary.href} className={dark}>{HOME.primary.label}</Link>
      </nav>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto grid min-h-[100svh] max-w-[1440px] items-center gap-12 px-6 pt-28 pb-16 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-16 lg:px-12 lg:pt-20">
      <div className="flex flex-col gap-5">
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.03em]">{HOME.title[0]}<br />{HOME.title[1]}</h1>
        <p className="max-w-[360px] text-[15px] leading-[1.5] text-muted-foreground">{HOME.lead}</p>
        <div className="flex gap-2">
          <Link href={HOME.primary.href} className={dark}>{HOME.primary.label}</Link>
          <Link href={HOME.secondary.href} className={light}>{HOME.secondary.label}</Link>
        </div>
      </div>
      <HeroPreview />
      <a href="#how" className="absolute bottom-8 left-6 flex h-8 items-center gap-2 rounded-md bg-secondary px-3 text-[13px] lg:left-12">
        <span className="size-1.5 rounded-full bg-info" aria-hidden />
        <span className="text-foreground">{HOME.news.label}</span>
        <span className="text-muted-foreground">{HOME.news.text}</span>
        <ChevronRight className="size-3.5 stroke-[1.5]" />
      </a>
    </section>
  );
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-[1440px] scroll-mt-20 px-6 py-20 lg:px-12 lg:py-28">
      <div className="mb-12 flex items-baseline justify-between border-t pt-5">
        <h2 className="text-[28px] leading-[1.2] tracking-[-0.03em]">{title}</h2>
        {aside && <span className="mono hidden text-muted-foreground sm:inline">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function How() {
  const steps = HOME.how.steps;
  return (
    <Section id="how" title={HOME.how.title} aside={`${String(steps.length).padStart(2, "0")} STEPS`}>
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="lg:sticky lg:top-24"><HowDiagram labels={steps.map((s) => s.k.split(" ")[0])} /></div>
        <ol className="flex flex-col">
          {steps.map((s) => (
            <li key={s.k} className="flex flex-col gap-2 border-t py-7 first:border-t-0 first:pt-0">
              <span className="mono text-muted-foreground">{s.k}</span>
              <span className="text-[18px] leading-snug tracking-[-0.02em] text-foreground">{s.t}</span>
              <span className="max-w-md text-[14px] leading-6">{s.b}</span>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function Screens() {
  return (
    <Section id="screens" title={HOME.screens.title}>
      <p className="-mt-6 mb-10 max-w-lg text-[15px]">{HOME.screens.lead}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {HOME.screens.items.map((s) => (
          <Link key={s.href} href={s.href} className="surface group flex min-h-56 flex-col gap-2 p-5 transition-colors hover:border-foreground/20">
            <span className="text-[13px] text-muted-foreground">{s.sub}</span>
            <span className="text-[20px] tracking-[-0.02em] text-foreground">{s.title}</span>
            <span className="mt-auto text-[14px] leading-6">{s.body}</span>
            <ArrowRight className="size-4 stroke-[1.5] text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </Link>
        ))}
      </div>
    </Section>
  );
}

function Rules() {
  return (
    <Section id="rules" title={HOME.rules.title}>
      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
        {HOME.rules.items.map((r, i) => (
          <div key={r.t} className="flex flex-col gap-2">
            <span className="mono text-faint">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[16px] text-foreground">{r.t}</span>
            <span className="text-[14px] leading-6">{r.b}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Cta() {
  const cards = [{ ...HOME.primary, body: HOME.cta.body }, { ...HOME.secondary, body: HOME.screens.items[1].body }];
  return (
    <Section id="start" title={HOME.cta.title}>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group flex min-h-60 flex-col justify-between rounded-xl bg-primary p-6 text-primary-foreground">
            <div className="flex flex-col gap-2"><span className="text-[20px] tracking-[-0.02em]">{c.label}</span><span className="max-w-sm text-[14px] leading-6 text-white/60">{c.body}</span></div>
            <span className="inline-flex h-[30px] items-center gap-1.5 self-start rounded-md bg-white/10 px-2.5 text-[12px]">{c.label}<ArrowRight className="size-3.5 stroke-[1.5] transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1440px] flex-col gap-6 border-t px-6 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-12">
      <Logo />
      <p className="max-w-xl text-[12px] leading-5 text-muted-foreground">{HOME.footer}</p>
      <a href={HOME.repo.href} className="text-[13px] text-soft hover:text-foreground">{HOME.repo.label}</a>
    </footer>
  );
}
