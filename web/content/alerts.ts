// Staff push notifications (web/lib/alerts.ts): where and what only, never the caller's words. Formal Japanese.

// Web Push and the mobile app. `place` is the station's Japanese label.
export const PUSH: Record<string, { title: string; body: (place: string) => string }> = {
  new_case: { title: "新しい案件", body: (place) => `${place}で新しい案件が発生しました。` },
  sla: { title: "目標時間の超過", body: (place) => `${place}の案件が目標時間を超えて待機しています。` },
  remind: { title: "対応期限が近づいています", body: (place) => `${place}の案件の対応期限が近づいています。` },
  promise_due: { title: "約束の時刻", body: (place) => `${place}の案件で約束した時刻になりました。` },
  field_job: { title: "新しい出動依頼", body: (place) => `${place}への出動依頼が届きました。` },
};
export const PUSH_UNKNOWN_PLACE = "ステーション";

// /account: notifications on this browser.
export const ACCOUNT_PUSH = {
  title: "通知",
  lead: "新しい案件、目標時間の超過、出動依頼、約束の時刻をこの端末に通知します。お客様の発言は通知に含まれません。サインアウトすると通知も停止します。",
  on: "この端末で通知を受け取る",
  off: "この端末の通知を停止",
  enabled: "通知を有効にしました。",
  disabled: "通知を停止しました。",
  denied: "通知が許可されていません。ブラウザの設定で許可してください。",
  failed: "通知を設定できませんでした。時間をおいて再度お試しください。",
};
