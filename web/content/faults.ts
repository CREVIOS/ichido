// Real-world fault paths: every reason a card, passbook or cash stays in (or never leaves) the machine, from the
// sourced caller stories. Each fault type has its own caller facts (taps) and approved replies, and each reply has a
// rule the server enforces in SQL (supabase/migrations/20261123110000_faults.sql; tests/faults.test.mjs checks they match).
// Bengali, Vietnamese, Indonesian and Nepali below are drafts awaiting native review; Japanese is easy Japanese for callers
// and formal Japanese for staff.
//
// No runtime import from catalogue.ts: catalogue.ts spreads these objects at load time, so a cycle would break it.
import type { Fact, L10n, Lang, ReplySlots } from "./catalogue.ts";
import { PACK_REPLIES, PACK_RULES, PACK_SITUATION_NAMES, PACK_SITUATION_STAFF, PACK_TAPS, contentPack, packOfFault, packTapsFor, type PackId } from "./packs/index.ts";

const p = (v: L10n | undefined, lang: Lang) => v?.[lang] ?? v?.en ?? "";

type Group = "card" | "passbook" | "cash";
// amount: the operator may record the amount the caller stated on the handset (本人申告).
type FaultType = { name: L10n; staff: string; group: Group; amount?: boolean };

// card_retained stays in catalogue.ts (it is what the device button reports).
export const FAULT_TYPES: Record<string, FaultType> = {
  card_forgotten: {
    group: "card", staff: "カードの取り忘れ（ATMが回収）",
    name: {
      ja: "カードを とりわすれて、ATM の 中に もどった", en: "The card was left in the slot and taken back inside",
      bn: "কার্ড স্লটে রয়ে গিয়েছিল, মেশিন সেটি ভেতরে টেনে নিয়েছে", vi: "Thẻ bị để quên ở khe và máy đã thu vào trong",
      id: "Kartu tertinggal di slot dan ditarik kembali ke dalam mesin", ne: "कार्ड स्लटमै छुट्यो र मेसिनले भित्र तान्यो",
    },
  },
  card_kept: {
    group: "card", staff: "銀行の規定によるカード取込み（紛失届・有効期限切れ・取引制限等）",
    name: {
      ja: "銀行の きまりで ATM が カードを あずかった", en: "The machine kept the card under the bank's rules",
      bn: "ব্যাংকের নিয়মে মেশিন কার্ডটি রেখে দিয়েছে", vi: "Máy giữ thẻ theo quy định của ngân hàng",
      id: "Mesin menahan kartu sesuai aturan bank", ne: "बैंकको नियमअनुसार मेसिनले कार्ड राख्यो",
    },
  },
  card_unreadable: {
    group: "card", staff: "カードの読み取り不可",
    name: {
      ja: "ATM が カードを よめない", en: "The machine cannot read the card",
      bn: "মেশিন কার্ডটি পড়তে পারছে না", vi: "Máy không đọc được thẻ",
      id: "Mesin tidak bisa membaca kartu", ne: "मेसिनले कार्ड पढ्न सकेन",
    },
  },
  passbook_stuck: {
    group: "passbook", staff: "通帳が排出されない",
    name: {
      ja: "通帳が でてこない", en: "The passbook did not come back out",
      bn: "পাসবই ফেরত আসেনি", vi: "Sổ tài khoản không được trả ra",
      id: "Buku tabungan tidak keluar", ne: "पासबुक बाहिर आएन",
    },
  },
  cash_jam: {
    group: "cash", amount: true, staff: "入金時の紙幣詰まり",
    name: {
      ja: "入れた お金が ATM の 中で つまった", en: "Cash put in is stuck inside the machine",
      bn: "জমা দেওয়া টাকা মেশিনের ভেতরে আটকে গেছে", vi: "Tiền nạp vào bị kẹt trong máy",
      id: "Uang yang disetor tersangkut di dalam mesin", ne: "हालेको पैसा मेसिनभित्र अड्कियो",
    },
  },
  cash_left: {
    group: "cash", amount: true, staff: "現金の取り忘れ（ATMが回収）",
    name: {
      ja: "お金を とりわすれて、ATM の 中に もどった", en: "Cash was left in the tray and taken back inside",
      bn: "নগদ টাকা ট্রেতে রয়ে গিয়েছিল, মেশিন সেটি ভেতরে টেনে নিয়েছে", vi: "Tiền bị để quên ở khay và máy đã thu vào trong",
      id: "Uang tertinggal dan ditarik kembali ke dalam mesin", ne: "नगद ट्रेमै छुट्यो र मेसिनले भित्र तान्यो",
    },
  },
  debited_no_cash: {
    group: "cash", amount: true, staff: "出金記録あり・現金未排出",
    name: {
      ja: "こうざの お金は へったが、お金が でてこない", en: "Money left the account, but no cash came out",
      bn: "অ্যাকাউন্ট থেকে টাকা কেটেছে, কিন্তু নগদ বের হয়নি", vi: "Tài khoản bị trừ tiền nhưng máy không nhả tiền",
      id: "Saldo terpotong, tetapi uang tunai tidak keluar", ne: "खाताबाट पैसा काटियो, तर नगद निस्किएन",
    },
  },
  limit_refused: {
    group: "cash", staff: "限度額超過による取引不可",
    name: {
      ja: "きめられた 金額を こえたので とりひきが できない", en: "Transaction refused: over the limit",
      bn: "সীমা ছাড়িয়ে যাওয়ায় লেনদেন হয়নি", vi: "Giao dịch bị từ chối do vượt hạn mức",
      id: "Transaksi ditolak karena melebihi batas", ne: "सीमाभन्दा बढी भएकाले कारोबार भएन",
    },
  },
};
// The other packs' situations (content/packs) are fault codes too, so every screen and the SQL rules share one list.
export const FAULT_NAMES = { ...Object.fromEntries(Object.entries(FAULT_TYPES).map(([k, f]) => [k, f.name])), ...PACK_SITUATION_NAMES } as Record<string, L10n>;
export const FAULT_STAFF = { ...Object.fromEntries(Object.entries(FAULT_TYPES).map(([k, f]) => [k, f.staff])), ...PACK_SITUATION_STAFF } as Record<string, string>;
const groupOf = (fault: string): Group => FAULT_TYPES[fault]?.group ?? "card";
export const takesAmount = (fault: string) => Boolean(FAULT_TYPES[fault]?.amount);
export const AMOUNT_FAULTS = Object.keys(FAULT_TYPES).filter(takesAmount);
export const AMOUNT_MAX = 10_000_000;

// What the caller can tap (their own statements). suggests: the fault type their story points to, shown to the operator.
// urgent and group: a pack's red flags and grouped taps (content/packs/types.ts).
type CallerFlag = { label: L10n; staff: string; suggests?: string; urgent?: boolean; group?: string };
export const CALLER_FLAGS: Record<string, CallerFlag> = {
  forgot_card: {
    suggests: "card_forgotten", staff: "カードを取り忘れたとのこと",
    label: {
      ja: "カードを とるのを わすれました", en: "I forgot to take my card, and the machine took it back",
      bn: "আমি কার্ড নিতে ভুলে গিয়েছিলাম, মেশিন সেটি ভেতরে টেনে নিয়েছে", vi: "Tôi quên lấy thẻ và máy đã thu thẻ vào",
      id: "Saya lupa mengambil kartu, lalu mesin menariknya kembali", ne: "मैले कार्ड लिन बिर्सें, मेसिनले भित्र तान्यो",
    },
  },
  card_kept_msg: {
    suggests: "card_kept", staff: "紛失届済み、または有効期限切れの可能性があるとのこと",
    label: {
      ja: "この カードは なくした と とどけた か、きげんが きれて いる かもしれません", en: "I reported this card lost, or it may be expired",
      bn: "আমি এই কার্ড হারিয়ে যাওয়ার কথা ব্যাংককে জানিয়েছিলাম, অথবা এর মেয়াদ শেষ হয়ে থাকতে পারে", vi: "Tôi đã báo mất thẻ này, hoặc thẻ có thể đã hết hạn",
      id: "Saya pernah melaporkan kartu ini hilang, atau kartunya mungkin sudah kedaluwarsa", ne: "मैले यो कार्ड हराएको खबर गरेको थिएँ, वा यसको म्याद सकिएको हुन सक्छ",
    },
  },
  cant_read: {
    suggests: "card_unreadable", staff: "カードを読み取れないと表示されたとのこと",
    label: {
      ja: "ATM に カードが よめない と でました", en: "The ATM said it cannot read my card",
      bn: "এটিএম বলেছে আমার কার্ড পড়া যাচ্ছে না", vi: "Máy ATM báo không đọc được thẻ",
      id: "ATM bilang kartu saya tidak bisa dibaca", ne: "एटीएमले मेरो कार्ड पढ्न सकिँदैन भन्यो",
    },
  },
  card_cant_use: {
    staff: "「このカードは使えません」と表示されたとのこと（在留期間による取引制限の可能性）",
    label: {
      ja: "ATM に この カードは つかえない と でました", en: "The ATM says my card can't be used",
      bn: "এটিএম বলছে আমার কার্ড ব্যবহার করা যাবে না", vi: "Máy ATM báo thẻ của tôi không dùng được",
      id: "ATM bilang kartu saya tidak bisa digunakan", ne: "एटीएमले मेरो कार्ड प्रयोग गर्न मिल्दैन भन्छ",
    },
  },
  debited_no_cash: {
    suggests: "debited_no_cash", staff: "口座から引き落とされたが現金が出ていないとのこと",
    label: {
      ja: "こうざの お金は へったのに、お金が でてきません", en: "Money was taken from my account, but no cash came out",
      bn: "অ্যাকাউন্ট থেকে টাকা কেটে নেওয়া হয়েছে, কিন্তু নগদ টাকা বের হয়নি", vi: "Tiền đã bị trừ khỏi tài khoản nhưng máy không nhả tiền",
      id: "Uang terpotong dari rekening, tetapi uang tunai tidak keluar", ne: "खाताबाट पैसा काटियो, तर नगद निस्किएन",
    },
  },
  cash_left: {
    suggests: "cash_left", staff: "現金を取り忘れたとのこと",
    label: {
      ja: "お金を とるのを わすれました", en: "I forgot to take the cash",
      bn: "আমি টাকা নিতে ভুলে গিয়েছিলাম", vi: "Tôi quên lấy tiền",
      id: "Saya lupa mengambil uangnya", ne: "मैले पैसा लिन बिर्सें",
    },
  },
  cash_in_stuck: {
    suggests: "cash_jam", staff: "入金した現金が機内で詰まっているとのこと",
    label: {
      ja: "入れた お金が ATM の 中で つまって います", en: "The cash I put in is stuck in the machine",
      bn: "আমার জমা দেওয়া টাকা মেশিনের ভেতরে আটকে আছে", vi: "Tiền tôi nạp vào bị kẹt trong máy",
      id: "Uang yang saya setor tersangkut di dalam mesin", ne: "मैले हालेको पैसा मेसिनभित्र अड्कियो",
    },
  },
  limit_msg: {
    suggests: "limit_refused", staff: "限度額を超えたと表示されたとのこと",
    label: {
      ja: "ATM に 金額が 上限を こえた と でました", en: "The ATM said the amount is over the limit",
      bn: "এটিএম বলেছে টাকার পরিমাণ সীমা ছাড়িয়েছে", vi: "Máy ATM báo số tiền vượt hạn mức",
      id: "ATM bilang jumlahnya melebihi batas", ne: "एटीएमले रकम सीमाभन्दा बढी भयो भन्यो",
    },
  },
  passbook_inside: {
    suggests: "passbook_stuck", staff: "通帳が出てこないとのこと",
    label: {
      ja: "通帳が でてきません", en: "My passbook did not come back out",
      bn: "আমার পাসবই ফেরত আসেনি", vi: "Sổ tài khoản của tôi không được trả ra",
      id: "Buku tabungan saya tidak keluar", ne: "मेरो पासबुक बाहिर आएन",
    },
  },
  foreign_card: {
    staff: "海外発行のカードとのこと",
    label: {
      ja: "カードは 日本の そとで 作りました", en: "My card was issued outside Japan",
      bn: "আমার কার্ড জাপানের বাইরে ইস্যু করা", vi: "Thẻ của tôi được phát hành ở ngoài Nhật Bản",
      id: "Kartu saya diterbitkan di luar Jepang", ne: "मेरो कार्ड जापानबाहिर जारी गरिएको हो",
    },
  },
  leaving_japan: {
    staff: "再来店できない（出国予定など）とのこと",
    label: {
      ja: "もう ここに 来られません（日本を はなれます）", en: "I can't come back here / I am leaving Japan",
      bn: "আমি আর এখানে আসতে পারব না / আমি জাপান ছেড়ে যাচ্ছি", vi: "Tôi không thể quay lại đây / tôi sắp rời Nhật Bản",
      id: "Saya tidak bisa kembali ke sini / saya akan meninggalkan Jepang", ne: "म फेरि यहाँ आउन सक्दिनँ / म जापान छोड्दै छु",
    },
  },
  // Recorded on the case as a flag only: no name, relationship or contact details.
  helper: {
    staff: "ご家族が付き添い・操作を補助",
    label: {
      ja: "家族が てつだって います", en: "A family member is helping me",
      bn: "পরিবারের একজন আমাকে সাহায্য করছেন", vi: "Người nhà đang giúp tôi",
      id: "Anggota keluarga sedang membantu saya", ne: "परिवारको एक जना सदस्यले मलाई सहयोग गर्दै हुनुहुन्छ",
    },
  },
  ...PACK_TAPS,
};
export const isCallerFlag = (k: unknown): k is string => typeof k === "string" && Object.hasOwn(CALLER_FLAGS, k);
// Each fault type's own facts first, then the ones every caller may need.
const GROUP_FLAGS: Record<Group, string[]> = {
  card: ["forgot_card", "card_kept_msg", "cant_read", "card_cant_use"],
  passbook: ["passbook_inside"],
  cash: ["debited_no_cash", "cash_left", "cash_in_stuck", "limit_msg"],
};
const COMMON_FLAGS = ["foreign_card", "leaving_japan", "helper"];
// flags: the caller's current taps (a pack also shows the details of the situations they point to).
export function flagsFor(fault: string, flags: readonly string[] = []) {
  const p = contentPack(fault);
  return p ? packTapsFor(p, fault, flags) : ["need_other", ...GROUP_FLAGS[groupOf(fault)], ...COMMON_FLAGS];
}

// Fault types the caller's taps point to that differ from the current one (a hint for the operator, never automatic).
export const suggestedFaults = (fault: string, flags: readonly string[]) =>
  [...new Set(flags.map((f) => CALLER_FLAGS[f]?.suggests).filter((s): s is string => Boolean(s) && s !== fault))];

type FaultReply = { code: string; title: string; text: (s: ReplySlots) => L10n; offersChoice?: boolean };
export const FAULT_REPLIES: Record<string, FaultReply> = {
  CARD_FORGOTTEN: {
    code: "B-1", title: "カード取り忘れ（ATMが回収・銀行所定の手続き、待機不要）",
    text: (s) => ({
      ja: `ATM が カードを 中に もどしました。ここで まつ ひつようは ありません。${p(s.branch, "ja")} に きく ことが できます。${p(s.hours, "ja")} きけます。カードを 出した 銀行でも きけます。`,
      bn: `নিরাপত্তার জন্য মেশিন কার্ডটি ভেতরে টেনে নিয়েছে। এখানে অপেক্ষা করার দরকার নেই। ${p(s.branch, "bn")} (${p(s.hours, "bn")}) অথবা যে ব্যাংক কার্ডটি দিয়েছে, তাদের জিজ্ঞেস করুন।`,
      en: `The machine took the card back inside to keep it safe. No need to wait here. Ask ${p(s.branch, "en")} (${p(s.hours, "en")}) or the bank that issued the card.`,
      vi: `Máy đã thu thẻ vào trong để giữ an toàn. Bạn không cần chờ ở đây. Hãy hỏi ${p(s.branch, "vi")} (${p(s.hours, "vi")}) hoặc ngân hàng phát hành thẻ.`,
      id: `Mesin menarik kartu ke dalam agar aman. Anda tidak perlu menunggu di sini. Tanyakan ke ${p(s.branch, "id")} (${p(s.hours, "id")}) atau bank penerbit kartu.`,
      ne: `सुरक्षाका लागि मेसिनले कार्ड भित्र तान्यो। यहाँ पर्खनु पर्दैन। ${p(s.branch, "ne")} (${p(s.hours, "ne")}) वा कार्ड जारी गर्ने बैंकलाई सोध्नुहोस्।`,
    }),
  },
  CARD_KEPT_RULE: {
    code: "B-2", title: "銀行の規定によるカード取込み（障害ではない・待機不要）",
    text: () => ({
      ja: `ATM は 銀行の きまりで カードを あずかりました（なくした カード、きげんが きれた カード など）。こわれた のでは ありません。ここで まつ ひつようは ありません。カードを 出した 銀行に きいて ください。`,
      bn: `ব্যাংকের নিয়মে মেশিন কার্ডটি রেখে দিয়েছে (যেমন হারানো বা মেয়াদ শেষ হওয়া কার্ড)। এটি ত্রুটি নয়। এখানে অপেক্ষা করার দরকার নেই। যে ব্যাংক কার্ডটি দিয়েছে, তাদের জিজ্ঞেস করুন।`,
      en: `The machine kept the card under the bank's rules (for example, a lost or expired card). It is not broken. No need to wait here. Ask the bank that issued the card.`,
      vi: `Máy giữ thẻ theo quy định của ngân hàng (ví dụ thẻ đã báo mất hoặc hết hạn). Máy không hỏng. Bạn không cần chờ ở đây. Hãy hỏi ngân hàng phát hành thẻ.`,
      id: `Mesin menahan kartu karena aturan bank (misalnya kartu yang dilaporkan hilang atau kedaluwarsa). Mesin tidak rusak. Anda tidak perlu menunggu di sini. Tanyakan ke bank penerbit kartu.`,
      ne: `बैंकको नियमअनुसार मेसिनले कार्ड राख्यो (जस्तै हराएको वा म्याद सकिएको कार्ड)। मेसिन बिग्रेको होइन। यहाँ पर्खनु पर्दैन। कार्ड जारी गर्ने बैंकलाई सोध्नुहोस्।`,
    }),
  },
  CARD_UNREADABLE: {
    code: "B-3", title: "カード読み取り不可（カード発行銀行の窓口へ）",
    text: () => ({
      ja: `ATM が カードを よめませんでした。カードに きずが あるか、ふるい かもしれません。カードを 出した 銀行に もって いって ください。`,
      bn: `মেশিন কার্ডটি পড়তে পারেনি। কার্ডে দাগ থাকতে পারে বা পুরোনো হতে পারে। যে ব্যাংক কার্ডটি দিয়েছে, সেখানে নিয়ে যান।`,
      en: `The machine could not read the card. It may be scratched or worn. Take it to the bank that issued it.`,
      vi: `Máy không đọc được thẻ. Thẻ có thể bị trầy hoặc đã cũ. Hãy mang thẻ đến ngân hàng phát hành thẻ.`,
      id: `Mesin tidak bisa membaca kartu. Kartu mungkin tergores atau aus. Bawa kartu ke bank penerbitnya.`,
      ne: `मेसिनले कार्ड पढ्न सकेन। कार्ड कोरिएको वा पुरानो हुन सक्छ। कार्ड जारी गर्ने बैंकमा लैजानुहोस्।`,
    }),
  },
  RESIDENCE_CARD: {
    code: "B-4", title: "在留期間による取引制限の可能性（新しい在留カードをカード発行銀行へ）",
    text: () => ({
      ja: `「この カードは つかえません」と でたら、在留カード（ざいりゅうカード）の きげんに ついての 銀行の きまり かもしれません。新しい 在留カードを、カードを 出した 銀行に もって いって ください。長崎県の 外国から 来た 人の そうだん まどぐちでも、22の ことばで きけます。`,
      bn: `এটিএম যদি বলে কার্ডটি ব্যবহার করা যাবে না, তা আপনার থাকার মেয়াদ নিয়ে ব্যাংকের নিয়ম হতে পারে। নতুন রেসিডেন্স কার্ড পেলে, যে ব্যাংক আপনার কার্ড দিয়েছে সেখানে নিয়ে যান। নাগাসাকি প্রিফেকচারের বিদেশি বাসিন্দা পরামর্শ কেন্দ্র ২২টি ভাষায় সাহায্য করে।`,
      en: `If the ATM says the card cannot be used, it may be the bank's rule about your residence period. When you get a new residence card, take it to the bank that issued your card. Nagasaki Prefecture's foreign residents' desk can help in 22 languages.`,
      vi: `Nếu ATM báo thẻ không dùng được, có thể do quy định của ngân hàng về thời hạn lưu trú. Khi có thẻ cư trú mới, hãy mang đến ngân hàng phát hành thẻ của bạn. Quầy tư vấn người nước ngoài của tỉnh Nagasaki hỗ trợ 22 ngôn ngữ.`,
      id: `Jika ATM menyatakan kartu tidak bisa dipakai, mungkin karena aturan bank tentang masa tinggal Anda. Setelah mendapat kartu izin tinggal (residence card) baru, bawa ke bank penerbit kartu Anda. Layanan konsultasi warga asing Prefektur Nagasaki membantu dalam 22 bahasa.`,
      ne: `एटीएमले कार्ड चल्दैन भन्यो भने, तपाईंको बसाइ अवधिबारे बैंकको नियम हुन सक्छ। नयाँ रेसिडेन्स कार्ड पाएपछि कार्ड जारी गर्ने बैंकमा लैजानुहोस्। नागासाकी प्रिफेक्चरको विदेशी बासिन्दा परामर्श केन्द्रले २२ भाषामा सहयोग गर्छ।`,
    }),
  },
  VISITOR_CARD: {
    code: "B-5", title: "海外発行カード・再来店できない方（発行元へ利用停止を依頼）",
    text: () => ({
      ja: "日本の そとで 作った カードの ときや、ここに もう 来られない ときは、カードを 作った 銀行や 会社に れんらくして、カードを とめて もらって ください。ここの 銀行は、カードを 銀行の きまりに そって あつかいます。",
      en: "If your card was issued outside Japan, or you cannot come back here, please contact your card issuer (the bank or card company that gave you the card) and ask them to block the card. The bank here handles the card under its own procedure.",
      bn: "আপনার কার্ড যদি জাপানের বাইরে ইস্যু করা হয়ে থাকে, অথবা আপনি আর এখানে ফিরে আসতে না পারেন, তাহলে যে ব্যাংক বা কার্ড কোম্পানি কার্ডটি দিয়েছে তাদের সাথে যোগাযোগ করে কার্ডটি বন্ধ (ব্লক) করতে বলুন। এখানকার ব্যাংক কার্ডটি নিজস্ব নিয়মে দেখবে।",
      vi: "Nếu thẻ của bạn được phát hành ở ngoài Nhật Bản, hoặc bạn không thể quay lại đây, hãy liên hệ với nơi phát hành thẻ (ngân hàng hoặc công ty thẻ đã cấp thẻ cho bạn) để yêu cầu khóa thẻ. Ngân hàng ở đây xử lý thẻ theo quy trình riêng của mình.",
      id: "Jika kartu Anda diterbitkan di luar Jepang, atau Anda tidak bisa kembali ke sini, hubungi penerbit kartu Anda (bank atau perusahaan kartu yang memberikan kartu itu) dan minta kartu diblokir. Bank di sini menangani kartu sesuai prosedurnya sendiri.",
      ne: "तपाईंको कार्ड जापानबाहिर जारी गरिएको हो, वा तपाईं यहाँ फेरि आउन सक्नुहुन्न भने, कार्ड जारी गर्ने बैंक वा कार्ड कम्पनीलाई सम्पर्क गरेर कार्ड बन्द (ब्लक) गर्न भन्नुहोस्। यहाँको बैंकले कार्डलाई आफ्नै प्रक्रियाअनुसार हेर्छ।",
    }),
  },
  CASH_DEBITED: {
    code: "C-1", title: "出金記録あり・現金なし（銀行が記録を確認し残高を訂正、明細を保管、待機不要）",
    text: (s) => ({
      ja: `お金が でないのに こうざの お金が へった ときは、銀行が しらべて なおします。ATM から でた 紙は すてないで ください。ここで まつ ひつようは ありません。${p(s.branch, "ja")} にも きく ことが できます。${p(s.hours, "ja")} きけます。`,
      bn: `টাকা কেটে নেওয়া হলেও নগদ বের না হলে, ব্যাংক দেখে ব্যালান্স ঠিক করে দেবে। কোনো রসিদ পেলে রেখে দিন। এখানে অপেক্ষা করার দরকার নেই। ${p(s.branch, "bn")}-এর কাছেও জানতে পারবেন (${p(s.hours, "bn")})।`,
      en: `If money left your account but no cash came out, the bank will check and fix your balance. Keep any slip. No need to wait here. You can also ask ${p(s.branch, "en")} (${p(s.hours, "en")}).`,
      vi: `Nếu tiền bị trừ mà máy không nhả tiền, ngân hàng sẽ kiểm tra và điều chỉnh số dư. Hãy giữ lại phiếu nếu có. Bạn không cần chờ ở đây. Bạn cũng có thể hỏi ${p(s.branch, "vi")} (${p(s.hours, "vi")}).`,
      id: `Jika saldo terpotong tetapi uang tidak keluar, bank akan memeriksa dan membetulkan saldo Anda. Simpan struk jika ada. Anda tidak perlu menunggu di sini. Anda juga bisa bertanya ke ${p(s.branch, "id")} (${p(s.hours, "id")}).`,
      ne: `खाताबाट पैसा काटियो तर नगद निस्किएन भने, बैंकले जाँचेर मौज्दात मिलाउँछ। रसिद भए राख्नुहोस्। यहाँ पर्खनु पर्दैन। ${p(s.branch, "ne")} मा पनि सोध्न सक्नुहुन्छ (${p(s.hours, "ne")})।`,
    }),
  },
  CASH_LEFT: {
    code: "C-2", title: "現金の取り忘れ（ATMが回収・銀行が記録を確認、待機不要）",
    text: () => ({
      ja: "お金を とらないで いると、ATM は お金を 中に もどします。銀行が ATM の 記録を しらべて、銀行の きまりに そって こうざの お金を なおします。ATM から でた 紙が あれば、すてないで ください。ここで まつ ひつようは ありません。",
      en: "When cash is left in the tray, the machine takes it back inside. The bank checks the machine's record and corrects your balance under its own procedure. Please keep the slip if the machine gave you one. You do not need to wait here.",
      bn: "নগদ টাকা ট্রেতে রেখে গেলে মেশিন টাকাটা ভেতরে টেনে নেয়। ব্যাংক মেশিনের রেকর্ড দেখে নিজস্ব নিয়মে আপনার ব্যালান্স ঠিক করবে। মেশিন কোনো রসিদ দিয়ে থাকলে সেটি রেখে দিন। এখানে অপেক্ষা করার দরকার নেই।",
      vi: "Nếu tiền bị để quên ở khay, máy sẽ thu tiền vào trong. Ngân hàng kiểm tra dữ liệu của máy và điều chỉnh số dư theo quy trình riêng. Nếu máy có in phiếu, hãy giữ lại. Bạn không cần chờ ở đây.",
      id: "Jika uang tunai tertinggal, mesin menariknya kembali ke dalam. Bank memeriksa catatan mesin dan membetulkan saldo Anda sesuai prosedurnya sendiri. Jika mesin mengeluarkan struk, simpanlah. Anda tidak perlu menunggu di sini.",
      ne: "नगद ट्रेमै छोडियो भने मेसिनले पैसा भित्र तान्छ। बैंकले मेसिनको रेकर्ड जाँचेर आफ्नै प्रक्रियाअनुसार तपाईंको मौज्दात मिलाउँछ। मेसिनले रसिद दिएको भए त्यसलाई राख्नुहोस्। यहाँ पर्खनु पर्दैन।",
    }),
  },
  CASH_IN_JAM: {
    code: "C-3", title: "入金時の紙幣詰まり（銀行が現金と記録を確認、待つ／帰るを選択）", offersChoice: true,
    text: () => ({
      ja: "入れた お金は ATM の 中に あります。銀行が お金と 記録を しらべて、こうざの お金を なおします。ATM から でた 紙が あれば、すてないで ください。ここで まっても、かえっても いいです。あとで この 画面で おしらせを みて ください。",
      en: "The cash you put in is inside the machine. The bank counts it, checks the record and corrects your balance. Please keep the slip if the machine gave you one. You can wait here, or you can leave. Check this case here for updates.",
      bn: "আপনি যে টাকা জমা দিয়েছেন তা মেশিনের ভেতরে আছে। ব্যাংক টাকা গুনে, রেকর্ড দেখে আপনার ব্যালান্স ঠিক করবে। মেশিন কোনো রসিদ দিয়ে থাকলে সেটি রেখে দিন। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। নতুন খবরের জন্য এই কেসটি এখানে দেখুন।",
      vi: "Số tiền bạn nạp vào đang ở trong máy. Ngân hàng sẽ đếm tiền, kiểm tra dữ liệu và điều chỉnh số dư cho bạn. Nếu máy có in phiếu, hãy giữ lại. Bạn có thể chờ ở đây, hoặc có thể ra về. Hãy xem lại hồ sơ tại đây để biết tin mới.",
      id: "Uang yang Anda setor ada di dalam mesin. Bank menghitungnya, memeriksa catatan, dan membetulkan saldo Anda. Jika mesin mengeluarkan struk, simpanlah. Anda bisa menunggu di sini, atau Anda bisa pulang. Periksa kasus ini di sini untuk kabar terbaru.",
      ne: "तपाईंले हालेको पैसा मेसिनभित्र छ। बैंकले पैसा गनेर, रेकर्ड जाँचेर तपाईंको मौज्दात मिलाउँछ। मेसिनले रसिद दिएको भए त्यसलाई राख्नुहोस्। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। नयाँ जानकारीका लागि यहीँ केस हेर्नुहोस्।",
    }),
  },
  LIMIT_REFUSED: {
    code: "C-4", title: "限度額による取引不可（障害ではない・カード発行銀行へ）",
    text: () => ({
      ja: `銀行が きめた 上限で とりひきが とまりました。こわれた のでは ありません。カードを 出した 銀行に きいて ください。`,
      bn: `ব্যাংকের সীমার (যেমন দৈনিক সীমা) কারণে লেনদেন থেমেছে। এটি ত্রুটি নয়। যে ব্যাংক আপনার কার্ড দিয়েছে, তাদের জিজ্ঞেস করুন।`,
      en: `A bank limit (such as the daily limit) stopped this transaction. It is not broken. Ask the bank that issued your card.`,
      vi: `Giao dịch dừng do hạn mức của ngân hàng (ví dụ hạn mức trong ngày). Máy không hỏng. Hãy hỏi ngân hàng phát hành thẻ.`,
      id: `Transaksi berhenti karena batas dari bank (misalnya batas harian). Mesin tidak rusak. Tanyakan ke bank penerbit kartu Anda.`,
      ne: `बैंकको सीमा (जस्तै दैनिक सीमा) का कारण कारोबार रोकियो। मेसिन बिग्रेको होइन। कार्ड जारी गर्ने बैंकलाई सोध्नुहोस्।`,
    }),
  },
  PASSBOOK_HELD: {
    code: "D-1", title: "機械障害により通帳を保管中（待つ／帰るを選択）", offersChoice: true,
    text: (s) => ({
      ja: `通帳は ATM の 中に あります。ここで まっても、かえっても いいです。おしらせは この 画面に でます。${p(s.branch, "ja")} にも きく ことが できます。${p(s.hours, "ja")} きけます。`,
      bn: `আপনার পাসবই মেশিনের ভেতরে আছে। এখানে অপেক্ষা করতে পারেন, বা চলে যেতে পারেন। খবর এখানেই দেখাবে। ${p(s.branch, "bn")}-এর কাছেও জানতে পারবেন (${p(s.hours, "bn")})।`,
      en: `Your passbook is inside the machine. You can wait here or leave. Updates will show here. You can also ask ${p(s.branch, "en")} (${p(s.hours, "en")}).`,
      vi: `Sổ tài khoản của bạn đang ở trong máy. Bạn có thể chờ ở đây hoặc ra về. Tin mới sẽ hiện ở đây. Bạn cũng có thể hỏi ${p(s.branch, "vi")} (${p(s.hours, "vi")}).`,
      id: `Buku tabungan Anda ada di dalam mesin. Anda bisa menunggu di sini atau pulang. Kabar terbaru akan muncul di sini. Anda juga bisa bertanya ke ${p(s.branch, "id")} (${p(s.hours, "id")}).`,
      ne: `तपाईंको पासबुक मेसिनभित्र छ। यहीँ पर्खन वा जान सक्नुहुन्छ। नयाँ जानकारी यहीँ देखिन्छ। ${p(s.branch, "ne")} मा पनि सोध्न सक्नुहुन्छ (${p(s.hours, "ne")})।`,
    }),
  },
  ...PACK_REPLIES,
};

// Which pack, situations (fault types) and caller statements each reply needs. The SQL trigger on public.reply
// enforces exactly this (ichido.reply_rule); an intent without a rule is never sent, and no reply crosses packs.
// pack defaults to the ATM; no faults = any situation of the pack. A forgotten or deliberately kept card can never
// get the "card is inside, you can wait" reply, whatever the machine alert said.
const CARD = ["card_retained", "card_forgotten", "card_kept", "card_unreadable"];
type Rule = { autonomous?: boolean; pack?: PackId; faults?: string[]; needsFlags?: string[]; blockedBy?: string[] };
export const REPLY_RULES: Record<string, Rule> = {
  HANDSET: {},
  OFFICIAL_CHANNEL: {},
  HELD_WAIT_OR_LEAVE: { faults: ["card_retained"], blockedBy: ["forgot_card", "card_kept_msg"] },
  CARD_FORGOTTEN: { faults: ["card_forgotten"] },
  CARD_KEPT_RULE: { faults: ["card_kept"] },
  CARD_UNREADABLE: { faults: ["card_unreadable"] },
  RESIDENCE_CARD: { faults: CARD, needsFlags: ["card_cant_use"] },
  VISITOR_CARD: { faults: CARD, needsFlags: ["foreign_card", "leaving_japan"] },
  CASH_DEBITED: { faults: ["debited_no_cash"] },
  CASH_LEFT: { faults: ["cash_left"] },
  CASH_IN_JAM: { faults: ["cash_jam"], needsFlags: ["cash_in_stuck"] },
  LIMIT_REFUSED: { faults: ["limit_refused"] },
  PASSBOOK_HELD: { faults: ["passbook_stuck"], needsFlags: ["passbook_inside"] },
  ...PACK_RULES,
};

export type ReplyCtx = { fault: string; flags: readonly string[]; confirmed: boolean; card_back: Fact; remote_release: string | null };
export type ReplyBlock = "awaiting" | "held" | "fault" | "flag";
// Why a reply cannot be sent now (null = it can). needsHeld comes from the reply in catalogue.ts.
export function replyBlock(intent: string, needsHeld: boolean | undefined, c: ReplyCtx): ReplyBlock | null {
  if (!c.confirmed) return "awaiting";
  if (needsHeld && (c.card_back !== "no" || c.remote_release === "released")) return "held";
  const r = Object.hasOwn(REPLY_RULES, intent) ? REPLY_RULES[intent] : null;
  if (!r || (r.pack ?? "atm") !== packOfFault(c.fault)) return "fault";
  if (r.faults && !r.faults.includes(c.fault)) return "fault";
  if (r.needsFlags && !r.needsFlags.some((f) => c.flags.includes(f))) return "flag";
  if (r.blockedBy?.some((f) => c.flags.includes(f))) return "flag";
  return null;
}

// The bank's follow-up status, set by an operator on the bank's behalf; the caller sees it in their language.
// contact_by carries a date. None of these mention collecting a card: the bank's procedure decides that.
// label: the operator's picker; staff: the record (with the date filled in).
type BankStatus = { label: string; staff: (due: string) => string; caller: (due: string, lang: Lang) => string; due?: boolean };
const LOCALE: L10n = { ja: "ja-JP", bn: "bn-BD", vi: "vi-VN", id: "id-ID", ne: "ne-NP", en: "en-US" };   // same as LANG_LOCALE
const dueText = (due: string, lang: Lang) =>
  new Date(`${due}T00:00:00+09:00`).toLocaleDateString(LOCALE[lang], { month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
export const BANK_STATUS: Record<string, BankStatus> = {
  received: {
    label: "受付済み", staff: () => "受付済み",
    caller: (_, l) => ({ ja: "銀行が あなたの そうだんを うけつけました。", en: "The bank has received your case.", bn: "ব্যাংক আপনার কেসটি গ্রহণ করেছে।", vi: "Ngân hàng đã tiếp nhận hồ sơ của bạn.", id: "Bank sudah menerima kasus Anda.", ne: "बैंकले तपाईंको केस प्राप्त गर्‍यो।" })[l],
  },
  record_checked: {
    label: "取引記録を確認済み", staff: () => "取引記録を確認済み",
    caller: (_, l) => ({ ja: "銀行が ATM の 記録を しらべました。", en: "The bank has checked the machine's record.", bn: "ব্যাংক মেশিনের রেকর্ড দেখেছে।", vi: "Ngân hàng đã kiểm tra dữ liệu của máy.", id: "Bank sudah memeriksa catatan mesin.", ne: "बैंकले मेसिनको रेकर्ड जाँच्यो।" })[l],
  },
  contact_by: {
    due: true, label: "期日までにご連絡予定（日付を指定）",
    staff: (due) => `${dueText(due, "ja")}までにご連絡予定`,
    caller: (due, l) => {
      const d = dueText(due, l);
      return ({ ja: `銀行から ${d}までに れんらくします。`, en: `The bank will contact you by ${d}.`, bn: `ব্যাংক ${d}-এর মধ্যে আপনার সঙ্গে যোগাযোগ করবে।`, vi: `Ngân hàng sẽ liên lạc với bạn trước ngày ${d}.`, id: `Bank akan menghubungi Anda paling lambat ${d}.`, ne: `बैंकले ${d} भित्र तपाईंलाई सम्पर्क गर्नेछ।` })[l];
    },
  },
  contacted: {
    label: "ご本人に連絡済み", staff: () => "ご本人に連絡済み",
    caller: (_, l) => ({ ja: "銀行から あなたに れんらくしました。", en: "The bank has contacted you.", bn: "ব্যাংক আপনার সাথে যোগাযোগ করেছে।", vi: "Ngân hàng đã liên lạc với bạn.", id: "Bank sudah menghubungi Anda.", ne: "बैंकले तपाईंलाई सम्पर्क गर्‍यो।" })[l],
  },
  completed: {
    label: "銀行の手続き完了", staff: () => "銀行の手続き完了",
    caller: (_, l) => ({ ja: "銀行の 手つづきは おわりました。", en: "The bank has finished its procedure for this case.", bn: "এই কেসের জন্য ব্যাংক তার প্রক্রিয়া শেষ করেছে।", vi: "Ngân hàng đã hoàn tất thủ tục cho hồ sơ này.", id: "Bank sudah menyelesaikan prosedurnya untuk kasus ini.", ne: "यस केसका लागि बैंकले आफ्नो प्रक्रिया पूरा गर्‍यो।" })[l],
  },
};
export const isBankStatus = (k: unknown): k is string => typeof k === "string" && Object.hasOwn(BANK_STATUS, k);
export const bankStatusText = (code: string, due: string | null, lang: Lang) => (isBankStatus(code) ? BANK_STATUS[code].caller(due ?? "", lang) : "");
export const bankStatusStaff = (code: string, due: string | null) => (isBankStatus(code) ? BANK_STATUS[code].staff(due ?? "") : code);

// Caller screens: flags, elderly-friendly settings, the bank's status and the follow-up page.
export const FAULT_UI = {
  flagsTitle: { ja: "あてはまる ものを おして ください", en: "Tap anything that is true", bn: "যেগুলো সত্যি, সেগুলোতে চাপুন", vi: "Chạm vào những điều đúng với bạn", id: "Ketuk yang sesuai dengan keadaan Anda", ne: "जुन कुरा साँचो हो, त्यसमा थिच्नुहोस्" },
  largeText: { ja: "字を 大きく する", en: "Large text", bn: "বড় লেখা", vi: "Chữ lớn", id: "Huruf besar", ne: "ठूलो अक्षर" },
  slowVoice: { ja: "ゆっくり よむ", en: "Read aloud slowly", bn: "ধীরে পড়ে শোনান", vi: "Đọc chậm", id: "Bacakan pelan-pelan", ne: "बिस्तारै पढेर सुनाउनुहोस्" },
  bankTitle: { ja: "銀行からの おしらせ", en: "From the bank", bn: "ব্যাংকের কাছ থেকে", vi: "Thông báo từ ngân hàng", id: "Kabar dari bank", ne: "बैंकबाट" },
  bankNone: {
    ja: "銀行からの おしらせは まだ ありません。この 画面は あとで また 見られます。", en: "The bank has not posted an update yet. You can come back to this page later.",
    bn: "ব্যাংক এখনও কোনো খবর দেয়নি। আপনি পরে আবার এই পাতাটি দেখতে পারবেন।", vi: "Ngân hàng chưa có thông báo mới. Bạn có thể mở lại trang này sau.",
    id: "Bank belum memberi kabar terbaru. Anda bisa membuka halaman ini lagi nanti.", ne: "बैंकले अहिलेसम्म कुनै जानकारी दिएको छैन। तपाईं पछि फेरि यो पेज हेर्न सक्नुहुन्छ।",
  },
  followTitle: { ja: "あなたの そうだん", en: "Your case", bn: "আপনার কেস", vi: "Hồ sơ của bạn", id: "Kasus Anda", ne: "तपाईंको केस" },
  followLead: {
    ja: "ATM での そうだんは おわりました。銀行からの おしらせは ここに でます。そうだんの 番号を のこして おいて ください。", en: "Your help at the machine has finished. The bank's updates appear here. Please keep the case number.",
    bn: "মেশিনে সাহায্য শেষ হয়েছে। ব্যাংকের খবর এখানে দেখা যাবে। কেস নম্বরটি রেখে দিন।", vi: "Việc hỗ trợ tại máy đã xong. Thông báo của ngân hàng sẽ hiện ở đây. Hãy giữ lại mã hồ sơ.",
    id: "Bantuan di mesin sudah selesai. Kabar dari bank akan muncul di sini. Simpan nomor kasus Anda.", ne: "मेसिनमा सहयोग सकियो। बैंकका जानकारी यहाँ देखिनेछन्। केस नम्बर राख्नुहोस्।",
  },
  lastReply: { ja: "係の 人が つたえた こと", en: "What you were told", bn: "আপনাকে যা জানানো হয়েছে", vi: "Nội dung đã được thông báo", id: "Yang sudah disampaikan", ne: "तपाईंलाई भनिएको कुरा" },
} satisfies Record<string, L10n>;

// Operator console (formal Japanese).
export const FAULT_DESK = {
  title: "障害の種類",
  note: "機械の通知とお客様の申告が合わない場合は種類を変更します。送信済みの返答が新しい種類に合わない場合、お客様の画面から取り下げられます。",
  change: "種類を変更",
  suggests: (name: string) => `お客様の申告からの候補：${name}`,
  flags: "お客様の申告（選択肢）",
  flagsNone: "まだありません",
  helper: "ご家族が補助中",
  amount: "本人申告額",
  amountNote: "お客様が受話器で述べた金額を担当者が入力します。お客様の端末からは入力できず、お客様の画面にも表示されません。",
  amountPlaceholder: "金額（円）",
  amountSave: "記録",
  amountClear: "消去",
  yen: (n: number) => `${n.toLocaleString("ja-JP")}円（本人申告）`,
  bank: "銀行の対応状況",
  bankNote: "銀行から受けた連絡を、銀行に代わって記録します。お客様の画面にお客様の言語で表示されます（案件終了後も表示）。",
  bankDue: "連絡予定日",
  bankSave: "記録",
  bankNone: "未記録",
  blocked: { work: "担当者の依頼・受諾・移動状況がこの案内の条件を満たしていません。", fault: "この障害の種類では送れない返答です", flag: "お客様の申告がこの返答の条件に合いません" } as Record<string, string>,
};

// Timeline sentences for the events this file adds (catalogue.ts eventText falls through to here).
const nameOf = (f: string | undefined) => (f && FAULT_STAFF[f]) || (f === "card_retained" ? "取引後にカードが排出されない" : f ?? "—");
export function faultEventText(kind: string, d: Record<string, string | undefined>): string | null {
  switch (kind) {
    case "fault_changed": return `障害の種類を変更：${nameOf(d.from)} → ${nameOf(d.to)}`;
    case "flag": return `お客様の申告：${CALLER_FLAGS[d.flag ?? ""]?.staff ?? d.flag}${String(d.on) === "false" ? "（取り消し）" : ""}`;
    case "stated_amount": return d.amount ? `本人申告額を記録：${FAULT_DESK.yen(Number(d.amount))}` : "本人申告額を消去";
    case "bank_status": return `銀行の対応状況を記録：${bankStatusStaff(d.status ?? "", d.due ?? null)}`;
    case "reply_withdrawn": return "送信済みの返答を取り下げ（障害の種類またはお客様の申告と合わなくなったため）";
    default: return null;
  }
}
