#!/usr/bin/env node
// LOCAL ONLY. Seeds the demo staff accounts for the local stack and the test suite: Better Auth users with verified
// emails, a known password and a known authenticator secret, so tests and people can sign in with a computed TOTP code.
// Existing accounts keep their uid and name (cases, replies and guard jobs point at them).
//
//   node --env-file=web/.env.local scripts/seed-staff.mjs
//
// Refuses any DATABASE_URL that is not on this machine. Production accounts come from an admin's invite (/admin)
// or, for the first admin, scripts/create-staff.mjs.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const web = createRequire(new URL("../web/package.json", import.meta.url));
const { Pool } = web("pg");
const { hashPassword, symmetricEncrypt } = await import(pathToFileURL(web.resolve("better-auth/crypto")).href);

export const PASSWORD = "ichido-demo-local";
// The authenticator secret is these bytes (UTF-8), as Better Auth stores it; web/tests/helpers.mjs computes codes from it.
export const totpSecret = (email) => `local-totp-${email}`;
export const ACCOUNTS = [
  ["operator@ichido.demo", "operator", "伊藤"],
  ["operator2@ichido.demo", "operator", "佐藤"],
  ["guard1@ichido.demo", "field", "山口"],
  ["guard2@ichido.demo", "field", "中村"],
  ["manager@ichido.demo", "manager", "管理者"],
  ["admin@ichido.demo", "admin", "高橋"],
  ["auditor@ichido.demo", "auditor", "松本"],
];

async function seed() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("seed-staff is for the local stack only (DATABASE_URL must be on localhost)");
  const key = process.env.BETTER_AUTH_SECRET;
  if (!key) throw new Error("BETTER_AUTH_SECRET is not set");
  const pool = new Pool({ connectionString: url.href });
  const db = await pool.connect();
  try {
    await db.query("begin");
    for (const [email, role, name] of ACCOUNTS) {
      const { rows: [u] } = await db.query(
        `insert into auth_ba."user" (id, name, email, "emailVerified", role, "twoFactorEnabled", banned, "createdAt", "updatedAt")
         values (gen_random_uuid(), $2, $1, true, $3, true, false, now(), now())
         on conflict (email) do update set role = excluded.role, "emailVerified" = true, "twoFactorEnabled" = true, banned = false,
           "banReason" = null, "banExpires" = null, "updatedAt" = now()
         returning id`, [email, name, role]);
      await db.query(`delete from auth_ba.account where "userId" = $1 and "providerId" = 'credential'`, [u.id]);
      await db.query(`insert into auth_ba.account ("accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1::text, 'credential', $1::uuid, $2, now(), now())`,
        [u.id, await hashPassword(PASSWORD)]);
      const codes = Array.from({ length: 10 }, () => randomBytes(5).toString("hex").replace(/^(.{5})/, "$1-"));
      await db.query(`delete from auth_ba."twoFactor" where "userId" = $1`, [u.id]);
      await db.query(`insert into auth_ba."twoFactor" (secret, "backupCodes", "userId", verified) values ($1, $2, $3, true)`,
        [await symmetricEncrypt({ key, data: totpSecret(email) }), await symmetricEncrypt({ key, data: JSON.stringify(codes) }), u.id]);
      if (role === "field") await db.query("update ichido.staff set duty_station='TABLE-A', duty_function='atm' where uid=$1 and duty_station is null", [u.id]);
      console.log(`ok  ${role.padEnd(8)} ${email}`);
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
    await pool.end();
  }
  console.log(`\nLocal password for every account: ${PASSWORD}. Authenticator secret: "local-totp-<email>" (see README).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await seed();
