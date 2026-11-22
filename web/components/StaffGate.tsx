"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ChartNoAxesColumn, LogOut, MapPin, RadioTower, Router } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { Logo, Notice, type NavItem } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAFF, NAV } from "@/content/catalogue";

export type Role = "operator" | "field" | "manager";
export type Me = { uid: string; role: Role; name: string };

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  operator: [{ href: "/operator", label: NAV.operator, icon: RadioTower }, { href: "/stations", label: NAV.stations, icon: Router }, { href: "/insights", label: NAV.insights, icon: ChartNoAxesColumn }],
  manager: [{ href: "/insights", label: NAV.insights, icon: ChartNoAxesColumn }],
  field: [{ href: "/field", label: NAV.field, icon: MapPin }],
};
export const navFor = (role: Role, counts: Partial<Record<string, number>> = {}) => NAV_BY_ROLE[role].map((n) => ({ ...n, count: counts[n.href] }));

export async function signOut() {
  await sb().auth.signOut();
  location.reload();
}

// Who is signed in, at the bottom of the sidebar.
export function MeFooter({ me }: { me: Me }) {
  return (
    <div className="flex items-center gap-2.5 border-t px-2 pt-3">
      <span aria-hidden className="grid size-7 place-items-center rounded-full bg-secondary text-[12px] text-foreground">{me.name.slice(0, 1)}</span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] text-foreground">{me.name}</span>
        <span className="text-[12px] text-muted-foreground">{STAFF.roleName[me.role]}</span>
      </span>
      <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label={STAFF.signOut} data-close><LogOut className="stroke-[1.5]" /></Button>
    </div>
  );
}

async function resolveMe(): Promise<Me | null> {
  const { data } = await sb().auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  const r = await cmd<{ role: string; name?: string }>("me").catch(() => null);
  return r && (r.role === "operator" || r.role === "field" || r.role === "manager") ? { uid: user.id, role: r.role, name: r.name ?? "" } : null;
}

// Signs a staff member in, checks their role against the page, then renders the page.
export function StaffGate({ allow, title, children }: { allow: Role[]; title: string; children: (me: Me) => ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { resolveMe().then(setMe); }, []);

  if (me === undefined) return null;
  if (me && allow.includes(me.role)) return <>{children(me)}</>;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    const { error } = await sb().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    setMe(await resolveMe());
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex w-full max-w-[360px] flex-col gap-6">
        <Logo />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight">{title}</h1>
          <p className="text-[14px]">{STAFF.signInLead}</p>
        </div>
        {me && <Notice tone="warn">{STAFF.noAccess(STAFF.roleName[me.role] ?? me.role)}</Notice>}
        <form className="flex flex-col gap-4" onSubmit={signIn}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{STAFF.email}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className="h-9 bg-card" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{STAFF.password}</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="h-9 bg-card" />
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          <Button type="submit" size="lg" disabled={busy}>{STAFF.signIn}</Button>
          {me && <Button type="button" variant="secondary" onClick={signOut}>{STAFF.otherAccount}</Button>}
        </form>
      </div>
    </main>
  );
}
