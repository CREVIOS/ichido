#!/usr/bin/env node
// Create or update staff accounts in a Supabase project from a JSON file (see staff.example.json).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_… node scripts/create-staff.mjs staff.json [--reset]
//
// New accounts get a generated password, printed once. Existing accounts keep theirs unless --reset is given.
// Role and display name are always brought in line with the file. Keep the JSON file out of git.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const ROLES = new Set(["operator", "field", "manager"]);
const [file, ...flags] = process.argv.slice(2);
const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
if (!file || !url || !key) {
  console.error("usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/create-staff.mjs staff.json [--reset]");
  process.exit(2);
}
const reset = flags.includes("--reset");

const people = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(people)) throw new Error("expected a JSON array");
for (const p of people) {
  if (typeof p.email !== "string" || !p.email.includes("@")) throw new Error(`bad email: ${JSON.stringify(p.email)}`);
  if (!ROLES.has(p.role)) throw new Error(`${p.email}: role must be operator, field or manager`);
  if (typeof p.name !== "string" || !p.name.trim()) throw new Error(`${p.email}: name is required`);
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function existingUsers() {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const { users } = await api("GET", `/auth/v1/admin/users?page=${page}&per_page=1000`);
    for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (users.length < 1000) return byEmail;
  }
}

const users = await existingUsers();
const issued = [];
for (const p of people) {
  const email = p.email.trim().toLowerCase();
  const password = randomBytes(18).toString("base64url");
  let uid = users.get(email);
  if (!uid) {
    uid = (await api("POST", "/auth/v1/admin/users", { email, password, email_confirm: true })).id;
    issued.push([email, password, "created"]);
  } else if (reset) {
    await api("PUT", `/auth/v1/admin/users/${uid}`, { password });
    issued.push([email, password, "reset"]);
  }
  await api("POST", "/rest/v1/staff?on_conflict=uid", { uid, role: p.role, display_name: p.name.trim() }, {
    "content-profile": "ichido", prefer: "resolution=merge-duplicates,return=minimal",
  });
  console.log(`ok  ${p.role.padEnd(8)} ${email}`);
}

if (issued.length) {
  console.log("\nPasswords (shown once; hand each to its owner over a private channel):");
  for (const [email, password, how] of issued) console.log(`  ${email}  ${password}  (${how})`);
}
