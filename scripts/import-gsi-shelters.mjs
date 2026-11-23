#!/usr/bin/env node
// LOCAL ONLY. Loads GSI designated evacuation sites (指定緊急避難場所) for 長崎県 into public.shelter_site.
//
//   node scripts/import-gsi-shelters.mjs --download          # fetch every 長崎県 municipality's CSV into scripts/.data/gsi/
//   node --env-file=web/.env.local scripts/import-gsi-shelters.mjs              # load scripts/.data/gsi/42*_2.csv
//   node scripts/import-gsi-shelters.mjs --seed              # write the small demo subset to supabase/seed-shelters.sql
//
// Source: 国土地理院「指定緊急避難場所・指定避難所データ」https://www.gsi.go.jp/bousaichiri/hinanbasho.html (CSV per
// municipality from https://hinanmap.gsi.go.jp/). Use is under the 国土地理院コンテンツ利用規約
// (https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html, compatible with CC BY 4.0; credit 国土地理院) and the
// dataset's notes (https://www.gsi.go.jp/bousaichiri/hinanbasho-menseki.html): data may be out of date, so confirm with
// the municipality; emergency sites (指定緊急避難場所) differ from shelters (指定避難所) and are designated per hazard;
// pass these notes on to anyone shown the data. Ichido shows sites as "designated", never as open, with the credit.
// scripts/.data/ is gitignored; only the demo subset is committed.
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "scripts/.data/gsi");
const BASE = "https://hinanmap.gsi.go.jp/hinanjocp/defaultFtpData";
const PREF = "42";   // 長崎県
// GSI's hazard columns, in CSV order, and our codes for them (public.shelter_site.hazards).
const HAZARDS = [["洪水", "flood"], ["崖崩れ、土石流及び地滑り", "landslide"], ["高潮", "storm_surge"], ["地震", "earthquake"],
  ["津波", "tsunami"], ["大規模な火事", "fire"], ["内水氾濫", "inland_flood"], ["火山現象", "volcano"]];
// Demo subset: sites within this distance of the demo stations' centre (TABLE-A, Nagasaki Station).
const DEMO = { lat: 32.7522, lng: 129.8702, km: 2 };

async function fetchText(url) {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

// RFC 4180 CSV (quoted fields may hold commas, quotes and newlines).
function csv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function sites(file, date) {
  const [head, ...rows] = csv(readFileSync(file, "utf8").replace(/^﻿/, ""));
  const col = (name) => { const i = head.indexOf(name); if (i < 0) throw new Error(`${file}: no column ${name}`); return i; };
  const [id, name, address, lat, lng, same] = ["共通ID", "施設・場所名", "住所", "緯度", "経度", "指定避難所との住所同一"].map(col);
  const hz = HAZARDS.map(([ja, code]) => [col(ja), code]);
  return rows.map((r) => ({
    id: r[id], name: r[name].trim(), address: r[address].trim() || null, lat: Number(r[lat]), lng: Number(r[lng]),
    municipality: r[address].match(/^長崎県(.+?[市町村])/)?.[1] ?? null,
    hazards: hz.filter(([i]) => r[i] === "1").map(([, code]) => code),
    designated_shelter: r[same] === "1", source: "国土地理院 指定緊急避難場所データ", source_date: date,
  })).filter((s) => /^[\w-]{1,64}$/.test(s.id) && s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

function load() {
  const dates = JSON.parse(readFileSync(path.join(dir, "dates.json"), "utf8"));
  return readdirSync(dir).filter((f) => new RegExp(`^${PREF}\\d{3}_2\\.csv$`).test(f))
    .flatMap((f) => sites(path.join(dir, f), dates[f.slice(0, 5)] ?? null));
}

const metres = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};
const sql = (v) => (v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v)
  : Array.isArray(v) ? `array[${v.map(sql).join(", ")}]::text[]` : `'${String(v).replaceAll("'", "''")}'`);
const COLUMNS = ["id", "name", "address", "municipality", "lat", "lng", "hazards", "designated_shelter", "source", "source_date"];

const arg = process.argv[2];
if (arg === "--download") {
  console.log("GSI data: by downloading you accept the 国土地理院コンテンツ利用規約 and the notes at https://www.gsi.go.jp/bousaichiri/hinanbasho-menseki.html");
  mkdirSync(dir, { recursive: true });
  // publicHistoryListData.csv: municipality code, name, first published, last updated, …
  const list = csv(await fetchText(`${BASE}/publicHistoryCSV/publicHistoryListData.csv`)).filter((r) => new RegExp(`^${PREF}\\d{3}$`).test(r[0]) && r[3]);
  const dates = {};
  for (const [code, name, , updated] of list) {
    const text = await fetchText(`${BASE}/csv/${code}_2.csv`).catch((e) => { console.warn(`skip ${name}: ${e.message}`); return null; });
    if (!text) continue;
    writeFileSync(path.join(dir, `${code}_2.csv`), text);
    dates[code] = updated;
    console.log(`ok  ${code} ${name} (${updated})`);
  }
  writeFileSync(path.join(dir, "dates.json"), JSON.stringify(dates, null, 2));
} else if (arg === "--seed") {
  const near = load().filter((s) => metres(DEMO, s) <= DEMO.km * 1000).sort((a, b) => a.id.localeCompare(b.id));
  const body = `-- GENERATED by scripts/import-gsi-shelters.mjs --seed: GSI designated evacuation sites within ${DEMO.km} km of the demo
-- stations, for the local demo. Source: 国土地理院「指定緊急避難場所データ」(https://www.gsi.go.jp/bousaichiri/hinanbasho.html),
-- used under the 国土地理院コンテンツ利用規約 (CC BY 4.0 compatible). Designated sites, not necessarily open; may be out of
-- date: confirm with the municipality. The full prefecture loads with: node --env-file=web/.env.local scripts/import-gsi-shelters.mjs
insert into public.shelter_site (${COLUMNS.join(", ")}) values
${near.map((s) => `  (${COLUMNS.map((c) => sql(s[c])).join(", ")})`).join(",\n")}
on conflict (id) do nothing;
`;
  writeFileSync(path.join(root, "supabase/seed-shelters.sql"), body);
  console.log(`wrote supabase/seed-shelters.sql (${near.length} sites)`);
} else {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("import-gsi-shelters is for the local stack only (DATABASE_URL must be on localhost)");
  const { Pool } = createRequire(path.join(root, "web/package.json"))("pg");
  const pool = new Pool({ connectionString: url.href });
  const all = load();
  const db = await pool.connect();
  try {
    await db.query("begin");
    for (const s of all) {
      await db.query(`insert into public.shelter_site (${COLUMNS.join(", ")}) values (${COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})
        on conflict (id) do update set ${COLUMNS.slice(1).map((c) => `${c} = excluded.${c}`).join(", ")}`, COLUMNS.map((c) => s[c]));
    }
    await db.query("commit");
    console.log(`loaded ${all.length} designated evacuation sites`);
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
    await pool.end();
  }
}
