import Link from "next/link";

export default function Home() {
  return (
    <main className="phone" style={{ maxWidth: 720 }}>
      <p className="small" style={{ color: "var(--field)" }}>Hackathon demo · fictional bank, synthetic data</p>
      <h1 style={{ fontSize: 34 }}>一度 Ichido</h1>
      <p style={{ fontSize: 18 }}>
        When an ATM keeps your card, the person in front of it should never be left without words or without a next step.
        Ichido joins the machine&apos;s alert, the caller&apos;s own words and the operator&apos;s decision into one case — in the caller&apos;s language.
      </p>
      <div className="stack">
        <Link className="btn primary big" href="/operator">Operator console · 監視センター</Link>
        <Link className="btn secondary big" href="/s/TABLE-A">Caller (Help Point sticker) · কলার</Link>
        <Link className="btn secondary big" href="/field">Security guard · 警備員</Link>
      </div>
      <p className="small secondary">
        The ATM is simulated by an ESP32 prop or an on-screen button. Nothing here connects to a real bank, ATM or security company.
        The assistant never asks for a PIN, card, account or ID number.
      </p>
    </main>
  );
}
