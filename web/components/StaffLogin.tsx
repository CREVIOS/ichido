"use client";
import { useEffect, useState, type ReactNode } from "react";
import { sb } from "@/lib/supabase";

// Signs a staff member in with email and password, then renders children with their user id.
export function StaffGate({ title, hint, children }: { title: string; hint: string; children: (uid: string) => ReactNode }) {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState(hint);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    sb().auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUid(u && !u.is_anonymous ? u.id : null);
    });
  }, []);

  if (uid === undefined) return null;
  if (uid) return <>{children(uid)}</>;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else setUid(data.user.id);
  }

  return (
    <main className="phone">
      <h1>{title}</h1>
      <form className="stack" onSubmit={signIn}>
        <label className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
          <span className="label">メール</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
          <span className="label">パスワード</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="chip alert">{error}</p>}
        <button className="btn primary big">サインイン</button>
      </form>
      <p className="small muted">デモ環境・架空のデータ</p>
    </main>
  );
}

export async function signOut() {
  await sb().auth.signOut();
  location.reload();
}
