"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Chip, MoreMenu, Notice, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { can, ROLES, type Role } from "@/lib/rbac";
import { ADMIN, FIRST_SHIFT, SHIFT, STAFF } from "@/content/catalogue";

// Account administration (admins) and the account audit log (admins and auditors). Every change goes through
// /api/admin, which checks lib/rbac.ts and writes the append-only audit log.
export default function AdminPage() {
  return <StaffGate need="audit:read" title={ADMIN.title}>{(me) => <Admin me={me} />}</StaffGate>;
}

type Site = { id: string; kind: string; label: string };
type User = { delivery: string | null; notifications: boolean; duty_station: string | null; available: boolean; id: string; email: string; name: string; role: Role; banned: boolean; verified: boolean; totp: boolean; passkeys: number; active_at: string | null };
type AuditRow = { id: number; at: string; action: string; data: { from?: string; to?: string; role?: string }; actor_name: string | null; target_name: string | null };

async function api<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "server");
  return json as T;
}
const when = (t: string | null) => (t ? new Date(t).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" }) : ADMIN.never);
const role = (r: string | undefined) => (r ? STAFF.roleName[r] ?? r : "");
const field = "h-10 rounded-lg bg-secondary/60 px-3 text-[14px] shadow-none";

function RoleSelect({ value, onChange, disabled, label }: { value: Role; onChange: (r: Role) => void; disabled?: boolean; label: string }) {
  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v as Role); }} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-[132px] text-[13px]"><SelectValue>{(v: string) => role(v)}</SelectValue></SelectTrigger>
      <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{role(r)}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function Admin({ me }: { me: Me }) {
  const manage = can(me.role, "user:list");
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [invite, setInvite] = useState<{ name: string; email: string; role: Role }>({ name: "", email: "", role: "operator" });

  const load = useCallback(() => Promise.all([manage ? api<{ users: User[]; sites: Site[] }>("users") : null, api<{ audit: AuditRow[] }>("audit")])
    .then(([u, a]) => { setUsers(u?.users ?? null); setSites(u?.sites ?? []); setAudit(a.audit); setFailed(false); })
    .catch(() => setFailed(true)), [manage]);
  useEffect(() => { void load(); const timer = setInterval(load,15000); return () => clearInterval(timer); }, [load]);

  async function run(action: string, body: Record<string, unknown>, ok = ADMIN.saved, question?: string) {
    if (question && !window.confirm(question)) return false;
    try {
      await api(action, body);
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(ADMIN.errors[(e as Error).message] ?? ADMIN.loadError);
      return false;
    } finally {
      await load();
    }
  }

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} title={ADMIN.title}>
      <div className="flex flex-col gap-10 px-4 py-6 lg:px-6">
        {failed && <div role="alert"><Notice tone="warn">{ADMIN.loadError}</Notice></div>}
        {manage && (
          <Panel title={ADMIN.inviteTitle}>
            <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (await run("invite", invite, ADMIN.invited)) setInvite({ name: "", email: "", role: invite.role });
            }}>
              <Input aria-label={ADMIN.name} placeholder={ADMIN.name} value={invite.name} maxLength={60} required onChange={(e) => setInvite({ ...invite, name: e.target.value })} className={`${field} w-[180px]`} />
              <Input aria-label={ADMIN.email} placeholder={ADMIN.email} type="email" value={invite.email} required onChange={(e) => setInvite({ ...invite, email: e.target.value })} className={`${field} w-[260px]`} />
              <RoleSelect label={ADMIN.role} value={invite.role} onChange={(r) => setInvite({ ...invite, role: r })} />
              <Button type="submit"><UserPlus className="stroke-[1.5]" />{ADMIN.send}</Button>
            </form>
            <p className="text-[12px] text-muted-foreground">{ADMIN.inviteLead}</p>
          </Panel>
        )}

        {manage && (
          <Panel title={ADMIN.users}>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="border-b text-muted-foreground">
                  <tr>{[ADMIN.head.name, ADMIN.head.role, ADMIN.head.mfa, ADMIN.head.status, ADMIN.head.active, ADMIN.head.actions].map((h, i) => <th key={i} scope="col" className="px-4 py-2.5 font-normal">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {(users ?? []).map((u) => {
                    const self = u.id === me.uid;
                    const state = u.banned ? "disabled" : u.verified ? "active" : "invited";
                    return (
                      <tr key={u.id}>
                        <td className="px-4 py-2.5"><span className="flex flex-col leading-tight"><span className="text-[14px] text-foreground">{u.name}</span><span className="text-muted-foreground">{u.email}</span></span></td>
                        <td className="px-4 py-2.5"><RoleSelect label={`${ADMIN.role}: ${u.name}`} value={u.role} disabled={self} onChange={(r) => void run("set_role", { userId: u.id, role: r })} /></td>
                        <td className="px-4 py-2.5">{ADMIN.mfa(u.totp, u.passkeys)}</td>
                        <td className="px-4 py-2.5"><Chip>{u.banned ? ADMIN.status.disabled : u.verified ? (u.totp || u.passkeys ? FIRST_SHIFT.ready : FIRST_SHIFT.verified) : u.delivery === "invite_failed" ? FIRST_SHIFT.failed : u.delivery === "invite_sent" ? FIRST_SHIFT.sent : ADMIN.status.invited}</Chip>
                          <div>{u.notifications ? FIRST_SHIFT.pushOn : FIRST_SHIFT.pushOff}</div>
                          {u.role === "field" && <div className="flex gap-2">
                            <select aria-label={SHIFT.duty} value={u.duty_station ?? ""} onChange={(e) => void run("set_duty",{ userId:u.id,station:e.target.value,available:u.available })}>
                              <option value="" disabled>{SHIFT.duty}</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.label ?? s.id} · {s.kind}</option>)}
                            </select><Button size="sm" disabled={!u.duty_station} onClick={() => void run("set_duty",{userId:u.id,station:u.duty_station,available:!u.available})}>{u.available ? SHIFT.off : SHIFT.available}</Button>
                          </div>}</td>
                        <td className="num px-4 py-2.5 text-muted-foreground">{when(u.active_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {self ? <span className="text-[12px] text-muted-foreground">{ADMIN.self}</span> : (
                            <MoreMenu label={u.name} items={[
                              ...(state === "invited" ? [{ label: ADMIN.actions.resend, onClick: () => void run("resend_invite", { userId: u.id }, ADMIN.invited) }] : []),
                              { label: ADMIN.actions.revoke, onClick: () => void run("revoke_sessions", { userId: u.id }, ADMIN.saved, ADMIN.confirm.revoke) },
                              { label: ADMIN.actions.resetMfa, danger: true, onClick: () => void run("reset_mfa", { userId: u.id }, ADMIN.saved, ADMIN.confirm.resetMfa) },
                              u.banned
                                ? { label: ADMIN.actions.enable, onClick: () => void run("enable", { userId: u.id }) }
                                : { label: ADMIN.actions.disable, danger: true, onClick: () => void run("disable", { userId: u.id }, ADMIN.saved, ADMIN.confirm.disable) },
                            ]} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <Panel title={ADMIN.audit}>
          <p className="text-[13px] text-muted-foreground">{ADMIN.auditLead}</p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-left text-[13px]" aria-label={ADMIN.audit}>
              <thead className="border-b text-muted-foreground">
                <tr>{[ADMIN.auditHead.at, ADMIN.auditHead.actor, ADMIN.auditHead.action, ADMIN.auditHead.target].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {(audit ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="num px-4 py-2.5 text-muted-foreground">{when(r.at)}</td>
                    <td className="px-4 py-2.5">{r.actor_name ?? ADMIN.never}</td>
                    <td className="px-4 py-2.5">
                      {ADMIN.auditAction[r.action] ?? r.action}
                      {r.data.from && <span className="ml-2 text-muted-foreground">{ADMIN.roleChange(role(r.data.from), role(r.data.to))}</span>}
                      {r.data.role && <span className="ml-2 text-muted-foreground">{role(r.data.role)}</span>}
                    </td>
                    <td className="px-4 py-2.5">{r.target_name ?? ADMIN.never}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audit?.length === 0 && <p role="status" className="py-10 text-center text-[14px] text-muted-foreground">{ADMIN.auditEmpty}</p>}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
