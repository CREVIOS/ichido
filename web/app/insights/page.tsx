"use client";
import { useCallback, useState } from "react";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, navFor, signOut, type Me } from "@/components/StaffGate";
import { Shell, Card, More, Tag, Funnel, Dots, Steps, Meter } from "@/components/ui";
import { FUNNEL, LANG_NAME, type Lang } from "@/content/catalogue";

type Insights = {
  since: string;
  funnel: Record<string, number>;
  per_day: { day: string; n: number }[];
  per_hour: { hour: number; n: number }[];
  languages: Record<string, number>;
  median_first_reply_s: number | null;
  choices: Record<string, number>;
};

const PERIODS = [7, 14, 30];
const HOURS_PER_SLOT = 2;
const LANG_COLOR: Record<string, string> = { bn: "var(--green)", en: "var(--blue)", ja: "var(--rose)", none: "var(--faint)" };
const gap = (g: number) => ({ "--gap": `${g}px` }) as React.CSSProperties;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function InsightsPage() {
  return <StaffGate allow={["operator", "manager"]} hint="manager@ichido.demo" title="インサイト">{(me) => <Board me={me} />}</StaffGate>;
}

function Board({ me }: { me: Me }) {
  const [days, setDays] = useState(PERIODS[1]);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("insights", { p_days: days });
    if (error) setError(error.message); else { setError(""); setData(data as Insights); }
  }, [days]);
  useLive(["desk"], load);

  const f = data?.funnel ?? {};
  const total = f.received ?? 0;
  // Two-hour slots keep the dot matrix readable on a card.
  const hours = data?.per_hour ?? [];
  const slots = Array.from({ length: hours.length / HOURS_PER_SLOT }, (_, i) => ({
    hour: i * HOURS_PER_SLOT,
    n: hours.slice(i * HOURS_PER_SLOT, (i + 1) * HOURS_PER_SLOT).reduce((sum, h) => sum + h.n, 0),
  }));
  const peak = slots.reduce((best, h) => (h.n > best.n ? h : best), { hour: 0, n: 0 });
  const langs = Object.entries(data?.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const langMax = Math.max(1, ...langs.map(([, n]) => n));
  const median = data?.median_first_reply_s;
  const choices = data?.choices ?? {};
  const chosen = (choices.wait ?? 0) + (choices.leave ?? 0);

  return (
    <Shell
      nav={navFor(me.role)}
      title="インサイト"
      right={<div className="row"><span className="small soft">{me.name}</span><button className="btn ghost" onClick={signOut}>サインアウト</button></div>}
      aside={
        <div className="row" style={gap(6)}>
          {PERIODS.map((p) => <button key={p} className={`btn ${p === days ? "on" : ""}`} onClick={() => setDays(p)}>直近{p}日</button>)}
        </div>
      }
    >
      {error && <p className="notice" style={{ marginBottom: 16 }}>{error}</p>}
      <div className="grid insights">
        <Card title="案件の流れ" action={<More label="表示" items={[{ label: "件数を更新", onClick: load }]} />}>
          <p className="small soft">障害通知から「お客様が次の手順を自分の言葉で説明」まで。列にカーソルを合わせると前の段階からの通過率を表示します。</p>
          <Funnel steps={FUNNEL.map((s) => ({ label: s.ja, value: f[s.key] ?? 0 }))} />
        </Card>
        <Card title="受付件数">
          <span className="big">{total.toLocaleString()}</span>
          <hr className="hairline" />
          <div className="stack" style={gap(14)}>
            {langs.length === 0 && <span className="small muted">データがありません</span>}
            {langs.map(([l, n]) => (
              <div key={l} className="stack" style={gap(6)}>
                <span className="row between"><span style={{ fontSize: 17 }}>{LANG_NAME[l as Lang] ?? "多言語窓口を使わず"}</span><span className="num soft">{n}</span></span>
                <Meter value={n} max={langMax} color={LANG_COLOR[l] ?? "var(--faint)"} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginTop: 22 }}>
        <Card title="日別の受付">
          {data && <Steps values={data.per_day.map((d) => d.n)} labels={data.per_day.map((d) => new Date(d.day).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }))} />}
        </Card>
        <Card title="時間帯" action={peak.n > 0 ? <Tag label="ピーク：" value={`${peak.hour}〜${peak.hour + HOURS_PER_SLOT}時`} /> : undefined}>
          <span className="big">{total}</span>
          <Dots values={slots.map((h) => h.n)} labels={slots.map((h) => `${h.hour}時`)} maxDots={5} />
          <div className="row between tiny muted">{slots.filter((_, i) => i % 3 === 0).map((h) => <span key={h.hour}>{h.hour}時</span>)}</div>
        </Card>
        <Card title="初回返答まで">
          <span className="big">{median == null ? "—" : median < 90 ? `${Math.round(median)}秒` : `${(median / 60).toFixed(1)}分`}</span>
          <span className="small soft">障害通知から、承認済み返答がお客様に届くまでの中央値</span>
          <hr className="hairline" />
          <div className="row between"><span className="soft">案内確認まで到達</span><span className="mid num">{pct(f.guided ?? 0, total)}%</span></div>
        </Card>
        <Card title="お客様の選択">
          <div className="stack" style={gap(14)}>
            {[["wait", "現地で待つ", "var(--blue)"], ["leave", "帰宅して連絡を待つ", "var(--violet)"]].map(([k, l, c]) => (
              <div key={k} className="stack" style={gap(6)}>
                <span className="row between"><span style={{ fontSize: 17 }}>{l}</span><span className="num soft">{pct(choices[k] ?? 0, chosen)}%</span></span>
                <Meter value={choices[k] ?? 0} max={Math.max(1, chosen)} color={c} />
              </div>
            ))}
          </div>
          <span className="tiny muted">「待つ／帰る」を選べる返答を受けたお客様のみ</span>
        </Card>
      </div>
      <p className="tiny muted" style={{ marginTop: 18 }}>件数のみを集計しています。お客様の言葉や個人を特定できる情報は表示しません。デモ環境の数値は合成データを含みます。</p>
    </Shell>
  );
}
