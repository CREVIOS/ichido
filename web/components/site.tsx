import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/kit";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HOME, SITE } from "@/content/catalogue";

// Shared chrome for the marketing pages (/, /enterprise, /pricing).
export const dark = cn(buttonVariants({ size: "sm" }), "h-[30px] rounded-md px-2.5 text-[12px]");
export const light = cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-[30px] rounded-md px-2.5 text-[12px]");

export function TopNav() {
  return (
    // An opaque band, so the page never shows through or around the bar as it scrolls underneath.
    <header className="fixed inset-x-0 top-0 z-30 flex justify-center bg-background px-4 pt-4 pb-3">
      <nav className="flex h-[38px] items-center gap-1 rounded-[10px] bg-[oklch(0.95_0_0)] py-1 pr-1 pl-3.5" aria-label="Main">
        <Logo className="mr-3" />
        <div className="hidden items-center lg:flex">
          {HOME.nav.map((n) => <Link key={n.href} href={n.href} className="rounded-md px-2 py-1 text-[13px] text-soft transition-colors hover:text-foreground">{n.label}</Link>)}
          <a href={HOME.repo.href} className="rounded-md px-2 py-1 text-[13px] text-soft transition-colors hover:text-foreground">{HOME.repo.label}</a>
        </div>
        <span className="mx-2 hidden h-4 w-px bg-border lg:block" />
        <Link href="/operator" className="hidden px-2 text-[13px] text-soft hover:text-foreground md:block">{HOME.signIn}</Link>
        <Link href={HOME.primary.href} className={dark}>{HOME.primary.label}</Link>
      </nav>
    </header>
  );
}

// A page section: hairline, title (with an optional grey second voice) on the left, mono tags on the right.
export function Section({ id, title, sub, tag, className, children }: {
  id?: string; title: ReactNode; sub?: string[]; tag?: { left?: string; right: string }; className?: string; children: ReactNode;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-[1440px] scroll-mt-20 px-6 py-20 lg:px-12 lg:py-28", className)}>
      <div className="mb-12 grid grid-cols-[1fr_auto] items-baseline gap-4 border-t pt-5 lg:grid-cols-[1fr_minmax(0,0.45fr)_auto]">
        <h2 className="text-[28px] leading-[1.2] tracking-[-0.03em]">
          {title}
          {sub && <span className="block text-muted-foreground">{sub.map((s) => <span key={s} className="lg:block">{s} </span>)}</span>}
        </h2>
        {tag?.left && <span className="mono hidden text-[11px] tracking-[0.06em] text-muted-foreground uppercase lg:inline">{tag.left}</span>}
        {tag && <span className={cn("mono text-[11px] text-muted-foreground", !tag.left && "lg:col-start-3")}>{tag.right}</span>}
      </div>
      {children}
    </section>
  );
}

export function Footer() {
  const f = SITE.footer;
  return (
    <footer className="mx-auto max-w-[1440px] px-6 pt-10 pb-10 lg:px-12">
      <div className="grid grid-cols-3 gap-x-4 gap-y-10 border-t pt-6 lg:grid-cols-[1fr_repeat(3,minmax(0,0.6fr))]">
        <Logo className="col-span-3 self-start lg:col-span-1" />
        {f.cols.map((c) => (
          <div key={c.title} className="flex flex-col gap-2 text-[13px]">
            <span className="text-foreground">{c.title}</span>
            {c.links.map((l) => <a key={l.label} href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">{l.label}</a>)}
          </div>
        ))}
      </div>
      <div className="mt-24 flex flex-col gap-3 text-[12px] text-muted-foreground lg:grid lg:grid-cols-[1fr_minmax(0,1.8fr)_auto] lg:gap-6">
        <span>{f.legal}</span>
        <span className="max-w-xl">{HOME.footer}</span>
        <span>{f.made}</span>
      </div>
    </footer>
  );
}

// Question list with hairlines and a plus that turns into a cross, as on the reference pages.
export function Faq({ items, size = "sm" }: { items: { q: string; a: string }[]; size?: "sm" | "md" }) {
  return (
    <Accordion className="border-t">
      {items.map((it) => (
        <AccordionItem key={it.q} value={it.q} className="border-b">
          <AccordionTrigger className={cn("items-center rounded-none font-normal hover:no-underline hover:text-foreground aria-expanded:text-foreground", size === "md" ? "py-4 text-[15px] text-foreground" : "py-2.5 text-[15px] text-muted-foreground")}>{it.q}</AccordionTrigger>
          <AccordionContent className="max-w-2xl pb-4 text-[14px] leading-6 text-soft">{it.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
