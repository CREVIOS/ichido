"use client";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { sb } from "@/lib/supabase";
import { StaffGate } from "@/components/StaffGate";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { LANGS, STATION, STATIONS, type L10n } from "@/content/catalogue";

export default function StickerPage() {
  return <StaffGate allow={["operator"]} title={STATIONS.openSticker}>{() => <Suspense fallback={null}><Sticker /></Suspense>}</StaffGate>;
}

// The printable Help Point sticker: a QR to the neutral pairing page and the promise that it holds no personal data.
function Sticker() {
  const { id } = useParams<{ id: string }>();
  const [svg, setSvg] = useState("");
  const [label, setLabel] = useState<L10n | null>(null);
  useEffect(() => {
    const url = `${location.origin}/s/${encodeURIComponent(id)}`;
    QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(setSvg);
    sb().from("station").select("label").eq("id", id).maybeSingle().then(({ data }) => setLabel((data?.label as L10n) ?? null));
  }, [id]);

  return (
    <main className="grid min-h-dvh place-items-center gap-6 p-6 print:block print:p-0">
      <article className="flex w-[340px] flex-col gap-5 rounded-2xl border bg-card p-7 print:border-black">
        <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[17px] text-foreground"><Mark />Ichido</span><span className="mono text-muted-foreground">{id}</span></div>
        <div className="flex flex-col gap-1">
          <span className="text-[26px] leading-tight tracking-[-0.03em] text-foreground">Help Point</span>
          {label && <span className="text-[13px]">{label.ja}</span>}
        </div>
        <div className="aspect-square w-full text-foreground [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="flex flex-col gap-1.5">
          {LANGS.map((l) => <span key={l} lang={l} className="text-[13px] leading-5 text-foreground">{STATION.title[l]}</span>)}
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground" lang="ja">{STATION.why.ja}</p>
      </article>
      <Button className="print:hidden" onClick={() => window.print()}><Printer className="stroke-[1.5]" />{STATIONS.print}</Button>
    </main>
  );
}
