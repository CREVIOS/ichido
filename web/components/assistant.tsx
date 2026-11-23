"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { staffToken } from "@/lib/supabase";
import { can, type Role } from "@/lib/rbac";
import { Chip, Notice } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ASSISTANT as A } from "@/content/catalogue";

// Ask Ichido: the staff assistant (/api/assistant), opened from the ⌘K palette or /insights. Read-only; each answer
// shows the MCP tools it used and the cases it read.

// Who is signed in, for pages inside StaffGate (the palette offers the assistant only to roles with assistant:use).
export const StaffRole = createContext<Role | null>(null);
export const useAssistantAllowed = () => can(useContext(StaffRole), "assistant:use");

let open = false;
const subs = new Set<() => void>();
const setOpen = (v: boolean) => { open = v; subs.forEach((f) => f()); };
export const openAssistant = () => setOpen(true);
const useOpen = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => open, () => false);

// Whether the server has a model: asked once per tab, only by roles that may use the assistant.
let enabled: Promise<boolean> | null = null;
export function useAssistantEnabled() {
  const allowed = useAssistantAllowed();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    enabled ??= staffToken().then((t) => fetch("/api/assistant", { headers: { authorization: `Bearer ${t}` } }))
      .then(async (r) => r.ok && Boolean((await r.json()).enabled)).catch(() => false);
    void enabled.then(setOn);
  }, [allowed]);
  return allowed && on;
}

type Tool = { name: string; server: string; ms: number | null; ok: boolean; cases: string[] };
type Done = { mode: string; model: string; cases: string[]; ms: number };
type Turn = { q: string; text: string; tools: Tool[]; done: Done | null; error: string | null };

export function AssistantPanel() {
  const isOpen = useOpen();
  const allowed = useAssistantAllowed();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns]);
  if (!allowed) return null;

  const patch = (f: (t: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), f(ts[ts.length - 1])]);
  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = turns.filter((t) => t.done).flatMap((t) => [{ role: "user", text: t.q }, { role: "assistant", text: t.text }]);
    setTurns((ts) => [...ts, { q: question, text: "", tools: [], done: null, error: null }]);
    setQ(""); setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await staffToken()}` },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok || !res.body) {
        const code = (await res.json().catch(() => ({}))).error;
        return patch((t) => ({ ...t, error: code === "not_configured" ? A.off : code === "rate_limited" ? A.limited : A.failed }));
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line);
          if (e.t === "text") patch((t) => ({ ...t, text: t.text + e.d }));
          else if (e.t === "tool") patch((t) => ({ ...t, tools: [...t.tools, e] }));
          else if (e.t === "done") patch((t) => ({ ...t, done: e }));
          else if (e.t === "error") patch((t) => ({ ...t, error: e.code === "not_configured" ? A.off : A.failed }));
        }
      }
    } catch {
      patch((t) => ({ ...t, error: A.failed }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[440px]">
        <div className="flex flex-col gap-1.5 border-b px-5 pt-5 pb-4">
          <SheetTitle className="flex items-center gap-1.5 text-[15px]"><Sparkles className="size-3.5 stroke-[1.5]" />{A.title}</SheetTitle>
          <SheetDescription className="text-[12px] leading-5">{A.lead}</SheetDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
          {!turns.length && (
            <div className="flex flex-wrap gap-1.5">
              {A.examples.map((x) => <Button key={x} variant="secondary" size="sm" onClick={() => ask(x)}>{x}</Button>)}
            </div>
          )}
          {turns.map((t, i) => <Answer key={i} t={t} busy={busy && i === turns.length - 1} />)}
          <div ref={end} />
        </div>
        <form className="flex flex-col gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <Textarea aria-label={A.title} value={q} onChange={(e) => setQ(e.target.value)} placeholder={A.placeholder} maxLength={500}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ask(q); } }} className="min-h-16 resize-none text-[14px]" />
          <Button type="submit" className="self-end" disabled={busy || !q.trim()}>{A.ask}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Answer({ t, busy }: { t: Turn; busy: boolean }) {
  const caseLink = useContext(StaffRole) === "operator";
  const max = Math.max(1, ...t.tools.map((x) => x.ms ?? 0));
  return (
    <section className="flex flex-col gap-3">
      <p className="self-end rounded-lg bg-secondary px-3 py-2 text-[14px] text-foreground">{t.q}</p>
      {busy && !t.text && <span className="text-[13px] text-muted-foreground">{A.thinking}</span>}
      {t.text && <p className="whitespace-pre-wrap text-[14px] leading-6 text-foreground">{t.text}</p>}
      {t.error && <Notice tone="warn">{t.error}</Notice>}
      {t.tools.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="flex justify-between"><span className="label">{A.trace}</span>{t.done && <span className="label num">{A.total(t.done.ms)}</span>}</span>
          {t.tools.map((x, i) => (
            <span key={`${x.name}-${i}`} className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-2 text-[12px]">
              <span className={x.ok ? "truncate text-muted-foreground" : "truncate text-alert"}>{A.tools[x.name] ?? x.name}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-[oklch(0.72_0.16_145)]" style={{ width: `${x.ms == null ? 100 : Math.max(4, (x.ms / max) * 100)}%` }} /></span>
              <span className="num text-right text-muted-foreground">{x.ms == null ? "—" : `${x.ms}ms`}</span>
            </span>
          ))}
        </div>
      )}
      {t.done && (
        <div className="flex flex-wrap items-center gap-1.5">
          {t.done.cases.length > 0 && <span className="label mr-1">{A.cases}</span>}
          {t.done.cases.map((c) => caseLink
            ? <Link key={c} href={`/operator#${c}`} className="mono rounded border px-1.5 text-[12px] hover:bg-accent">{c.slice(0, 8)}</Link>
            : <span key={c} className="mono rounded border px-1.5 text-[12px]">{c.slice(0, 8)}</span>)}
          <Chip className="ml-auto">{A.mode[t.done.mode] ?? t.done.mode} · {t.done.model}</Chip>
        </div>
      )}
    </section>
  );
}
