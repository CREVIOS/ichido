import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { fail, priv } from "@/lib/server";
import { rpc } from "@/lib/access";

// Hand-off links: a read-only record of one case for the bank, the police or the security company.
export const RECIPIENTS = ["bank", "police", "security"] as const;
export type Recipient = (typeof RECIPIENTS)[number];
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createHandoff(incident: string, recipient: string, by: { uid: string }) {
  if (!(RECIPIENTS as readonly string[]).includes(recipient)) fail(400, "bad_request");
  const token = randomBytes(24).toString("base64url");
  const [link] = await rpc<{ id: string; expires_at: string }[]>("create_handoff", {
    p_uid: by.uid, p_incident: incident, p_hash: hash(token), p_recipient: recipient,
  });
  return { id: link.id, expires_at: link.expires_at, path: `/h/${token}` };
}

export async function listHandoffs(incident: string) {
  const { data, error } = await priv().from("handoff").select("id, recipient, created_at, expires_at, revoked_at, views")
    .eq("incident", incident).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function revokeHandoff(id: string, by: { uid: string }) {
  await rpc("revoke_handoff", { p_uid: by.uid, p_id: id });
}

// Resolve a token for the public page; counts the view and writes it to the timeline. Null when unknown, expired or revoked.
export async function openHandoff(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const [link] = await rpc<{ incident: string; recipient: Recipient; expires_at: string }[]>("view_handoff", { p_hash: hash(token) });
  return link ?? null;
}
