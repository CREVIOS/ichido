// Wait until Realtime delivers a broadcast sent from the database (a freshly started local stack can take a while to
// begin its message replication). Local stack only: sends through `docker exec` on the Supabase Postgres container.
// usage: node --env-file=.env.local scripts/wait-realtime.mjs [db-container] [timeout-seconds]
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const [container = "supabase_db_ichido", seconds = "120"] = process.argv.slice(2);
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const topic = `ready-${Date.now()}`;
const send = () => execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-Atqc",
  `select realtime.send('{}'::jsonb, 'ready', '${topic}', false)`]);

const started = Date.now();
const ok = await new Promise((resolve) => {
  let poke;
  const timer = setTimeout(() => { clearInterval(poke); resolve(false); }, Number(seconds) * 1000);
  c.channel(topic).on("broadcast", { event: "ready" }, () => { clearTimeout(timer); clearInterval(poke); resolve(true); })
    .subscribe((status) => { if (status === "SUBSCRIBED") { send(); poke = setInterval(send, 2000); } });
});
console.log(ok ? `realtime ready after ${((Date.now() - started) / 1000).toFixed(1)} s` : `realtime not ready after ${seconds} s`);
process.exit(ok ? 0 : 1);
