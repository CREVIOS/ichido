import type { ReactNode } from "react";
import { Logo } from "@/components/kit";
import type { Lang } from "@/content/catalogue";

export function Phone({ lang, right, station, children, center, large, chat }: {
  lang?: Lang; right?: ReactNode; station?: string; children: ReactNode; center?: boolean; large?: boolean; chat?: boolean;
}) {
  return <main lang={lang} data-large={large || undefined} className={chat ? "phone phone-chat" : "phone flex flex-col"}>
    <header className="phone-head"><Logo className={station ? "[&>span]:sr-only" : undefined} />
      {station && <h1 title={station} className="station">{station}</h1>}{right}</header>
    <div className={center ? "phone-body my-auto" : "phone-body"}>{children}</div>
  </main>;
}
