// Staff wording for scenario packs (formal Japanese): console, stations, insights, field.
export const PACK_DESK = {
  pack: "種別",
  all: "すべて",
  urgent: "至急：お客様が緊急の状態を申告しました",
  urgentBody: "至急の承認済み返答（近くの職員へ直ちに伝える／119番）のみ送信できます。お客様の画面には同じ文面が既に表示されています。",
  urgentChip: "至急",
  tapsConfirmed: "お客様が確認した申告（選択肢）",
  responder: (r: string) => `${r}へ依頼`,
  dispatchBody: (r: string) => `${r}へ現地対応を依頼します。AIは診断・法律・在留資格の助言を行いません。`,
  noRecipients: "この種別には引継先がありません。",
  insights: {
    title: "種別ごとの案件",
    def: "ステーションの種別（ATM・病院・市役所・駅・避難所）ごとの受付件数と、案内確認まで到達した件数。件数のみ。",
    received: "受付",
    guided: "案内確認",
  },
  stationsLead: "各ステーション（ATM・病院・市役所・駅・避難所）の Help Point の稼働状況。端末は60秒ごとに通信します。",
};
