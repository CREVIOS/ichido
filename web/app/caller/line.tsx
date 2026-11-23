"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { MessageCircle } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { Button, buttonVariants } from "@/components/ui/button";
import { LINE_CALLER, errorText, type Lang } from "@/content/catalogue";

// Updates on LINE for this case (opt-in, web/lib/line.ts). Shown only when the server has LINE keys. Nothing is
// stored until the caller sends the one-time code from their own LINE; then only their LINE id, for at most 7 days.
type Status = { enabled: boolean; linked: boolean };
type Issued = { code: string | null; url: string; linked: boolean };

export function LineUpdates({ lang }: { lang: Lang }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [qr, setQr] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { void cmd<Status>("line_status").then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(() => { if (issued?.url) void QRCode.toDataURL(issued.url, { margin: 1, width: 160 }).then(setQr).catch(() => setQr("")); }, [issued?.url]);

  if (!status?.enabled) return null;
  if (status.linked || issued?.linked) return <p className="text-[14px] text-muted-foreground">{LINE_CALLER.linked[lang]}</p>;
  if (!issued) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button variant="outline" className="self-start" onClick={() => cmd<Issued>("line_code").then(setIssued).catch((e: Error) => setNote(errorText(e.message, lang)))}>
          <MessageCircle className="stroke-[1.5]" />{LINE_CALLER.offer[lang]}
        </Button>
        {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
      </div>
    );
  }
  return (
    <section className="surface flex flex-col gap-3 p-4">
      <span className="text-[15px] text-foreground">{LINE_CALLER.offer[lang]}</span>
      <p className="text-[14px] leading-6">{LINE_CALLER.lead[lang]}</p>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn in the browser */}
        {qr && <img src={qr} alt="" width={96} height={96} className="rounded-md border" />}
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">{LINE_CALLER.code[lang]}</span>
          <span className="font-mono text-[24px] tracking-[0.15em] text-foreground" data-testid="line-code">{issued.code}</span>
          <span className="text-[12px] text-muted-foreground">{LINE_CALLER.codeHint[lang]}</span>
        </div>
      </div>
      <a href={issued.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "self-start" })}>{LINE_CALLER.open[lang]}</a>
    </section>
  );
}
