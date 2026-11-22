"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = { k: string; lines: string[][] };

// Code window with tabs, for the "Open by design" section.
export function McpTabs({ tabs, copy }: { tabs: Tab[]; copy: string }) {
  const [on, setOn] = useState(0);
  const text = tabs[on].lines.map(([, l]) => l).join("\n");
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-2">
      <div role="tablist" className="flex gap-0.5 self-start rounded-lg bg-white/55 p-0.5 backdrop-blur">
        {tabs.map((t, i) => (
          <button key={t.k} role="tab" type="button" aria-selected={on === i} onClick={() => setOn(i)}
            className={cn("h-7 rounded-md px-3 text-[13px] text-soft transition-colors hover:text-foreground", on === i && "bg-white text-foreground shadow-sm")}>{t.k}</button>
        ))}
      </div>
      <div className="rounded-xl border border-white/60 bg-[oklch(0.985_0_0/0.92)] shadow-[0_24px_48px_-24px_oklch(0_0_0/0.3)] backdrop-blur">
        <div className="flex h-9 items-center gap-1.5 border-b px-3">
          {[0, 1, 2].map((d) => <span key={d} className="size-2 rounded-full bg-foreground/10" />)}
          <button type="button" onClick={() => void navigator.clipboard?.writeText(text)} className="ml-auto text-[12px] text-soft hover:text-foreground">{copy}</button>
        </div>
        <pre className="min-h-32 overflow-x-auto p-4 font-mono text-[12px] leading-6 text-foreground">
          {tabs[on].lines.map(([p, l]) => <div key={l}><span className="mr-3 text-faint select-none">{p || " "}</span><span className={p === "›" ? "text-[oklch(0.5_0.12_255)]" : ""}>{l}</span></div>)}
        </pre>
      </div>
    </div>
  );
}
