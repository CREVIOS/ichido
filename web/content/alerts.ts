// Alerts and messaging (web/lib/alerts.ts, web/lib/line.ts). Staff notifications carry where and what only, never the
// caller's words; staff wording is formal Japanese. Caller strings (LINE follow-up) are drafts awaiting native review,
// like the rest of the catalogue; the easy-Japanese ones pass `npm run check:ja`.

import type { L10n } from "./catalogue.ts";

// Staff push notifications (Web Push and the mobile app). `place` is the station's Japanese label.
export const PUSH: Record<string, { title: string; body: (place: string) => string }> = {
  new_case: { title: "新しい案件", body: (place) => `${place}で新しい案件が発生しました。` },
  sla: { title: "目標時間の超過", body: (place) => `${place}の案件が目標時間を超えて待機しています。` },
  remind: { title: "対応期限が近づいています", body: (place) => `${place}の案件の対応期限が近づいています。` },
  promise_due: { title: "約束の時刻", body: (place) => `${place}の案件で約束した時刻になりました。` },
  field_job: { title: "新しい出動依頼", body: (place) => `${place}への出動依頼が届きました。` },
};
export const PUSH_UNKNOWN_PLACE = "ステーション";

// Managers' Slack channel (SLACK_WEBHOOK_URL): SLA breaches and disaster mode, codes and places only.
export const SLACK = {
  sla: (place: string, reason: string) => `【Ichido】${place}の案件が目標時間を超過しました（${SLA_REASON[reason] ?? reason}）。`,
  disaster: (places: string) => `【Ichido】災害・障害モードが設定されました：${places}`,
};
const SLA_REASON: Record<string, string> = { unclaimed: "未担当", no_reply: "未返信", guard_late: "警備員未出発" };

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

// Caller: updates on LINE (opt-in). Shown only when the server has LINE keys.
export const LINE_CALLER = {
  offer: {
    ja: "LINE で おしらせを うけとる", en: "Get updates on LINE", bn: "LINE-এ আপডেট পান", vi: "Nhận cập nhật qua LINE",
    id: "Dapatkan kabar lewat LINE", ne: "LINE मा जानकारी पाउनुहोस्",
  },
  lead: {
    ja: "LINE で 銀行の 友だちに なって、下の コードを おくって ください。この 件の おしらせが 7日まで LINE に とどきます。いつでも「stop」と おくると とまります。LINE で カードの 番号や 暗証番号を きく ことは ありません。",
    en: "Add the bank's LINE account and send it the code below. You will get updates about this case on LINE for up to 7 days. Send \"stop\" at any time to end them. We never ask for card numbers or PINs on LINE.",
    bn: "LINE-এ ব্যাংকের অ্যাকাউন্টটি যোগ করুন এবং নিচের কোডটি পাঠান। এই বিষয়ের আপডেট ৭ দিন পর্যন্ত LINE-এ পাবেন। যেকোনো সময় \"stop\" পাঠালে বন্ধ হবে। LINE-এ আমরা কখনো কার্ড নম্বর বা পিন জানতে চাই না।",
    vi: "Hãy kết bạn với tài khoản LINE của ngân hàng và gửi mã dưới đây. Bạn sẽ nhận cập nhật về việc này qua LINE trong tối đa 7 ngày. Gửi \"stop\" bất cứ lúc nào để dừng. Chúng tôi không bao giờ hỏi số thẻ hay mã PIN qua LINE.",
    id: "Tambahkan akun LINE bank dan kirim kode di bawah. Anda akan mendapat kabar tentang masalah ini lewat LINE paling lama 7 hari. Kirim \"stop\" kapan saja untuk berhenti. Kami tidak pernah meminta nomor kartu atau PIN lewat LINE.",
    ne: "LINE मा बैंकको खाता थप्नुहोस् र तलको कोड पठाउनुहोस्। यस विषयको जानकारी ७ दिनसम्म LINE मा आउँछ। जुनसुकै बेला \"stop\" पठाएर रोक्न सक्नुहुन्छ। LINE मा हामी कहिल्यै कार्ड नम्बर वा पिन सोध्दैनौं।",
  },
  open: { ja: "LINE を ひらく", en: "Open LINE", bn: "LINE খুলুন", vi: "Mở LINE", id: "Buka LINE", ne: "LINE खोल्नुहोस्" },
  code: { ja: "おくる コード", en: "Code to send", bn: "যে কোড পাঠাবেন", vi: "Mã cần gửi", id: "Kode untuk dikirim", ne: "पठाउने कोड" },
  codeHint: {
    ja: "コードは 15分の あいだ 1回だけ つかえます。", en: "The code works once, for 15 minutes.",
    bn: "কোডটি ১৫ মিনিটের মধ্যে একবারই কাজ করবে।", vi: "Mã chỉ dùng được một lần, trong 15 phút.",
    id: "Kode hanya berlaku sekali, selama 15 menit.", ne: "कोड १५ मिनेटभित्र एक पटक मात्र चल्छ।",
  },
  linked: {
    ja: "この 件の おしらせは LINE にも とどきます。", en: "Updates about this case also go to your LINE.",
    bn: "এই বিষয়ের আপডেট আপনার LINE-এও যাবে।", vi: "Cập nhật về việc này cũng được gửi đến LINE của bạn.",
    id: "Kabar tentang masalah ini juga dikirim ke LINE Anda.", ne: "यस विषयको जानकारी तपाईंको LINE मा पनि जान्छ।",
  },
} satisfies Record<string, L10n>;

// What the LINE account itself says (reply or push), in the caller's language. Nothing else is ever sent there
// except the bank's approved replies and statuses for the linked case.
export const LINE_MESSAGES = {
  hello: {
    ja: "でんわの 画面に でた コードを ここに おくって ください。",
    en: "Send the code shown on your phone screen here to get updates about your case.",
    bn: "আপনার বিষয়ের আপডেট পেতে ফোনের স্ক্রিনে দেখানো কোডটি এখানে পাঠান।",
    vi: "Gửi mã hiện trên màn hình điện thoại vào đây để nhận cập nhật về việc của bạn.",
    id: "Kirim kode yang tampil di layar ponsel Anda ke sini untuk mendapat kabar tentang masalah Anda.",
    ne: "आफ्नो विषयको जानकारी पाउन फोनको स्क्रिनमा देखिएको कोड यहाँ पठाउनुहोस्।",
  },
  linked: {
    ja: "この 件の おしらせを 7日まで ここに おくります。とめる ときは「stop」と おくって ください。",
    en: "You will get updates about this case here for up to 7 days. Send \"stop\" to end them.",
    bn: "এই বিষয়ের আপডেট ৭ দিন পর্যন্ত এখানে পাবেন। বন্ধ করতে \"stop\" পাঠান।",
    vi: "Bạn sẽ nhận cập nhật về việc này tại đây trong tối đa 7 ngày. Gửi \"stop\" để dừng.",
    id: "Anda akan mendapat kabar tentang masalah ini di sini paling lama 7 hari. Kirim \"stop\" untuk berhenti.",
    ne: "यस विषयको जानकारी ७ दिनसम्म यहाँ आउँछ। रोक्न \"stop\" पठाउनुहोस्।",
  },
  badCode: {
    ja: "この コードは つかえません。画面の コードを たしかめて ください。",
    en: "That code did not work. Check the code on your screen, or ask for a new one there.",
    bn: "এই কোডটি কাজ করেনি। স্ক্রিনের কোডটি দেখে নিন, অথবা সেখানে নতুন কোড নিন।",
    vi: "Mã này không dùng được. Hãy kiểm tra mã trên màn hình, hoặc lấy mã mới tại đó.",
    id: "Kode itu tidak berlaku. Periksa kode di layar Anda, atau minta kode baru di sana.",
    ne: "यो कोड चलेन। स्क्रिनको कोड जाँच्नुहोस्, वा त्यहीँबाट नयाँ कोड लिनुहोस्।",
  },
  stopped: {
    ja: "おしらせを とめました。この LINE と 件の つながりを けしました。",
    en: "Updates stopped. Your LINE is no longer linked to the case.",
    bn: "আপডেট বন্ধ হয়েছে। আপনার LINE আর এই বিষয়ের সাথে যুক্ত নেই।",
    vi: "Đã dừng cập nhật. LINE của bạn không còn liên kết với việc này.",
    id: "Kabar dihentikan. LINE Anda tidak lagi terhubung dengan masalah ini.",
    ne: "जानकारी रोकियो। तपाईंको LINE अब यस विषयसँग जोडिएको छैन।",
  },
  closed: {
    ja: "この 件は おわりました。まって くれて ありがとう。",
    en: "This case is closed. Thank you for waiting.",
    bn: "এই বিষয়টি শেষ হয়েছে। অপেক্ষা করার জন্য ধন্যবাদ।",
    vi: "Việc này đã kết thúc. Cảm ơn bạn đã chờ.",
    id: "Masalah ini sudah selesai. Terima kasih sudah menunggu.",
    ne: "यो विषय सकियो। पर्खनुभएकोमा धन्यवाद।",
  },
} satisfies Record<string, L10n>;

// Words that unlink, in any of the six languages (compared after trimming and lower-casing).
export const LINE_STOP_WORDS = ["stop", "ストップ", "とめる", "停止", "থামুন", "dừng", "dung", "berhenti", "रोक्नुहोस्", "रोक"];
