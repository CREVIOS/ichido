import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { admin, event, fail, priv } from "@/lib/server";

// Hand-off links: a read-only record of one case for the bank, the police or the security company.
export const RECIPIENTS = ["bank", "police", "security"] as const;
export type Recipient = (typeof RECIPIENTS)[number];
const TTL_MS = 24 * 60 * 60_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createHandoff(incident: string, recipient: string, by: { uid: string; name: string }) {
  if (!(RECIPIENTS as readonly string[]).includes(recipient)) fail(400, "bad_request");
  const { data: d } = await admin.from("desk").select("id").eq("id", incident).maybeSingle();
  if (!d) fail(404, "not_found");
  const token = randomBytes(24).toString("base64url");
  const expires_at = new Date(Date.now() + TTL_MS).toISOString();
  const { data, error } = await priv().from("handoff")
    .insert({ incident, token_hash: hash(token), recipient, created_by: by.uid, expires_at }).select("id").single();
  if (error) throw error;
  await event(incident, "operator", "handoff", { recipient }, by.name);
  return { id: data.id, path: `/h/${token}`, expires_at };
}

export async function listHandoffs(incident: string) {
  const { data, error } = await priv().from("handoff").select("id, recipient, created_at, expires_at, revoked_at, views")
    .eq("incident", incident).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function revokeHandoff(id: string, by: { name: string }) {
  const { data } = await priv().from("handoff").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("incident, recipient").maybeSingle();
  if (!data) fail(409, "conflict");
  await event(data!.incident, "operator", "handoff_revoked", { recipient: data!.recipient }, by.name);
}

// Resolve a token for the public page; counts the view and writes it to the timeline. Null when unknown, expired or revoked.
export async function openHandoff(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data: h } = await priv().from("handoff").select("id, incident, recipient, expires_at, revoked_at, views").eq("token_hash", hash(token)).maybeSingle();
  if (!h || h.revoked_at || Date.parse(h.expires_at) < Date.now()) return null;
  await priv().from("handoff").update({ views: h.views + 1 }).eq("id", h.id);
  await event(h.incident, "system", "handoff_viewed", { recipient: h.recipient });
  return h;
}
