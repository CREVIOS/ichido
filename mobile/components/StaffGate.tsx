import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { router } from "expo-router";
import { sb, cmd, signOut } from "@/lib/supabase";
import { Image, View } from "react-native";
import { Button, Input, Mark, Notice, Screen, T } from "@/components/ui";
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
    <Screen back>
      {/* Tōhaku's pines in ink, fading into the page; then the mark, the title and two fields. */}
      <View style={{ height: 240, marginHorizontal: -16, marginTop: -8, overflow: "hidden" }}>
        <Image source={require("@/assets/images/signin-art.webp")} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
        <LinearGradient colors={["rgba(255,255,255,0)", "#F5F5F5"]} locations={[0.45, 1]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      </View>
      <View style={{ gap: 14 }}>
        <Mark size={30} />
        <T v="h1">{title}</T>
      </View>
      {me && <Notice tone="alert">{STAFF.noAccess(me.role)}</Notice>}
      <View style={{ gap: 10 }}>
        <Input placeholder={STAFF.email} accessibilityLabel={STAFF.email} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="username" />
        <Input placeholder={STAFF.password} accessibilityLabel={STAFF.password} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" onSubmitEditing={signIn} />
        {error ? <Notice tone="alert">{error}</Notice> : null}
        <Button label={STAFF.signIn} onPress={signIn} busy={busy} disabled={!email || !password} block />
        {me && <Button kind="ghost" label={STAFF.otherAccount} onPress={out} />}
      </View>
    </Screen>
  );
}
