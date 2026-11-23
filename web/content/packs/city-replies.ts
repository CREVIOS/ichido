// The city's approved replies. Slots come from the station row: branch = the desk to go to, hours = its hours.
// They say where a procedure is done; none of them advises on immigration status or the law.
import type { PackReply } from "./types.ts";
import { slot as p } from "./common.ts";

export const CITY_REPLIES: Record<string, PackReply> = {
  CITY_IMMIGRATION: {
    code: "M-1", title: "在留期間の更新は入管で（市では相談不可・場所のみ案内）", rule: { faults: ["city_residence"], needsFlags: ["card_expiring"] },
    text: () => ({
      ja: "在留カードの きげんを のばす 手つづきは、市役所では しません。入管（にゅうかん）で します。ここでは その 手つづきの そうだんは できません。係の 人が 場所を おしえます。きげんが すぎる まえに 手つづきを して ください。",
      en: "Extending your period of stay is done at the Immigration Services office (入管), not at the city office. This desk cannot advise on immigration. Staff will show you where the office is. Please apply before the date on your card passes.",
      bn: "থাকার মেয়াদ বাড়ানোর কাজ সিটি অফিসে নয়, ইমিগ্রেশন অফিসে (入管) হয়। এই ডেস্ক ভিসা-বিষয়ে পরামর্শ দিতে পারে না। অফিসটি কোথায়, কর্মীরা দেখিয়ে দেবেন। কার্ডের মেয়াদ শেষ হওয়ার আগে আবেদন করুন।",
      vi: "Việc gia hạn thời gian lưu trú được làm tại Cục Xuất nhập cảnh (入管), không phải ở tòa thị chính. Quầy này không tư vấn về cư trú. Nhân viên sẽ chỉ cho bạn văn phòng ở đâu. Hãy nộp đơn trước khi thẻ hết hạn.",
      id: "Perpanjangan masa tinggal dilakukan di kantor Imigrasi (入管), bukan di kantor kota. Meja ini tidak bisa memberi saran imigrasi. Petugas akan menunjukkan letak kantornya. Ajukan sebelum tanggal di kartu Anda lewat.",
      ne: "बसाइ अवधि थप्ने काम सिटी अफिसमा होइन, अध्यागमन कार्यालय (入管) मा हुन्छ। यो डेस्कले भिसासम्बन्धी सल्लाह दिन सक्दैन। कार्यालय कहाँ छ, कर्मचारीले देखाउनुहुन्छ। कार्डको म्याद सकिनुअघि आवेदन दिनुहोस्।",
    }),
  },
  CITY_MOVING: {
    code: "M-2", title: "転入届（転入から14日以内・在留カード持参・記入は職員が補助）", rule: { faults: ["city_moving"] },
    text: (s) => ({
      ja: `ひっこして きた 人は、ひっこした 日から 14日 いないに、在留カードを もって ${p(s.branch, "ja")} で とどけを して ください。あいて いるのは ${p(s.hours, "ja")} です。とどけの 紙は 係の 人が いっしょに 書きます。あたらしい じゅうしょは カードの うらに 書かれます。`,
      en: `If you moved here, please register at the ${p(s.branch, "en")} (${p(s.hours, "en")}) within 14 days of moving in, and bring your residence card. Staff will fill in the form with you. Your new address is written on the back of your card.`,
      bn: `এখানে বাসা বদলে এলে, আসার ১৪ দিনের মধ্যে রেসিডেন্স কার্ড নিয়ে ${p(s.branch, "bn")}-এ (${p(s.hours, "bn")}) নিবন্ধন করুন। কর্মীরা আপনার সঙ্গে ফর্ম পূরণ করবেন। নতুন ঠিকানা কার্ডের পেছনে লেখা হবে।`,
      vi: `Nếu bạn chuyển đến đây, hãy đăng ký tại ${p(s.branch, "vi")} (${p(s.hours, "vi")}) trong vòng 14 ngày kể từ ngày chuyển đến, và mang theo thẻ cư trú. Nhân viên sẽ cùng bạn điền giấy tờ. Địa chỉ mới được ghi ở mặt sau thẻ.`,
      id: `Jika Anda pindah ke sini, lapor di ${p(s.branch, "id")} (${p(s.hours, "id")}) dalam 14 hari setelah pindah, dan bawa kartu izin tinggal Anda. Petugas akan mengisi formulir bersama Anda. Alamat baru ditulis di bagian belakang kartu.`,
      ne: `यहाँ सरेर आउनुभएको हो भने सरेको १४ दिनभित्र रेसिडेन्स कार्ड लिएर ${p(s.branch, "ne")} मा (${p(s.hours, "ne")}) दर्ता गर्नुहोस्। कर्मचारीले तपाईंसँगै फारम भर्नुहुन्छ। नयाँ ठेगाना कार्डको पछाडि लेखिन्छ।`,
    }),
  },
  CITY_MYNUMBER: {
    code: "M-3", title: "マイナンバーカードの手続きは窓口へ（番号・暗証番号は聞かない）", rule: { faults: ["city_mynumber"] },
    text: (s) => ({
      ja: `マイナンバー カードの 手つづきは、${p(s.branch, "ja")} で します。あいて いるのは ${p(s.hours, "ja")} です。在留カードを もって いって ください。マイナンバーや カードの ひみつの 番号は、だれにも いわないで ください。ここにも 書かないで ください。`,
      en: `My Number card procedures (applying, receiving the card, resetting its passcode, a lost card) are done at the ${p(s.branch, "en")} (${p(s.hours, "en")}). Bring your residence card. Never tell anyone your My Number or the card's passcode, and do not type them here.`,
      bn: `মাই নাম্বার কার্ডের কাজ (আবেদন, কার্ড নেওয়া, গোপন কোড নতুন করা, হারানো কার্ড) ${p(s.branch, "bn")}-এ (${p(s.hours, "bn")}) হয়। রেসিডেন্স কার্ড সঙ্গে আনুন। আপনার মাই নাম্বার বা কার্ডের গোপন কোড কাউকে বলবেন না, এখানেও লিখবেন না।`,
      vi: `Các thủ tục thẻ My Number (làm thẻ, nhận thẻ, đặt lại mã bí mật, mất thẻ) được làm tại ${p(s.branch, "vi")} (${p(s.hours, "vi")}). Hãy mang thẻ cư trú. Đừng bao giờ nói số My Number hay mã bí mật của thẻ cho ai, và đừng nhập ở đây.`,
      id: `Urusan kartu My Number (pengajuan, menerima kartu, mengatur ulang kode rahasia, kartu hilang) dilakukan di ${p(s.branch, "id")} (${p(s.hours, "id")}). Bawa kartu izin tinggal Anda. Jangan pernah memberi tahu siapa pun nomor My Number atau kode rahasia kartu Anda, dan jangan mengetiknya di sini.`,
      ne: `माई नम्बर कार्डका काम (आवेदन, कार्ड लिने, गोप्य कोड फेरि बनाउने, हराएको कार्ड) ${p(s.branch, "ne")} मा (${p(s.hours, "ne")}) हुन्छन्। रेसिडेन्स कार्ड ल्याउनुहोस्। आफ्नो माई नम्बर वा कार्डको गोप्य कोड कसैलाई नभन्नुहोस्, यहाँ पनि नलेख्नुहोस्।`,
    }),
  },
  CITY_LETTER: {
    code: "M-4", title: "読めない通知は多言語窓口へ（通訳と一緒に確認し担当課を案内）", rule: { faults: ["city_letter"] },
    text: (s) => ({
      ja: `よめない 手紙は、${p(s.branch, "ja")} に もって きて ください。あいて いるのは ${p(s.hours, "ja")} です。通訳の 人が いっしょに よんで、どこの 課からの 手紙か おしえます。お金や 日づけが 書いて あれば、その 課が はらいかたや そうだん先を せつめい します。手紙の 番号は ここに 書かないで ください。`,
      en: `Please bring the letter to the ${p(s.branch, "en")} (${p(s.hours, "en")}). An interpreter reads it with you and tells you which section sent it. If it shows an amount or a date, that section explains how to pay or whom to ask. Please do not type numbers from the letter here.`,
      bn: `চিঠিটি ${p(s.branch, "bn")}-এ (${p(s.hours, "bn")}) নিয়ে আসুন। একজন দোভাষী আপনার সঙ্গে পড়ে বলবেন কোন বিভাগ এটি পাঠিয়েছে। টাকার পরিমাণ বা তারিখ থাকলে সেই বিভাগ বুঝিয়ে দেবে কীভাবে দিতে হয় বা কার কাছে জানতে হয়। চিঠির কোনো নম্বর এখানে লিখবেন না।`,
      vi: `Hãy mang lá thư đến ${p(s.branch, "vi")} (${p(s.hours, "vi")}). Phiên dịch viên sẽ cùng bạn đọc và cho biết thư từ phòng ban nào. Nếu thư có ghi số tiền hoặc ngày, phòng ban đó sẽ giải thích cách nộp hoặc hỏi ai. Xin đừng nhập các số trong thư ở đây.`,
      id: `Bawalah surat itu ke ${p(s.branch, "id")} (${p(s.hours, "id")}). Penerjemah akan membacanya bersama Anda dan memberi tahu bagian mana yang mengirimnya. Jika ada jumlah uang atau tanggal, bagian itu akan menjelaskan cara membayar atau kepada siapa bertanya. Jangan ketik nomor dari surat itu di sini.`,
      ne: `चिठी ${p(s.branch, "ne")} मा (${p(s.hours, "ne")}) ल्याउनुहोस्। दोभाषेले तपाईंसँगै पढेर कुन शाखाबाट आएको हो भनिदिनुहुन्छ। रकम वा मिति लेखिएको भए त्यही शाखाले कसरी तिर्ने वा कसलाई सोध्ने बुझाउँछ। चिठीका नम्बर यहाँ नलेख्नुहोस्।`,
    }),
  },
  CITY_APPOINTMENT: {
    code: "M-5", title: "通訳を依頼済み・時刻は未確定", rule: {},
    text: () => ({
      ja: "つうやくを たのみました。まだ 時間は きまって いません。",
      en: "The desk has requested an interpreter. A time has not been confirmed.",
      bn: "ডেস্ক থেকে দোভাষীর অনুরোধ করা হয়েছে। সময় এখনও ঠিক হয়নি।",
      vi: "Quầy đã yêu cầu phiên dịch. Chưa xác nhận thời gian.",
      id: "Meja layanan sudah meminta penerjemah. Waktunya belum pasti.",
      ne: "कक्षले दोभाषे मागेको छ। समय अझै तोकिएको छैन।",
    }),
  },
  CITY_STAFF_COMING: {
    code: "M-6", title: "市の通訳・相談員がHelp Pointへ向かう（待機の依頼）", rule: {},
    text: () => ({
      ja: "市の つうやくの 人が この Help Point に きます。ここで まって いて ください。",
      en: "A city interpreter is coming to this Help Point. Please wait here.",
      bn: "শহরের একজন দোভাষী এই Help Point-এ আসছেন। এখানে অপেক্ষা করুন।",
      vi: "Phiên dịch viên của thành phố đang đến Help Point này. Hãy chờ ở đây.",
      id: "Penerjemah dari kantor kota sedang menuju Help Point ini. Silakan tunggu di sini.",
      ne: "नगरको दोभाषे यो Help Point मा आउँदै हुनुहुन्छ। यहीँ पर्खनुहोस्।",
    }),
  },
};
