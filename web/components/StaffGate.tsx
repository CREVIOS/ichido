"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bot, ChartNoAxesColumn, Fingerprint, GraduationCap, KeyRound, LogOut, MapPin, RadioTower, Router, Rows3, ScanText, ShieldCheck, Smartphone } from "lucide-react";
import { cmd, enterStaffSession, leaveStaffSession } from "@/lib/supabase";
import { authClient } from "@/lib/auth-client";
import { can, isRole, type Permission, type Role } from "@/lib/rbac";
import { CountBadge, Notice, useSidebar, type NavItem } from "@/components/kit";
import { useReviewQueue } from "@/lib/review";
import { Mark } from "@/components/mark";
import { StaffRole } from "@/components/assistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ART, FIRST_SHIFT, AUTH, STAFF, NAV, REVIEW, authError } from "@/content/catalogue";

export type { Role };
export type Me = { uid: string; role: Role; name: string };

// Staff navigation, in one order; each person sees the entries their role may use (lib/rbac.ts).
const NAV_ITEMS: (NavItem & { need: Permission })[] = [
  { href: "/operator", label: NAV.operator, icon: RadioTower, need: "case:act" },
  { href: "/review", label: REVIEW.nav, icon: ScanText, Badge: ReviewBadge, need: "case:act" },
  { href: "/cases", label: NAV.cases, icon: Rows3, need: "case:read" },
  { href: "/stations", label: NAV.stations, icon: Router, need: "stations:read" },
  { href: "/insights", label: NAV.insights, icon: ChartNoAxesColumn, need: "insights:read" },
  { href: "/automation", label: NAV.automation, icon: Bot, need: "case:act" },
  { href: "/training", label: NAV.training, icon: GraduationCap, need: "training:use" },
  { href: "/field", label: NAV.field, icon: MapPin, need: "field:act" },
  { href: "/admin", label: NAV.admin, icon: ShieldCheck, need: "audit:read" },
];
// Unreviewed items for the signed-in operator, live on every operator page.
function ReviewBadge() {
  return <CountBadge n={useReviewQueue().items?.length} />;
}

export const navFor = (role: Role, counts: Partial<Record<string, number>> = {}) =>
  NAV_ITEMS.filter((n) => can(role, n.need)).map(({ href, label, icon, Badge }) => ({ href, label, icon, Badge, count: counts[href] }));

export async function signOut() {
  await authClient.signOut().catch(() => undefined);
  leaveStaffSession();
  location.reload();
}

// Who is signed in, at the bottom of the sidebar; the name opens their account page.
export function MeFooter({ me }: { me: Me }) {
  const { collapsed } = useSidebar();
  const avatar = <span aria-hidden title={me.name} className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[12px] text-foreground">{me.name.slice(0, 1)}</span>;
  const out = <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label={STAFF.signOut} title={STAFF.signOut} data-close><LogOut className="stroke-[1.5]" /></Button>;
  if (collapsed) return <div className="flex flex-col items-center gap-2 border-t pt-3"><Link href="/account" aria-label={STAFF.account}>{avatar}</Link>{out}</div>;
  return (
    <div className="flex items-center gap-2.5 border-t px-2 pt-3">
      <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md" data-close>
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] text-foreground">{me.name}</span>
          <span className="text-[12px] text-muted-foreground">{STAFF.roleName[me.role]}</span>
        </span>
      </Link>
      {out}
    </div>
  );
}

// Where the person stands: signed out, signed in with a password only (must enrol or confirm a second factor), or in.
type Status = { at: "out" } | { at: "aal1"; passkeys: number; totp: boolean } | { at: "in"; me: Me };

async function resolve(): Promise<Status> {
  const { data } = await authClient.getSession();
  if (!data) return { at: "out" };
  if (data.session.aal !== "aal2") {
    const { data: keys } = await authClient.passkey.listUserPasskeys();
    return { at: "aal1", passkeys: keys?.length ?? 0, totp: Boolean((data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) };
  }
  enterStaffSession();
  const r = await cmd<{ role: string; name?: string }>("me").catch(() => null);
  return r && isRole(r.role) ? { at: "in", me: { uid: data.user.id, role: r.role, name: r.name ?? "" } } : { at: "out" };
}

const field = "h-11 rounded-lg bg-secondary/60 px-3.5 text-[15px] shadow-none";
type ApiError = { code?: string; status?: number } | null | undefined;

// One step's busy flag and error message; a step returns a Better Auth error to show, or nothing.
function useStep() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = (step: () => Promise<ApiError | void>) => async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(""); setBusy(true);
    try {
      const err = await step();
      if (err) setError(authError(err.code, err.status));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run, clear: () => setError("") };
}

const Submit = ({ busy, label }: { busy: boolean; label: string }) =>
  <Button type="submit" size="lg" className="h-11 rounded-lg text-[14px]" disabled={busy}>{busy ? AUTH.working : label}</Button>;

function CodeInput({ label, numeric, value, onChange }: { label: string; numeric: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <Input aria-label={label} placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} required autoFocus
      inputMode={numeric ? "numeric" : "text"} autoComplete="one-time-code" maxLength={numeric ? 6 : 11} pattern={numeric ? "[0-9]{6}" : undefined}
      className={cn(field, "font-mono tracking-[0.2em]")} />
  );
}

async function passkeySignIn(): Promise<ApiError> {
  const { error } = await authClient.signIn.passkey();
  return error ? { code: "PASSKEY", status: error.status } : null;
}

// Signs a staff member in (password, then a second factor; or a passkey), enrols a second factor on first sign-in,
// checks their role may open the page (any staff role without `need`), then renders it. The pine-screen art stays beside every step.
export function StaffGate({ need, title, children }: { need?: Permission; title: string; children: (me: Me) => ReactNode }) {
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const refresh = useCallback(() => resolve().then(setStatus), []);
  useEffect(() => { void refresh(); }, [refresh]);

  if (status === undefined) return null;
  if (status.at === "in" && (!need || can(status.me.role, need))) return <StaffRole.Provider value={status.me.role}>{children(status.me)}</StaffRole.Provider>;
  if (status.at === "in") {
    return (
      <SignInLayout heading={title} error="">
        <div className="flex flex-col gap-3">
          <Notice tone="warn">{STAFF.noAccess(STAFF.roleName[status.me.role] ?? status.me.role)}</Notice>
          <Button type="button" variant="ghost" onClick={signOut}>{STAFF.otherAccount}</Button>
        </div>
      </SignInLayout>
    );
  }
  if (status.at === "aal1") return <SecondFactor passkeys={status.passkeys} totp={status.totp} done={refresh} />;
  return <SignIn title={title} done={refresh} />;
}

type SignInView = "signin" | "forgot" | "sent" | "totp" | "backup" | "otp";

function SignIn({ title, done }: { title: string; done: () => Promise<void> }) {
  const [view, setView] = useState<SignInView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const { error, busy, run, clear } = useStep();
  const go = (v: SignInView) => { clear(); setCode(""); setView(v); };

  // Passkeys offered in the email field's autofill (conditional UI) where the browser supports it.
  useEffect(() => {
    if (view !== "signin" || typeof PublicKeyCredential === "undefined" || !PublicKeyCredential.isConditionalMediationAvailable) return;
    void PublicKeyCredential.isConditionalMediationAvailable().then(async (ok) => { if (ok && !(await authClient.signIn.passkey({ autoFill: true })).error) await done(); });
  }, [view, done]);

  const signIn = run(async () => {
    const { data, error } = await authClient.signIn.email({ email: email.trim(), password });
    if (error) return error;
    setPassword("");
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setMethods((data as { twoFactorMethods?: string[] }).twoFactorMethods ?? ["totp"]);
      return go("totp");
    }
    await done();
  });
  const passkey = run(async () => (await passkeySignIn()) ?? done());
  const verify = run(async () => {
    const c = code.trim();
    const { error } = view === "backup" ? await authClient.twoFactor.verifyBackupCode({ code: c })
      : view === "otp" ? await authClient.twoFactor.verifyOtp({ code: c })
      : await authClient.twoFactor.verifyTotp({ code: c });
    return error ?? done();
  });
  const emailCode = run(async () => (await authClient.twoFactor.sendOtp()).error ?? go("otp"));
  // The same answer whether or not the address is staff.
  const forgot = run(async () => {
    const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/staff/password" });
    return error?.status === 429 ? error : go("sent");
  });

  const back = <Button type="button" variant="ghost" onClick={() => go("signin")}>{AUTH.back}</Button>;
  const emailInput = <Input aria-label={STAFF.email} placeholder={STAFF.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username webauthn" required className={field} />;
  let body: ReactNode;
  if (view === "signin") {
    body = (
      <form className="flex flex-col gap-7" onSubmit={signIn}>
        <div className="flex flex-col gap-3">
          {emailInput}
          <Input aria-label={STAFF.password} placeholder={STAFF.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password webauthn" required className={field} />
        </div>
        <div className="flex flex-col gap-2">
          <Submit busy={busy} label={STAFF.signIn} />
          <div className="flex items-center gap-3 py-1 text-[12px] text-muted-foreground" aria-hidden><span className="h-px flex-1 bg-border" />{AUTH.or}<span className="h-px flex-1 bg-border" /></div>
          <Button type="button" variant="outline" size="lg" className="h-11 rounded-lg text-[14px]" onClick={() => passkey()} disabled={busy}><Fingerprint className="stroke-[1.5]" />{AUTH.passkey}</Button>
          <Button type="button" variant="link" className="self-start px-0 text-[13px] text-muted-foreground" onClick={() => go("forgot")}>{AUTH.forgot}</Button>
        </div>
      </form>
    );
  } else if (view === "forgot") {
    body = (
      <form className="flex flex-col gap-5" onSubmit={forgot}>
        <p className="text-[14px] text-muted-foreground">{AUTH.forgotFlow.lead}</p>
        {emailInput}
        <div className="flex flex-col gap-2"><Submit busy={busy} label={AUTH.forgotFlow.send} />{back}</div>
      </form>
    );
  } else if (view === "sent") {
    body = <div className="flex flex-col gap-4"><Notice tone="info">{AUTH.forgotFlow.sent}</Notice>{back}</div>;
  } else {
    const lead = view === "backup" ? AUTH.twoFactor.backupLead : view === "otp" ? AUTH.twoFactor.emailLead : AUTH.twoFactor.lead;
    body = (
      <form className="flex flex-col gap-5" onSubmit={verify}>
        <p className="text-[14px] text-muted-foreground">{lead}</p>
        <CodeInput label={view === "backup" ? AUTH.twoFactor.backup : AUTH.twoFactor.code} numeric={view !== "backup"} value={code} onChange={setCode} />
        <div className="flex flex-col gap-2">
          <Submit busy={busy} label={AUTH.twoFactor.verify} />
          {view !== "totp" && methods.includes("totp") && <Button type="button" variant="ghost" onClick={() => go("totp")}>{AUTH.twoFactor.useTotp}</Button>}
          {view !== "backup" && <Button type="button" variant="ghost" onClick={() => go("backup")}>{AUTH.twoFactor.useBackup}</Button>}
          {view !== "otp" && methods.includes("otp") && <Button type="button" variant="ghost" onClick={() => emailCode()} disabled={busy}>{AUTH.twoFactor.email}</Button>}
          {back}
        </div>
      </form>
    );
  }
  const heading = view === "signin" ? title : view === "forgot" || view === "sent" ? AUTH.forgotFlow.title : AUTH.twoFactor.title;
  return <SignInLayout heading={heading} error={error}>{body}</SignInLayout>;
}

type Enrolment = { qr: string; secret: string; codes: string[] };

// Signed in with a password only. A person with a passkey but no authenticator confirms with it; anyone else
// registers an authenticator app (QR, then a code, then backup codes shown once) or a passkey. MFA is not optional.
function SecondFactor({ passkeys, totp, done }: { passkeys: number; totp: boolean; done: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const { error, busy, run } = useStep();
  const other = <Button type="button" variant="ghost" onClick={signOut}>{STAFF.otherAccount}</Button>;

  const passkey = run(async () => (await passkeySignIn()) ?? done());
  const startTotp = run(async () => {
    const { data, error } = await authClient.twoFactor.enable({ password });
    if (error || !data || !("totpURI" in data) || !data.totpURI) return error ?? {};
    setPassword("");
    const { toDataURL } = await import("qrcode");
    setEnrolment({ qr: await toDataURL(data.totpURI, { margin: 1, width: 192 }), secret: new URL(data.totpURI).searchParams.get("secret") ?? "", codes: data.backupCodes ?? [] });
  });
  const confirmTotp = run(async () => (await authClient.twoFactor.verifyTotp({ code: code.trim() })).error ?? setConfirmed(true));
  const addPasskey = run(async () => {
    const added = await authClient.passkey.addPasskey({ name: AUTH.enrol.passkeyName });
    if (added?.error) return { code: "PASSKEY", status: added.error.status };
    return (await passkeySignIn()) ?? done();   // the new passkey signs in again, this time as aal2
  });

  if (passkeys > 0 && !totp) {
    return (
      <SignInLayout heading={AUTH.stepUp.title} error={error}>
        <div className="flex flex-col gap-5">
          <p className="text-[14px] text-muted-foreground">{AUTH.stepUp.lead}</p>
          <Button size="lg" className="h-11 rounded-lg text-[14px]" onClick={() => passkey()} disabled={busy}><Fingerprint className="stroke-[1.5]" />{AUTH.passkey}</Button>
          {other}
        </div>
      </SignInLayout>
    );
  }
  if (enrolment && confirmed) {
    return (
      <SignInLayout heading={AUTH.enrol.backupTitle} error="">
        <div className="flex flex-col gap-5">
          <p className="text-[14px] text-muted-foreground">{AUTH.enrol.backupLead}</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl border p-4 font-mono text-[14px]" aria-label={AUTH.enrol.backupTitle} data-testid="backup-codes">
            {enrolment.codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(enrolment.codes.join("\n"))}>{AUTH.enrol.copy}</Button>
          <Button size="lg" className="h-11 rounded-lg text-[14px]" onClick={() => { setEnrolment(null); void done(); }}>{AUTH.enrol.saved}</Button>
        </div>
      </SignInLayout>
    );
  }
  if (enrolment) {
    return (
      <SignInLayout heading={AUTH.enrol.title} error={error}>
        <form className="flex flex-col gap-5" onSubmit={confirmTotp}>
          <p className="text-[14px] text-muted-foreground">{AUTH.enrol.scan}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn in the browser; the secret never leaves it */}
          <img src={enrolment.qr} alt={AUTH.enrol.qrAlt} width={192} height={192} className="self-start rounded-lg border" />
          <p className="text-[12px] text-muted-foreground">{AUTH.enrol.manual}<br /><code className="mono break-all text-foreground" data-testid="totp-secret">{enrolment.secret}</code></p>
          <CodeInput label={AUTH.twoFactor.code} numeric value={code} onChange={setCode} />
          <Submit busy={busy} label={AUTH.twoFactor.verify} />
        </form>
      </SignInLayout>
    );
  }
  return (
    <SignInLayout heading={AUTH.enrol.title} error={error}>
      <form className="flex flex-col gap-5" onSubmit={startTotp}>
        <p className="text-[14px] text-muted-foreground">{AUTH.enrol.lead}</p>
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <span className="flex flex-wrap items-center gap-2 text-[14px]"><Smartphone className="size-4 stroke-[1.5]" />{AUTH.enrol.totp}<span className="text-[12px] text-muted-foreground">{AUTH.enrol.totpHint}</span></span>
          <Input aria-label={STAFF.password} placeholder={AUTH.enrol.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={field} />
          <Submit busy={busy} label={AUTH.enrol.next} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Button type="button" variant="outline" size="lg" className="h-11 rounded-lg text-[14px]" onClick={() => addPasskey()} disabled={busy}><KeyRound className="stroke-[1.5]" />{AUTH.enrol.passkey}</Button>
          <span className="text-[12px] text-muted-foreground">{AUTH.enrol.passkeyHint} {FIRST_SHIFT.native}</span>
        </div>
        {other}
      </form>
    </SignInLayout>
  );
}

// The split sign-in screen: the pine-screen art, then the mark, the step's title and its fields.
export function SignInLayout({ heading, error, children }: { heading: string; error: string; children: ReactNode }) {
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
        <div className="flex w-full max-w-[320px] flex-col gap-7">
          <div className="flex flex-col items-start gap-5">
            <Mark className="h-8 w-10 text-foreground" strokeWidth={1.3} />
            <h1 className="text-[32px] leading-none tracking-[-0.04em]">{heading}</h1>
          </div>
          {children}
          {error && <div role="alert"><Notice tone="warn">{error}</Notice></div>}
        </div>
      </div>
    </main>
  );
}
