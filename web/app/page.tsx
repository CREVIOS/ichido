import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { HeroPreview } from "@/components/hero-preview";
import { HowDiagram } from "@/components/how-diagram";
import { People } from "@/components/people";
import { MeasurePreview } from "@/components/measure-preview";
import { Footer, Section, TopNav, dark, light } from "@/components/site";
import { HOME } from "@/content/catalogue";

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <TopNav />
      <Hero />
      <How />
      <PeopleSection />
      <Measure />
      <Screens />
      <Rules />
      <Cta />
      <Footer />
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

function How() {
  const steps = HOME.how.steps;
  return (
    <Section id="how" title={HOME.how.title} tag={HOME.howTag}>
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
        <HowDiagram labels={steps.map((s) => s.k)} />
        <ol className="flex flex-col gap-14 lg:gap-24">
          {steps.map((s) => (
            <li key={s.k} className="flex max-w-md flex-col gap-2">
              <span className="mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">{s.k}</span>
              <span className="text-[17px] leading-snug tracking-[-0.01em] text-foreground">{s.t}</span>
              <span className="text-[15px] leading-6">{s.b}</span>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function PeopleSection() {
  return <Section id="people" title={HOME.people.title} tag={HOME.people.tag}><People /></Section>;
}

function Measure() {
  return (
    <section id="measure" className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-20 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-20 lg:px-12 lg:py-28">
      <div className="flex flex-col gap-2 self-stretch">
        <div className="my-auto flex flex-col gap-2">
          <h3 className="text-[17px] tracking-[-0.01em]">{HOME.measure.title}</h3>
          <p className="text-[15px] leading-6 text-muted-foreground">{HOME.measure.body}</p>
        </div>
        <p className="text-[13px] leading-5 text-muted-foreground">{HOME.measure.note}</p>
      </div>
      <MeasurePreview />
    </section>
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
