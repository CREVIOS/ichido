import Link from "next/link";
import { Section } from "@/components/site";
import { PACK_ICON } from "@/components/pack-icon";
import { CONTENT_PACKS, HOME, PACKS } from "@/content/catalogue";

// "Beyond ATMs" on the landing and enterprise pages: one card per scenario pack, read from the packs themselves.
const B = HOME.beyond;

export function Beyond() {
  const cards = [
    { id: "atm" as const, situations: [B.atm], why: undefined },
    ...CONTENT_PACKS.map((p) => ({ id: p.id, situations: Object.values(p.situations).map((s) => s.name.en), why: p.why })),
  ];
  return (
    <Section id="packs" title={B.title} sub={B.sub} tag={B.tag}>
      <p className="mb-8 max-w-2xl text-[15px] leading-6 text-muted-foreground">{B.lead}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => {
          const p = PACKS[c.id];
          const Icon = PACK_ICON[c.id];
          return (
            <div key={c.id} className="flex flex-col gap-3 rounded-xl bg-[oklch(0.945_0_0)] p-5">
              <span className="flex items-center gap-2 text-[15px] text-foreground"><Icon className="size-4 stroke-[1.5]" />{p.name.en}<span className="text-muted-foreground">{p.name.staff}</span></span>
              <span className="text-[13px] text-muted-foreground">{B.responder}: <span className="text-foreground">{p.responder.caller.en}</span></span>
              <span className="label">{B.situations}</span>
              <ul className="flex flex-col gap-1 text-[14px] leading-5">{c.situations.map((s) => <li key={s}>{s}</li>)}</ul>
              {c.why && <p className="text-[12px] leading-5 text-muted-foreground">{c.why}</p>}
              <Link href={`/s/${B.stations[c.id]}`} className="mt-auto text-[13px] text-foreground underline underline-offset-4">{B.try}</Link>
            </div>
          );
        })}
      </div>
      <ul className="mt-8 grid gap-3 text-[14px] leading-6 sm:grid-cols-2">
        {B.rules.map((r) => <li key={r} className="border-t pt-3">{r}</li>)}
      </ul>
    </Section>
  );
}
