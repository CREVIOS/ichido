import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Compact pane chrome for the review inbox and the sequence view: a 40px title bar, hairline 0.5px borders,
// 22px bordered controls.

export function TitleBar({ icon: Icon, title, children, className, as: Heading = "h1" }: { icon: LucideIcon; title: ReactNode; as?: "h1" | "h2"; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex h-10 shrink-0 items-center gap-2 pr-2 pl-3.5", className)}>
      <Icon className="size-4 shrink-0 stroke-[1.5] text-foreground" aria-hidden />
      <Heading className="min-w-0 truncate text-sm font-medium tracking-normal text-foreground">{title}</Heading>
      {children}
    </header>
  );
}

// A small bordered control: icon-only (square) or with a label.
export function PaneButton({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button type="button" {...props}
      className={cn("inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center gap-1 rounded-[5px] border-[0.5px] border-black/12 px-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-black/4 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:stroke-[1.5]", className)}>
      {children}
    </button>
  );
}

// A section label inside a pane ("Performance", "Steps" …).
export const PaneLabel = ({ children }: { children: ReactNode }) => <h2 className="mb-1.5 text-[12px] tracking-normal text-muted-foreground">{children}</h2>;
