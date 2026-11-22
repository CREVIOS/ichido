#!/usr/bin/env node
// Create or update staff accounts (Better Auth, schema auth_ba) from a JSON file (see staff.example.json): for the
// first admin of a deployment, or a batch. Day to day an admin invites people from /admin instead.
//
//   DATABASE_URL=postgresql://… BETTER_AUTH_URL=https://<app> node scripts/create-staff.mjs staff.json [--reset]
//
// New accounts (and, with --reset, existing ones) get a one-time set-password link, valid 72 hours, saved in a
// private file for handoff to the account owner: the link proves their email, then they set a password and register
// a second factor at first sign-in. Role and display name are always brought in line with the file.
// Keep the JSON file out of git.
import { createRequire } from "node:module";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { authOrigin } from "./auth-origin.mjs";

const { Pool } = createRequire(new URL("../web/package.json", import.meta.url))("pg");
const ROLES = new Set(["operator", "field", "manager", "admin", "auditor"]);
const LINK_TTL_S = 72 * 3600;
const [file, ...flags] = process.argv.slice(2);
if (!file || !process.env.DATABASE_URL || !process.env.BETTER_AUTH_URL) {
  console.error("usage: DATABASE_URL=… BETTER_AUTH_URL=… node scripts/create-staff.mjs staff.json [--reset]");
  process.exit(2);
}
const reset = flags.includes("--reset");
const app = authOrigin(process.env.BETTER_AUTH_URL);

const people = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(people)) throw new Error("expected a JSON array");
for (const p of people) {
  if (typeof p.email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(p.email)) throw new Error("invalid staff email");
  if (!ROLES.has(p.role)) throw new Error("invalid staff role");
  if (typeof p.name !== "string" || !p.name.trim() || p.name.trim().length > 60) throw new Error("staff name is required (60 characters at most)");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let handoff;
try {
  for (const p of people) {
    const email = p.email.trim().toLowerCase();
    const { rows: [u] } = await pool.query(
      `insert into auth_ba."user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
       values (gen_random_uuid(), $2, $1, false, $3, now(), now())
       on conflict (email) do update set name = excluded.name, role = excluded.role, "updatedAt" = now()
       returning id, (xmax = 0) as created`, [email, p.name.trim(), p.role]);
    if (!u.created && !reset) continue;
    const token = randomBytes(24).toString("base64url");
    await pool.query(`insert into auth_ba.verification (identifier, value, "expiresAt") values ($1, $2, now() + make_interval(secs => $3))`,
      [`reset-password:${token}`, u.id, LINK_TTL_S]);
    await pool.query("insert into ichido.staff_audit (actor, action, target, data) values (null, $1, $2, $3)",
      [u.created ? "user_invited" : "invite_resent", u.id, { role: p.role, via: "create-staff" }]);
    if (!handoff) {
      handoff = join(mkdtempSync(join(tmpdir(), "ichido-staff-")), "links.jsonl");
      console.error("Private set-password link handoff file:", handoff);
    }
    const link = `${app}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("/staff/password?invite=1")}`;
    appendFileSync(handoff, JSON.stringify({ email, link }) + "\n", { mode: 0o600 });
  }
} finally {
  await pool.end();
}
console.log("Staff records updated:", people.length);
