import type { ReactNode } from "react";
import { Logo } from "@/components/kit";
import type { Lang } from "@/content/catalogue";

export function Phone({ lang, right, station, children, center, large, chat }: {
  lang?: Lang; right?: ReactNode; station?: string; children: ReactNode; center?: boolean; large?: boolean; chat?: boolean;
}) {
  const Station = chat ? "h1" : "span";
  return <main lang={lang} data-large={large || undefined} className={chat ? "phone phone-chat" : "phone flex flex-col"}>
    <header className="phone-head"><Logo className={station ? "[&>span]:sr-only" : undefined} />
      {station && <Station title={station} className="station">{station}</Station>}{right}</header>
    <div className={center ? "phone-body my-auto" : "phone-body"}>{children}</div>
  </main>;
}
