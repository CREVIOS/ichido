"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { FIRST_SHIFT, ACCOUNT_PUSH } from "@/content/catalogue";

// Notifications on this browser for this session (web/lib/alerts.ts). Hidden when the server has no VAPID keys.
// The subscription is tied to the session on the server, so signing out or being signed out ends it there too.
const b64url = (s: string) => {
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const toB64url = (b: ArrayBuffer | null) => (b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");

export function PushPanel() {
  const [key, setKey] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    if (!supported) return;
    void cmd<{ key: string | null; endpoint: string | null }>("push_key").then(async (r) => {
      setKey(r.key);
      const reg = await navigator.serviceWorker.getRegistration("/");
      setOn(Boolean(r.endpoint && (await reg?.pushManager.getSubscription())?.endpoint === r.endpoint) && Notification.permission === "granted");
    }).catch(() => setKey(null));
  }, [supported]);

  if (!key) return <Panel title={ACCOUNT_PUSH.title}><p>{FIRST_SHIFT.pushUnavailable}</p></Panel>;

  const enable = async () => {
    if (await Notification.requestPermission() !== "granted") return void toast.error(ACCOUNT_PUSH.denied);
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const old = await reg.pushManager.getSubscription();
    // A subscription made with another key cannot be reused.
    if (old && toB64url(old.options.applicationServerKey) !== key) await old.unsubscribe();
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(key) });
    await cmd("push_subscribe", { platform: "web", endpoint: sub.endpoint, p256dh: toB64url(sub.getKey("p256dh")), auth: toB64url(sub.getKey("auth")) });
    setOn(true);
    toast.success(ACCOUNT_PUSH.enabled);
  };
  const disable = async () => {
    await cmd("push_unsubscribe", { platform: "web" });
    await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription().then((s) => s?.unsubscribe());
    setOn(false);
    toast.success(ACCOUNT_PUSH.disabled);
  };
  const run = (f: () => Promise<void>) => () => { setBusy(true); f().catch(() => toast.error(ACCOUNT_PUSH.failed)).finally(() => setBusy(false)); };

  return (
    <Panel title={ACCOUNT_PUSH.title}>
      <p className="text-[13px] text-muted-foreground">{ACCOUNT_PUSH.lead}</p>
      {on
        ? <Button variant="outline" className="self-start" disabled={busy} onClick={run(disable)}><BellOff className="stroke-[1.5]" />{ACCOUNT_PUSH.off}</Button>
        : <Button className="self-start" disabled={busy} onClick={run(enable)}><Bell className="stroke-[1.5]" />{ACCOUNT_PUSH.on}</Button>}
    </Panel>
  );
}
