import type { Metadata } from "next";
import { Suspense } from "react";
import { openHandoff, partnerReport } from "@/lib/handoff";
import { HANDOFF } from "@/content/catalogue";
import { Mark } from "@/components/mark";
import { PrintButton } from "./print";

const D = HANDOFF.doc;
export const metadata: Metadata = { title: D.title, robots: { index: false, follow: false } };

export default function HandoffPage({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={null}><Report params={params} /></Suspense>;
}

async function Report({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await openHandoff(token);
  if (!link) return <main className="grid min-h-dvh place-items-center p-6">{D.gone}</main>;
  const rows = await partnerReport(link.incident,link.recipient,link.expires_at);
  return <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10">
    <header className="flex items-center justify-between border-b pb-4"><Mark /><h1>{D.title}</h1><PrintButton label={D.print} /></header>
    <dl className="grid grid-cols-[auto_1fr] gap-3 text-sm">{rows.map(([label,value],i) =>
      <div className="contents" key={i}><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-line">{value}</dd></div>)}</dl>
    <footer>{D.footer(new Date(link.expires_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}))}</footer>
  </main>;
}
