import { MapPin, MessageCircle, RadioTower } from "lucide-react";
import { HOME } from "@/content/catalogue";

const ICON = { caller: MessageCircle, operator: RadioTower, guard: MapPin } as const;
// Soft, blurred light fields behind each card; pure CSS, no imagery.
const FIELD = [
  "radial-gradient(60% 45% at 30% 30%, oklch(0.82 0.03 240) 0%, transparent 70%), radial-gradient(55% 50% at 70% 75%, oklch(0.7 0.04 245) 0%, transparent 70%), linear-gradient(160deg, oklch(0.74 0.025 235), oklch(0.62 0.03 245))",
  "radial-gradient(40% 18% at 45% 0%, oklch(0.8 0.08 85) 0%, transparent 80%), radial-gradient(70% 50% at 50% 80%, oklch(0.72 0.02 90) 0%, transparent 70%), linear-gradient(180deg, oklch(0.32 0.04 255), oklch(0.58 0.03 240) 55%, oklch(0.66 0.02 90))",
  "radial-gradient(55% 45% at 75% 20%, oklch(0.78 0.04 60) 0%, transparent 70%), radial-gradient(60% 55% at 30% 70%, oklch(0.76 0.015 260) 0%, transparent 70%), linear-gradient(165deg, oklch(0.66 0.02 250), oklch(0.73 0.02 70))",
];

export function People() {
  return (
    <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
      {HOME.people.items.map((p, i) => {
        const Icon = ICON[p.icon as keyof typeof ICON];
        return (
          <article key={p.name} className="relative flex aspect-[7/8] min-w-[300px] snap-start flex-col overflow-hidden rounded-xl p-7 text-white lg:min-w-0">
            <div aria-hidden className="absolute inset-0 scale-110 blur-2xl" style={{ background: FIELD[i] }} />
            <div className="relative flex items-center gap-3 text-[18px]"><Icon className="size-6 stroke-[1.5]" />{p.name}</div>
            <p className="relative mt-8 text-[19px] leading-[1.45] tracking-[-0.01em] text-white/95">{p.text}</p>
            <div className="relative mt-auto flex flex-col text-[14px]">
              <span>{p.who}</span>
              <span className="text-white/60">{p.tag}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
