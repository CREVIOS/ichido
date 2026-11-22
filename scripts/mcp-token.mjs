// Prints a short-lived access token for a staff account, for MCP clients (Authorization: Bearer <token>).
// Usage: node --env-file=web/.env.local scripts/mcp-token.mjs <email>   (password read from ICHIDO_PASSWORD or stdin)
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { authOrigin } from "./auth-origin.mjs";

const [email] = process.argv.slice(2);
if (!email) { console.error("usage: node --env-file=web/.env.local scripts/mcp-token.mjs <email>"); process.exit(2); }
const url = authOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
async function readPassword() {
  if (process.stdin.isTTY) process.stderr.write("Password: ");
  const hidden = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: hidden, terminal: Boolean(process.stdin.isTTY) });
  try {
    return await input.question("");
  } finally {
    input.close();
    if (process.stdin.isTTY) process.stderr.write("\n");
  }
}
const password = process.env.ICHIDO_PASSWORD ?? await readPassword();
const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST", redirect: "error", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
});
if (!res.ok) { console.error(`sign-in failed (HTTP ${res.status})`); process.exit(1); }
const body = await res.json();
console.error(`token valid for ${Math.round(body.expires_in / 60)} minutes`);
console.log(body.access_token);
