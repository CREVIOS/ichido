// Operator-side real-world paths (docs/research/10-real-stories.md §2 gaps 1, 4, 7, 12; §3 dispatch realism):
// fraud-in-progress mode, mass incidents, timers on promises, the harassment flag and takeover, and the security
// company's control centre on every dispatch. Caller strings: Bengali, Vietnamese, Indonesian, Nepali and easy Japanese
// are drafts awaiting native review. Staff strings are formal Japanese.
//
// No runtime import from catalogue.ts: catalogue.ts spreads these objects at load time, so a cycle would break it.
import type { L10n } from "./catalogue.ts";

// The alert source "phone call at the ATM / suspected fraud", raised by the monitoring side (POST /api/device with
// X-Fault) or registered by the operator. It only alerts: fraud mode itself is always the operator's decision.
export const FRAUD_FAULT = "phone_fraud";
export const OPS_FAULTS: Record<string, L10n> = {
  phone_fraud: {
    ja: "電話を しながら ATM を つかって いる", bn: "ফোনে কথা বলতে বলতে এটিএম ব্যবহার", en: "Using the ATM during a phone call",
    vi: "Dùng ATM trong khi đang gọi điện thoại", id: "Memakai ATM sambil menelepon", ne: "फोनमा कुरा गर्दै एटीएम प्रयोग",
  },
};
export const OPS_FAULT_STAFF: Record<string, string> = { phone_fraud: "ATM前で通話中（特殊詐欺の疑い）" };

// What the caller's phone shows. All bank-approved wording; none asks for anything.
export const OPS_CALLER = {
  fraud: {
    title: { ja: "とまって ください", bn: "থামুন", en: "Stop", vi: "Dừng lại", id: "Berhenti", ne: "रोकिनुहोस्" } as L10n,
    body: {
      ja: "お金を かえす ために ATM を つかって ほしい と いう 市役所、年金の 事務所、銀行は ありません。電話を すぐ きって ください。",
      bn: "কোনো সিটি অফিস, পেনশন অফিস বা ব্যাংক টাকা ফেরত দেওয়ার জন্য এটিএম ব্যবহার করতে বলে না। এখনই ফোন কেটে দিন।",
      en: "No city office, pension office or bank asks you to use an ATM to get money back. End the call now.",
      vi: "Không có văn phòng thành phố, cơ quan lương hưu hay ngân hàng nào yêu cầu bạn dùng ATM để nhận lại tiền. Hãy tắt cuộc gọi ngay.",
      id: "Tidak ada kantor kota, kantor pensiun, atau bank yang meminta Anda memakai ATM untuk mendapatkan uang kembali. Akhiri telepon sekarang.",
      ne: "कुनै पनि नगरपालिका कार्यालय, पेन्सन कार्यालय वा बैंकले पैसा फिर्ता पाउन एटीएम प्रयोग गर्न भन्दैन। अहिले नै फोन काट्नुहोस्।",
    } as L10n,
  },
  noticeLabel: { ja: "おしらせ", bn: "হালনাগাদ", en: "Update", vi: "Cập nhật", id: "Kabar terbaru", ne: "जानकारी" } as L10n,
  notice: {
    guidance_changed: {
      ja: "さきほどの あんないは かわりました。つぎの あんないを まって ください。",
      en: "The previous guidance has changed. Please wait for the next message.",
      vi: "Hướng dẫn trước đã thay đổi. Xin chờ tin nhắn tiếp theo.",
      bn: "আগের নির্দেশনা বদলেছে। পরের বার্তার জন্য অপেক্ষা করুন।",
      id: "Petunjuk sebelumnya sudah berubah. Silakan tunggu pesan berikutnya.",
      ne: "अघिको निर्देशन फेरिएको छ। अर्को सन्देश पर्खनुहोस्।",
    },
    mass_leave: {
      ja: "いま、たくさんの ATM が とまって います。かえっても いいです。銀行から れんらくします。カードは 銀行の きまりに そって あつかいます。",
      bn: "এখন অনেক এটিএমে সমস্যা হচ্ছে। আপনি এখন চলে যেতে পারেন। ব্যাংক আপনার সাথে যোগাযোগ করবে। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে।",
      en: "Many ATMs have a problem right now. You can leave now. The bank will contact you. The card is handled under the bank's own procedure.",
      vi: "Hiện nhiều máy ATM đang gặp sự cố. Bạn có thể ra về ngay bây giờ. Ngân hàng sẽ liên lạc với bạn. Thẻ được xử lý theo quy trình riêng của ngân hàng.",
      id: "Saat ini banyak ATM sedang bermasalah. Anda boleh pulang sekarang. Bank akan menghubungi Anda. Kartu ditangani sesuai prosedur bank sendiri.",
      ne: "अहिले धेरै एटीएममा समस्या छ। तपाईं अहिले जान सक्नुहुन्छ। बैंकले तपाईंलाई सम्पर्क गर्नेछ। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ।",
    },
    still_working: {
      ja: "係の 人が まだ たいおう して います。まって くれて ありがとう。",
      bn: "আমরা এখনো বিষয়টি দেখছি। অপেক্ষা করার জন্য ধন্যবাদ।",
      en: "Staff are still working on this. Thank you for waiting.",
      vi: "Nhân viên vẫn đang xử lý. Cảm ơn bạn đã chờ.",
      id: "Petugas masih menanganinya. Terima kasih sudah menunggu.",
      ne: "कर्मचारीहरू अझै यसमा काम गर्दै हुनुहुन्छ। पर्खनुभएकोमा धन्यवाद।",
    },
  } as Record<string, L10n>,
};

// Call-back and re-check promises the operator can make, in minutes.
export const PROMISE_MINUTES = [5, 10, 15, 30];
export const OPERATOR_PROMISES = ["callback", "recheck"] as const;

const KIND: Record<string, string> = {
  callback: "折り返し連絡", recheck: "再確認", eta: "警備員の到着目安", arrived: "警備員の到着後の対応完了",
};
const viaCompany = (company: string | undefined) => (company ? `${company} 管制` : "警備会社 管制");

// Staff copy (formal Japanese).
export const OPS = {
  fraud: {
    title: "特殊詐欺の疑い",
    body: "還付金や「銀行」を名乗る電話の指示で、お客様がATMを操作している疑いがあるときに使います。",
    warn: "警告を表示する",
    safe: "安全を確認・通常の案内に戻る",
    replacement: "案内を取り下げました。状況に合う案内を選んでください。",
    effects: [
      "お客様の画面に、承認済みの警告を全画面で表示",
      "Help Point のランプを赤に",
      "警備会社の管制へ出動を要請",
      "警察宛の引継票を発行（経過つき）",
    ],
    action: (guard: string) => `詐欺の疑い：${guard} の出動と警察への引継`,
    active: (t: string) => `${t} から詐欺の疑いモードです。お客様の画面には警告を表示しています。`,
    chip: "詐欺の疑い",
    toast: "詐欺の疑いモードにしました。警察宛の引継票のリンクをコピーしました。",
    noGuard: "出動を依頼できる警備員が登録されていません。",
    ai: "AIは詐欺の疑いモードを提案しています。実行するかどうかは担当者が判断します。",
    manual: (label: string) => `詐欺の疑いを手動登録：${label}`,
    handoff: "特殊詐欺の疑い",
  },
  abusive: {
    mark: "カスハラとして記録 (H)",
    chip: "カスハラ記録",
    toast: "カスハラとして記録しました。必要なら別の担当者に引き継いでください。",
  },
  takeover: {
    button: "この案件を引き継ぐ",
    abusive: "担当者がカスハラとして記録しています。",
    toast: "この案件を引き継ぎました",
  },
  mass: {
    preview: (n: number, kinds: string[]) => `対象 ${n}人（${kinds.join("・") || "—"}）`,
    chip: "大規模障害",
    title: (n: number) => `大規模障害：${n}拠点で障害が発生しています`,
    body: (m: number) => `${m}分以内に複数のATMで障害が発生したため、1件の障害としてまとめました。対応中の案件は、お客様の待ち時間が長い順に並べています。`,
    send: "接続中のお客様へ一斉案内を送信",
    confirm: "送信する（取り消せません）",
    cancel: "やめる",
    note: "承認済みの文面（帰宅してよい・銀行から連絡・カードの扱いは銀行所定の手続き）を、接続中のお客様へ1回だけ送ります。詐欺の疑いの案件には送りません。",
    sent: (t: string, by: string, n: number) => `${t} ${by} が一斉案内を送信（${n}人）`,
    toast: (n: number) => `一斉案内を${n}人に送信しました`,
  },
  promise: {
    title: "約束とタイマー",
    kind: KIND,
    make: (kind: string) => `${KIND[kind]}を約束`,
    minutes: (m: number) => `${m}分`,
    due: (t: string) => `${t} まで`,
    done: "完了",
    expired: "期限切れ",
    none: "期限つきの約束はありません。",
    note: "期限を過ぎると、この画面に通知し、お客様の画面には承認済みの「まだ対応中です」を表示します。警備員の到着目安と到着後の対応も同じように見守り、警備員には目安の更新を依頼します。",
    toast: (station: string, kind: string) => `${station}：${KIND[kind] ?? kind}の期限が過ぎました`,
  },
  dispatch: {
    chain: (company: string) => ["監視センター", viaCompany(company), "警備員"],
    note: "出動は警備会社の管制を通して依頼します。管制との連絡は通常の手順で行ってください。",
  },
  field: {
    via: (company: string) => `依頼元：監視センター → ${viaCompany(company)}`,
    reestimate: "到着目安の時刻を過ぎました。いまの見込みを選んで、もう一度「向かっています」を押してください。",
    arrivedLong: "到着から時間が経っています。対応が終わったら「対応完了」を押してください。",
  },
  insights: {
    metric: {
      title: "現場の判断",
      def: "担当者の判断で記録した件数。詐欺の疑いモード、カスハラ記録と引継ぎ、大規模障害と一斉案内、期限つきの約束と期限切れ、カード保管の障害と当日中の解決（案内確認まで）を数えます。",
    },
    fraud: "詐欺の疑いで介入",
    abusive: "カスハラ記録",
    takeovers: "担当の引継ぎ",
    mass: "大規模障害",
    broadcasts: "一斉案内の送信先",
    promises: "期限つきの約束",
    expired: "期限切れ",
    captured: "カード保管の障害",
    resolved: "当日中に解決",
  },
};

// Timeline sentences for the events above (eventText in catalogue.ts).
export function opsEventText(kind: string, d: Record<string, string | undefined>): string | null {
  switch (kind) {
    case "dispatch": return `${viaCompany(d.company)}へ出動を要請（警備員 ${d.assignee ?? ""}）`;
    case "redispatch": return `${viaCompany(d.company)}へ別の警備員の出動を要請（${d.assignee ?? ""}）`;
    case "fraud": return "特殊詐欺の疑い：お客様の画面に警告を表示し、ランプを赤に";
    case "fraud_safe": return "担当者が安全を確認し、通常の案内を再開";
    case "abusive": return "カスハラとして記録（担当者の判断）";
    case "takeover": return `担当を引き継ぎ（${d.from ?? "—"} から）`;
    case "mass_grouped": return "大規模障害としてまとめました";
    case "broadcast": return "一斉案内を送信：帰宅してよい・銀行から連絡（承認済み）";
    case "promise": return `約束を記録：${KIND[d.kind ?? ""] ?? d.kind}（${d.minutes}分）`;
    case "promise_kept": return `約束を完了：${KIND[d.kind ?? ""] ?? d.kind}`;
    case "promise_due": return `期限切れ：${KIND[d.kind ?? ""] ?? d.kind}${d.by ? `（${d.by}）` : ""} → お客様の画面に「まだ対応中です」を表示`;
    default: return null;
  }
}

export const SHIFT = {
  accept: "依頼を引き受ける", decline: "対応できません", help: "応援を依頼", eta: "到着目安を更新",
  correct: "進行状況を訂正", accepted: "担当者が受諾", declined: "辞退・再割当が必要",
  unack: "担当者の応答待ち", provider: "通知サービス受付済み", helpNeeded: "応援要請あり",
  reassigned: "他の担当者に再割当されました", duty: "担当拠点・職務", available: "受付可", off: "受付停止",
  pushReady: "端末通知：登録済み", pushDenied: "端末通知：許可されていません",
  pushMissing: "端末通知：未設定", pushFailed: "端末通知：登録失敗", pushWait: "端末通知：確認中",
  noWorker: "この拠点・職務で出動できる担当者はいません。",
};

export function nextFieldStep(state: string, acknowledged: string | null) {
  if (state === "requested") return acknowledged ? "on_way" : "accept";
  if (state === "on_way") return "arrived";
  if (state === "arrived") return "done";
  return null;
}

export const PARTNER = {
  preview: "共有内容を確認", issue: "この内容でリンクを作成", due: "対応期限", desk: "発行窓口", asOf: "情報の時点",
  tentative: "仮の申告（本人未確認）", action: "依頼すること", pending: "依頼準備中", sent: "依頼連絡済み",
  request: "相手に依頼した", accept: "相手の受諾を記録", accepted: "相手が受諾", ref: "鉄道会社の受付番号",
  verify: "氏名・連絡先・住所など、個人を特定する情報がないことを確認しました",
  mine: "自分が担当する未完了の外部対応", late: "期限超過", field: "現場対応", partner: "外部窓口",
  actions: { bank: "銀行での取扱いを確認する", police: "安全対応の引継ぎを確認する", security: "現地の安全を確認する",
    department: "受診先を確認する", medical_interpreter: "医療通訳を手配する", city_section: "担当課で手続きを確認する",
    consult_desk: "通訳の相談を受け付ける", railway: "忘れ物の照会を受け付ける", disaster_hq: "避難所の支援を調整する", health_team: "保健師による支援を確認する",
  } as Record<string,string>,
};
