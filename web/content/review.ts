// 要確認 (For review) and the Ichido Bot sequence view (/automation). Staff screens: formal Japanese.
// The rule both screens keep: the AI and the bot prepare drafts; a person decides.
import { SLA } from "./staff.ts";

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
  return m < 60 * 48 ? "昨日" : `${Math.floor(m / 1440)}日前`;
};
const secs = (s: number | null | undefined) => (s == null ? "—" : s < 90 ? `${Math.round(s)}秒` : `${(s / 60).toFixed(1)}分`);
const at = (t: string) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const REVIEW = {
  title: "要確認",
  nav: "要確認",
  menu: "表示の操作",
  ago,
  at,
  secs,
  empty: "確認が必要な項目はありません。AI提案、対応記録、機械翻訳、引継票のうち、判断が必要なものがここに届きます。",
  pick: "左の一覧から項目を選んでください。",
  loadError: "要確認の項目を読み込めませんでした。",
  prev: "前の項目 (K)",
  next: "次の項目 (J)",
  dismiss: "見送る",
  dismissKey: "見送る (E)",
  more: "詳細を表示",
  less: "詳細を閉じる",
  keys: "J・K で移動、Enter で実行、E で見送り",
  done: "記録しました",
  groups: { suggestion: "AI提案", record: "対応記録", translation: "機械翻訳の確認", handoff: "引継票" } as Record<string, string>,
  suggestion: {
    tag: "返答を送信",
    rows: { to: "宛先", reply: "返答", guard: "現地確認", by: "提案元" },
    to: (lang: string) => `お客様（${lang}）`,
    noGuard: "依頼しない",
    noIntent: "送信できる承認済み返答がありません。見送ってください。",
    reasons: "理由",
    risks: "注意",
    accept: "送信",
    acceptDispatch: (name: string) => `送信して ${name} へ依頼`,
    sub: (code: string, guard: string | null) => (guard ? `${code}・${guard} へ依頼` : code),
    note: "送信と出動依頼は、あなたの操作として記録されます。お客様の発言はAIに渡していません。",
    toast: "承認済み返答を送信しました",
  },
  record: {
    tag: "承認",
    rows: { closed: "終了", claim: "担当まで", reply: "初回返答まで", guard: "警備員の到着まで", total: "合計" },
    sub: (total: string) => `合計 ${total}`,
    note: "スタッフ用メモ（任意）",
    notePlaceholder: "社内向けの補足を記入できます。お客様には送られません。",
    noteHint: "500文字まで。お客様、銀行、引継票には表示されません。",
    approve: "承認",
    toast: "対応記録を承認しました",
    approved: (name: string, t: string) => `承認済み・${name}（${t}）`,
    staffNote: "スタッフ用メモ",
  },
  translation: {
    tag: "確認",
    source: { words: "お客様のことば", teachback: "次の手順の説明" } as Record<string, string>,
    rows: { source: "種類", lang: "言語" },
    original: "原文",
    mt: "機械翻訳",
    hint: "原文と機械翻訳の意味が一致しているかを確認してください。判断できない場合は、バイリンガルの担当者に回してください。",
    confirm: "翻訳を確認",
    flag: "バイリンガル確認へ回す",
    toast: "翻訳の確認を記録しました",
    flagged: "バイリンガルの担当者による確認を依頼しました",
  },
  handoff: {
    tag: "リンク",
    rows: { to: "宛先", issued: "発行", expires: "期限", views: "閲覧" },
    unviewed: "まだ閲覧されていません",
    expiring: (t: string) => `${t} に失効します`,
    summary: (to: string, unviewed: boolean, expires: string) =>
      `${to}宛の引継票リンクは${unviewed ? "まだ閲覧されていません" : "閲覧済みですが、まもなく失効します"}。期限は ${expires} です。リンクはハッシュのみ保存しているため、再度コピーするには新しいリンクを発行します（以前のリンクは失効します）。`,
    sub: (to: string, unviewed: boolean) => `${to}宛・${unviewed ? "未閲覧" : "まもなく失効"}`,
    views: (n: number) => `${n}回`,
    reissue: "新しいリンクをコピー",
    revoke: "失効させる",
    copied: "新しいリンクをコピーしました（以前のリンクは失効しました）",
    revoked: "リンクを失効させました",
  },
  // Timeline sentences (eventText in catalogue.ts).
  events: {
    suggestion_accepted: "AI提案を採用（担当者が送信）",
    suggestion_dismissed: "AI提案を見送り",
    record_approved: "対応記録を承認",
    record_dismissed: "対応記録の確認を見送り",
    translation_confirmed: "機械翻訳の内容を確認",
    translation_flagged: "機械翻訳をバイリンガル確認へ回付",
    translation_dismissed: "機械翻訳の確認を見送り",
    handoff_dismissed: "未閲覧の引継票を確認",
  } as Record<string, string>,
};

// /automation as a sequence view of the Ichido Bot workflow.
export const SEQUENCE = {
  name: "Ichido Bot",
  menu: "ワークフローの操作",
  tabs: { overview: "概要", running: "実行中", history: "履歴", test: "テスト" } as Record<string, string>,
  performance: "実績（直近30日）",
  tiles: {
    runs: "開始した実行",
    routed: "担当者の推奨",
    prepared: "AI提案の準備",
    reminded: "期限前の通知",
    recorded: "対応記録",
    reply: "初回返答の平均",
    target: (t: string) => `目標 ${t}`,
  },
  share: (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : ""),
  description: "説明",
  lead: "Ichido Bot は案件ごとに1つのワークフローとして、障害通知から案件の終了まで動きます。準備と通知は自動で行いますが、判断はすべて担当者が行います。",
  may: "自動で行うこと",
  mayList: ["担当者を推奨する（担当の決定は担当者）", "お客様の確認後にAI提案を準備する", "目標時間の前に担当者と警備員へ通知する", "終了時に対応記録と所要時間を作成する"],
  mayNot: "行わないこと",
  mayNotList: ["案件の担当、返答の送信、出動依頼、案件の終了", "お客様への文章の作成や送信", "記録の承認（要確認で担当者が行います）"],
  steps: "ステップ",
  step: (n: number) => `ステップ${n}`,
  sequence: [
    { key: "route", when: "すぐに", title: "ルーティング", body: "対応中の案件が最も少ない担当者を推奨します" },
    { key: "prepare", when: "お客様の確認後", title: "提案の準備", body: "承認済み返答と出動の要否をAIが下書きします" },
    { key: "remind", when: `目標の${Math.round(SLA.warn * 100)}%で`, title: "リマインド", body: "初回返答と警備員の出発の目標が近づいたら通知します" },
    { key: "record", when: "終了時", title: "記録", body: "対応記録と所要時間を作成し、要確認へ送ります" },
  ],
  targets: (reply: string, guard: string) => `初回返答 ${reply}・警備員の出発 ${guard}`,
  doneCount: (n: number) => `完了 ${n}`,
  running: {
    empty: "実行中のワークフローはありません。",
    current: "現在のステップ",
    finished: "全ステップ完了",
    started: "開始",
  },
  history: {
    empty: "完了した実行はまだありません。",
    head: { station: "ATM", closed: "終了", claim: "担当まで", reply: "初回返答まで", guard: "警備員の到着まで", total: "合計" },
  },
  test: {
    lead: "手動登録（受話器での申告）で開いた案件の実行です。テストとして障害を登録すると、実際の案件として同じワークフローが動きます。",
    empty: "手動登録で開始した実行はありません。",
    start: (station: string) => `テスト実行：${station}`,
    started: "テスト用の障害を登録しました",
    open: "対応中",
    closed: "終了",
  },
};
