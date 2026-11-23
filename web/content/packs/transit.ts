// Station pack: a Help Point at a railway ticket gate. Captures what is wrong and routes to station staff.
// Sourced needs (docs/research): "trouble at stations" was 9 of 75 everyday difficulties Bangladeshis in Japan described
// (GRIPS survey); a late commuter ran out of time before the last train while waiting at a station ATM (real story 3);
// bus and rail routes in Nagasaki are being cut for lack of drivers (prefecture plan), so the last train matters more.
import type { Pack, Tap } from "./types.ts";
import { SHARED_TAPS } from "./common.ts";
import { TRANSIT_REPLIES } from "./transit-replies.ts";

const taps: Record<string, Tap> = {
  // New caller wording in all non-English locales is awaiting native review.
  leave_soon: { staff: "まもなく出発する必要あり", label: { ja: "もうすぐ ここを でます", en: "I need to leave soon", bn: "আমাকে শিগগিরই চলে যেতে হবে", vi: "Tôi cần đi sớm", id: "Saya harus segera pergi", ne: "म छिट्टै जानुपर्छ" } },
  share_item: { staff: "鉄道会社に品物の選択内容を共有可", label: { ja: "えらんだ ものと 場所を 駅の 人に つたえて いいです", en: "Share the item and place I selected with the railway", bn: "আমার বেছে নেওয়া জিনিস ও জায়গা রেলকে জানান", vi: "Chia sẻ đồ vật và nơi tôi chọn với nhà ga", id: "Bagikan barang dan tempat yang saya pilih kepada petugas kereta", ne: "मैले छानेको सामान र ठाउँ रेल कर्मचारीलाई बताउनुहोस्" } },
  need_way: { group: "need", suggests: "transit_way", staff: "行き先が分からないとのこと", label: { ja: "みちが わかりません", en: "I don't know the way", bn: "পথ চিনতে পারছি না", vi: "Tôi không biết đường", id: "Saya tidak tahu jalannya", ne: "बाटो थाहा छैन" } },
  need_last: { group: "need", suggests: "transit_last_train", staff: "終電に乗り遅れたとのこと", label: { ja: "さいごの 電車に のれませんでした", en: "I missed the last train", bn: "শেষ ট্রেন ধরতে পারিনি", vi: "Tôi lỡ chuyến tàu cuối", id: "Saya ketinggalan kereta terakhir", ne: "मेरो अन्तिम रेल छुट्यो" } },
  need_item: { group: "need", suggests: "transit_lost_item", staff: "忘れ物・落とし物とのこと", label: { ja: "ものを なくしました", en: "I lost something", bn: "কিছু হারিয়ে ফেলেছি", vi: "Tôi bị mất đồ", id: "Saya kehilangan barang", ne: "मेरो सामान हरायो" } },
  need_access: { group: "need", suggests: "transit_access", staff: "移動の介助を希望", label: { ja: "うごくのに てつだいが ほしいです", en: "I need help getting around", bn: "চলাফেরায় সাহায্য দরকার", vi: "Tôi cần hỗ trợ di chuyển", id: "Saya butuh bantuan untuk bergerak", ne: "हिँडडुलमा सहयोग चाहियो" } },

  way_platform: { staff: "乗り場が分からないとのこと", label: { ja: "のりばが わかりません", en: "I can't find my platform", bn: "প্ল্যাটফর্ম খুঁজে পাচ্ছি না", vi: "Tôi không tìm thấy sân ga", id: "Saya tidak menemukan peron saya", ne: "मेरो प्लेटफर्म भेटिनँ" } },
  way_exit: { staff: "出口・乗換が分からないとのこと", label: { ja: "でぐちや のりかえが わかりません", en: "I can't find the exit or my transfer", bn: "বের হওয়ার পথ বা ট্রেন বদলের জায়গা খুঁজে পাচ্ছি না", vi: "Tôi không tìm thấy lối ra hoặc chỗ đổi tàu", id: "Saya tidak menemukan pintu keluar atau tempat transit", ne: "निस्कने बाटो वा रेल फेर्ने ठाउँ भेटिनँ" } },
  way_ticket: { staff: "切符が買えない・ICカード不具合とのこと", label: { ja: "きっぷが かえません・カードが つかえません", en: "I can't buy a ticket, or my IC card doesn't work", bn: "টিকিট কিনতে পারছি না, বা আইসি কার্ড কাজ করছে না", vi: "Tôi không mua được vé, hoặc thẻ IC không dùng được", id: "Saya tidak bisa membeli tiket, atau kartu IC saya tidak berfungsi", ne: "टिकट किन्न सकिनँ, वा आईसी कार्ड चलेन" } },
  night_nowhere: { staff: "今夜の宿泊先がないとのこと", label: { ja: "こんや とまる ところが ありません", en: "I have nowhere to stay tonight", bn: "আজ রাতে থাকার জায়গা নেই", vi: "Tối nay tôi không có chỗ ở", id: "Saya tidak punya tempat menginap malam ini", ne: "आज राति बस्ने ठाउँ छैन" } },
  night_far: { staff: "自宅が遠方とのこと", label: { ja: "家が とおいです", en: "My home is far away", bn: "আমার বাসা অনেক দূরে", vi: "Nhà tôi ở xa", id: "Rumah saya jauh", ne: "मेरो घर टाढा छ" } },
  item_bag: { group: "item", staff: "落とし物：かばん", label: { ja: "かばん", en: "Bag", bn: "ব্যাগ", vi: "Túi", id: "Tas", ne: "झोला" } },
  item_wallet: { group: "item", staff: "落とし物：財布", label: { ja: "さいふ", en: "Wallet", bn: "মানিব্যাগ", vi: "Ví", id: "Dompet", ne: "पर्स" } },
  item_phone: { group: "item", staff: "落とし物：携帯電話", label: { ja: "でんわ（けいたい）", en: "Phone", bn: "ফোন", vi: "Điện thoại", id: "Ponsel", ne: "फोन" } },
  item_card: { group: "item", staff: "落とし物：在留カード等の身分証", label: { ja: "在留カードなどの カード", en: "Residence card or another ID card", bn: "রেসিডেন্স কার্ড বা অন্য পরিচয়পত্র", vi: "Thẻ cư trú hoặc giấy tờ tùy thân khác", id: "Kartu izin tinggal atau kartu identitas lain", ne: "रेसिडेन्स कार्ड वा अर्को परिचयपत्र" } },
  item_other: { group: "item", staff: "落とし物：その他", label: { ja: "ほかの もの", en: "Something else", bn: "অন্য কিছু", vi: "Thứ khác", id: "Barang lain", ne: "अरू केही" } },
  item_on_train: { group: "lostwhere", staff: "紛失場所：列車内", label: { ja: "でんしゃの 中で", en: "On a train", bn: "ট্রেনের ভেতরে", vi: "Trên tàu", id: "Di dalam kereta", ne: "रेलभित्र" } },
  item_in_station: { group: "lostwhere", staff: "紛失場所：駅構内", label: { ja: "えきの 中で", en: "In the station", bn: "স্টেশনের ভেতরে", vi: "Trong nhà ga", id: "Di dalam stasiun", ne: "स्टेसनभित्र" } },
  acc_wheel: { staff: "車いすを使用", label: { ja: "車いすを つかって います", en: "I use a wheelchair", bn: "আমি হুইলচেয়ার ব্যবহার করি", vi: "Tôi dùng xe lăn", id: "Saya memakai kursi roda", ne: "म ह्वीलचेयर प्रयोग गर्छु" } },
  acc_stairs: { staff: "階段が使えないとのこと", label: { ja: "かいだんが つかえません", en: "I can't use stairs", bn: "সিঁড়ি ব্যবহার করতে পারি না", vi: "Tôi không đi cầu thang được", id: "Saya tidak bisa naik tangga", ne: "म भर्‍याङ चढ्न सक्दिनँ" } },
  acc_sight: { staff: "視覚に障害があるとのこと", label: { ja: "目が よく 見えません", en: "I can't see well", bn: "আমি ভালো দেখতে পাই না", vi: "Tôi nhìn không rõ", id: "Penglihatan saya kurang baik", ne: "म राम्ररी देख्न सक्दिनँ" } },
  ...SHARED_TAPS,
};

export const TRANSIT: Pack = {
  id: "transit", kinds: ["transit"], name: { staff: "駅", en: "Station" }, place: "改札 Help Point",
  responder: {
    staff: "駅係員",
    caller: { ja: "えきの 係の 人", en: "station staff", bn: "স্টেশনের কর্মী", vi: "nhân viên nhà ga", id: "petugas stasiun", ne: "स्टेसनका कर्मचारी" },
  },
  recipients: { railway: "鉄道事業者", police: "警察" },
  why: "Trouble at stations was 9 of 75 everyday difficulties Bangladeshis in Japan described (GRIPS survey).",
  device: "transit_way",
  situations: {
    transit_way: { staff: "行き先・乗り場が分からない", name: { ja: "どこに いけば いいか わからない", en: "I'm lost or don't know where to go", bn: "কোথায় যেতে হবে বুঝতে পারছি না", vi: "Tôi bị lạc hoặc không biết đi đâu", id: "Saya tersesat atau tidak tahu harus ke mana", ne: "म हराएँ वा कहाँ जाने थाहा छैन" } },
    transit_last_train: { staff: "終電に乗り遅れた", name: { ja: "さいごの 電車に のれなかった", en: "I missed the last train", bn: "শেষ ট্রেন ধরতে পারিনি", vi: "Tôi lỡ chuyến tàu cuối", id: "Saya ketinggalan kereta terakhir", ne: "अन्तिम रेल छुट्यो" } },
    transit_lost_item: { staff: "忘れ物・落とし物", name: { ja: "わすれもの・おとしもの", en: "I lost something", bn: "কিছু হারিয়ে ফেলেছি", vi: "Tôi bị mất đồ", id: "Saya kehilangan barang", ne: "मेरो सामान हरायो" } },
    transit_access: { staff: "移動の介助が必要（車いす等）", name: { ja: "うごくのに てつだいが ほしい（車いす など）", en: "I need help getting around (wheelchair, stairs…)", bn: "চলাফেরায় সাহায্য দরকার (হুইলচেয়ার, সিঁড়ি…)", vi: "Tôi cần hỗ trợ di chuyển (xe lăn, cầu thang…)", id: "Saya butuh bantuan bergerak (kursi roda, tangga…)", ne: "हिँडडुलमा सहयोग चाहियो (ह्वीलचेयर, भर्‍याङ…)" } },
  },
  taps,
  common: ["leave_soon", "need_way", "need_last", "need_item", "need_access", "need_interpreter", "helper"],
  bySituation: {
    transit_way: ["way_platform", "way_exit", "way_ticket"],
    transit_last_train: ["night_nowhere", "night_far"],
    transit_lost_item: ["share_item", "item_bag", "item_wallet", "item_phone", "item_card", "item_other", "item_on_train", "item_in_station"],
    transit_access: ["acc_wheel", "acc_stairs", "acc_sight"],
  },
  replies: TRANSIT_REPLIES,
  hint: {
    ja: "かいさつの 駅の 人にも きけます。", en: "You can also ask at the ticket gate.", bn: "টিকিট গেটেও জিজ্ঞেস করতে পারেন।",
    vi: "Bạn cũng có thể hỏi ở cửa soát vé.", id: "Anda juga bisa bertanya di gerbang tiket.", ne: "टिकट गेटमा पनि सोध्न सक्नुहुन्छ।",
  },
};
