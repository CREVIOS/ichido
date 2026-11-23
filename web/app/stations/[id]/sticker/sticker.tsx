"use client";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { sb } from "@/lib/supabase";
import { StaffGate } from "@/components/StaffGate";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { ASSIST, JOURNEY, LANGS, STATIONS, type L10n } from "@/content/catalogue";

export function PrintableStation({origin}: {origin:string | null}) {
  return <StaffGate need="case:act" title={STATIONS.openSticker}>{() => <Suspense fallback={null}><Sticker origin={origin} /></Suspense>}</StaffGate>;
}

// The printable Help Point sticker: a QR to the neutral pairing page and the promise that it holds no personal data.
function Sticker({origin}: {origin:string | null}) {
  const { id } = useParams<{ id: string }>();
  const [qr, setQr] = useState<{ id: string; src: string; label?: L10n; host?:string; address?:string; domain?:string } | null>(null);
  useEffect(() => {
    if (!origin) return;
    const url = `${origin}/s/${encodeURIComponent(id)}`;
    let active = true;
    Promise.all([
      QRCode.toDataURL(url, { width: 768, margin: 0, errorCorrectionLevel: "M" }),
      sb().from("station").select("label,host_org,short_address").eq("id", id).maybeSingle(),
    ])
      .then(([src, station]) => { if (active) setQr({ id, src, label: station.data?.label, host:station.data?.host_org, address:station.data?.short_address, domain:new URL(origin).host }); })
      .catch(() => { if (active) setQr({ id, src: "" }); });
    return () => { active = false; };
  }, [id,origin]);

  return (
    <main className="grid min-h-dvh place-items-center gap-6 p-6 print:block print:p-0">
      {(!origin || (qr && (!qr.host || !qr.address))) && <p className="print:hidden">{ASSIST.stickerMissing}</p>}
      <article className={`flex w-[340px] flex-col gap-5 rounded-2xl border bg-card p-7 print:border-black ${qr?.id === id && qr.host && qr.address && qr.src ? "" : "print:hidden"}`}>
        <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[17px] text-foreground"><Mark />Ichido</span><span className="mono text-muted-foreground">{id}</span></div>
        <div className="flex flex-col gap-1">
          <span className="text-[26px] leading-tight tracking-[-0.03em] text-foreground">Help Point</span>
          <strong>{qr?.host}</strong><span>{qr?.address}</span><span className="font-mono">{qr?.domain}</span>
          {qr?.id === id && qr.label && <span className="text-[13px]">{qr.label.ja}</span>}
        </div>
        <div className="aspect-square w-full">
          {qr?.id === id && (qr.src ? <Image width={768} height={768} unoptimized src={qr.src} alt={STATIONS.openSticker} /> : <p role="alert">{STATIONS.qrError}</p>)}
        </div>
        <div className="flex flex-col gap-1.5">
          {LANGS.map((l) => <span key={l} lang={l} className="text-[13px] leading-5 text-foreground">{JOURNEY.sticker[l]}</span>)}
        </div>
      </article>
      <Button className="print:hidden" disabled={qr?.id !== id || !qr.src || !qr.host || !qr.address} onClick={() => window.print()}><Printer className="stroke-[1.5]" />{STATIONS.print}</Button>
    </main>
  );
}
