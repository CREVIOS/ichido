"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, MoreHorizontal, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Mark } from "@/components/mark";
import { Palette, usePalette, type PaletteItem } from "@/components/palette";
export { Mark } from "@/components/mark";
import { STATUS, STAFF, STAFF_JA, type Lang, type Status } from "@/content/catalogue";

export type NavItem = { href: string; label: string; icon: LucideIcon; count?: number };

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-1.5 text-foreground", className)} aria-label="Ichido">
      <Mark />
      <span className="text-[17px] leading-none tracking-[-0.035em]">Ichido</span>
    </Link>
  );
}

function SideNav({ nav, side, footer, onSearch }: { nav: NavItem[]; side?: ReactNode; footer?: ReactNode; onSearch: () => void }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <div className="flex items-center justify-between pr-9 pl-2 lg:pr-0">
        <Logo />
        <button type="button" onClick={onSearch} data-close className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent" aria-label={STAFF.palette.title}>
          <Search className="size-3.5 stroke-[1.5]" /><span className="mono text-[11px]">{STAFF.palette.shortcut}</span>
        </button>
      </div>
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
export function AppShell({ nav, side, footer, title, crumb, actions, commands = [], children }: {
  nav: NavItem[]; side?: ReactNode; footer?: ReactNode; title: ReactNode; crumb?: ReactNode; actions?: ReactNode; commands?: PaletteItem[]; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const palette = usePalette();
  return (
    <div className="flex min-h-dvh">
      <Palette nav={nav} items={commands} open={palette.open} onOpenChange={palette.setOpen} />
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 lg:block">
        <SideNav nav={nav} side={side} footer={footer} onSearch={() => palette.setOpen(true)} />
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
                <SideNav nav={nav} side={side} footer={footer} onSearch={() => palette.setOpen(true)} />
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

export function StatusLabel({ status, lang, className }: { status: Status; lang?: Lang; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-soft", className)}><Dot s={status} />{lang ? STATUS[status][lang] : STAFF_JA.status[status]}</span>;
}

// Small grey token, as used for counts and metadata.
export const Chip = ({ children, className }: { children: ReactNode; className?: string }) =>
  <span className={cn("inline-flex h-5 items-center gap-1 rounded-[5px] bg-secondary px-1.5 text-[12px] text-soft", className)}>{children}</span>;

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5"><span className="label">{label}</span><span className="truncate text-[14px] text-foreground">{value}</span></div>;
}

export const Big = ({ children, className }: { children: ReactNode; className?: string }) =>
  <span className={cn("num text-[44px] leading-none tracking-[-0.04em] text-foreground", className)}>{children}</span>;

export const Notice = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "info" }) => (
  <p className={cn("rounded-lg px-3 py-2.5 text-[14px]", tone === "warn" ? "bg-[oklch(0.97_0.03_70)] text-[oklch(0.45_0.1_60)]" : tone === "info" ? "bg-[oklch(0.97_0.02_250)] text-[oklch(0.42_0.1_250)]" : "bg-secondary text-soft")}>{children}</p>
);
