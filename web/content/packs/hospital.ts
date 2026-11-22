// Hospital pack: a Help Point at outpatient reception (外来受付). The assistant never diagnoses: it captures who, where,
// since when and how much it hurts as taps, and routes to a nurse or a medical interpreter. Red-flag taps allow only the
// "tell the staff now / call 119" reply (packs/hospital-replies.ts; enforced in SQL).
// Sourced needs (docs/research): at hospital, 24.5% of foreign residents brought a Japanese-speaking relative and 18.9%
// used a translation app (ISA 基礎調査 R7); calling 119 was the task most wanted in Japanese (94.3%), and 43.4% could not
// do it (NINJAL); Daishin Giken builds DS KARTE and DS Annai patient guidance boards.
import type { Pack, Tap } from "./types.ts";
import { NO_MEDICAL, SHARED_TAPS } from "./common.ts";
import { HOSPITAL_REPLIES, RED_HOSPITAL } from "./hospital-replies.ts";

const taps: Record<string, Tap> = {
  red_chest: { group: "urgent", urgent: true, staff: "胸痛・胸部圧迫感（至急）", label: { ja: "むねが いたい・くるしい", en: "Chest pain or pressure", bn: "বুকে ব্যথা বা চাপ", vi: "Đau hoặc tức ngực", id: "Nyeri atau sesak di dada", ne: "छाती दुख्ने वा थिचिएजस्तो हुने" } },
  red_breath: { group: "urgent", urgent: true, staff: "呼吸困難（至急）", label: { ja: "いきが くるしい", en: "Hard to breathe", bn: "শ্বাস নিতে কষ্ট হচ্ছে", vi: "Khó thở", id: "Sulit bernapas", ne: "सास फेर्न गाह्रो" } },
  red_bleed: { group: "urgent", urgent: true, staff: "多量の出血（至急）", label: { ja: "血が たくさん でて いる", en: "Heavy bleeding", bn: "অনেক রক্ত পড়ছে", vi: "Chảy máu nhiều", id: "Pendarahan hebat", ne: "धेरै रगत बगिरहेको" } },
  red_faint: { group: "urgent", urgent: true, staff: "失神・意識障害の疑い（至急）", label: { ja: "たおれた・いしきが ぼんやり する", en: "Fainted, or about to faint", bn: "অজ্ঞান হয়ে গেছে বা হয়ে যাচ্ছে", vi: "Ngất hoặc sắp ngất", id: "Pingsan atau hampir pingsan", ne: "बेहोस भयो वा हुन लागेको" } },
  red_stroke: { group: "urgent", urgent: true, staff: "顔面・手足の麻痺、言葉が出ない（至急）", label: { ja: "かおや 手足が うごかない・ことばが でない", en: "Face, arm or leg won't move, or can't speak", bn: "মুখ, হাত বা পা নড়ছে না, বা কথা বলতে পারছে না", vi: "Mặt, tay hoặc chân không cử động được, hoặc không nói được", id: "Wajah, lengan atau kaki tidak bisa digerakkan, atau tidak bisa bicara", ne: "अनुहार, हात वा खुट्टा चल्दैन, वा बोल्न सक्दैन" } },

  need_first_visit: { group: "need", suggests: "hosp_first_visit", staff: "初診とのこと", label: { ja: "はじめて この 病院に 来ました", en: "This is my first time at this hospital", bn: "এই হাসপাতালে আমি প্রথমবার এসেছি", vi: "Đây là lần đầu tôi đến bệnh viện này", id: "Ini pertama kali saya ke rumah sakit ini", ne: "म यो अस्पतालमा पहिलो पटक आएको हुँ" } },
  need_where: { group: "need", suggests: "hosp_department", staff: "行き先・診療科が分からないとのこと", label: { ja: "どこに いけば いいか わかりません", en: "I don't know where to go", bn: "কোথায় যেতে হবে জানি না", vi: "Tôi không biết phải đi đâu", id: "Saya tidak tahu harus ke mana", ne: "कहाँ जानुपर्छ थाहा छैन" } },
  need_explain: { group: "need", suggests: "hosp_symptoms", staff: "症状を日本語で説明できないとのこと", label: { ja: "ぐあいを 日本語で いえません", en: "I can't explain how I feel in Japanese", bn: "জাপানি ভাষায় আমার অসুস্থতার কথা বলতে পারছি না", vi: "Tôi không nói được triệu chứng bằng tiếng Nhật", id: "Saya tidak bisa menjelaskan keluhan dalam bahasa Jepang", ne: "जापानी भाषामा आफ्नो बिरामीबारे भन्न सक्दिनँ" } },
  need_pay: { group: "need", suggests: "hosp_payment", staff: "支払い・保険が分からないとのこと", label: { ja: "はらいかたや 保険が わかりません", en: "I don't understand payment or insurance", bn: "টাকা দেওয়া বা বিমার ব্যাপার বুঝতে পারছি না", vi: "Tôi không hiểu cách thanh toán hoặc bảo hiểm", id: "Saya tidak paham pembayaran atau asuransi", ne: "भुक्तानी वा बीमा बुझिनँ" } },

  who_me: { group: "who", staff: "受診者：本人", label: { ja: "じぶん", en: "Me", bn: "আমি নিজে", vi: "Tôi", id: "Saya sendiri", ne: "म आफैं" } },
  who_child: { group: "who", staff: "受診者：子ども", label: { ja: "こども", en: "My child", bn: "আমার সন্তান", vi: "Con tôi", id: "Anak saya", ne: "मेरो बच्चा" } },
  who_family: { group: "who", staff: "受診者：家族", label: { ja: "ほかの かぞく", en: "Another family member", bn: "পরিবারের অন্য কেউ", vi: "Người nhà khác", id: "Anggota keluarga lain", ne: "परिवारको अर्को सदस्य" } },
  where_head: { group: "where", staff: "部位：頭部", label: { ja: "あたま", en: "Head", bn: "মাথা", vi: "Đầu", id: "Kepala", ne: "टाउको" } },
  where_belly: { group: "where", staff: "部位：腹部", label: { ja: "おなか", en: "Belly", bn: "পেট", vi: "Bụng", id: "Perut", ne: "पेट" } },
  where_throat: { group: "where", staff: "部位：のど・咳", label: { ja: "のど・せき", en: "Throat or cough", bn: "গলা বা কাশি", vi: "Họng hoặc ho", id: "Tenggorokan atau batuk", ne: "घाँटी वा खोकी" } },
  where_body: { group: "where", staff: "部位：背部・四肢", label: { ja: "せなか・うで・あし", en: "Back, arms or legs", bn: "পিঠ, হাত বা পা", vi: "Lưng, tay hoặc chân", id: "Punggung, lengan atau kaki", ne: "ढाड, हात वा खुट्टा" } },
  where_skin: { group: "where", staff: "部位：皮膚（かゆみ・発疹）", label: { ja: "ひふ（かゆい・ぶつぶつ）", en: "Skin (itch or rash)", bn: "ত্বক (চুলকানি বা ফুসকুড়ি)", vi: "Da (ngứa hoặc phát ban)", id: "Kulit (gatal atau ruam)", ne: "छाला (चिलाउने वा बिमिरा)" } },
  since_today: { group: "since", staff: "発症：本日", label: { ja: "きょうから", en: "Since today", bn: "আজ থেকে", vi: "Từ hôm nay", id: "Sejak hari ini", ne: "आजदेखि" } },
  since_days: { group: "since", staff: "発症：2〜3日前", label: { ja: "2、3日 まえから", en: "2–3 days", bn: "২–৩ দিন ধরে", vi: "Khoảng 2–3 ngày", id: "Sekitar 2–3 hari", ne: "२–३ दिनदेखि" } },
  since_week: { group: "since", staff: "発症：1週間以上前", label: { ja: "1しゅうかん いじょう まえから", en: "A week or more", bn: "এক সপ্তাহ বা তার বেশি", vi: "Một tuần trở lên", id: "Seminggu atau lebih", ne: "एक हप्ता वा बढीदेखि" } },
  pain_none: { group: "pain", staff: "痛み：なし", label: { ja: "いたくない", en: "No pain", bn: "ব্যথা নেই", vi: "Không đau", id: "Tidak sakit", ne: "दुख्दैन" } },
  pain_mild: { group: "pain", staff: "痛み：軽度", label: { ja: "すこし いたい", en: "A little", bn: "একটু ব্যথা", vi: "Đau một chút", id: "Sedikit sakit", ne: "अलिकति दुख्छ" } },
  pain_strong: { group: "pain", staff: "痛み：強い", label: { ja: "とても いたい", en: "A lot", bn: "খুব ব্যথা", vi: "Rất đau", id: "Sangat sakit", ne: "धेरै दुख्छ" } },
  pain_worst: { group: "pain", staff: "痛み：耐えられない", label: { ja: "がまん できない ほど いたい", en: "Worse than I can bear", bn: "সহ্য করা যায় না এমন ব্যথা", vi: "Đau không chịu nổi", id: "Sakit sekali, tidak tertahankan", ne: "सहनै नसकिने गरी दुख्छ" } },

  has_referral: { staff: "紹介状ありとのこと", label: { ja: "ほかの 病院からの 手紙が あります", en: "I have a letter from another doctor (referral)", bn: "অন্য ডাক্তারের চিঠি (রেফারেল) আছে", vi: "Tôi có giấy giới thiệu của bác sĩ khác", id: "Saya membawa surat rujukan dari dokter lain", ne: "मसँग अर्को डाक्टरको सिफारिस पत्र छ" } },
  ins_not_with_me: { staff: "保険証を持参していないとのこと", label: { ja: "きょうは 保険証を もって いません", en: "I don't have my health insurance card with me today", bn: "আজ আমার স্বাস্থ্যবিমা কার্ড সঙ্গে নেই", vi: "Hôm nay tôi không mang thẻ bảo hiểm y tế", id: "Hari ini saya tidak membawa kartu asuransi kesehatan", ne: "आज मसँग स्वास्थ्य बीमा कार्ड छैन" } },
  ins_none: { staff: "日本の公的医療保険に未加入とのこと", label: { ja: "日本の けんこう保険に はいって いません", en: "I'm not in Japanese health insurance", bn: "আমি জাপানের স্বাস্থ্যবিমায় নেই", vi: "Tôi không có bảo hiểm y tế của Nhật", id: "Saya tidak punya asuransi kesehatan Jepang", ne: "म जापानको स्वास्थ्य बीमामा छैन" } },
  ...SHARED_TAPS,
};

const SYMPTOMS = ["who_me", "who_child", "who_family", "where_head", "where_belly", "where_throat", "where_body", "where_skin", "since_today", "since_days", "since_week", "pain_none", "pain_mild", "pain_strong", "pain_worst"];
const INSURANCE = ["ins_not_with_me", "ins_none"];

export const HOSPITAL: Pack = {
  id: "hospital", kinds: ["hospital"], name: { staff: "病院", en: "Hospital" }, place: "受付 Help Point",
  responder: {
    staff: "看護師・医療事務",
    caller: { ja: "かんごしか びょういんの 係の 人", en: "a nurse or hospital clerk", bn: "একজন নার্স বা হাসপাতাল কর্মী", vi: "y tá hoặc nhân viên bệnh viện", id: "perawat atau petugas rumah sakit", ne: "नर्स वा अस्पताल कर्मचारी" },
  },
  recipients: { department: "診療科", medical_interpreter: "医療通訳" },
  why: "24.5% of foreign residents bring a Japanese-speaking relative to hospital; 43% cannot call 119 in Japanese (ISA 2025, NINJAL).",
  device: "hosp_first_visit",
  situations: {
    hosp_first_visit: { staff: "初診（受付方法が分からない）", name: { ja: "はじめて この 病院に 来た。うけつけの しかたが わからない", en: "First visit: I don't know how to register", bn: "প্রথমবার এসেছি: কীভাবে নাম লেখাতে হয় জানি না", vi: "Lần đầu đến khám: không biết cách đăng ký", id: "Kunjungan pertama: tidak tahu cara mendaftar", ne: "पहिलो पटक आएँ: दर्ता कसरी गर्ने थाहा छैन" } },
    hosp_department: { staff: "受診する診療科・行き先が分からない", name: { ja: "どこに いけば いいか、どの 科か わからない", en: "I don't know where to go or which department", bn: "কোথায় বা কোন বিভাগে যাব জানি না", vi: "Không biết phải đi đâu hay khám khoa nào", id: "Tidak tahu harus ke mana atau ke bagian apa", ne: "कहाँ वा कुन विभागमा जाने थाहा छैन" } },
    hosp_symptoms: { staff: "症状を日本語で説明できない", name: { ja: "からだの ぐあいを 日本語で せつめい できない", en: "I can't explain my symptoms in Japanese", bn: "জাপানি ভাষায় অসুস্থতার কথা বোঝাতে পারছি না", vi: "Không giải thích được triệu chứng bằng tiếng Nhật", id: "Tidak bisa menjelaskan keluhan dalam bahasa Jepang", ne: "जापानी भाषामा बिरामीबारे भन्न सक्दिनँ" } },
    hosp_payment: { staff: "支払い・保険の手続きが分からない", name: { ja: "お金の はらいかたや 保険が わからない", en: "I don't understand payment or health insurance", bn: "টাকা দেওয়া বা স্বাস্থ্যবিমার নিয়ম বুঝতে পারছি না", vi: "Không hiểu về thanh toán hoặc bảo hiểm y tế", id: "Tidak paham soal pembayaran atau asuransi kesehatan", ne: "भुक्तानी वा स्वास्थ्य बीमाबारे बुझिनँ" } },
  },
  taps,
  common: [...RED_HOSPITAL, "need_first_visit", "need_where", "need_explain", "need_pay", "need_interpreter", "helper"],
  bySituation: {
    hosp_first_visit: ["has_referral", ...INSURANCE],
    hosp_department: SYMPTOMS.filter((t) => !t.startsWith("pain_")),
    hosp_symptoms: SYMPTOMS,
    hosp_payment: INSURANCE,
  },
  replies: HOSPITAL_REPLIES,
  scope: NO_MEDICAL,
  hint: {
    ja: "いそぐ ときは うけつけの 人に つたえて ください。", en: "If it is urgent, tell the reception staff.", bn: "জরুরি হলে রিসেপশনের কর্মীকে জানান।",
    vi: "Nếu gấp, hãy báo cho nhân viên quầy tiếp nhận.", id: "Jika mendesak, beri tahu petugas pendaftaran.", ne: "जरुरी भए रिसेप्सनका कर्मचारीलाई भन्नुहोस्।",
  },
};
