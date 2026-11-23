import type { L10n } from "./catalogue.ts";

// All non-English wording awaits native review. The pilot's only informational answer is in the shelter pack.
export const FRONTLINE = {
  greeting: {
    en: "Hello, I’m Ichido’s AI assistant. What do you need?",
    ja: "こんにちは。わたしは 一度の AIです。なにに こまっていますか？",
    bn: "নমস্কার, আমি ইচিদোর এআই সহকারী। আপনার কী সাহায্য দরকার?",
    ne: "नमस्ते, म इचिदोको एआई सहायक हुँ। तपाईंलाई कस्तो सहयोग चाहिन्छ?",
    vi: "Xin chào, tôi là trợ lý AI của Ichido. Bạn cần giúp gì?",
    id: "Halo, saya asisten AI Ichido. Anda perlu bantuan apa?",
  },
  disclosure: {
    en: "Authorized operators can read messages you send. They cannot see what you are still typing. You can ask for a person at any time.",
    ja: "おくった 文は 係の 人が よめます。まだ おくって いない 文は みえません。いつでも 人と はなせます。",
    bn: "আপনি পাঠালে অনুমোদিত কর্মীরা বার্তাটি পড়তে পারবেন। লেখার সময় তাঁরা তা দেখেন না। যেকোনো সময় একজন মানুষের সাহায্য চাইতে পারেন।",
    vi: "Nhân viên có quyền có thể đọc tin nhắn bạn đã gửi. Họ không thấy phần bạn đang gõ. Bạn có thể yêu cầu gặp nhân viên bất cứ lúc nào.",
    id: "Petugas yang berwenang dapat membaca pesan yang Anda kirim. Mereka tidak melihat tulisan yang belum dikirim. Anda bisa meminta petugas kapan saja.",
    ne: "तपाईंले पठाएका सन्देश अधिकृत कर्मचारीले पढ्न सक्छन्। टाइप गर्दै गरेको कुरा उनीहरूले देख्दैनन्। जुनसुकै बेला कर्मचारीसँग कुरा गर्न सक्नुहुन्छ।",
  },
  start: { en: "Continue with AI", ja: "AIと つづける", bn: "এআইয়ের সঙ্গে চালিয়ে যান", vi: "Tiếp tục với AI", id: "Lanjut dengan AI", ne: "एआईसँग जारी राख्नुहोस्" },
  readback: { en: "Is this what you meant? You can change it.", ja: "これで あっていますか？ なおせます。", bn: "আপনি কি এটাই বোঝাতে চেয়েছেন? বদলাতে পারেন।", vi: "Đây có đúng ý bạn không? Bạn có thể sửa.", id: "Apakah ini maksud Anda? Anda bisa mengubahnya.", ne: "तपाईंले भन्न खोजेको यही हो? सच्याउन सक्नुहुन्छ।" },
  queued: {
    en: "I’ve asked a person to join. They can see what you’ve already sent.",
    ja: "係の 人に つなぐよう たのみました。係の 人は あなたが おくった 文を よめます。",
    bn: "একজন কর্মীকে যোগ দিতে বলা হয়েছে। আপনি যা পাঠিয়েছেন তিনি তা দেখতে পারবেন।",
    vi: "Tôi đã yêu cầu nhân viên tham gia. Họ có thể đọc những gì bạn đã gửi.",
    id: "Saya telah meminta petugas untuk bergabung. Mereka bisa membaca pesan yang sudah Anda kirim.",
    ne: "मैले कर्मचारीलाई जोडिन अनुरोध गरेको छु। तपाईंले पठाएका सन्देश उहाँले पढ्न सक्नुहुन्छ।",
  },
  connected: { en: "An operator has joined your case.", ja: "係の 人が つながりました。", bn: "একজন কর্মী আপনার কেসে যুক্ত হয়েছেন।", vi: "Một nhân viên đã tham gia hỗ trợ bạn.", id: "Petugas sudah bergabung.", ne: "एक जना कर्मचारी तपाईंको केसमा जोडिनुभएको छ।" },
  fallback: { en: "I need a person’s help with this.", ja: "これは 係の 人に ききます。", bn: "এ বিষয়ে একজন কর্মীর সাহায্য দরকার।", vi: "Việc này cần nhân viên hỗ trợ.", id: "Saya perlu bantuan petugas untuk ini.", ne: "यसका लागि कर्मचारीको सहायता चाहिन्छ।" },
  inPerson: { en: "Show this screen to a staff member or scan the Help Point sticker to request help by text.", ja: "この 画面を 係の 人に みせて ください。たすけを よぶ シールを よむと、文字でも たのめます。", bn: "কর্মীকে এই স্ক্রিন দেখান বা লিখে সাহায্য চাইতে হেল্প পয়েন্টের স্টিকার স্ক্যান করুন।", vi: "Hãy cho nhân viên xem màn hình này hoặc quét nhãn Help Point để yêu cầu hỗ trợ bằng chữ.", id: "Tunjukkan layar ini kepada petugas atau pindai stiker Help Point untuk meminta bantuan lewat teks.", ne: "कर्मचारीलाई यो स्क्रिन देखाउनुहोस् वा लेखेर मद्दत माग्न हेल्प पोइन्टको स्टिकर स्क्यान गर्नुहोस्।" },
  requested: { en: "Your request was sent to the service team.", ja: "係の 人に おねがいを おくりました。", bn: "আপনার অনুরোধ কর্মীদের কাছে পাঠানো হয়েছে।", vi: "Yêu cầu của bạn đã được gửi cho nhân viên.", id: "Permintaan Anda sudah dikirim ke petugas.", ne: "तपाईंको अनुरोध कर्मचारीलाई पठाइएको छ।" },
  write: { en: "Continue in writing", ja: "文字で つづける", bn: "লিখে চালিয়ে যান", vi: "Tiếp tục bằng tin nhắn", id: "Lanjut dengan tulisan", ne: "लेखेर जारी राख्नुहोस्" },
  risk: { en: "Your message may be urgent. The service team has been alerted.", ja: "いそぐ ことかも しれません。係の 人に しらせました。", bn: "আপনার বার্তাটি জরুরি হতে পারে। কর্মীদের জানানো হয়েছে।", vi: "Tin nhắn của bạn có thể khẩn cấp. Nhân viên đã được thông báo.", id: "Pesan Anda mungkin mendesak. Petugas sudah diberi tahu.", ne: "तपाईंको सन्देश जरुरी हुन सक्छ। कर्मचारीलाई खबर गरिएको छ।" },
  change: { en: "Change my answer", ja: "こたえを なおす", bn: "আমার উত্তর বদলান", vi: "Sửa câu trả lời", id: "Ubah jawaban saya", ne: "मेरो उत्तर सच्याउने" },
  answered: { en: "Yes, that answered my question", ja: "はい、わかりました", bn: "হ্যাঁ, আমার প্রশ্নের উত্তর পেয়েছি", vi: "Có, tôi đã nhận được câu trả lời", id: "Ya, pertanyaan saya terjawab", ne: "हो, मैले उत्तर पाएँ" },
} satisfies Record<string, L10n>;

export const FRONT_DESK = {
  consent: "送信済みメッセージの共有に同意", event: "操作記録", emptyAI: "現在、AIが対応している相談はありません。", emptyQueued: "現在、担当者を待っている相談はありません。",
  ai: "AI対応中", queued: "担当者待ち", monitor: "送信済みの会話", submitted: "相談者", aiSpeaker: "AI",
  translation: "機械翻訳", transfer: "引き継ぎ", joined: "担当者が参加", takeover: "担当する",
  reasons: { human_request: "本人の希望", suspected_risk: "危険の可能性", staff_needed: "職員による確認", staffed_entry: "職員による受付", limit: "対応上限", unclear: "再確認が必要", provider: "自動応答が利用できません", withheld: "番号を非表示" } as Record<string,string>,
};


// Staff interface. Consent and delivery are recorded as staff observations.
export const ASSIST = {
  title: "電話・対面での受付", source: "伝達方法", handset: "備え付けの電話", in_person: "対面",
  consent: "本人に記録の同意を得て、選んだ内容を読み返し、確認した", save: "確認した内容を記録",
  teach: "本人の言葉で確認した次の行動（番号は記入しない）", finish: "この案内を伝え、理解を確認して完了",
  channel: "確認済みの連絡方法", phone: "電話", email: "メール", select: "選んでください",
  ack: "この食物アレルギーを確認", acknowledged: "食物アレルギーを確認済み", stickerMissing: "印刷には設置団体と所在地の登録が必要です。",
};
