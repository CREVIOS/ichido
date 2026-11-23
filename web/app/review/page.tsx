"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ListFilter } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { REVIEW_KINDS, itemKey, useReviewQueue, type ReviewItem, type ReviewKind } from "@/lib/review";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Dot, Notice } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CASES, REVIEW, staffError } from "@/content/catalogue";
import { useClock } from "../operator/queue";
import { Closures } from "./closures";
import { Detail, KIND_ICON, subtitle, type Decide } from "./item";

export default function ReviewPage() {
  return <StaffGate need={["case:act","case:qa"]} title={REVIEW.title}>{(me) => me.role==="manager" ? <Closures me={me} /> : <Inbox me={me} />}</StaffGate>;
}

const SEEN_KEY = "ichido.review.seen";
const readSeen = () => {
  try { return new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set<string>(); }
};

// Which items this browser has opened: the blue unread dot. A per-viewer convenience; a decision lives in review_state.
function useSeen(live: string[] | null) {
  const [seen, setSeen] = useState(readSeen);
  const mark = useCallback((key: string) => setSeen((s) => {
    if (s.has(key)) return s;
    const next = new Set([...s, key].filter((k) => !live || live.includes(k) || k === key));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...next])); } catch { /* storage blocked: the dot just returns next visit */ }
    return next;
  }), [live]);
  return { seen, mark };
}

function Inbox({ me }: { me: Me }) {
  const { items, failed } = useReviewQueue();
  const now = useClock();
  const [filter, setFilter] = useState<ReviewKind | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Grouped as the list shows them, so ↑/↓ walk the same order.
  const list = useMemo(() => REVIEW_KINDS.filter((k) => !filter || k === filter)
    .flatMap((k) => (items ?? []).filter((i) => i.kind === k && !gone.has(itemKey(i)))), [items, filter, gone]);
  const keys = useMemo(() => list.map(itemKey), [list]);
  const { seen, mark } = useSeen(items ? items.map(itemKey) : null);
  const current = list.find((i) => itemKey(i) === sel) ?? list[0];
  const at = current ? keys.indexOf(itemKey(current)) : -1;
  useEffect(() => { if (current) mark(itemKey(current)); }, [current, mark]);

  const move = useCallback((by: number) => {
    if (!keys.length) return;
    setSel(keys[Math.min(keys.length - 1, Math.max(0, at + by))]);
  }, [keys, at]);

  const decide: Decide = useCallback(async (item, decision, extra = {}) => {
    if (busy) return null;
    setBusy(true);
    try {
      const out = await cmd<{ path?: string }>("review", { incident: item.incident, kind: item.kind, ref: item.ref, decision, ...extra });
      const key = itemKey(item);
      setGone((g) => new Set(g).add(key));
      setSel(keys[at + 1] ?? keys[at - 1] ?? null);
      return out;
    } catch (e) {
      toast.error(staffError((e as Error).message));
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy, keys, at]);

  const primaryRef = useRef<(() => void) | null>(null);   // the selected item's primary action, set by Detail
  const dismiss = useCallback(() => { if (current) decide(current, "dismissed").then((ok) => ok && toast.success(REVIEW.done)); }, [current, decide]);

  // J/K or ↓/↑ move, Enter runs the item's primary action, E dismisses. Ignored while typing or in a menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "arrowdown") { e.preventDefault(); move(1); }
      else if (k === "k" || k === "arrowup") { e.preventDefault(); move(-1); }
      else if (k === "e") dismiss();
      else if (k === "enter" && (!el.closest("button, a") || el.closest("[data-row]"))) { e.preventDefault(); primaryRef.current?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, dismiss]);

  const [phoneDetail,setPhoneDetail] = useState(false);
  const count = (items ?? []).filter((i) => !gone.has(itemKey(i))).length;
  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} title={REVIEW.title} actions={<>
      <span className="num text-sm text-muted-foreground">{items ? count : "—"}</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="ml-auto grid size-11 place-items-center rounded-[5px] text-foreground hover:bg-black/4 aria-expanded:bg-black/4" aria-label={REVIEW.menu}>
          <ListFilter className={cn("size-4 stroke-[1.5]", filter && "text-brand-strong")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {[null, ...REVIEW_KINDS].map((k) => (
            <DropdownMenuItem key={k ?? "all"} onClick={() => setFilter(k)}>
              <span className="flex-1">{k ? REVIEW.groups[k] : CASES.all}</span>{filter === k && <Check className="stroke-[1.5]" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>}>
      <div className="grid bg-pane lg:h-[calc(100dvh-4rem-2px)] lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden lg:rounded-b-xl">
        <aside hidden={phoneDetail && !!current} className="flex min-h-0 lg:!flex flex-col lg:border-r lg:border-border">
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-3">
            {failed && <div className="p-2"><Notice tone="warn">{REVIEW.loadError}</Notice></div>}
            {items?.length === 0 && <p className="px-2 py-3 text-[12px] leading-5 text-muted-foreground">{REVIEW.empty}</p>}
            {REVIEW_KINDS.map((k) => {
              const rows = list.filter((i) => i.kind === k);
              if (!rows.length) return null;
              return (
                <section key={k} className="mb-2">
                  <h2 className="flex h-7 items-center px-2 text-sm tracking-normal text-muted-foreground">{REVIEW.groups[k]}</h2>
                  <div className="flex flex-col gap-0.5">
                    {rows.map((i) => <Row key={itemKey(i)} item={i} on={i === current} unread={!seen.has(itemKey(i))} now={now} onPick={() => {setSel(itemKey(i));setPhoneDetail(true);}} />)}
                  </div>
                </section>
              );
            })}
          </div>
        </aside>
        <section className={cn("min-w-0 flex-col lg:flex",phoneDetail && current ? "flex" : "hidden")}>
          <button type="button" className="min-h-11 self-start px-4 lg:hidden" onClick={() => setPhoneDetail(false)}>‹ {REVIEW.title}</button>
          {current
            ? <Detail key={itemKey(current)} item={current} pos={{ at, of: keys.length }} busy={busy} move={move} decide={decide} dismiss={dismiss} primaryRef={primaryRef} />
            : items && <div className="grid flex-1 place-items-center p-8"><p className="max-w-sm text-center text-[13px] text-muted-foreground">{list.length ? REVIEW.pick : REVIEW.empty}</p></div>}
        </section>
      </div>
    </AppShell>
  );
}

function Row({ item, on, unread, now, onPick }: { item: ReviewItem; on: boolean; unread: boolean; now: number; onPick: () => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button type="button" data-row onClick={onPick} aria-current={on || undefined}
      className="flex min-h-14 w-full items-center gap-2.5 rounded-[5px] px-2.5 pt-[7px] pb-[5px] text-left transition-colors hover:bg-black/3 aria-[current=true]:bg-black/4">
      <Icon className="size-4 shrink-0 stroke-[1.5] text-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.station_label ?? item.station}</span>
          <span className={cn("num flex shrink-0 items-center gap-1.5 text-[13px] font-medium", unread ? "text-foreground" : "text-muted-foreground")}>
            {unread && <span className="size-1.5 rounded-full bg-brand" aria-hidden />}
            {REVIEW.ago(now - Date.parse(item.at))}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <Dot s={item.status} />
          <span className="truncate">{subtitle(item)}</span>
        </span>
      </span>
    </button>
  );
}
