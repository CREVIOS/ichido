import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Image, View } from "react-native";
import { cmd, enterStaffSession, signOut } from "@/lib/supabase";
import { authClient } from "@/lib/auth";
import { registerPush } from "@/lib/push";
import { can, isRole, type Permission, type Role } from "@rbac";
import { Button, Input, Mark, Notice, Screen, T } from "@/components/ui";
import { AUTH, STAFF, authError } from "@content/catalogue";

export type { Role };
export type Me = { uid: string; role: Role; name: string; push?: string; signOut: () => Promise<void> };
type Who = { push?: string; uid: string; role: Role; name: string };
type Status = { at: "out" } | { at: "aal1" } | { at: "in"; who: Who };
type ApiError = { code?: string; status?: number } | null | undefined;

async function resolve(): Promise<Status> {
  const { data } = await authClient.getSession();
  if (!data) return { at: "out" };
  if (data.session.aal !== "aal2") return { at: "aal1" };
  enterStaffSession();
  const r = await cmd<{ role: string; name?: string }>("me").catch(() => null);
  if (!r || !isRole(r.role)) return { at: "out" };
  const push = await registerPush(r.role);
  return { at: "in", who: { push, uid: data.user.id, role: r.role, name: r.name ?? "" } };
}

// Mirrors web/components/StaffGate.tsx: password, then the authenticator code (or a backup code); on first sign-in
// an authenticator app is registered here. Passkeys work on the web only (no native module in this app yet).
export function StaffGate({ need, title, children }: { need: Permission; title: string; children: (me: Me) => ReactNode }) {
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const [step, setStep] = useState<"password" | "totp" | "backup">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrolment, setEnrolment] = useState<{ uri: string; secret: string; codes: string[]; confirmed: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => resolve().then((s) => { setStatus(s); setStep("password"); setCode(""); }), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const out = useCallback(async () => { await signOut(); setEnrolment(null); await refresh(); }, [refresh]);

  if (status === undefined) return null;
  if (status.at === "in" && can(status.who.role, need)) return <>{children({ ...status.who, signOut: () => signOut().then(() => router.replace("/")) })}</>;

  const run = (fn: () => Promise<ApiError | void>) => async () => {
    setBusy(true); setError("");
    try {
      const err = await fn();
      if (err) setError(authError(err.code, err.status));
    } finally {
      setBusy(false);
    }
  };
  const signIn = run(async () => {
    const { data, error } = await authClient.signIn.email({ email: email.trim(), password });
    if (error) return error;
    setPassword("");
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) { setCode(""); setStep("totp"); return; }
    await refresh();
  });
  const verify = run(async () => {
    const { error } = step === "backup" ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() }) : await authClient.twoFactor.verifyTotp({ code: code.trim() });
    return error ?? refresh();
  });
  const enrol = run(async () => {
    const { data, error } = await authClient.twoFactor.enable({ password });
    if (error || !data || !("totpURI" in data) || !data.totpURI) return error ?? {};
    setPassword(""); setCode("");
    setEnrolment({ uri: data.totpURI, secret: new URL(data.totpURI).searchParams.get("secret") ?? "", codes: data.backupCodes ?? [], confirmed: false });
  });
  const confirm = run(async () => {
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    if (error) return error;
    setEnrolment((e) => e && { ...e, confirmed: true });
  });

  const heading = status.at === "aal1" ? (enrolment?.confirmed ? AUTH.enrol.backupTitle : AUTH.enrol.title) : step === "password" ? title : AUTH.twoFactor.title;
  const codeField = (label: string) => (
    <Input placeholder={label} accessibilityLabel={label} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} mono
      keyboardType={step === "backup" ? "default" : "number-pad"} textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={step === "backup" ? 11 : 6} />
  );

  let body: ReactNode;
  if (status.at === "in") {
    body = (
      <>
        <Notice tone="alert">{STAFF.noAccess(STAFF.roleName[status.who.role] ?? status.who.role)}</Notice>
        <Button kind="ghost" label={STAFF.otherAccount} onPress={out} />
      </>
    );
  } else if (status.at === "aal1" && enrolment?.confirmed) {
    body = (
      <>
        <T v="body">{AUTH.enrol.backupLead}</T>
        <View style={{ gap: 4 }}>{enrolment.codes.map((c) => <T key={c} v="body" mono>{c}</T>)}</View>
        <Button label={AUTH.enrol.saved} onPress={() => { setEnrolment(null); void refresh(); }} block />
      </>
    );
  } else if (status.at === "aal1" && enrolment) {
    body = (
      <>
        <Button kind="secondary" label={AUTH.app.openAuthenticator} onPress={() => void Linking.openURL(enrolment.uri)} block />
        <T v="small">{AUTH.app.secret}</T>
        <T v="body" mono selectable>{enrolment.secret}</T>
        {codeField(AUTH.twoFactor.code)}
        <Button label={AUTH.twoFactor.verify} onPress={confirm} busy={busy} disabled={code.length !== 6} block />
      </>
    );
  } else if (status.at === "aal1") {
    body = (
      <>
        <T v="body">{AUTH.enrol.lead}</T>
        <Notice tone="info">{AUTH.app.passkeyOnWeb}</Notice>
        <Input placeholder={AUTH.enrol.password} accessibilityLabel={STAFF.password} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" />
        <Button label={AUTH.enrol.totp} onPress={enrol} busy={busy} disabled={!password} block />
        <Button kind="ghost" label={STAFF.otherAccount} onPress={out} />
      </>
    );
  } else if (step !== "password") {
    body = (
      <>
        <T v="body">{step === "backup" ? AUTH.twoFactor.backupLead : AUTH.twoFactor.lead}</T>
        {codeField(step === "backup" ? AUTH.twoFactor.backup : AUTH.twoFactor.code)}
        <Button label={AUTH.twoFactor.verify} onPress={verify} busy={busy} disabled={!code.trim()} block />
        <Button kind="ghost" label={step === "backup" ? AUTH.twoFactor.useTotp : AUTH.twoFactor.useBackup} onPress={() => { setCode(""); setStep(step === "backup" ? "totp" : "backup"); }} />
        <Button kind="ghost" label={AUTH.back} onPress={() => { setError(""); setStep("password"); }} />
      </>
    );
  } else {
    body = (
      <>
        <Input placeholder={STAFF.email} accessibilityLabel={STAFF.email} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="username" />
        <Input placeholder={STAFF.password} accessibilityLabel={STAFF.password} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" onSubmitEditing={signIn} />
        <Button label={STAFF.signIn} onPress={signIn} busy={busy} disabled={!email || !password} block />
      </>
    );
  }

  return (
    <Screen back>
      {/* Tōhaku's pines in ink, fading into the page; then the mark, the title and the step's fields. */}
      <View style={{ height: 240, marginHorizontal: -16, marginTop: -8, overflow: "hidden" }}>
        <Image source={require("@/assets/images/signin-art.webp")} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
        <LinearGradient colors={["rgba(255,255,255,0)", "#F5F5F5"]} locations={[0.45, 1]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      </View>
      <View style={{ gap: 14 }}>
        <Mark size={30} />
        <T v="h1">{heading}</T>
      </View>
      <View style={{ gap: 10 }}>
        {body}
        {error ? <Notice tone="alert">{error}</Notice> : null}
      </View>
    </Screen>
  );
}
