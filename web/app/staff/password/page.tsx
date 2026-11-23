"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { SignInLayout } from "@/components/StaffGate";
import { Notice } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { AUTH, authError } from "@/content/catalogue";

// Where an invite or a password-reset email lands (via Better Auth's /api/auth/reset-password/<token>, which checks
// the token and adds it here). Setting the password also proves the email address.
export default function PasswordPage() {
  return <Suspense fallback={null}><SetPassword /></Suspense>;
}

function SetPassword() {
  const params = useSearchParams();
  const token = params.get("token");
  const invite = params.get("invite") === "1";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState(token && !params.get("error") ? "" : AUTH.password.invalid);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = "h-11 rounded-lg bg-secondary/60 px-3.5 text-[15px] shadow-none";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) return setError(AUTH.password.mismatch);
    setBusy(true); setError("");
    const { error } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
    setBusy(false);
    if (error) return setError(authError(error.code, error.status));
    setDone(true);
  }

  const heading = invite ? AUTH.password.inviteTitle : AUTH.password.title;
  if (done) {
    return (
      <SignInLayout heading={heading} error="">
        <div className="flex flex-col gap-4">
          <Notice tone="info">{invite ? AUTH.password.done : AUTH.password.resetDone}</Notice>
          <Link href={invite ? "/account/first-shift" : "/account"} className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-lg text-[14px]")}>{AUTH.password.toSignIn}</Link>
        </div>
      </SignInLayout>
    );
  }
  return (
    <SignInLayout heading={heading} error={error}>
      {token && !params.get("error") && (
        <form className="flex flex-col gap-5" onSubmit={save}>
          <p className="text-[14px] text-muted-foreground">{AUTH.password.lead}</p>
          <div className="flex flex-col gap-3">
            <Input aria-label={AUTH.password.new} placeholder={AUTH.password.new} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required className={field} />
            <Input aria-label={AUTH.password.confirm} placeholder={AUTH.password.confirm} type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required className={field} />
          </div>
          <Button type="submit" size="lg" className="h-11 rounded-lg text-[14px]" disabled={busy}>{busy ? AUTH.working : AUTH.password.save}</Button>
        </form>
      )}
    </SignInLayout>
  );
}
