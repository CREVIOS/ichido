// City office pack: a Help Point at the foreign residents' and procedures desk. The assistant never gives legal or
// immigration advice: it captures what the caller needs (and which letter they hold) and routes to the multilingual desk.
// Sourced needs (docs/research): only 4.8% of foreign residents in Sasebo would take a problem to city hall, and 45.9%
// named Japanese as their biggest problem (Sasebo City survey 2019–20); 16.6% did not know where to ask and 16.6% had
// to take time off work to go to a counter (ISA 基礎調査 R7); accounts freeze when a residence card lapses (ISA free text).
import type { Pack, Tap } from "./types.ts";
import { NO_LEGAL, SHARED_TAPS } from "./common.ts";
import { CITY_REPLIES } from "./city-replies.ts";

const taps: Record<string, Tap> = {
  need_residence: { group: "need", suggests: "city_residence", staff: "在留カードについての相談", label: { ja: "在留カードの ことを ききたい", en: "I have a question about my residence card", bn: "আমার রেসিডেন্স কার্ড নিয়ে প্রশ্ন আছে", vi: "Tôi có câu hỏi về thẻ cư trú", id: "Saya punya pertanyaan tentang kartu izin tinggal", ne: "मेरो रेसिडेन्स कार्डबारे प्रश्न छ" } },
  need_moving: { group: "need", suggests: "city_moving", staff: "転入・転居の届出を希望", label: { ja: "ひっこしの とどけを したい", en: "I want to register that I moved", bn: "বাসা বদলের নিবন্ধন করতে চাই", vi: "Tôi muốn đăng ký chuyển nhà", id: "Saya ingin melapor pindah alamat", ne: "बसाइँ सरेको दर्ता गर्न चाहन्छु" } },
  need_mynumber: { group: "need", suggests: "city_mynumber", staff: "マイナンバーカードについての相談", label: { ja: "マイナンバー カードの ことを ききたい", en: "I have a question about my My Number card", bn: "মাই নাম্বার কার্ড নিয়ে প্রশ্ন আছে", vi: "Tôi có câu hỏi về thẻ My Number", id: "Saya punya pertanyaan tentang kartu My Number", ne: "माई नम्बर कार्डबारे प्रश्न छ" } },
  need_letter: { group: "need", suggests: "city_letter", staff: "読めない通知・書類あり", label: { ja: "よめない 手紙が あります", en: "I have a letter I can't read", bn: "এমন একটা চিঠি আছে যা পড়তে পারছি না", vi: "Tôi có một lá thư không đọc được", id: "Saya punya surat yang tidak bisa saya baca", ne: "मसँग पढ्न नसकेको चिठी छ" } },

  card_expiring: { staff: "在留期限が近い・経過したとのこと", label: { ja: "カードの きげんが ちかい・すぎた", en: "My card's date is close or has passed", bn: "কার্ডের মেয়াদ শেষ হয়ে আসছে বা শেষ হয়ে গেছে", vi: "Thẻ của tôi sắp hết hạn hoặc đã hết hạn", id: "Masa berlaku kartu saya hampir habis atau sudah lewat", ne: "मेरो कार्डको म्याद सकिन लागेको वा सकिएको छ" } },
  card_address: { suggests: "city_moving", staff: "在留カードの住居地変更を希望", label: { ja: "カードの じゅうしょを かえたい", en: "I need to change the address on my card", bn: "কার্ডে ঠিকানা বদলাতে হবে", vi: "Tôi cần đổi địa chỉ trên thẻ", id: "Saya perlu mengubah alamat di kartu", ne: "कार्डमा ठेगाना फेर्नुपर्छ" } },
  from_abroad: { staff: "新規入国後の転入とのこと", label: { ja: "日本に ついた ばかりです", en: "I just arrived in Japan", bn: "আমি সবে জাপানে এসেছি", vi: "Tôi vừa mới đến Nhật", id: "Saya baru tiba di Jepang", ne: "म भर्खर जापान आएको हुँ" } },
  from_japan: { staff: "国内の他市町村からの転入とのこと", label: { ja: "日本の ほかの 町から きました", en: "I moved from another town in Japan", bn: "জাপানের অন্য শহর থেকে এসেছি", vi: "Tôi chuyển từ thành phố khác ở Nhật đến", id: "Saya pindah dari kota lain di Jepang", ne: "म जापानकै अर्को सहरबाट आएको हुँ" } },
  mn_get: { staff: "マイナンバーカードの申請・交付を希望", label: { ja: "カードを つくりたい・もらいたい", en: "I want to apply for the card or get it", bn: "কার্ডের জন্য আবেদন করতে বা কার্ড নিতে চাই", vi: "Tôi muốn làm thẻ hoặc nhận thẻ", id: "Saya ingin mengajukan atau mendapatkan kartu", ne: "कार्डका लागि आवेदन दिन वा कार्ड लिन चाहन्छु" } },
  mn_lock: { staff: "暗証番号の失念・ロックとのこと", label: { ja: "カードの ひみつの 番号を わすれた", en: "I forgot the card's passcode", bn: "কার্ডের গোপন কোড ভুলে গেছি", vi: "Tôi quên mã bí mật của thẻ", id: "Saya lupa kode rahasia kartu", ne: "कार्डको गोप्य कोड बिर्सें" } },
  mn_lost: { staff: "マイナンバーカード紛失とのこと", label: { ja: "カードを なくした", en: "I lost my card", bn: "কার্ড হারিয়ে ফেলেছি", vi: "Tôi làm mất thẻ", id: "Kartu saya hilang", ne: "मेरो कार्ड हरायो" } },
  letter_tax: { group: "letter", staff: "通知の種類：税", label: { ja: "ぜいきん", en: "Tax", bn: "কর", vi: "Thuế", id: "Pajak", ne: "कर" } },
  letter_health: { group: "letter", staff: "通知の種類：国民健康保険", label: { ja: "けんこう保険", en: "Health insurance", bn: "স্বাস্থ্যবিমা", vi: "Bảo hiểm y tế", id: "Asuransi kesehatan", ne: "स्वास्थ्य बीमा" } },
  letter_pension: { group: "letter", staff: "通知の種類：年金", label: { ja: "ねんきん", en: "Pension", bn: "পেনশন", vi: "Lương hưu", id: "Pensiun", ne: "पेन्सन" } },
  letter_child: { group: "letter", staff: "通知の種類：子ども（手当・学校）", label: { ja: "こどもの こと（てあて・学校）", en: "Children (allowance or school)", bn: "সন্তান (ভাতা বা স্কুল)", vi: "Con cái (trợ cấp hoặc trường học)", id: "Anak (tunjangan atau sekolah)", ne: "बच्चा (भत्ता वा विद्यालय)" } },
  letter_unknown: { group: "letter", staff: "通知の種類：不明", label: { ja: "わからない", en: "Not sure", bn: "জানি না", vi: "Không rõ", id: "Tidak tahu", ne: "थाहा छैन" } },
  letter_due: { staff: "期限または金額の記載ありとのこと", label: { ja: "日づけや お金の ことが 書いて あります", en: "It shows a date or an amount to pay", bn: "চিঠিতে তারিখ বা টাকার পরিমাণ লেখা আছে", vi: "Thư có ghi ngày hoặc số tiền phải trả", id: "Ada tanggal atau jumlah yang harus dibayar", ne: "चिठीमा मिति वा तिर्नुपर्ने रकम लेखिएको छ" } },
  ...SHARED_TAPS,
};

export const CITY: Pack = {
  id: "city_office", kinds: ["city_office"], name: { staff: "市役所", en: "City office" }, place: "多言語窓口 Help Point",
  responder: {
    staff: "市の通訳・相談員",
    caller: { ja: "市の つうやくの 人", en: "a city interpreter", bn: "শহরের একজন দোভাষী", vi: "phiên dịch viên của thành phố", id: "penerjemah dari kantor kota", ne: "नगरको दोभाषे" },
  },
  recipients: { city_section: "市の担当課", consult_desk: "県外国人相談窓口" },
  why: "Only 4.8% of foreign residents in Sasebo would take a problem to city hall (Sasebo City survey 2019–20).",
  device: "city_letter",
  situations: {
    city_residence: { staff: "在留カード（期間更新・記載事項）の相談", name: { ja: "在留カードの こと", en: "About my residence card", bn: "আমার রেসিডেন্স কার্ড নিয়ে", vi: "Về thẻ cư trú của tôi", id: "Tentang kartu izin tinggal saya", ne: "मेरो रेसिडेन्स कार्डबारे" } },
    city_moving: { staff: "転入・転居の届出", name: { ja: "ひっこしの とどけ", en: "Moving-in or change-of-address notification", bn: "বাসা বদলের নিবন্ধন", vi: "Đăng ký chuyển đến hoặc đổi địa chỉ", id: "Lapor pindah datang atau ganti alamat", ne: "बसाइँ सरेको दर्ता" } },
    city_mynumber: { staff: "マイナンバーカードの手続き", name: { ja: "マイナンバー カードの こと", en: "My Number card", bn: "মাই নাম্বার কার্ড", vi: "Thẻ My Number", id: "Kartu My Number", ne: "माई नम्बर कार्ड" } },
    city_letter: { staff: "読めない通知・書類（税・保険・年金等）", name: { ja: "よめない 手紙が とどいた", en: "A letter I can't read (tax, insurance, pension…)", bn: "এমন চিঠি এসেছে যা পড়তে পারছি না (কর, বিমা, পেনশন…)", vi: "Thư tôi không đọc được (thuế, bảo hiểm, lương hưu…)", id: "Surat yang tidak bisa saya baca (pajak, asuransi, pensiun…)", ne: "पढ्न नसकेको चिठी (कर, बीमा, पेन्सन…)" } },
  },
  taps,
  common: ["need_residence", "need_moving", "need_mynumber", "need_letter", "need_interpreter", "helper"],
  bySituation: {
    city_residence: ["card_expiring", "card_address"],
    city_moving: ["from_abroad", "from_japan"],
    city_mynumber: ["mn_get", "mn_lock", "mn_lost"],
    city_letter: ["letter_tax", "letter_health", "letter_pension", "letter_child", "letter_unknown", "letter_due"],
  },
  replies: CITY_REPLIES,
  scope: NO_LEGAL,
  hint: {
    ja: "まどぐちの 人にも きけます。", en: "You can also ask at the counter.", bn: "কাউন্টারেও জিজ্ঞেস করতে পারেন।",
    vi: "Bạn cũng có thể hỏi ở quầy.", id: "Anda juga bisa bertanya di loket.", ne: "काउन्टरमा पनि सोध्न सक्नुहुन्छ।",
  },
};
