import { Human } from "./human";
import { OctagonAlert } from "lucide-react";
import { OPS_CALLER, type Lang } from "@/content/catalogue";

// Fraud-in-progress mode (the operator's decision): the approved warning, full screen, nothing to tap.
export function FraudScreen({ lang }: { lang: Lang }) {
  return (
    <main lang={lang} role="alert" className="fixed inset-0 z-50 flex flex-col justify-center gap-6 overflow-y-auto bg-alert p-8 text-white">
      <Human lang={lang} />
      <OctagonAlert className="size-14 stroke-[1.5]" aria-hidden />
      <h1 className="text-[44px] leading-none font-semibold tracking-[-0.02em]">{OPS_CALLER.fraud.title[lang]}</h1>
      <p className="max-w-md text-[24px] leading-[1.45]">{OPS_CALLER.fraud.body[lang]}</p>
    </main>
  );
}

// An approved status from the desk: the mass-incident broadcast, or "still working on it" when a promise ran out.
export function CallerNotice({ code, lang }: { code: string; lang: Lang }) {
  const text = OPS_CALLER.notice[code]?.[lang];
  if (!text) return null;
  return (
    <section role="status" className="surface flex flex-col gap-1 border-alert/30 p-4">
      <span className="text-[13px] text-muted-foreground">{OPS_CALLER.noticeLabel[lang]}</span>
      <span className="text-[17px] leading-7 text-foreground">{text}</span>
    </section>
  );
}
