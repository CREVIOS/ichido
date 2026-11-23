"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, Menu, MoreHorizontal, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Mark } from "@/components/mark";
import { Palette, usePalette, type PaletteItem } from "@/components/palette";
export { Mark } from "@/components/mark";
import { STATUS, STAFF, STAFF_JA, type Lang, type Status } from "@/content/catalogue";

// Badge: a live count the item fetches itself (e.g. 要確認 on every operator page).
export type NavItem = { href: string; label: string; icon: LucideIcon; count?: number; Badge?: ComponentType };

export function Logo({ className }: { className?: string }) {
  // Leaving the voice screen needs a new document to drop its microphone permission policy.
  const HomeLink = usePathname() === "/caller" ? "a" : Link;
  return (
    <HomeLink href="/" className={cn("inline-flex items-center gap-1.5 text-foreground", className)} aria-label="Ichido">
      <Mark />
      <span className="text-[17px] leading-none tracking-[-0.035em]">Ichido</span>
    </HomeLink>
  );
}

// Sidebar collapse: remembered per browser, toggled with the « button or the [ key.
const SIDEBAR_KEY = "ichido.sidebar";
const sidebarListeners = new Set<() => void>();
function readCollapsed() { try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; } }
function setCollapsed(v: boolean) {
  try { localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0"); } catch { /* storage unavailable: still toggles for this page */ }
  memoryCollapsed = v;
  sidebarListeners.forEach((l) => l());
}
let memoryCollapsed: boolean | null = null;
const subscribeSidebar = (l: () => void) => { sidebarListeners.add(l); return () => { sidebarListeners.delete(l); }; };
export function useSidebarCollapsed() {
  return useSyncExternalStore(subscribeSidebar, () => memoryCollapsed ?? readCollapsed(), () => false);
}
// Lets the user footer and side panels draw their compact form inside the rail.
export const SidebarContext = createContext({ collapsed: false });
export const useSidebar = () => useContext(SidebarContext);

function SideNav({ nav, side, footer, onSearch, collapsed = false, onToggle }: {
  nav: NavItem[]; side?: ReactNode; footer?: ReactNode; onSearch: () => void; collapsed?: boolean; onToggle?: () => void;
}) {
  const path = usePathname();
  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div className={cn("flex h-full flex-col gap-5 py-4", collapsed ? "items-center px-2" : "px-3")}>
        <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between pr-9 pl-2 lg:pr-0")}>
          {collapsed ? <Link href="/" aria-label="Ichido" className="text-foreground"><Mark /></Link> : <Logo />}
          <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-0.5")}>
            <button type="button" onClick={onSearch} data-close title={STAFF.palette.title} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent" aria-label={STAFF.palette.title}>
              <Search className="size-3.5 stroke-[1.5]" />{!collapsed && <span className="mono text-[11px]">{STAFF.palette.shortcut}</span>}
            </button>
            {onToggle && (
              <button type="button" onClick={onToggle} title={collapsed ? STAFF.sidebar.expand : STAFF.sidebar.collapse} aria-label={collapsed ? STAFF.sidebar.expand : STAFF.sidebar.collapse}
                className="hidden size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent lg:grid">
                {collapsed ? <ChevronsRight className="size-4 stroke-[1.5]" /> : <ChevronsLeft className="size-4 stroke-[1.5]" />}
              </button>
            )}
          </div>
        </div>
        <nav className={cn("flex flex-col gap-px", collapsed && "items-center")} aria-label={STAFF.menu}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} title={collapsed ? n.label : undefined}
              className={cn("relative flex h-8 items-center rounded-md text-[14px] text-soft transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:text-foreground",
                collapsed ? "w-8 justify-center" : "gap-2.5 px-2")}>
              <n.icon className="size-4 shrink-0 stroke-[1.5]" />
              {collapsed ? <span className="sr-only">{n.label}</span> : <span className="flex-1">{n.label}</span>}
              {!collapsed && (n.Badge ? <n.Badge /> : <CountBadge n={n.count} />)}
              {collapsed && (n.count ?? 0) > 0 && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-info" />}
            </Link>
          ))}
        </nav>
        {/* Only the middle scrolls; the logo above and the user below stay put. */}
        <div className={cn("min-h-0 w-full flex-1 overflow-y-auto", collapsed && "hidden")}>{side}</div>
        {collapsed && <div className="flex-1" />}
        <div className="w-full shrink-0">{footer}</div>
      </div>
    </SidebarContext.Provider>
  );
}

export const CountBadge = ({ n }: { n?: number }) =>
  n != null && n > 0 ? <span className="num grid h-4 min-w-4 place-items-center rounded bg-secondary px-1 text-[11px] text-muted-foreground">{n}</span> : null;

// Staff app frame: a quiet sidebar on the canvas, the work on a white sheet beside it.
// bare: the page draws its own title bars on wide screens (the header stays for the phone menu).
export function AppShell({ nav, side, footer, title, crumb, actions, commands = [], bare, children }: {
  nav: NavItem[]; side?: ReactNode; footer?: ReactNode; title: ReactNode; crumb?: ReactNode; actions?: ReactNode; commands?: PaletteItem[]; bare?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const palette = usePalette();
  const collapsed = useSidebarCollapsed();
  const toggle = useCallback(() => setCollapsed(!(memoryCollapsed ?? readCollapsed())), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault(); toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return (
    // Wide screens: a full-screen app — the sidebar and title bar stay put and only the work area scrolls.
    // Phones: the page scrolls normally and the sidebar opens as a sheet.
    <div className="flex min-h-dvh lg:h-dvh lg:overflow-hidden">
      <Palette nav={nav} items={commands} open={palette.open} onOpenChange={palette.setOpen} />
      <aside className={cn("hidden h-dvh shrink-0 transition-[width] duration-200 ease-out lg:block", collapsed ? "w-[60px]" : "w-[248px]")}>
        <SideNav nav={nav} side={side} footer={footer} onSearch={() => palette.setOpen(true)} collapsed={collapsed} onToggle={toggle} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:py-2 lg:pr-2">
        <main className="flex min-h-0 flex-1 flex-col bg-card lg:overflow-hidden lg:rounded-xl lg:border" style={{ boxShadow: "0 1px 2px oklch(0 0 0 / 0.03)" }}>
          <header className={cn("sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur lg:rounded-t-xl lg:px-5", bare && "lg:hidden")}>
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
          <div className="min-h-0 flex-1 lg:overflow-y-auto">{children}</div>
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

// text: the caller's wording when the pack words a status its own way (content/packs).
export function StatusLabel({ status, lang, className, text }: { status: Status; lang?: Lang; className?: string; text?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-soft", className)}><Dot s={status} />{text ?? (lang ? STATUS[status][lang] : STAFF_JA.status[status])}</span>;
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
  <p className={cn("rounded-lg px-3 py-2.5 text-[14px]", tone === "warn" ? "bg-[oklch(0.97_0.03_70)] text-[oklch(0.45_0.1_60)]" : tone === "info" ? "bg-[oklch(0.97_0.02_250)] text-[oklch(0.42_0.1_250)]" : "bg-secondary text-foreground")}>{children}</p>
);
