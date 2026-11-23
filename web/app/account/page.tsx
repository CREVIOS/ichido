"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { KeyRound, Laptop, Plus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Notice, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIRST_SHIFT, ACCOUNT, AUTH, STAFF, authError } from "@/content/catalogue";
import { PushPanel } from "./push";

// The signed-in person's own account: where they are signed in, their passkeys, password and backup codes.
export default function AccountPage() {
  return <StaffGate title={ACCOUNT.title}>{(me) => <Account me={me} />}</StaffGate>;
}

type Session = { id: string; token: string; userAgent?: string | null; updatedAt: Date | string };
type Passkey = { id: string; name?: string | null; createdAt?: Date | string | null };
const when = (t: Date | string | null | undefined) => (t ? new Date(t).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" }) : "");
const device = (ua?: string | null) => {
  if (!ua) return ACCOUNT.unknownDevice;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /Expo|okhttp|CFNetwork/.test(ua) ? ACCOUNT.app : "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ") || ACCOUNT.unknownDevice;
};
const field = "h-10 rounded-lg bg-secondary/60 px-3 text-[14px] shadow-none";

function Account({ me }: { me: Me }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState("");
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [totp, setTotp] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [codePassword, setCodePassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const load = useCallback(() => Promise.all([authClient.getSession(), authClient.listSessions(), authClient.passkey.listUserPasskeys()])
    .then(([s, list, keys]) => {
      setCurrent(s.data?.session.token ?? "");
      setTotp(Boolean((s.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled));
      setSessions((list.data ?? []) as Session[]);
      setPasskeys((keys.data ?? []) as Passkey[]);
    }), []);
  useEffect(() => { void load(); }, [load]);

  const act = async (p: Promise<{ error: { code?: string; status?: number } | null }>, ok = ACCOUNT.done) => {
    const { error } = await p;
    if (error) toast.error(authError(error.code, error.status)); else toast.success(ok);
    await load();
    return !error;
  };

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} title={ACCOUNT.title}>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-4 py-6 lg:px-6">
        <div className="flex gap-4"><Link href={FIRST_SHIFT.desk[me.role]}>{FIRST_SHIFT.open}</Link>
          {me.role === "operator" && <Link href="/training">{FIRST_SHIFT.training}</Link>}</div>
        <Panel title={ACCOUNT.sessions} action={<Button variant="ghost" size="sm" onClick={() => act(authClient.revokeOtherSessions())}>{ACCOUNT.revokeOthers}</Button>}>
          <p className="text-[13px] text-muted-foreground">{ACCOUNT.sessionsLead}</p>
          <ul className="flex flex-col divide-y rounded-xl border" aria-label={ACCOUNT.sessions}>
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Laptop className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-[14px]">{device(s.userAgent)}{s.token === current && <span className="ml-2 text-[12px] text-muted-foreground">{ACCOUNT.current}</span>}</span>
                  <span className="text-[12px] text-muted-foreground">{ACCOUNT.since(when(s.updatedAt))}</span>
                </span>
                {s.token !== current && <Button variant="ghost" size="sm" onClick={() => act(authClient.revokeSession({ token: s.token }))}>{ACCOUNT.revoke}</Button>}
              </li>
            ))}
          </ul>
        </Panel>

        {["operator","manager","field"].includes(me.role) && <PushPanel />}

        <Panel title={ACCOUNT.passkeys} action={<Button variant="ghost" size="sm" onClick={() => act(authClient.passkey.addPasskey({ name: AUTH.enrol.passkeyName }).then((r) => ({ error: r?.error ?? null })))}><Plus />{ACCOUNT.addPasskey}</Button>}>
          <p className="text-[13px] text-muted-foreground">{totp ? ACCOUNT.totpOn : ACCOUNT.totpOff}</p>
          {passkeys.length === 0 ? <Notice>{ACCOUNT.passkeysEmpty}</Notice> : (
            <ul className="flex flex-col divide-y rounded-xl border" aria-label={ACCOUNT.passkeys}>
              {passkeys.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                  <KeyRound className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-[14px]">{k.name || AUTH.enrol.passkeyName}</span>
                    <span className="text-[12px] text-muted-foreground">{ACCOUNT.added(when(k.createdAt))}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => act(authClient.passkey.deletePasskey({ id: k.id }))}>{ACCOUNT.removePasskey}</Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={ACCOUNT.password}>
          <form className="flex flex-col gap-3" onSubmit={async (e) => {
            e.preventDefault();
            if (await act(authClient.changePassword({ currentPassword: oldPassword, newPassword, revokeOtherSessions: true }), ACCOUNT.changed)) { setOldPassword(""); setNewPassword(""); }
          }}>
            <p className="text-[13px] text-muted-foreground">{ACCOUNT.passwordLead}</p>
            <Input aria-label={ACCOUNT.currentPassword} placeholder={ACCOUNT.currentPassword} type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className={field} />
            <Input aria-label={ACCOUNT.newPassword} placeholder={ACCOUNT.newPassword} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className={field} />
            <Button type="submit" className="self-start">{ACCOUNT.change}</Button>
          </form>
        </Panel>

        {totp && (
          <Panel title={ACCOUNT.backup}>
            <form className="flex flex-col gap-3" onSubmit={async (e) => {
              e.preventDefault();
              const { data, error } = await authClient.twoFactor.generateBackupCodes({ password: codePassword });
              setCodePassword("");
              if (error) return void toast.error(authError(error.code, error.status));
              setCodes(data?.backupCodes ?? []);
            }}>
              <p className="text-[13px] text-muted-foreground">{ACCOUNT.backupLead}</p>
              {codes ? (
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl border p-4 font-mono text-[14px] sm:grid-cols-5" aria-label={ACCOUNT.backup}>{codes.map((c) => <li key={c}>{c}</li>)}</ul>
              ) : (
                <>
                  <Input aria-label={STAFF.password} placeholder={STAFF.password} type="password" autoComplete="current-password" value={codePassword} onChange={(e) => setCodePassword(e.target.value)} required className={field} />
                  <Button type="submit" variant="outline" className="self-start">{ACCOUNT.regenerate}</Button>
                </>
              )}
            </form>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
