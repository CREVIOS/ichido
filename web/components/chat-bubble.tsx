import type { ReactNode } from "react";
import { Mark } from "./mark";

export function ChatBubble({ from, first = true, last = true, label, lang, children }: {
  from: "ai" | "caller" | "operator"; first?: boolean; last?: boolean; label?: string; lang?: string; children: ReactNode;
}) {
  return <div className="chat-row" data-from={from} data-first={first} data-last={last}>
    {from === "ai" && first && <Mark className="chat-avatar" />}
    <div className="chat-balloon" lang={lang}>
      {label && <span className="chat-role">{label}</span>}{children}
    </div>
  </div>;
}
