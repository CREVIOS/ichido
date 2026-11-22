import { cn } from "@/lib/utils";

// The mark: a speech bubble holding one brush stroke, 一 ("one").
// Say it once — and the line that connects (tsunagu) the caller to the person who helps.
export const BUBBLE = "M4.5 1.75h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9.25L5.5 15.5v-2.75h-1a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z";
// Brush-drawn 一: a pressed entry, a tapering body, the small closing press at the end.
export const ICHI = "M5.6 7.55c.35-.55.95-.8 1.7-.8 2.1 0 4.1.05 5.95-.05.55-.03 1 .02 1.3.25.35.27.3.72-.08.9-.3.14-.75.17-1.25.17-1.9 0-3.85.05-5.8.15-.6.03-1.2.03-1.55-.15-.3-.15-.4-.3-.27-.47z";

export function MarkGlyph({ strokeWidth = 1.5 }: { strokeWidth?: number }) {
  return (
    <>
      <path d={BUBBLE} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d={ICHI} fill="currentColor" />
    </>
  );
}

export function Mark({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 20 17" className={cn("h-[15px] w-[18px]", className)} aria-hidden>
      <MarkGlyph strokeWidth={strokeWidth} />
    </svg>
  );
}
