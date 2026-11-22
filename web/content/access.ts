// A path with no voice (deaf or speech-impaired callers) and disaster / outage mode.
// Caller strings are drafts awaiting native review, like the rest of the catalogue; staff strings are formal Japanese.

import type { L10n } from "./catalogue.ts";
import { SHELTER_NOTICES } from "./packs/shelter.ts";

// Text-only path (caller).

export const ACCESS = {
  cantHear: {
    bn: "আমি শুনতে পাই না / কথা বলতে পারি না", en: "I can't hear / I can't speak", ja: "きこえない・はなせない",
    vi: "Tôi không nghe được / không nói được", id: "Saya tidak bisa mendengar / tidak bisa berbicara", ne: "म सुन्न सक्दिनँ / बोल्न सक्दिनँ",
  },
  cantHearHint: {
    bn: "এটি চাপলে ফোন ছাড়াই অপারেটরকে জানানো হবে। কোডটি Help Point-এর স্ক্রিনে দেখা যাবে।",
    en: "Press this to tell the operator without a call. The code will appear on the Help Point screen.",
    ja: "ここを おすと、電話を しないで 係の 人に つたえます。コードは Help Point の 画面に でます。",
    vi: "Bấm vào đây để báo cho nhân viên mà không cần gọi điện. Mã sẽ hiện trên màn hình Help Point.",
    id: "Tekan ini untuk memberi tahu petugas tanpa menelepon. Kodenya akan muncul di layar Help Point.",
    ne: "यो थिच्नुभयो भने फोन नगरी कर्मचारीलाई जानकारी दिइन्छ। कोड Help Point को स्क्रिनमा देखिन्छ।",
  },
  alertSent: {
    bn: "অপারেটরকে জানানো হয়েছে। একটু পরে Help Point-এর স্ক্রিনে ৬ অক্ষরের একটি কোড দেখা যাবে। নিচে সেটি লিখুন।",
    en: "The operator has been told. In a moment a 6-character code will appear on the Help Point screen. Type it below.",
    ja: "係の 人に つたえました。すこし すると Help Point の 画面に 6もじの コードが でます。下に 書いて ください。",
    vi: "Đã báo cho nhân viên. Một lát nữa, mã gồm 6 ký tự sẽ hiện trên màn hình Help Point. Hãy nhập mã đó vào bên dưới.",
    id: "Petugas sudah diberi tahu. Sebentar lagi kode 6 karakter akan muncul di layar Help Point. Ketik kode itu di bawah.",
    ne: "कर्मचारीलाई जानकारी दिइयो। केही बेरमा Help Point को स्क्रिनमा ६ अक्षरको कोड देखिन्छ। त्यो कोड तल लेख्नुहोस्।",
  },
  screenCode: {
    bn: "Help Point-এর স্ক্রিনে দেখানো কোড", en: "The code on the Help Point screen", ja: "Help Point の 画面に でた コード",
    vi: "Mã trên màn hình Help Point", id: "Kode di layar Help Point", ne: "Help Point को स्क्रिनमा देखिएको कोड",
  },
  textOnly: {
    bn: "এই কথোপকথন শুধু লেখায় হবে। অপারেটর এখানে লিখে উত্তর দেবেন।",
    en: "This conversation is by text only. The operator will answer here in writing.",
    ja: "この そうだんは 文字だけで します。係の 人は ここに 文字で こたえます。",
    vi: "Cuộc trao đổi này chỉ bằng chữ viết. Nhân viên sẽ trả lời bằng chữ tại đây.",
    id: "Percakapan ini hanya lewat tulisan. Petugas akan menjawab di sini secara tertulis.",
    ne: "यो कुराकानी लेखेर मात्र हुन्छ। कर्मचारीले यहीँ लेखेर जवाफ दिनुहुन्छ।",
  },
  humanAsked: {
    bn: "অপারেটরকে জানানো হয়েছে। তিনি এখানে লিখে উত্তর দেবেন।",
    en: "The operator has been told. They will answer here in writing.",
    ja: "係の 人に つたえました。ここに 文字で こたえます。",
    vi: "Đã báo cho nhân viên. Nhân viên sẽ trả lời bằng chữ tại đây.",
    id: "Petugas sudah diberi tahu. Petugas akan menjawab di sini secara tertulis.",
    ne: "कर्मचारीलाई जानकारी दिइयो। उहाँले यहीँ लेखेर जवाफ दिनुहुन्छ।",
  },
  waiting: {
    bn: "অপারেটর এখনো আপনার বিষয়টি দেখছেন। উত্তর এখানেই আসবে।",
    en: "The operator is still looking at your case. The answer will appear here.",
    ja: "係の 人が まだ かくにん しています。こたえは ここに でます。",
    vi: "Nhân viên vẫn đang xem trường hợp của bạn. Câu trả lời sẽ hiện tại đây.",
    id: "Petugas masih memeriksa kasus Anda. Jawabannya akan muncul di sini.",
    ne: "कर्मचारीले अझै तपाईंको विषय हेर्दै हुनुहुन्छ। जवाफ यहीँ देखिन्छ।",
  },
} satisfies Record<string, L10n>;

// Disaster / outage mode (caller).

// The bank's emergency-arrangement (非常取扱い) notices. Only these can be shown; `title` is for staff.
export const DISASTER_NOTICES: Record<string, { title: string; text: L10n }> = {
  earthquake: {
    title: "地震（非常取扱い）",
    text: {
      ja: "地震の ため、銀行は 非常の ときの やりかたで うごいて います。この ATM は とまる ことが あります。カードは 銀行の きまりに そって あつかいます。下の つかえる Help Point か、うごく まどぐちを つかって ください。銀行が きめた まどぐちにも れんらく できます。",
      bn: "ভূমিকম্পের কারণে ব্যাংক জরুরি ব্যবস্থায় কাজ করছে। এই এটিএম বন্ধ হয়ে যেতে পারে। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। নিচের চালু থাকা Help Point বা ভ্রাম্যমাণ শাখা ব্যবহার করুন, অথবা ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যম ব্যবহার করুন।",
      en: "Because of the earthquake, the bank is using its emergency arrangements. This ATM may stop working. Your card is handled under the bank's own procedure. Use a working Help Point or mobile branch listed below, or the bank's official contact channel.",
      vi: "Do động đất, ngân hàng đang áp dụng quy trình khẩn cấp. Cây ATM này có thể ngừng hoạt động. Thẻ được xử lý theo quy trình riêng của ngân hàng. Hãy dùng Help Point hoặc chi nhánh lưu động đang hoạt động bên dưới, hoặc kênh liên hệ chính thức của ngân hàng.",
      id: "Karena gempa bumi, bank sedang menjalankan prosedur darurat. ATM ini bisa berhenti berfungsi. Kartu ditangani sesuai prosedur bank sendiri. Gunakan Help Point atau kantor cabang keliling yang masih berfungsi di bawah, atau saluran kontak resmi bank.",
      ne: "भूकम्पका कारण बैंकले आपतकालीन व्यवस्था लागू गरेको छ। यो एटीएम बन्द हुन सक्छ। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। तल दिइएका चालु Help Point वा घुम्ती शाखा प्रयोग गर्नुहोस्, वा बैंकको आधिकारिक सम्पर्क माध्यम प्रयोग गर्नुहोस्।",
    },
  },
  typhoon: {
    title: "台風・大雨（非常取扱い）",
    text: {
      ja: "台風や 大雨の ため、銀行は 非常の ときの やりかたで うごいて います。この ATM は とまる ことが あります。カードは 銀行の きまりに そって あつかいます。あぶない ときは そとに でないで ください。下の つかえる Help Point か、うごく まどぐちを つかって ください。",
      bn: "টাইফুন বা ভারী বৃষ্টির কারণে ব্যাংক জরুরি ব্যবস্থায় কাজ করছে। এই এটিএম বন্ধ হয়ে যেতে পারে। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। বিপদ থাকলে বাইরে যাবেন না। নিচের চালু থাকা Help Point বা ভ্রাম্যমাণ শাখা ব্যবহার করুন।",
      en: "Because of the typhoon or heavy rain, the bank is using its emergency arrangements. This ATM may stop working. Your card is handled under the bank's own procedure. Do not go outside while it is dangerous. Use a working Help Point or mobile branch listed below.",
      vi: "Do bão hoặc mưa lớn, ngân hàng đang áp dụng quy trình khẩn cấp. Cây ATM này có thể ngừng hoạt động. Thẻ được xử lý theo quy trình riêng của ngân hàng. Đừng ra ngoài khi còn nguy hiểm. Hãy dùng Help Point hoặc chi nhánh lưu động đang hoạt động bên dưới.",
      id: "Karena topan atau hujan lebat, bank sedang menjalankan prosedur darurat. ATM ini bisa berhenti berfungsi. Kartu ditangani sesuai prosedur bank sendiri. Jangan keluar rumah selama masih berbahaya. Gunakan Help Point atau kantor cabang keliling yang masih berfungsi di bawah.",
      ne: "आँधी वा भारी वर्षाका कारण बैंकले आपतकालीन व्यवस्था लागू गरेको छ। यो एटीएम बन्द हुन सक्छ। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। खतरा हुँदा बाहिर ननिस्कनुहोस्। तल दिइएका चालु Help Point वा घुम्ती शाखा प्रयोग गर्नुहोस्।",
    },
  },
  outage: {
    title: "停電・システム障害によるATM休止",
    text: {
      ja: "停電や 機械の こしょうの ため、この あたりの ATM は とまって います。カードは 銀行の きまりに そって あつかいます。下の つかえる Help Point か、うごく まどぐちを つかって ください。銀行が きめた まどぐちにも れんらく できます。",
      bn: "বিদ্যুৎ বিভ্রাট বা সিস্টেমের সমস্যার কারণে এই এলাকার এটিএম বন্ধ আছে। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। নিচের চালু থাকা Help Point বা ভ্রাম্যমাণ শাখা ব্যবহার করুন, অথবা ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যম ব্যবহার করুন।",
      en: "Because of a power cut or system outage, ATMs in this area are stopped. Your card is handled under the bank's own procedure. Use a working Help Point or mobile branch listed below, or the bank's official contact channel.",
      vi: "Do mất điện hoặc sự cố hệ thống, các cây ATM trong khu vực này đang ngừng hoạt động. Thẻ được xử lý theo quy trình riêng của ngân hàng. Hãy dùng Help Point hoặc chi nhánh lưu động đang hoạt động bên dưới, hoặc kênh liên hệ chính thức của ngân hàng.",
      id: "Karena listrik padam atau gangguan sistem, ATM di daerah ini sedang berhenti. Kartu ditangani sesuai prosedur bank sendiri. Gunakan Help Point atau kantor cabang keliling yang masih berfungsi di bawah, atau saluran kontak resmi bank.",
      ne: "बिजुली गएको वा प्रणालीमा समस्या भएकाले यस क्षेत्रका एटीएम बन्द छन्। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। तल दिइएका चालु Help Point वा घुम्ती शाखा प्रयोग गर्नुहोस्, वा बैंकको आधिकारिक सम्पर्क माध्यम प्रयोग गर्नुहोस्।",
    },
  },
  // A shelter's updates use the same mode (content/packs/shelter.ts).
  ...SHELTER_NOTICES,
};
export const isDisasterNotice = (k: unknown): k is string => typeof k === "string" && Object.hasOwn(DISASTER_NOTICES, k);

export const DISASTER = {
  title: {
    bn: "জরুরি ব্যবস্থা চালু আছে", en: "Emergency arrangements are in place", ja: "いまは 非常の ときの やりかたです",
    vi: "Đang áp dụng quy trình khẩn cấp", id: "Prosedur darurat sedang berlaku", ne: "आपतकालीन व्यवस्था लागू छ",
  },
  nearby: {
    bn: "কাছাকাছি চালু থাকা Help Point", en: "Nearest working Help Points", ja: "ちかくで つかえる Help Point",
    vi: "Help Point đang hoạt động gần nhất", id: "Help Point terdekat yang berfungsi", ne: "नजिकका चालु Help Point",
  },
  mobileBranch: {
    bn: "ভ্রাম্যমাণ শাখা", en: "Mobile branch", ja: "うごく まどぐち（車）",
    vi: "Chi nhánh lưu động", id: "Kantor cabang keliling", ne: "घुम्ती शाखा",
  },
  none: {
    bn: "এই মুহূর্তে কাছাকাছি চালু কোনো Help Point জানা নেই। ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যম ব্যবহার করুন।",
    en: "No working Help Point nearby is known right now. Use the bank's official contact channel.",
    ja: "いま ちかくで つかえる Help Point は わかりません。銀行が きめた まどぐちに れんらくして ください。",
    vi: "Hiện chưa biết Help Point nào gần đây còn hoạt động. Hãy dùng kênh liên hệ chính thức của ngân hàng.",
    id: "Saat ini belum diketahui Help Point terdekat yang berfungsi. Gunakan saluran kontak resmi bank.",
    ne: "अहिले नजिकै कुनै चालु Help Point थाहा छैन। बैंकको आधिकारिक सम्पर्क माध्यम प्रयोग गर्नुहोस्।",
  },
} satisfies Record<string, L10n>;

// Distance in kilometres, the same in every language.
export const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

// Staff (formal Japanese).

export const ACCESS_STAFF = {
  badge: "文字対応",
  source: { caller: "お客様の画面（文字対応）" } as Record<string, string>,
  bannerTitle: "文字対応のお客様",
  banner: "お客様が「聞こえない・話せない」を選びました。音声・受話器は使わず、すべて文字で対応してください（A-6 受話器の案内は送らないでください）。接続コードは Help Point の画面に表示します。",
  title: "接続コード（端末表示）",
  body: "コードを読み上げる代わりに、Help Point の画面に表示します。お客様が表示されたコードを入力すると接続され、表示は消えます。",
  show: "端末に表示",
  reshow: "新しいコードを表示",
  showing: (s: number) => `Help Point に表示中 · あと ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
  shown: "Help Point に接続コードを表示しました",
  offline: "Help Point が応答していません。画面に表示できないため、警備員による現地確認を検討してください。",
};

export const DISASTER_STAFF = {
  title: "災害・障害モード",
  lead: "地図または一覧でステーションを選び、承認済みの告知を選んで設定します。対象ATMのお客様には告知と、近くで稼働中の Help Point・移動店舗が表示されます。",
  notice: "告知文（承認済み）",
  preview: "お客様の画面（やさしい日本語）",
  selected: (n: number) => `${n}件選択中`,
  selectAll: "すべて選択",
  unselect: "選択を解除",
  set: "災害モードに設定",
  clear: "災害モードを解除",
  toastSet: (n: number) => (n ? `${n}件を災害モードに設定しました` : "変更はありません（すでに設定済みです）"),
  toastClear: (n: number) => (n ? `${n}件の災害モードを解除しました` : "変更はありません（災害モードではありません）"),
  badge: "災害モード",
  since: (t: string) => `${t} から`,
  mobileBranch: "移動店舗",
  noDevice: "端末なし",
  history: "最近の切り替え",
  entered: "開始",
  left: "解除",
  legend: { online: "稼働中", offline: "応答なし・未接続", disaster: "災害モード", mobile: "移動店舗" },
  select: "選択",
};

// Timeline sentences for the events above (see eventText in catalogue.ts).
export function accessEventText(kind: string, d: Record<string, string | undefined>): string | undefined {
  const notice = DISASTER_NOTICES[d.notice ?? ""]?.title ?? d.notice;
  switch (kind) {
    case "text_only": return "お客様が「聞こえない・話せない」を選択（文字対応）";
    case "device_code": return "接続コードを Help Point の画面に表示";
    case "disaster_entered": return `災害モード開始：${notice}`;
    case "disaster_left": return `災害モード解除：${notice}`;
    default: return undefined;
  }
}
