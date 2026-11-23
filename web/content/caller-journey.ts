import type { L10n } from "./catalogue.ts";

// Non-English wording awaits native review.
export const JOURNEY = {
  connecting: { en: "Connecting…", ja: "つないで います", bn: "সংযোগ হচ্ছে…", vi: "Đang kết nối…", id: "Sedang menyambungkan…", ne: "जोडिँदै छ…" },
  offline: { en: "Offline. Your screen may be out of date.", ja: "いまは つながりません。前の おしらせです。", bn: "সংযোগ নেই। আগের তথ্য দেখানো হচ্ছে।", vi: "Mất kết nối. Đây có thể là thông tin cũ.", id: "Terputus. Informasi ini mungkin sudah lama.", ne: "सम्पर्क छैन। यो जानकारी पुरानो हुन सक्छ।" },
  updated: { en: "Last updated", ja: "さいごに たしかめた とき", bn: "শেষ হালনাগাদ", vi: "Cập nhật lần cuối", id: "Terakhir diperbarui", ne: "पछिल्लो अद्यावधिक" },
  retry: { en: "Try again", ja: "もういちど つなぐ", bn: "আবার চেষ্টা করুন", vi: "Thử lại", id: "Coba lagi", ne: "फेरि प्रयास गर्नुहोस्" },
  expired: { en: "This pairing expired. Ask staff for a new code.", ja: "つなぐ じかんが すぎました。係の 人に 新しい コードを きいて ください。", bn: "সংযোগের মেয়াদ শেষ। কর্মীর কাছে নতুন কোড চান।", vi: "Kết nối đã hết hạn. Hãy xin nhân viên mã mới.", id: "Sambungan kedaluwarsa. Minta kode baru kepada petugas.", ne: "जोडीको म्याद सकियो। कर्मचारीसँग नयाँ कोड माग्नुहोस्।" },
  replaced: { en: "This pairing ended. Ask staff to pair again.", ja: "この つながりは おわりました。係の 人に コードを きいて ください。", bn: "এই সংযোগ শেষ হয়েছে। কর্মীর কাছে আবার কোড চান।", vi: "Kết nối này đã kết thúc. Hãy nhờ nhân viên kết nối lại.", id: "Sambungan ini berakhir. Minta petugas menyambungkan lagi.", ne: "यो जडान सकियो। कर्मचारीलाई फेरि जोड्न भन्नुहोस्।" },
  abandoned: { en: "The desk closed this case before finishing. Ask staff for help again.", ja: "そうだんの とちゅうで うけつけが おわりました。もういちど 係の 人に きいて ください。", bn: "সাহায্য শেষ হওয়ার আগেই কেসটি বন্ধ হয়েছে। আবার কর্মীর সাহায্য চান।", vi: "Hồ sơ đã đóng trước khi hỗ trợ xong. Hãy nhờ nhân viên lần nữa.", id: "Kasus ditutup sebelum selesai. Minta bantuan petugas lagi.", ne: "सहयोग नसकिँदै केस बन्द भयो। कर्मचारीसँग फेरि मद्दत माग्नुहोस्।" },
  resume: { en: "Open my case at", ja: "つづきを ひらく", bn: "আমার কেসটি খুলুন", vi: "Mở hồ sơ của tôi tại", id: "Buka kasus saya di", ne: "मेरो केस खोल्नुहोस्" },
  review: { en: "Review my words", ja: "書いた ことを たしかめる", bn: "আমার লেখা দেখে নিই", vi: "Xem lại lời tôi", id: "Periksa tulisan saya", ne: "मैले लेखेको कुरा हेर्ने" },
  privacy: { en: "Submitted text goes to Ichido and may be processed by AI. Leave out personal numbers.", ja: "おくった 文は 一度に とどきます。AIも よむ ことが あります。あなたの 番号は 書かないで ください。", bn: "পাঠানো লেখা ইচিদো পায় এবং এআই পড়তে পারে। ব্যক্তিগত নম্বর লিখবেন না।", vi: "Ichido nhận nội dung bạn gửi và AI có thể xử lý. Đừng nhập số cá nhân.", id: "Tulisan yang dikirim diterima Ichido dan mungkin diproses AI. Jangan tulis nomor pribadi.", ne: "पठाएको लेखाइ इचिदोमा पुग्छ र एआईले पढ्न सक्छ। व्यक्तिगत नम्बर नलेख्नुहोस्।" },
  choose: { en: "Choose an answer about what happened before sending.", ja: "おくる まえに、なにが あったか ひとつ えらんで ください。", bn: "পাঠানোর আগে কী হয়েছে তা বেছে নিন।", vi: "Trước khi gửi, hãy chọn điều đã xảy ra.", id: "Pilih jawaban tentang kejadian sebelum mengirim.", ne: "पठाउनुअघि के भयो भन्ने जवाफ छान्नुहोस्।" },
  other: { en: "Something else", ja: "ほかの こと", bn: "অন্য কিছু", vi: "Việc khác", id: "Hal lain", ne: "अरू कुरा" },
  sent: { en: "Sent", ja: "おくりました", bn: "পাঠানো হয়েছে", vi: "Đã gửi", id: "Terkirim", ne: "पठाइयो" },
  receipt: { en: "Show my case receipt", ja: "そうだんの ひかえを みる", bn: "কেসের রসিদ দেখুন", vi: "Xem phiếu hồ sơ", id: "Lihat tanda terima kasus", ne: "केसको रसिद हेर्नुहोस्" },
  saveReceipt: { en: "Save a copy", ja: "ひかえを のこす", bn: "একটি কপি রাখুন", vi: "Lưu bản sao", id: "Simpan salinan", ne: "एक प्रति राख्नुहोस्" },
  checkHere: { en: "Check this case here for updates.", ja: "あとで この 画面で おしらせを みて ください。", bn: "নতুন খবরের জন্য এই কেসটি এখানে দেখুন।", vi: "Hãy xem lại hồ sơ tại đây để biết tin mới.", id: "Periksa kasus ini di sini untuk kabar terbaru.", ne: "नयाँ जानकारीका लागि यहीँ केस हेर्नुहोस्।" },
  sticker: { en: "Press or scan for help. Without a phone, use the handset or ask staff.", ja: "たすけが いる ときは おすか、シールを よんで ください。けいたいが ない ときは そこの 電話か 係の 人へ。", bn: "সাহায্যের জন্য চাপুন বা স্ক্যান করুন। ফোন না থাকলে এখানকার ফোন ব্যবহার করুন বা কর্মীকে বলুন।", vi: "Nhấn nút hoặc quét mã để được giúp. Nếu không có điện thoại, dùng ống nghe hoặc hỏi nhân viên.", id: "Tekan atau pindai untuk bantuan. Tanpa ponsel, gunakan gagang telepon atau tanya petugas.", ne: "सहयोगका लागि थिच्नुहोस् वा स्क्यान गर्नुहोस्। फोन नभए यहाँको फोन प्रयोग गर्नुहोस् वा कर्मचारीलाई भन्नुहोस्।" },
  allergyCard: { en: "Show food allergy card · বাংলা / 日本語", ja: "食べものの アレルギーを みせる", bn: "খাবারের অ্যালার্জির কার্ড দেখান", vi: "Hiện thẻ dị ứng thực phẩm", id: "Tunjukkan kartu alergi makanan", ne: "खानेकुराको एलर्जी कार्ड देखाउने" },
} satisfies Record<string, L10n>;

export type EndReason = "expired" | "abandoned" | "replaced";

// Published by the Nagasaki International Association at https://www.nia.or.jp/index.php/page/consultation
export const CONSULTATION = { phone: "095-820-3377", email: "soudan@nia.or.jp" };
export const allergyFacts = (flags: string[]) => flags.includes("diet_allergy")
  ? flags.filter(f => ["diet_allergy","allergy_me","allergy_child","allergy_other"].includes(f)) : [];
export function receipt(station: string, id: string) {
  return `Ichido · ${station} · ${id.slice(0,8)}`;
}
