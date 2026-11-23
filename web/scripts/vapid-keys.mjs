// Prints a new VAPID key pair for staff Web Push (web/lib/alerts.ts), as env lines for web/.env.local or the host.
// Usage: node scripts/vapid-keys.mjs [mailto:ops@your-bank.example]
// Keep the private key secret; changing the pair invalidates every browser subscription (staff turn notifications on again).
import { generateVAPIDKeys } from "web-push";

const subject = process.argv[2] ?? "mailto:ops@ichido.example";
if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("VAPID subject must be a mailto: or https: URL");
const { publicKey, privateKey } = generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nVAPID_SUBJECT=${subject}`);
