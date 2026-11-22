"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { STATUS, type Lang, type Status } from "@/content/catalogue";

export type NavItem = { href: string; label: string };

// Staff frame: brand, pill navigation, big page title.
export function Shell({ nav, right, title, aside, children }: { nav: NavItem[]; right?: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="frame">
      <header className="topnav">
        <Link href="/" className="brand" aria-label="Ichido home"><span className="brand-mark" aria-hidden>一</span>ichido</Link>
        <nav className="pillnav" aria-label="Sections">
          {nav.map((n) => <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>{n.label}</Link>)}
        </nav>
        {right}
      </header>
      <div className="pagehead"><h1>{title}</h1>{aside}</div>
      {children}
    </div>
  );
}

export function Card({ title, action, children, className = "", style }: { title?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || action) && <div className="card-head"><h2>{title}</h2>{action}</div>}
      {children}
    </section>
  );
}

// The round "…" button; a native <details> menu, so it needs no positioning library.
export function More({ label, items }: { label: string; items: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  return (
    <details className="more">
      <summary aria-label={label}>···</summary>
      <div className="menu" role="menu">
        {items.map((it) => (
          <button key={it.label} role="menuitem" disabled={it.disabled} onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; it.onClick(); }}>{it.label}</button>
        ))}
      </div>
    </details>
  );
}

export const Tag = ({ label, value }: { label: string; value: ReactNode }) => <span className="tag">{label}<b>{value}</b></span>;

export const StatusChip = ({ status, lang = "ja" }: { status: Status; lang?: Lang }) => <span className={`chip ${status}`}>{STATUS[status][lang]}</span>;

// Hatched funnel: each stage is a column; hovering one shows conversion from the previous stage.
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const [on, setOn] = useState(Math.min(2, steps.length - 1));
  const max = Math.max(1, ...steps.map((s) => s.value));
  const cur = steps[on];
  const prev = steps[on - 1];
  return (
    <div className="funnel" style={{ "--n": steps.length } as React.CSSProperties}>
      {steps.map((s, i) => (
        <div key={s.label} className={`funnel-col ${i === on ? "on" : ""}`} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)} tabIndex={0}>
          <span className="label">{s.label}</span>
          <span className="value">{s.value.toLocaleString()}</span>
          <div className="funnel-bar" style={{ height: `${(s.value / max) * 68}%` }} />
          {i === on && (
            <div className="funnel-tip">
              <span className="tag"><b>{cur.value.toLocaleString()}</b> 件{prev && prev.value > 0 && <> | 通過率 <b>{Math.round((cur.value / prev.value) * 100)}%</b></>}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Dot matrix: one column per bucket; dot count scaled to the busiest bucket; the peak column is solid.
export function Dots({ values, color = "var(--green)", maxDots = 6, labels }: { values: number[]; color?: string; maxDots?: number; labels?: string[] }) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(max);
  return (
    <div className="dots" role="img" aria-label={labels ? labels.map((l, i) => `${l}: ${values[i]}`).join(", ") : undefined} style={{ "--c": color } as React.CSSProperties}>
      {values.map((v, i) => (
        <div key={i} className={`dots-col ${i === peak && v > 0 ? "peak" : ""}`} title={labels ? `${labels[i]}: ${v}` : String(v)}>
          {Array.from({ length: Math.max(1, Math.round((v / max) * maxDots)) }, (_, k) => <span key={k} className="dot" />)}
        </div>
      ))}
    </div>
  );
}

// Step chart with vertical hairline fill, as in the reference "Retention" card.
export function Steps({ values, labels, color = "var(--rose)", height = 180 }: { values: number[]; labels: string[]; color?: string; height?: number }) {
  const w = 400;
  const max = Math.max(1, ...values);
  const step = w / Math.max(1, values.length);
  const y = (v: number) => height - (v / max) * (height - 20);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${y(v)} H${(i + 1) * step}`).join(" ");
  const peak = values.indexOf(max);
  const id = `hatch-${color.replace(/[^a-z]/gi, "")}`;
  return (
    <div className="steps stack" style={{ "--gap": "8px" } as React.CSSProperties}>
      <svg viewBox={`0 -24 ${w} ${height + 24}`} role="img" aria-label={labels.map((l, i) => `${l}: ${values[i]}`).join(", ")}>
        <defs>
          <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse"><rect width="1.2" height="5" fill={color} opacity="0.22" /></pattern>
          <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity="0.9" /></linearGradient>
        </defs>
        <path d={`${path} V${height} H0 Z`} fill={`url(#${id})`} />
        <rect x="0" y="0" width={w} height={height} fill={`url(#${id}-fade)`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        <line x1="0" x2={w} y1={height} y2={height} stroke="currentColor" opacity="0.15" />
        {values[peak] > 0 && <circle cx={peak * step + 2} cy={y(values[peak])} r="4" fill={color} />}
      </svg>
      <div className="row between tiny muted">{labels.filter((_, i) => i % Math.ceil(labels.length / 6) === 0).map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  );
}

export const Meter = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div style={{ width: `${Math.max(4, (value / Math.max(1, max)) * 100)}%` }}><div className="meter" style={{ "--c": color } as React.CSSProperties} /></div>
);
