// Shelter pack: a Help Point at a disaster evacuation shelter (避難所). Captures arrival, needs and family-search
// requests as taps and routes them to shelter staff; updates reach callers as approved notices through disaster mode.
// Sourced needs (docs/research): Nagasaki's 1982 flood left 299 dead or missing and the Nankai Trough estimate is up
// to 500 deaths (prefecture plan); Muslim food rules were the largest category of difficulty for Bangladeshis in Japan
// (16 of 75, GRIPS) and the prefecture's first mosque opened in 2024; Daishin Giken's safety-check system lists shelters.
import type { L10n } from "../catalogue.ts";
import type { Pack, Tap } from "./types.ts";
import { NO_MEDICAL, SHARED_TAPS } from "./common.ts";
import { SHELTER_REPLIES } from "./shelter-replies.ts";

const taps: Record<string, Tap> = {
  red_hurt: { group: "urgent", urgent: true, staff: "重いけが・急病人あり（至急）", label: { ja: "けがや びょうきで とても ぐあいが わるい 人が いる", en: "Someone here is badly hurt or very sick", bn: "এখানে কেউ গুরুতর আহত বা খুব অসুস্থ", vi: "Có người ở đây bị thương nặng hoặc ốm nặng", id: "Ada orang di sini yang terluka parah atau sakit berat", ne: "यहाँ कोही गम्भीर घाइते वा धेरै बिरामी हुनुहुन्छ" } },
  family_child: { group: "urgent", urgent: true, staff: "子どもが見当たらない（至急）", label: { ja: "こどもが みつかりません", en: "A child is missing", bn: "একটি শিশুকে খুঁজে পাওয়া যাচ্ছে না", vi: "Có một đứa trẻ bị lạc", id: "Ada anak yang hilang", ne: "एउटा बच्चा भेटिएको छैन" } },

  need_checkin: { group: "need", suggests: "shelter_checkin", staff: "到着したばかりとのこと", label: { ja: "いま ついた ところです", en: "I've just arrived", bn: "আমি এইমাত্র পৌঁছেছি", vi: "Tôi vừa mới đến", id: "Saya baru saja tiba", ne: "म भर्खरै आइपुगें" } },
  need_items: { group: "need", suggests: "shelter_needs", staff: "必要なものがあるとのこと", label: { ja: "ひつような ものが あります", en: "I need something", bn: "আমার কিছু দরকার", vi: "Tôi cần một số thứ", id: "Saya membutuhkan sesuatu", ne: "मलाई केही चाहियो" } },
  need_family: { group: "need", suggests: "shelter_family", staff: "家族を捜しているとのこと", label: { ja: "家族を さがして います", en: "I'm looking for my family", bn: "আমি পরিবারকে খুঁজছি", vi: "Tôi đang tìm người nhà", id: "Saya sedang mencari keluarga", ne: "म परिवार खोज्दै छु" } },
  need_news: { group: "need", suggests: "shelter_info", staff: "情報を知りたいとのこと", label: { ja: "おしらせを 知りたいです", en: "I want the latest information", bn: "সর্বশেষ খবর জানতে চাই", vi: "Tôi muốn biết thông tin mới nhất", id: "Saya ingin informasi terbaru", ne: "मलाई पछिल्लो जानकारी चाहियो" } },

  party_alone: { group: "party", staff: "単身", label: { ja: "ひとり", en: "Alone", bn: "একা", vi: "Một mình", id: "Sendiri", ne: "एक्लै" } },
  party_family: { group: "party", staff: "家族と同伴", label: { ja: "家族と いっしょ", en: "With family", bn: "পরিবারের সঙ্গে", vi: "Cùng gia đình", id: "Bersama keluarga", ne: "परिवारसँग" } },
  party_baby: { group: "party", staff: "乳幼児と同伴", label: { ja: "あかちゃんや 小さい こどもと いっしょ", en: "With a baby or small children", bn: "শিশু বা ছোট বাচ্চার সঙ্গে", vi: "Cùng em bé hoặc trẻ nhỏ", id: "Bersama bayi atau anak kecil", ne: "शिशु वा साना बच्चासँग" } },
  party_elder: { group: "party", staff: "高齢者と同伴", label: { ja: "おとしよりと いっしょ", en: "With an older person", bn: "একজন বয়স্ক মানুষের সঙ্গে", vi: "Cùng người cao tuổi", id: "Bersama orang lanjut usia", ne: "एक जना वृद्धसँग" } },
  party_animal: { staff: "同伴動物あり", label: { ja: "どうぶつと いっしょ", en: "I have an animal with me", bn: "সঙ্গে একটি পোষা প্রাণী আছে", vi: "Tôi mang theo thú cưng", id: "Saya membawa hewan peliharaan", ne: "मसँग पाल्तु जनावर छ" } },
  need_medicine: { staff: "常用薬が必要とのこと", label: { ja: "いつも のむ くすりが ほしい", en: "I need my regular medicine", bn: "নিয়মিত ওষুধ দরকার", vi: "Tôi cần thuốc uống thường ngày", id: "Saya butuh obat rutin saya", ne: "मलाई नियमित औषधि चाहियो" } },
  diet_halal: { staff: "ハラール対応の食事を希望", label: { ja: "ハラールの 食べもの", en: "Halal food", bn: "হালাল খাবার", vi: "Đồ ăn halal", id: "Makanan halal", ne: "हलाल खाना" } },
  diet_allergy: { group: "need", suggests: "shelter_needs", staff: "食物アレルギーの食事相談", label: { ja: "食べものの アレルギーの そうだん", en: "Food allergy · help with meals", bn: "খাবারে অ্যালার্জি · খাবার নিয়ে সাহায্য চাই", vi: "Dị ứng thực phẩm · cần giúp về bữa ăn", id: "Alergi makanan · bantuan untuk makan", ne: "खानेकुराको एलर्जी · खानामा सहयोग" } },
  allergy_me: { group: "who", staff: "アレルギー：本人", label: { ja: "わたし", en: "Me", bn: "আমার", vi: "Tôi", id: "Saya", ne: "मलाई" } },
  allergy_child: { group: "who", staff: "アレルギー：子ども", label: { ja: "わたしの こども", en: "My child", bn: "আমার সন্তানের", vi: "Con tôi", id: "Anak saya", ne: "मेरो बच्चालाई" } },
  allergy_other: { group: "who", staff: "アレルギー：一緒にいる人", label: { ja: "いっしょに いる 人", en: "Someone with me", bn: "আমার সঙ্গে থাকা একজনের", vi: "Người đi cùng tôi", id: "Orang yang bersama saya", ne: "मसँग भएको व्यक्तिलाई" } },
  diet_veg: { staff: "肉を食べないとのこと", label: { ja: "肉を 食べません", en: "I don't eat meat", bn: "আমি মাংস খাই না", vi: "Tôi không ăn thịt", id: "Saya tidak makan daging", ne: "म मासु खान्नँ" } },
  need_infant: { staff: "乳児用ミルク・おむつが必要", label: { ja: "あかちゃんの ミルク・おむつ", en: "Baby milk or nappies", bn: "শিশুর দুধ বা ডায়াপার", vi: "Sữa hoặc tã cho em bé", id: "Susu atau popok bayi", ne: "शिशुको दूध वा डाइपर" } },
  need_wheelchair: { staff: "車いすが必要", label: { ja: "車いすが ひつよう", en: "I need a wheelchair", bn: "হুইলচেয়ার দরকার", vi: "Tôi cần xe lăn", id: "Saya butuh kursi roda", ne: "मलाई ह्वीलचेयर चाहियो" } },
  need_prayer: { staff: "礼拝のための静かな場所を希望", label: { ja: "いのる ための しずかな ばしょ", en: "A quiet place to pray", bn: "নামাজ বা প্রার্থনার জন্য নিরিবিলি জায়গা", vi: "Một nơi yên tĩnh để cầu nguyện", id: "Tempat tenang untuk beribadah", ne: "प्रार्थनाका लागि शान्त ठाउँ" } },
  family_missing: { staff: "家族と連絡が取れないとのこと", label: { ja: "家族と れんらくが とれない", en: "I can't reach a family member", bn: "পরিবারের একজনের সঙ্গে যোগাযোগ করতে পারছি না", vi: "Tôi không liên lạc được với người nhà", id: "Saya tidak bisa menghubungi anggota keluarga", ne: "परिवारको एक जनासँग सम्पर्क हुन सकेन" } },
  family_abroad: { staff: "海外の家族へ無事を伝えたいとのこと", label: { ja: "国の 家族に ぶじを つたえたい", en: "I want to tell my family abroad that I am safe", bn: "দেশে পরিবারকে জানাতে চাই যে আমি নিরাপদ", vi: "Tôi muốn báo cho gia đình ở nước ngoài là tôi an toàn", id: "Saya ingin memberi tahu keluarga di luar negeri bahwa saya selamat", ne: "विदेशमा रहेको परिवारलाई म सुरक्षित छु भन्न चाहन्छु" } },
  info_food: { staff: "食料・水についての問い合わせ", label: { ja: "食べものや 水の こと", en: "Food and water", bn: "খাবার ও পানি", vi: "Đồ ăn và nước uống", id: "Makanan dan air", ne: "खाना र पानी" } },
  info_home: { staff: "帰宅の見通しについての問い合わせ", label: { ja: "いつ 家に かえれるか", en: "When I can go home", bn: "কবে বাড়ি ফিরতে পারব", vi: "Khi nào tôi có thể về nhà", id: "Kapan saya bisa pulang", ne: "कहिले घर फर्कन सकिन्छ" } },
  ...SHARED_TAPS,
};

export const SHELTER: Pack = {
  id: "shelter", kinds: ["shelter"], name: { staff: "避難所", en: "Shelter" }, place: "避難所 Help Point",
  responder: {
    staff: "避難所の運営担当者",
    caller: { ja: "ひなんじょの 係の 人", en: "shelter staff", bn: "আশ্রয়কেন্দ্রের কর্মী", vi: "nhân viên nơi sơ tán", id: "petugas pengungsian", ne: "आश्रयस्थलका कर्मचारी" },
  },
  recipients: { disaster_hq: "市町村災害対策本部", health_team: "保健師・救護班" },
  why: "Nagasaki's 1982 flood left 299 dead or missing; the Nankai Trough estimate is up to 500 deaths in the prefecture.",
  device: "shelter_checkin",
  situations: {
    shelter_checkin: { staff: "避難所への到着・受付", name: { ja: "ひなんじょに ついた（うけつけ）", en: "I've arrived at the shelter (check-in)", bn: "আশ্রয়কেন্দ্রে পৌঁছেছি (নাম লেখানো)", vi: "Tôi vừa đến nơi sơ tán (đăng ký)", id: "Saya baru tiba di tempat pengungsian (pendaftaran)", ne: "आश्रयस्थलमा आइपुगें (दर्ता)" } },
    shelter_needs: { staff: "必要な支援（薬・食事・乳幼児・車いす等）", name: { ja: "ひつような ものが ある（くすり・食べもの など）", en: "I need something (medicine, food, baby items, wheelchair…)", bn: "কিছু দরকার (ওষুধ, খাবার, শিশুর জিনিস, হুইলচেয়ার…)", vi: "Tôi cần một số thứ (thuốc, đồ ăn, đồ cho em bé, xe lăn…)", id: "Saya butuh sesuatu (obat, makanan, perlengkapan bayi, kursi roda…)", ne: "केही चाहियो (औषधि, खाना, शिशुका सामान, ह्वीलचेयर…)" } },
    shelter_family: { staff: "家族の安否確認・捜索の依頼", name: { ja: "家族を さがして いる", en: "I'm looking for a family member", bn: "পরিবারের একজনকে খুঁজছি", vi: "Tôi đang tìm người nhà", id: "Saya mencari anggota keluarga", ne: "परिवारको सदस्य खोज्दै छु" } },
    shelter_info: { staff: "情報の確認（食料・帰宅の見通し等）", name: { ja: "おしらせを 知りたい", en: "I want the latest information", bn: "সর্বশেষ খবর জানতে চাই", vi: "Tôi muốn biết thông tin mới nhất", id: "Saya ingin informasi terbaru", ne: "पछिल्लो जानकारी चाहियो" } },
  },
  taps,
  common: ["red_hurt", "family_child", "diet_allergy", "need_checkin", "need_items", "need_family", "need_news", "need_interpreter", "helper"],
  bySituation: {
    shelter_checkin: ["party_alone", "party_family", "party_baby", "party_elder", "party_animal", "need_medicine"],
    shelter_needs: ["need_medicine", "diet_halal", "allergy_me", "allergy_child", "allergy_other", "diet_veg", "need_infant", "need_wheelchair", "need_prayer"],
    shelter_family: ["family_missing", "family_abroad"],
    shelter_info: ["info_food", "info_home"],
  },
  replies: SHELTER_REPLIES,
  scope: NO_MEDICAL,
  hint: {
    ja: "ひなんじょの うけつけでも きけます。", en: "You can also ask at the shelter reception.", bn: "আশ্রয়কেন্দ্রের রিসেপশনেও জিজ্ঞেস করতে পারেন।",
    vi: "Bạn cũng có thể hỏi ở quầy tiếp nhận của nơi sơ tán.", id: "Anda juga bisa bertanya di meja penerimaan pengungsian.", ne: "आश्रयस्थलको रिसेप्सनमा पनि सोध्न सक्नुहुन्छ।",
  },
};

// Shelter updates, shown through disaster mode (operators set them on shelter stations from /stations).
export const SHELTER_NOTICES: Record<string, { title: string; text: L10n }> = {
  shelter_supplies: {
    title: "避難所：食料・水の配布",
    text: {
      ja: "ひなんじょの うけつけで 食べものと 水を くばって います。じかんは 係の 人に きいて ください。アレルギーや ハラールの ことも つたえて ください。",
      en: "Food and water are being handed out at the shelter reception. Ask the staff for the times. Tell them about allergies or halal food too.",
      bn: "আশ্রয়কেন্দ্রের রিসেপশনে খাবার ও পানি দেওয়া হচ্ছে। সময় জানতে কর্মীদের জিজ্ঞেস করুন। অ্যালার্জি বা হালাল খাবারের কথাও জানান।",
      vi: "Đồ ăn và nước uống đang được phát tại quầy tiếp nhận của nơi sơ tán. Hãy hỏi nhân viên về giờ phát. Hãy cho họ biết nếu bạn bị dị ứng hoặc cần đồ ăn halal.",
      id: "Makanan dan air sedang dibagikan di meja penerimaan pengungsian. Tanyakan jamnya kepada petugas. Beri tahu juga jika Anda punya alergi atau butuh makanan halal.",
      ne: "आश्रयस्थलको रिसेप्सनमा खाना र पानी बाँडिँदै छ। समय कर्मचारीलाई सोध्नुहोस्। एलर्जी वा हलाल खानाबारे पनि भन्नुहोस्।",
    },
  },
  shelter_relocate: {
    title: "避難所：別の避難所への移動",
    text: {
      ja: "この ひなんじょは いっぱいに なりました。係の 人が ほかの ひなんじょへ あんない します。うけつけの まえで まって いて ください。",
      en: "This shelter is full. Staff will guide you to another shelter. Please wait in front of the reception.",
      bn: "এই আশ্রয়কেন্দ্র ভরে গেছে। কর্মীরা আপনাকে অন্য আশ্রয়কেন্দ্রে নিয়ে যাবেন। রিসেপশনের সামনে অপেক্ষা করুন।",
      vi: "Nơi sơ tán này đã đầy. Nhân viên sẽ hướng dẫn bạn đến nơi sơ tán khác. Hãy chờ trước quầy tiếp nhận.",
      id: "Tempat pengungsian ini sudah penuh. Petugas akan mengantar Anda ke tempat pengungsian lain. Silakan tunggu di depan meja penerimaan.",
      ne: "यो आश्रयस्थल भरियो। कर्मचारीले तपाईंलाई अर्को आश्रयस्थलमा लैजानुहुन्छ। रिसेप्सनअगाडि पर्खनुहोस्।",
    },
  },
};
