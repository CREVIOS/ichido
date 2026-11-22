// The hospital's approved replies. Slots come from the station row: branch = where to register, hours = its hours.
// While a red-flag tap is on, only HOSP_URGENT may be sent (rule.blockedBy on every other reply).
import type { PackReply } from "./types.ts";
import { slot as p } from "./common.ts";

export const RED_HOSPITAL = ["red_chest", "red_breath", "red_bleed", "red_faint", "red_stroke"];
const calm = { blockedBy: RED_HOSPITAL };

export const HOSPITAL_REPLIES: Record<string, PackReply> = {
  HOSP_URGENT: {
    code: "H-0", title: "至急：近くの職員へ直ちに伝える（院外・職員不在時は119番）", rule: { needsFlags: RED_HOSPITAL },
    text: () => ({
      ja: "いますぐ ちかくの 病院の 人に つたえて ください。うけつけでも、だれでも いいです。病院の そとに いる ときや、ちかくに 人が いない ときは、119に 電話して ください（きゅうきゅうしゃ）。",
      en: "Tell the hospital staff near you now — at the reception or any staff member. If you are outside the hospital building, or no staff are near, call 119 for an ambulance.",
      bn: "এখনই কাছের হাসপাতাল কর্মীকে জানান — রিসেপশনে বা যেকোনো কর্মীকে। হাসপাতালের বাইরে থাকলে বা কাছে কোনো কর্মী না থাকলে, অ্যাম্বুলেন্সের জন্য ১১৯-এ ফোন করুন।",
      vi: "Hãy báo ngay cho nhân viên bệnh viện gần bạn — ở quầy tiếp nhận hoặc bất kỳ nhân viên nào. Nếu bạn đang ở ngoài tòa nhà bệnh viện, hoặc không có nhân viên ở gần, hãy gọi 119 để gọi xe cấp cứu.",
      id: "Segera beri tahu petugas rumah sakit di dekat Anda — di bagian pendaftaran atau petugas mana pun. Jika Anda berada di luar gedung rumah sakit, atau tidak ada petugas di dekat Anda, telepon 119 untuk ambulans.",
      ne: "अहिले नै नजिकैको अस्पताल कर्मचारीलाई भन्नुहोस् — रिसेप्सनमा वा जुनसुकै कर्मचारीलाई। अस्पताल भवनबाहिर हुनुहुन्छ वा नजिकै कोही कर्मचारी हुनुहुन्न भने एम्बुलेन्सका लागि ११९ मा फोन गर्नुहोस्।",
    }),
  },
  HOSP_FIRST_VISIT: {
    code: "H-1", title: "初診受付の案内（申込書は職員が一緒に記入）", rule: { faults: ["hosp_first_visit"], ...calm },
    text: (s) => ({
      ja: `はじめての 人は、${p(s.branch, "ja")} で うけつけを します。うけつけの 紙は、係の 人が いっしょに 書きます。保険証が あれば もって いって ください。番号を ここに 書かないで ください。うけつけの 時間は ${p(s.hours, "ja")} です。`,
      en: `On a first visit, you register at the ${p(s.branch, "en")} (${p(s.hours, "en")}). A clerk will fill in the form with you. Bring your health insurance card if you have one. Please do not type any numbers from your cards here.`,
      bn: `প্রথমবার এলে ${p(s.branch, "bn")}-এ (${p(s.hours, "bn")}) নাম লেখাতে হয়। একজন কর্মী আপনার সঙ্গে ফর্ম পূরণ করবেন। স্বাস্থ্যবিমা কার্ড থাকলে সঙ্গে আনুন। এখানে কোনো কার্ডের নম্বর লিখবেন না।`,
      vi: `Lần đầu đến khám, bạn đăng ký tại ${p(s.branch, "vi")} (${p(s.hours, "vi")}). Nhân viên sẽ cùng bạn điền giấy tờ. Nếu có thẻ bảo hiểm y tế, hãy mang theo. Xin đừng nhập số trên các thẻ của bạn ở đây.`,
      id: `Pada kunjungan pertama, Anda mendaftar di ${p(s.branch, "id")} (${p(s.hours, "id")}). Petugas akan mengisi formulir bersama Anda. Bawalah kartu asuransi kesehatan jika ada. Jangan ketik nomor dari kartu Anda di sini.`,
      ne: `पहिलो पटक आउँदा ${p(s.branch, "ne")} मा (${p(s.hours, "ne")}) दर्ता गर्नुपर्छ। एक जना कर्मचारीले तपाईंसँगै फारम भर्नुहुन्छ। स्वास्थ्य बीमा कार्ड छ भने ल्याउनुहोस्। यहाँ कुनै कार्डको नम्बर नलेख्नुहोस्।`,
    }),
  },
  HOSP_WHERE: {
    code: "H-2", title: "診療科は看護師が判断（ご本人に選ばせない）・Help Pointで待機", rule: { faults: ["hosp_department", "hosp_symptoms"], ...calm },
    text: () => ({
      ja: "どの 科に いくかは、あなたの 話を きいて 看護師が きめます。じぶんで えらばなくて いいです。この Help Point で まって いて ください。係の 人が あんない します。",
      en: "A nurse decides which department you need after listening to you. You do not need to choose. Please wait at this Help Point; staff will take you there.",
      bn: "আপনার কথা শুনে একজন নার্স ঠিক করবেন কোন বিভাগে যেতে হবে। আপনাকে নিজে বেছে নিতে হবে না। এই Help Point-এ অপেক্ষা করুন; কর্মীরা আপনাকে নিয়ে যাবেন।",
      vi: "Y tá sẽ nghe bạn nói rồi quyết định bạn cần khám khoa nào. Bạn không cần tự chọn. Hãy chờ ở Help Point này; nhân viên sẽ đưa bạn đến đó.",
      id: "Perawat akan mendengarkan Anda lalu menentukan bagian yang Anda perlukan. Anda tidak perlu memilih sendiri. Silakan tunggu di Help Point ini; petugas akan mengantar Anda.",
      ne: "तपाईंको कुरा सुनेर नर्सले कुन विभागमा जाने भनेर निर्णय गर्नुहुन्छ। तपाईंले आफैं छान्नु पर्दैन। यही Help Point मा पर्खनुहोस्; कर्मचारीले तपाईंलाई लैजानुहुन्छ।",
    }),
  },
  HOSP_INTERPRETER: {
    code: "H-3", title: "医療通訳の手配（電話・映像）、問診は看護師が通訳を介して実施", rule: { needsFlags: ["need_interpreter", "need_explain"], ...calm },
    text: () => ({
      ja: "つうやくの 人を よびます。電話か 画面で つうやくの 人と つながります。看護師が つうやくの 人と いっしょに、あなたの ぐあいを ききます。この AI は びょうきに ついて こたえません。",
      en: "We are calling a medical interpreter, who joins by phone or on a screen. A nurse asks how you feel through the interpreter. This assistant does not answer questions about illness.",
      bn: "আমরা একজন চিকিৎসা-দোভাষীকে ডাকছি, যিনি ফোনে বা স্ক্রিনে যুক্ত হবেন। দোভাষীর মাধ্যমে একজন নার্স আপনার অবস্থা জানতে চাইবেন। এই সহকারী অসুখ নিয়ে প্রশ্নের উত্তর দেয় না।",
      vi: "Chúng tôi đang gọi phiên dịch y tế, người sẽ tham gia qua điện thoại hoặc màn hình. Y tá sẽ hỏi tình trạng của bạn qua phiên dịch. Trợ lý này không trả lời câu hỏi về bệnh.",
      id: "Kami memanggil penerjemah medis, yang akan bergabung lewat telepon atau layar. Perawat akan menanyakan keadaan Anda melalui penerjemah. Asisten ini tidak menjawab pertanyaan tentang penyakit.",
      ne: "हामी चिकित्सा दोभाषे बोलाउँदै छौं, जो फोन वा स्क्रिनबाट जोडिनुहुन्छ। दोभाषेमार्फत नर्सले तपाईंको अवस्था सोध्नुहुन्छ। यो सहायकले रोगबारे प्रश्नको जवाफ दिँदैन।",
    }),
  },
  HOSP_PAYMENT: {
    code: "H-4", title: "支払い・保険は会計窓口で説明", rule: { faults: ["hosp_payment"], ...calm },
    text: () => ({
      ja: "お金の はらいかたと 保険の ことは、会計の まどぐちで 係の 人が せつめい します。カードや 保険証の 番号は、ここに 書かないで ください。",
      en: "The accounting counter (会計) explains how to pay and how health insurance works here. Please do not type any numbers from your cards here.",
      bn: "কীভাবে টাকা দিতে হয় এবং স্বাস্থ্যবিমা কীভাবে কাজ করে, তা হিসাব কাউন্টার (会計) বুঝিয়ে দেবে। এখানে কোনো কার্ডের নম্বর লিখবেন না।",
      vi: "Quầy thu ngân (会計) sẽ giải thích cách thanh toán và cách dùng bảo hiểm y tế ở đây. Xin đừng nhập số trên các thẻ của bạn ở đây.",
      id: "Loket kasir (会計) akan menjelaskan cara membayar dan cara kerja asuransi kesehatan di sini. Jangan ketik nomor dari kartu Anda di sini.",
      ne: "भुक्तानी कसरी गर्ने र स्वास्थ्य बीमा कसरी चल्छ भन्ने कुरा हिसाब काउन्टर (会計) ले बुझाउँछ। यहाँ कुनै कार्डको नम्बर नलेख्नुहोस्।",
    }),
  },
  HOSP_NO_CARD: {
    code: "H-5", title: "保険証がない場合（当日全額負担の可能性・払い戻しは受付で確認）",
    rule: { faults: ["hosp_first_visit", "hosp_payment"], needsFlags: ["ins_not_with_me", "ins_none"], ...calm },
    text: () => ({
      ja: "保険証が ない ときは、きょう ぜんぶの お金を はらう ことが あります。あとで 保険証を みせると、お金が もどる ことも あります。くわしい ことは うけつけで きいて ください。",
      en: "Without a health insurance card, you may have to pay the full cost today. Some of it may be returned later when you show the card. Please ask at the reception how it works here.",
      bn: "স্বাস্থ্যবিমা কার্ড না থাকলে আজ পুরো খরচ দিতে হতে পারে। পরে কার্ড দেখালে কিছু টাকা ফেরত পেতে পারেন। এখানে কীভাবে হয়, রিসেপশনে জিজ্ঞেস করুন।",
      vi: "Nếu không có thẻ bảo hiểm y tế, hôm nay bạn có thể phải trả toàn bộ chi phí. Sau này khi xuất trình thẻ, bạn có thể được hoàn lại một phần. Hãy hỏi quầy tiếp nhận về cách làm ở đây.",
      id: "Tanpa kartu asuransi kesehatan, Anda mungkin harus membayar biaya penuh hari ini. Sebagian bisa dikembalikan nanti saat Anda menunjukkan kartunya. Tanyakan di bagian pendaftaran bagaimana caranya di sini.",
      ne: "स्वास्थ्य बीमा कार्ड नभए आज पूरै खर्च तिर्नुपर्ने हुन सक्छ। पछि कार्ड देखाउँदा केही पैसा फिर्ता हुन सक्छ। यहाँ कसरी हुन्छ, रिसेप्सनमा सोध्नुहोस्।",
    }),
  },
  HOSP_STAFF_COMING: {
    code: "H-6", title: "看護師・医療事務がHelp Pointへ向かう（待機の依頼）", rule: { ...calm },
    text: () => ({
      ja: "かんごしか 病院の 係の 人が、この Help Point に きます。ここで まって いて ください。",
      en: "A nurse or hospital clerk is coming to this Help Point. Please wait here.",
      bn: "একজন নার্স বা হাসপাতাল কর্মী এই Help Point-এ আসছেন। এখানে অপেক্ষা করুন।",
      vi: "Y tá hoặc nhân viên bệnh viện đang đến Help Point này. Hãy chờ ở đây.",
      id: "Perawat atau petugas rumah sakit sedang menuju Help Point ini. Silakan tunggu di sini.",
      ne: "नर्स वा अस्पताल कर्मचारी यो Help Point मा आउँदै हुनुहुन्छ। यहीँ पर्खनुहोस्।",
    }),
  },
};
