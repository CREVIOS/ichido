#!/usr/bin/env node
// Create or update staff accounts in a Supabase project from a JSON file (see staff.example.json).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_… node scripts/create-staff.mjs staff.json [--reset]
//
// Generated credentials are saved in a private file for handoff to the account owner.
// Role and display name are always brought in line with the file. Keep the JSON file out of git.
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { authOrigin } from "./auth-origin.mjs";

const ROLES = new Set(["operator", "field", "manager"]);
const [file, ...flags] = process.argv.slice(2);
const endpoint = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!file || !endpoint || !key) {
  console.error("usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/create-staff.mjs staff.json [--reset]");
  process.exit(2);
}
const reset = flags.includes("--reset");
const url = authOrigin(endpoint);

const people = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(people)) throw new Error("expected a JSON array");
for (const p of people) {
  if (typeof p.email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(p.email)) throw new Error("invalid staff email");
  if (!ROLES.has(p.role)) throw new Error("invalid staff role");
  if (typeof p.name !== "string" || !p.name.trim()) throw new Error("staff name is required");
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${url}${path}`, {
    method, redirect: "error",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`staff administration failed (HTTP ${res.status})`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function existingUsers() {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const { users } = await api("GET", `/auth/v1/admin/users?page=${page}&per_page=1000`);
    for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u);
    if (users.length < 1000) return byEmail;
  }
}

const users = await existingUsers();
let credentials;
for (const p of people) {
  const email = p.email.trim().toLowerCase();
  const password = randomBytes(18).toString("base64url");
  const existing = users.get(email);
  let uid = existing?.id;
  if (existing && (!existing.email_confirmed_at || existing.is_anonymous)) throw new Error("existing account requires verified email");
  if (!uid || reset) {
    if (!credentials) {
      credentials = join(mkdtempSync(join(tmpdir(), "ichido-staff-")), "credentials.jsonl");
      console.error("Private credential handoff file:", credentials);
    }
    appendFileSync(credentials, JSON.stringify({ email, password }) + "\n", { mode: 0o600 });
  }
  if (!uid) {
    uid = (await api("POST", "/auth/v1/admin/users", { email, password, email_confirm: true })).id;
  } else if (reset) {
    await api("PUT", `/auth/v1/admin/users/${uid}`, { password });
  }
  await api("POST", "/rest/v1/staff?on_conflict=uid", { uid, role: p.role, display_name: p.name.trim() }, {
    "content-profile": "ichido", prefer: "resolution=merge-duplicates,return=minimal",
  });
}
console.log("Staff records updated:", people.length);
