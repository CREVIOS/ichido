import Link from "next/link";

const ROLES = [
  { href: "/operator", title: "監視センター", sub: "Operator console", body: "The machine's fault, the caller's own words, approved replies and dispatch on one screen." },
  { href: "/s/TABLE-A", title: "Help Point", sub: "Caller · বাংলা / English / やさしい日本語", body: "Scan the sticker, enter the operator's code, say what happened in your language." },
  { href: "/field", title: "警備員", sub: "Security guard", body: "Only your own assignments. One tap for on the way, arrived, done." },
  { href: "/insights", title: "インサイト", sub: "Insights", body: "How cases flow from the machine alert to a caller who can explain their next step." },
];

export default function Home() {
  return (
    <div className="frame">
      <header className="topnav">
        <span className="brand"><span className="brand-mark" aria-hidden>一</span>ichido</span>
        <span className="tag" style={{ marginLeft: "auto" }}>Hackathon demo · <b>fictional bank, synthetic data</b></span>
      </header>
      <div className="pagehead" style={{ alignItems: "flex-start", flexDirection: "column", gap: 18 }}>
        <h1>Say it once.</h1>
        <p style={{ fontSize: 20, maxWidth: 760, color: "var(--ink-2)", letterSpacing: "-0.01em" }}>
          When an ATM keeps your card, nobody in front of it should be left without words or without a next step.
          Ichido joins the machine&apos;s alert, the caller&apos;s own words and the operator&apos;s decision into one case, in the caller&apos;s language.
        </p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {ROLES.map((r) => (
          <Link key={r.href} href={r.href} className="card" style={{ minHeight: 220 }}>
            <span className="eyebrow">{r.sub}</span>
            <span style={{ fontSize: 30, letterSpacing: "-0.03em" }}>{r.title}</span>
            <span className="soft" style={{ marginTop: "auto" }}>{r.body}</span>
            <span className="small" style={{ color: "var(--blue)" }}>Open →</span>
          </Link>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 22 }}>
        The ATM is simulated by an ESP32 prop or an on-screen action. Nothing here connects to a real bank, ATM or security company.
        The assistant never asks for a PIN, card, account or ID number.
      </p>
    </div>
  );
}
