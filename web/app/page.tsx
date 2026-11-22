import Link from "next/link";
import { HOME } from "@/content/catalogue";

export default function Home() {
  return (
    <div className="frame">
      <header className="topnav">
        <span className="brand"><span className="brand-mark" aria-hidden>一</span>ichido</span>
        <span className="tag" style={{ marginLeft: "auto" }}>{HOME.badge} · <b>{HOME.badgeStrong}</b></span>
      </header>
      <div className="pagehead" style={{ alignItems: "flex-start", flexDirection: "column", gap: 18 }}>
        <h1>{HOME.title}</h1>
        <p style={{ fontSize: 20, maxWidth: 760, color: "var(--ink-2)", letterSpacing: "-0.01em" }}>{HOME.lead}</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {HOME.roles.map((r) => (
          <Link key={r.href} href={r.href} className="card" style={{ minHeight: 220 }}>
            <span className="eyebrow">{r.sub}</span>
            <span style={{ fontSize: 30, letterSpacing: "-0.03em" }}>{r.title}</span>
            <span className="soft" style={{ marginTop: "auto" }}>{r.body}</span>
            <span className="small" style={{ color: "var(--blue)" }}>{HOME.open}</span>
          </Link>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 22 }}>{HOME.footer}</p>
    </div>
  );
}
