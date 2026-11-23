// Official alerts → normalised hazard alerts for Nagasaki. Pure (no I/O), so tests feed it recorded bulletins.
// Sources: JMA 防災情報XML (https://xml.kishou.go.jp/xmlpull.html) and the P2PQuake JSON API v2
// (https://github.com/p2pquake/epsp-specifications/blob/master/json-api-v2.yaml). Feed content is data: only the
// fields below are read, checked against fixed vocabularies, and nothing from a feed is ever shown or executed.
import { XMLParser } from "fast-xml-parser";

export type HazardKind = "earthquake" | "eew" | "tsunami" | "warning";
export type HazardAlert = {
  source: "jma" | "p2pquake"; source_id: string; kind: HazardKind;
  severity: string;            // shindo "4".."7"; tsunami "advisory" | "warning" | "major_warning"; warning "emergency"
  areas: string[];             // "<type>:<official name>", the format of public.station.jma_areas
  issued_at: string; expires_at: string;
};

const PREF = "長崎県";
const SHINDO = ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"] as const;
const PROPOSE_FROM = SHINDO.indexOf("4");   // shindo 4 or more in one of our areas proposes disaster mode
const rank = (s: unknown) => SHINDO.indexOf(String(s) as (typeof SHINDO)[number]);
const TTL_MIN: Record<HazardKind, number> = { eew: 30, earthquake: 180, tsunami: 360, warning: 360 };
// Which approved notice (content/access.ts DISASTER_NOTICES) an alert proposes.
export function noticeFor(a: Pick<HazardAlert, "kind" | "severity">): string {
  if (a.kind === "tsunami") return a.severity === "advisory" ? "tsunami_advisory" : "tsunami_warning";
  return a.kind === "warning" ? "typhoon" : "earthquake";
}

const MAX_AREAS = 200;
const name = (v: unknown) => (typeof v === "string" ? v.normalize("NFKC").trim() : "").slice(0, 60);
const list = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const expiry = (issued: string, kind: HazardKind) => new Date(Date.parse(issued) + TTL_MIN[kind] * 60_000).toISOString();
function alert(source: HazardAlert["source"], id: string, kind: HazardKind, severity: string, areas: Set<string>, issued: string): HazardAlert | null {
  if (!areas.size || !Number.isFinite(Date.parse(issued)) || !/^[\w.:-]{1,200}$/.test(id)) return null;
  const at = new Date(issued).toISOString();
  return { source, source_id: id, kind, severity, areas: [...areas].slice(0, MAX_AREAS), issued_at: at, expires_at: expiry(at, kind) };
}

// P2PQuake. Times are JST "YYYY/MM/DD HH:mm:ss"; scales are 10..70 (45 = 5-, 46 = 5- or more estimated, 50 = 5+ …).
const P2P_SCALE: Record<number, string> = { 10: "1", 20: "2", 30: "3", 40: "4", 45: "5-", 46: "5-", 50: "5+", 55: "6-", 60: "6+", 70: "7" };
const jst = (t: unknown) => (typeof t === "string" && /^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d/.test(t) ? `${t.slice(0, 19).replaceAll("/", "-").replace(" ", "T")}+09:00` : "");
// "長崎市元船町" → "長崎市", "西彼杵郡時津町浜田郷" → "時津町" (JMA city names drop the 郡).
const cityOf = (addr: string) => addr.match(/^(?:.+?郡)?(.+?[市町村])/)?.[1] ?? null;
const P2P_GRADE: Record<string, string> = { MajorWarning: "major_warning", Warning: "warning", Watch: "advisory" };
const GRADE_ORDER = ["advisory", "warning", "major_warning"];
// JMA 津波予報区 on Nagasaki's coasts (codes 712, 730, 731 in the JMA code table).
const NAGASAKI_TSUNAMI = new Set(["長崎県西方", "壱岐・対馬", "有明・八代海"]);

type P2P = {
  code?: number; id?: string; cancelled?: boolean; time?: string;
  issue?: { time?: string; type?: string };
  earthquake?: { time?: string };
  points?: { pref?: string; addr?: string; isArea?: boolean; scale?: number }[];
  areas?: { name?: string; grade?: string; pref?: string; scaleFrom?: number; scaleTo?: number }[];
};

export function fromP2P(items: unknown): HazardAlert[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw): HazardAlert[] => {
    const x = raw as P2P;
    if (!x || typeof x !== "object" || typeof x.id !== "string" || x.cancelled) return [];
    const issued = jst(x.issue?.time ?? x.time);
    const areas = new Set<string>();
    let top = -1;
    if (x.code === 551) {
      for (const p of list(x.points)) {
        const scale = rank(P2P_SCALE[p.scale ?? 0]);
        if (name(p.pref) !== PREF || scale < PROPOSE_FROM) continue;
        top = Math.max(top, scale);
        areas.add(`pref:${PREF}`);
        const addr = name(p.addr);
        if (p.isArea) areas.add(`eq:${addr}`);
        else if (cityOf(addr)) areas.add(`city:${cityOf(addr)}`);
      }
      const a = alert("p2pquake", x.id, "earthquake", SHINDO[top] ?? "", areas, issued);
      return a ? [a] : [];
    }
    if (x.code === 556) {
      for (const r of list(x.areas)) {
        const scale = rank(P2P_SCALE[r.scaleFrom ?? 0]);
        const n = name(r.name);
        if (!n.startsWith(PREF) || scale < PROPOSE_FROM) continue;
        top = Math.max(top, scale);
        areas.add(`pref:${PREF}`).add(`eq:${n}`);
      }
      const a = alert("p2pquake", x.id, "eew", SHINDO[top] ?? "", areas, issued);
      return a ? [a] : [];
    }
    if (x.code === 552) {
      for (const r of list(x.areas)) {
        const grade = P2P_GRADE[r.grade ?? ""];
        if (!grade || !NAGASAKI_TSUNAMI.has(name(r.name))) continue;
        top = Math.max(top, GRADE_ORDER.indexOf(grade));
        areas.add(`tsunami:${name(r.name)}`);
      }
      const a = alert("p2pquake", x.id, "tsunami", GRADE_ORDER[top] ?? "", areas, issued);
      return a ? [a] : [];
    }
    return [];
  });
}

// 警報等情報要素／津波警報・注意報・予報: 51 津波警報, 52/53 大津波警報, 62 津波注意報 (others: forecasts, lifted).
const JMA_TSUNAMI: Record<string, string> = { "51": "warning", "52": "major_warning", "53": "major_warning", "62": "advisory" };
// 気象警報・注意報 kind codes 32–38: the 特別警報 (emergency warnings).
const EMERGENCY = new Set(["32", "33", "35", "36", "37", "38"]);

// The bulletin types worth fetching, from the feed entry's URL (…_VXSE53_010000.xml). Warnings only from the
// Nagasaki Local Meteorological Office (420000).
export function wantedBulletin(url: string): boolean {
  return /_(VXSE51|VXSE53|VTSE41)_\d{6}\.xml$/.test(url) || /_VPWW54_420000\.xml$/.test(url);
}

const xml = new XMLParser({
  ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: false, removeNSPrefix: true,
});
type Node = Record<string, unknown>;
const at = (n: unknown, ...path: string[]): unknown => path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Node)[k] : undefined), n);
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

// Atom feed (eqvol.xml, extra.xml) → bulletin URLs to read, newest first, only from the JMA data host.
export function feedEntries(atom: string): string[] {
  const feed = at(xml.parse(atom), "feed");
  return list(at(feed, "entry") as Node | Node[]).map((e) => str(at(e, "id")))
    .filter((u) => u.startsWith("https://www.data.jma.go.jp/developer/xml/data/") && wantedBulletin(u));
}

// One JMA bulletin → an alert for our areas, or null (not Nagasaki, below threshold, cancelled, training or test).
export function fromJma(id: string, body: string): HazardAlert | null {
  const r = at(xml.parse(body), "Report") as Node | undefined;
  if (!r || str(at(r, "Control", "Status")) !== "通常" || str(at(r, "Head", "InfoType")) === "取消") return null;
  const issued = str(at(r, "Head", "ReportDateTime"));
  const title = str(at(r, "Control", "Title"));
  const areas = new Set<string>();
  if (title === "震度速報" || title === "震源・震度に関する情報") {
    let top = -1;
    for (const p of list(at(r, "Body", "Intensity", "Observation", "Pref") as Node | Node[])) {
      if (name(at(p, "Name")) !== PREF || rank(at(p, "MaxInt")) < PROPOSE_FROM) continue;
      top = Math.max(top, rank(at(p, "MaxInt")));
      areas.add(`pref:${PREF}`);
      for (const a of list(at(p, "Area") as Node | Node[])) {
        if (rank(at(a, "MaxInt")) < PROPOSE_FROM) continue;
        areas.add(`eq:${name(at(a, "Name"))}`);
        for (const c of list(at(a, "City") as Node | Node[])) if (rank(at(c, "MaxInt")) >= PROPOSE_FROM) areas.add(`city:${name(at(c, "Name"))}`);
      }
    }
    return alert("jma", id, "earthquake", SHINDO[top] ?? "", areas, issued);
  }
  if (title.startsWith("津波警報・注意報・予報")) {
    let top = -1;
    for (const item of list(at(r, "Body", "Tsunami", "Forecast", "Item") as Node | Node[])) {
      const area = name(at(item, "Area", "Name"));
      const grade = JMA_TSUNAMI[str(at(item, "Category", "Kind", "Code"))];
      if (!grade || !NAGASAKI_TSUNAMI.has(area)) continue;
      top = Math.max(top, GRADE_ORDER.indexOf(grade));
      areas.add(`tsunami:${area}`);
    }
    return alert("jma", id, "tsunami", GRADE_ORDER[top] ?? "", areas, issued);
  }
  if (title === "気象警報・注意報（Ｈ２７）" || title === "気象特別警報・警報・注意報") {
    for (const w of list(at(r, "Body", "Warning") as Node | Node[])) {
      for (const item of list(at(w, "Item") as Node | Node[])) {
        const on = list(at(item, "Kind") as Node | Node[]).some((k) => EMERGENCY.has(str(at(k, "Code"))) && str(at(k, "Status")) !== "解除");
        const code = str(at(item, "Area", "Code"));
        if (on && /^42\d{5}$/.test(code)) areas.add(`city:${name(at(item, "Area", "Name")).replace(/（.*）$/, "")}`);
      }
    }
    return alert("jma", id, "warning", "emergency", areas, issued);
  }
  return null;
}
