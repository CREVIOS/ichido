// Prints a short-lived token for a staff account, for MCP clients (Authorization: Bearer <token>).
// Signs in through the web app's Better Auth (password, then the authenticator code) and mints the same five-minute
// database token the console uses; the token stops working at once if the session is revoked.
// Usage: node --env-file=web/.env.local scripts/mcp-token.mjs <email>
//   password from ICHIDO_PASSWORD or the terminal; authenticator code from ICHIDO_TOTP or the terminal
//   app origin from ICHIDO_URL, else BETTER_AUTH_URL
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { authOrigin } from "./auth-origin.mjs";

const [email] = process.argv.slice(2);
if (!email) { console.error("usage: node --env-file=web/.env.local scripts/mcp-token.mjs <email>"); process.exit(2); }
const app = authOrigin(process.env.ICHIDO_URL ?? process.env.BETTER_AUTH_URL ?? "");

async function ask(prompt, hidden) {
  if (process.stdin.isTTY) process.stderr.write(prompt);
  const output = hidden ? new Writable({ write(_chunk, _encoding, done) { done(); } }) : process.stderr;
  const input = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  try {
    return (await input.question("")).trim();
  } finally {
    input.close();
    if (process.stdin.isTTY && hidden) process.stderr.write("\n");
  }
}

const cookies = new Map();
async function post(path, body = {}) {
  const res = await fetch(`${app}${path}`, {
    method: "POST", redirect: "error",
    headers: { origin: app, "content-type": "application/json", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
    body: JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie()) {
    const [k, v] = c.split(";")[0].split(/=(.*)/s);
    if (v) cookies.set(k, v); else cookies.delete(k);
  }
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const password = process.env.ICHIDO_PASSWORD ?? await ask("Password: ", true);
const signedIn = await post("/api/auth/sign-in/email", { email, password });
if (signedIn.status !== 200) { console.error(`sign-in failed (HTTP ${signedIn.status})`); process.exit(1); }
if (signedIn.body.twoFactorRedirect) {
  const code = process.env.ICHIDO_TOTP ?? await ask("Authenticator code: ", false);
  const verified = await post("/api/auth/two-factor/verify-totp", { code });
  if (verified.status !== 200) { console.error(`second factor refused (HTTP ${verified.status})`); process.exit(1); }
}
const minted = await post("/api/auth/supabase-token");
if (minted.status !== 200) { console.error(`no token (HTTP ${minted.status} ${minted.body.error ?? ""}): finish second-factor enrolment in the console first`); process.exit(1); }
console.error(`token valid for ${Math.round((minted.body.expires_at - Date.now() / 1000) / 60)} minutes`);
console.log(minted.body.token);
