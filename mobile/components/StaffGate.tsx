import { useCallback, useEffect, useState, type ReactNode } from "react";
import { router } from "expo-router";
import { sb, cmd, signOut } from "@/lib/supabase";
import { Brand, Button, Card, Input, Notice, Screen, T } from "@/components/ui";
import { STAFF } from "@content/catalogue";

export type Role = "operator" | "field" | "manager";
export type Me = { uid: string; role: Role; name: string; signOut: () => Promise<void> };
type Who = { uid: string; role: Role; name: string };

async function resolve(): Promise<Who | null> {
  const { data } = await sb().auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  const r = await cmd<{ role: string; name?: string }>("me").catch(() => null);
  return r && (r.role === "operator" || r.role === "field" || r.role === "manager") ? { uid: user.id, role: r.role, name: r.name ?? "" } : null;
}

// Mirrors web/components/StaffGate.tsx: signs a staff member in, checks the role against the screen, then renders it.
export function StaffGate({ allow, title, children }: { allow: Role[]; title: string; children: (me: Me) => ReactNode }) {
  const [me, setMe] = useState<Who | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { resolve().then(setMe); }, []);
  const out = useCallback(async () => { await signOut(); setMe(null); }, []);

  if (me === undefined) return null;
  if (me && allow.includes(me.role)) return <>{children({ ...me, signOut: () => signOut().then(() => router.replace("/")) })}</>;

  async function signIn() {
    setBusy(true); setError("");
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError(error.message); setBusy(false); return; }
    setMe(await resolve());
    setBusy(false);
  }

  return (
    <Screen back eyebrow={<Brand />} title={title}>
      <T v="row" tone="body">{STAFF.signInLead}</T>
      {me && <Notice tone="alert">{STAFF.noAccess(me.role)}</Notice>}
      <Card>
        <Input label={STAFF.email} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="username" />
        <Input label={STAFF.password} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" onSubmitEditing={signIn} />
        {error ? <Notice tone="alert">{error}</Notice> : null}
        <Button label={STAFF.signIn} onPress={signIn} busy={busy} disabled={!email || !password} block />
        {me && <Button kind="ghost" label={STAFF.otherAccount} onPress={out} />}
      </Card>
    </Screen>
  );
}
