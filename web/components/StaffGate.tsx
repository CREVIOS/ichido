"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Bot, ChartNoAxesColumn, GraduationCap, LogOut, MapPin, RadioTower, Router, Rows3, ScanText } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { CountBadge, Notice, useSidebar, type NavItem } from "@/components/kit";
import { useReviewQueue } from "@/lib/review";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ART, STAFF, NAV, REVIEW } from "@/content/catalogue";

export type Role = "operator" | "field" | "manager";
export type Me = { uid: string; role: Role; name: string };

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  operator: [
    { href: "/operator", label: NAV.operator, icon: RadioTower },
    { href: "/review", label: REVIEW.nav, icon: ScanText, Badge: ReviewBadge },
    { href: "/cases", label: NAV.cases, icon: Rows3 },
    { href: "/stations", label: NAV.stations, icon: Router },
    { href: "/insights", label: NAV.insights, icon: ChartNoAxesColumn },
    { href: "/automation", label: NAV.automation, icon: Bot },
    { href: "/training", label: NAV.training, icon: GraduationCap },
  ],
  manager: [{ href: "/insights", label: NAV.insights, icon: ChartNoAxesColumn }, { href: "/stations", label: NAV.stations, icon: Router }],
  field: [{ href: "/field", label: NAV.field, icon: MapPin }],
};
// Unreviewed items for the signed-in operator, live on every operator page.
function ReviewBadge() {
  return <CountBadge n={useReviewQueue().items?.length} />;
}

export const navFor = (role: Role, counts: Partial<Record<string, number>> = {}) => NAV_BY_ROLE[role].map((n) => ({ ...n, count: counts[n.href] }));

export async function signOut() {
  await sb().auth.signOut();
  location.reload();
}

// Who is signed in, at the bottom of the sidebar.
export function MeFooter({ me }: { me: Me }) {
  const { collapsed } = useSidebar();
  const avatar = <span aria-hidden title={me.name} className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[12px] text-foreground">{me.name.slice(0, 1)}</span>;
  const out = <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label={STAFF.signOut} title={STAFF.signOut} data-close><LogOut className="stroke-[1.5]" /></Button>;
  if (collapsed) return <div className="flex flex-col items-center gap-2 border-t pt-3">{avatar}{out}</div>;
  return (
    <div className="flex items-center gap-2.5 border-t px-2 pt-3">
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] text-foreground">{me.name}</span>
        <span className="text-[12px] text-muted-foreground">{STAFF.roleName[me.role]}</span>
      </span>
      {out}
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
    <main className="grid min-h-dvh grid-rows-[auto_1fr] bg-white lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-1">
      <figure className="relative h-[38dvh] overflow-hidden lg:h-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed decorative asset, not content */}
        <img src="/art/pines-tall.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
        {/* Ink fading into the paper: downward on phones, rightward beside the form. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white lg:bg-gradient-to-r" />
        <figcaption className="absolute bottom-4 left-5 hidden text-[11px] text-black/45 lg:block">{ART.credit}</figcaption>
      </figure>
      <div className="grid justify-items-center px-6 pt-2 pb-10 lg:place-items-center lg:py-10">
        <form className="flex w-full max-w-[320px] flex-col gap-7" onSubmit={signIn}>
          <div className="flex flex-col items-start gap-5">
            <Mark className="h-8 w-10 text-foreground" strokeWidth={1.3} />
            <h1 className="text-[32px] leading-none tracking-[-0.04em]">{title}</h1>
          </div>
          {me && <Notice tone="warn">{STAFF.noAccess(STAFF.roleName[me.role] ?? me.role)}</Notice>}
          <div className="flex flex-col gap-3">
            <Input aria-label={STAFF.email} placeholder={STAFF.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className="h-11 rounded-lg bg-secondary/60 px-3.5 text-[15px] shadow-none" />
            <Input aria-label={STAFF.password} placeholder={STAFF.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="h-11 rounded-lg bg-secondary/60 px-3.5 text-[15px] shadow-none" />
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" className="h-11 rounded-lg text-[14px]" disabled={busy}>{STAFF.signIn}</Button>
            {me && <Button type="button" variant="ghost" onClick={signOut}>{STAFF.otherAccount}</Button>}
          </div>
        </form>
      </div>
    </main>
  );
}
