// Prints a short-lived access token for a staff account, for MCP clients (Authorization: Bearer <token>).
// Usage: node --env-file=web/.env.local scripts/mcp-token.mjs <email>   (password read from ICHIDO_PASSWORD or stdin)
import { createInterface } from "node:readline/promises";

const [email] = process.argv.slice(2);
if (!email) { console.error("usage: node --env-file=web/.env.local scripts/mcp-token.mjs <email>"); process.exit(2); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.ICHIDO_PASSWORD ?? (await createInterface({ input: process.stdin, output: process.stderr }).question("password: "));
const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
});
const body = await res.json();
if (!res.ok) { console.error(`sign-in failed: ${body.error_description ?? body.msg ?? res.status}`); process.exit(1); }
console.error(`token for ${email}, valid ${Math.round(body.expires_in / 60)} minutes`);
console.log(body.access_token);
