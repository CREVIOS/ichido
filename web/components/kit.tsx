"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { STATUS, STAFF, type Lang, type Status } from "@/content/catalogue";

export type NavItem = { href: string; label: string; icon: LucideIcon; count?: number };

// The mark: two points joined by one stroke — 一 ("one"), and tsunagu ("connect").
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 12" fill="none" className={cn("h-3 w-[22px]", className)} aria-hidden>
      <circle cx="3.5" cy="6" r="2.5" fill="currentColor" />
      <path d="M6 6h9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="18.25" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-1.5 text-foreground", className)} aria-label="Ichido">
      <span className="text-[17px] leading-none tracking-[-0.035em]">Ichido</span>
      <Mark className="mt-px" />
    </Link>
  );
}

function SideNav({ nav, side, footer }: { nav: NavItem[]; side?: ReactNode; footer?: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <div className="px-2"><Logo /></div>
      <nav className="flex flex-col gap-px" aria-label={STAFF.menu}>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}
            className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[14px] text-soft transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:text-foreground">
            <n.icon className="size-4 stroke-[1.5]" />
            <span className="flex-1">{n.label}</span>
            {n.count != null && n.count > 0 && <span className="num grid h-4 min-w-4 place-items-center rounded bg-secondary px-1 text-[11px] text-muted-foreground">{n.count}</span>}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">{side}</div>
      {footer}
    </div>
  );
}

// Staff app frame: a quiet sidebar on the canvas, the work on a white sheet beside it.
export function AppShell({ nav, side, footer, title, crumb, actions, children }: {
  nav: NavItem[]; side?: ReactNode; footer?: ReactNode; title: ReactNode; crumb?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 lg:block">
        <SideNav nav={nav} side={side} footer={footer} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <main className="flex min-h-0 flex-1 flex-col bg-card lg:rounded-xl lg:border" style={{ boxShadow: "0 1px 2px oklch(0 0 0 / 0.03)" }}>
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur lg:rounded-t-xl lg:px-5">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label={STAFF.menu} />}>
                <Menu className="stroke-[1.5]" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] bg-background p-0" onClick={(e) => { if ((e.target as HTMLElement).closest("a,button[data-close]")) setOpen(false); }}>
                <SheetTitle className="sr-only">{STAFF.menu}</SheetTitle>
                <SideNav nav={nav} side={side} footer={footer} />
              </SheetContent>
            </Sheet>
            {crumb && <span className="hidden text-[13px] text-muted-foreground sm:inline">{crumb}</span>}
            {crumb && <span className="hidden text-faint sm:inline">/</span>}
            <h1 className="min-w-0 truncate text-[14px] tracking-[-0.01em]">{title}</h1>
            <div className="ml-auto flex items-center gap-1.5">{actions}</div>
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}

// A titled block inside the white sheet; hairline-separated rather than boxed.
export function Panel({ title, action, children, className, inset }: { title?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; inset?: boolean }) {
  return (
    <section className={cn("flex flex-col gap-3", inset && "surface p-4", className)}>
      {(title || action) && (
        <div className="flex min-h-6 items-center justify-between gap-3">
          <h2 className="text-[13px] tracking-normal text-muted-foreground">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function MoreMenu({ label, items }: { label: string; items: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }[] }) {
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
        <MoreHorizontal className="stroke-[1.5]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} disabled={it.disabled} onClick={it.onClick} variant={it.danger ? "destructive" : "default"}>{it.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const Dot = ({ s, className }: { s: string; className?: string }) => <span className={cn("dot", className)} data-s={s} aria-hidden />;

export function StatusLabel({ status, lang = "ja", className }: { status: Status; lang?: Lang; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-soft", className)}><Dot s={status} />{STATUS[status][lang]}</span>;
}

// Small grey token, as used for counts and metadata.
export const Chip = ({ children, className }: { children: ReactNode; className?: string }) =>
  <span className={cn("inline-flex h-5 items-center gap-1 rounded-[5px] bg-secondary px-1.5 text-[12px] text-soft", className)}>{children}</span>;

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5"><span className="label">{label}</span><span className="truncate text-[14px] text-foreground">{value}</span></div>;
}

export const Big = ({ children, className }: { children: ReactNode; className?: string }) =>
  <span className={cn("num text-[44px] leading-none tracking-[-0.04em] text-foreground", className)}>{children}</span>;

// Funnel: hatched hairline columns; the selected stage shows conversion from the previous one.
export function Funnel({ steps, conversion, unit }: { steps: { label: string; value: number }[]; conversion: string; unit: (n: number) => string }) {
  const [on, setOn] = useState(Math.max(0, steps.length - 1));
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        return (
          <button key={s.label} type="button" onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)}
            className={cn("group flex h-64 flex-col gap-2 border-l px-3 pt-1 text-left first:border-l-0", i === on ? "text-foreground" : "text-muted-foreground")}>
            <span className="text-[12px]">{s.label}</span>
            <span className="num text-[26px] leading-none tracking-[-0.03em] text-foreground">{s.value.toLocaleString()}</span>
            <span className="h-4 text-[12px]">{i === on && prev && prev.value > 0 ? `${conversion} ${Math.round((s.value / prev.value) * 100)}%` : i === on ? unit(s.value) : ""}</span>
            <span className={cn("hatch mt-auto w-full rounded-t-[3px] transition-colors", i === on ? "text-foreground/40" : "text-foreground/15")} style={{ height: `${Math.max(2, (s.value / max) * 55)}%` }} />
          </button>
        );
      })}
    </div>
  );
}

// Dot matrix: one column per bucket, dots scaled to the busiest; the peak column is solid.
export function Dots({ values, labels, maxDots = 6 }: { values: number[]; labels: string[]; maxDots?: number }) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(max);
  return (
    <div className="flex items-end justify-between gap-1" role="img" aria-label={labels.map((l, i) => `${l}: ${values[i]}`).join(", ")}>
      {values.map((v, i) => (
        <div key={labels[i]} className="flex flex-col-reverse items-center gap-1" title={`${labels[i]}: ${v}`}>
          {Array.from({ length: maxDots }, (_, k) => (
            <span key={k} className={cn("size-2 rounded-full", k < Math.round((v / max) * maxDots) ? (i === peak && v > 0 ? "bg-foreground" : "bg-foreground/25") : "bg-foreground/[0.06]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Step line over a hairline hatch.
export function Steps({ values, labels, height = 160 }: { values: number[]; labels: string[]; height?: number }) {
  const w = 400;
  const max = Math.max(1, ...values);
  const step = w / Math.max(1, values.length);
  const y = (v: number) => height - (v / max) * (height - 16);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${y(v)} H${(i + 1) * step}`).join(" ");
  const every = Math.ceil(labels.length / 6);
  return (
    <div className="flex flex-col gap-2 text-foreground">
      <svg viewBox={`0 -8 ${w} ${height + 8}`} className="h-auto w-full" role="img" aria-label={labels.map((l, i) => `${l}: ${values[i]}`).join(", ")}>
        <defs><pattern id="steps-hatch" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="1" height="5" fill="currentColor" opacity="0.14" /></pattern></defs>
        <path d={`${path} V${height} H0 Z`} fill="url(#steps-hatch)" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.85" />
        <line x1="0" x2={w} y1={height} y2={height} stroke="currentColor" opacity="0.12" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground">{labels.filter((_, i) => i % every === 0).map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }} />
    </div>
  );
}

export const Notice = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "info" }) => (
  <p className={cn("rounded-lg px-3 py-2.5 text-[14px]", tone === "warn" ? "bg-[oklch(0.97_0.03_70)] text-[oklch(0.45_0.1_60)]" : tone === "info" ? "bg-[oklch(0.97_0.02_250)] text-[oklch(0.42_0.1_250)]" : "bg-secondary text-soft")}>{children}</p>
);
