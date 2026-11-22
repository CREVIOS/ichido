"use client";
import { useEffect, useState, type ReactNode } from "react";
import { sb, cmd } from "@/lib/supabase";
import type { NavItem } from "@/components/ui";
import { STAFF } from "@/content/catalogue";

export type Role = "operator" | "field" | "manager";
export type Me = { uid: string; role: Role; name: string };

const NAV: Record<Role, NavItem[]> = {
  operator: [{ href: "/operator", label: "監視センター" }, { href: "/insights", label: "インサイト" }],
  manager: [{ href: "/insights", label: "インサイト" }],
  field: [{ href: "/field", label: "割当" }],
};
export const navFor = (role: Role) => NAV[role];

export async function signOut() {
  await sb().auth.signOut();
  location.reload();
}

// Signs a staff member in, checks their role against the page, then renders the page.
export function StaffGate({ allow, hint, title, children }: { allow: Role[]; hint: string; title: string; children: (me: Me) => ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [email, setEmail] = useState(hint);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function resolve(): Promise<Me | null> {
    const { data } = await sb().auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return null;
    const r = await cmd<{ role: string; name?: string }>("me").catch(() => null);
    return r && (r.role === "operator" || r.role === "field" || r.role === "manager") ? { uid: user.id, role: r.role, name: r.name ?? "" } : null;
  }
  useEffect(() => { resolve().then(setMe); }, []);

  if (me === undefined) return null;
  if (me && allow.includes(me.role)) return <>{children(me)}</>;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);
    setMe(await resolve());
  }

  return (
    <main className="phone" style={{ justifyContent: "center" }}>
      <div className="row"><span className="brand-mark" aria-hidden>一</span><span className="brand">ichido</span></div>
      <h1>{title}</h1>
      {me && <p className="notice">{STAFF.noAccess(me.role)}</p>}
      <form className="card" onSubmit={signIn}>
        <label className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
          <span className="field-label">{STAFF.email}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
          <span className="field-label">{STAFF.password}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="notice">{error}</p>}
        <button className="btn dark block">{STAFF.signIn}</button>
        {me && <button type="button" className="btn ghost" onClick={signOut}>{STAFF.otherAccount}</button>}
      </form>
      <p className="tiny muted">{STAFF.demo}</p>
    </main>
  );
}
