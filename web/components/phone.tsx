import type { ReactNode } from "react";
import { Logo } from "@/components/kit";
import type { Lang } from "@/content/catalogue";

// Caller frame: one narrow column, logo and language at the top, nothing else competing.
// large: the caller's "large text" setting; zoom scales every size and the column reflows.
export function Phone({ lang, right, children, center, large }: { lang?: Lang; right?: ReactNode; children: ReactNode; center?: boolean; large?: boolean }) {
  return (
    <main lang={lang} style={large ? { zoom: 1.3 } : undefined} className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col gap-6 px-4 pt-4 pb-8">
      <header className="flex h-9 items-center justify-between"><Logo />{right}</header>
      <div className={center ? "my-auto flex flex-col gap-6" : "flex flex-1 flex-col gap-6"}>{children}</div>
    </main>
  );
}
