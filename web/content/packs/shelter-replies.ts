// The municipality's approved replies at a shelter. While an urgent tap is on, only SHELTER_TELL_NOW may be sent.
// Updated non-English caller wording awaits native review.
import type { PackReply } from "./types.ts";

const URGENT = ["red_hurt", "family_child"];
const calm = { blockedBy: URGENT };

export const SHELTER_REPLIES: Record<string, PackReply> = {
  SHELTER_TELL_NOW: {
    code: "S-0", title: "至急：避難所の職員へ直ちに伝える（職員不在で急病・重傷なら119番）", rule: { needsFlags: URGENT },
    text: () => ({
      ja: "いますぐ ひなんじょの 係の 人に つたえて ください。ちかくに 係の 人が いなくて、ひどい けがや びょうきの 人が いる ときは、119に 電話して ください。",
      en: "Tell the shelter staff now. If no staff are near and someone is badly hurt or very sick, call 119.",
      bn: "এখনই আশ্রয়কেন্দ্রের কর্মীকে জানান। কাছে কোনো কর্মী না থাকলে এবং কেউ গুরুতর আহত বা খুব অসুস্থ হলে ১১৯-এ ফোন করুন।",
      vi: "Hãy báo ngay cho nhân viên nơi sơ tán. Nếu không có nhân viên ở gần và có người bị thương nặng hoặc ốm nặng, hãy gọi 119.",
      id: "Segera beri tahu petugas pengungsian. Jika tidak ada petugas di dekat Anda dan ada orang yang terluka parah atau sakit berat, telepon 119.",
      ne: "अहिले नै आश्रयस्थलका कर्मचारीलाई भन्नुहोस्। नजिकै कर्मचारी नभए र कोही गम्भीर घाइते वा धेरै बिरामी भए ११९ मा फोन गर्नुहोस्।",
    }),
  },
  SHELTER_CHECKIN: {
    code: "S-1", title: "避難所の受付（国籍を問わず利用可・在留カードの提示不要・受付票は職員が補助）", rule: { faults: ["shelter_checkin"], ...calm },
    text: () => ({
      ja: "ようこそ。ひなんじょは、どこの 国の 人でも つかえます。在留カードや カードの 番号を みせる ひつようは ありません。うけつけの 係の 人が、ここに いる 人の 紙を いっしょに 書きます。",
      en: "Welcome. Anyone can use this shelter, whatever their nationality. You do not need to show your residence card or give any ID numbers. The reception staff will fill in the shelter's sheet with you.",
      bn: "স্বাগতম। যেকোনো দেশের মানুষ এই আশ্রয়কেন্দ্র ব্যবহার করতে পারেন। রেসিডেন্স কার্ড দেখাতে বা কোনো পরিচয় নম্বর দিতে হবে না। রিসেপশনের কর্মীরা আপনার সঙ্গে আশ্রয়কেন্দ্রের ফর্ম পূরণ করবেন।",
      vi: "Chào mừng bạn. Người thuộc bất kỳ quốc tịch nào cũng có thể dùng nơi sơ tán này. Bạn không cần xuất trình thẻ cư trú hay cung cấp số giấy tờ nào. Nhân viên tiếp nhận sẽ cùng bạn điền phiếu của nơi sơ tán.",
      id: "Selamat datang. Siapa pun boleh memakai tempat pengungsian ini, apa pun kewarganegaraannya. Anda tidak perlu menunjukkan kartu izin tinggal atau memberi nomor identitas apa pun. Petugas penerimaan akan mengisi formulir pengungsian bersama Anda.",
      ne: "स्वागत छ। जुनसुकै देशका मानिसले यो आश्रयस्थल प्रयोग गर्न सक्नुहुन्छ। रेसिडेन्स कार्ड देखाउनु वा कुनै परिचय नम्बर दिनु पर्दैन। रिसेप्सनका कर्मचारीले तपाईंसँगै आश्रयस्थलको फारम भर्नुहुन्छ।",
    }),
  },
  SHELTER_NEEDS: {
    code: "S-2", title: "避難所の担当者が支援依頼を受諾", rule: { faults: ["shelter_needs"], ...calm },
    text: () => ({
      ja: "ひなんじょの 係の 人が あなたの たのみを うけつけました。",
      en: "A shelter worker has accepted your request for help.",
      bn: "আশ্রয়কেন্দ্রের একজন কর্মী আপনার সাহায্যের অনুরোধ গ্রহণ করেছেন।",
      vi: "Một nhân viên nơi sơ tán đã nhận yêu cầu hỗ trợ của bạn.",
      id: "Petugas pengungsian sudah menerima permintaan bantuan Anda.",
      ne: "आश्रयस्थलका कर्मचारीले तपाईंको सहयोगको अनुरोध स्वीकार गर्नुभएको छ।",
    }),
  },
  SHELTER_MEDICINE: {
    code: "S-3", title: "常用薬は保健師へ（お薬手帳・薬の箱を提示）", rule: { faults: ["shelter_needs", "shelter_checkin"], needsFlags: ["need_medicine"], ...calm },
    text: () => ({
      ja: "くすりの ことは、ひなんじょの 保健師（ほけんし）と はなして ください。お薬手帳や くすりの はこが あれば みせて ください。",
      en: "Please talk to the shelter's public health nurse (保健師) about your medicine. If you have your medicine notebook (お薬手帳) or the medicine box, show it to them.",
      bn: "ওষুধের বিষয়ে আশ্রয়কেন্দ্রের জনস্বাস্থ্য নার্সের (保健師) সঙ্গে কথা বলুন। ওষুধের খাতা (お薬手帳) বা ওষুধের বাক্স থাকলে দেখান।",
      vi: "Hãy nói chuyện với y tá y tế công cộng (保健師) của nơi sơ tán về thuốc của bạn. Nếu có sổ thuốc (お薬手帳) hoặc hộp thuốc, hãy cho họ xem.",
      id: "Bicarakan obat Anda dengan perawat kesehatan masyarakat (保健師) di pengungsian. Jika Anda punya buku catatan obat (お薬手帳) atau kotak obatnya, tunjukkan kepada mereka.",
      ne: "औषधिबारे आश्रयस्थलका जनस्वास्थ्य नर्स (保健師) सँग कुरा गर्नुहोस्। औषधि पुस्तिका (お薬手帳) वा औषधिको बट्टा छ भने देखाउनुहोस्।",
    }),
  },
  SHELTER_FAMILY: {
    code: "S-4", title: "避難所の担当者が支援依頼を受諾", rule: { faults: ["shelter_family"], ...calm },
    text: () => ({
      ja: "ひなんじょの 係の 人が あなたの たのみを うけつけました。 係の 人は ほかの ひなんじょとも れんらくを とります。家族に ぶじを つたえる ときは、171 に 電話して こえを のこせます。",
      en: "A shelter worker has accepted your request for help. To leave a 'safe' message for your family, you can call 171 (the Disaster Emergency Message Dial) or use web171.",
      bn: "আশ্রয়কেন্দ্রের একজন কর্মী আপনার সাহায্যের অনুরোধ গ্রহণ করেছেন। পরিবারের জন্য 'নিরাপদ আছি' বার্তা রাখতে ১৭১ (দুর্যোগ জরুরি বার্তা ডায়াল) নম্বরে ফোন করতে বা web171 ব্যবহার করতে পারেন।",
      vi: "Một nhân viên nơi sơ tán đã nhận yêu cầu hỗ trợ của bạn. Để để lại lời nhắn 'tôi an toàn' cho gia đình, bạn có thể gọi 171 (đường dây nhắn tin khẩn cấp khi thiên tai) hoặc dùng web171.",
      id: "Petugas pengungsian sudah menerima permintaan bantuan Anda. Untuk meninggalkan pesan 'saya selamat' bagi keluarga, Anda bisa menelepon 171 (layanan pesan darurat bencana) atau memakai web171.",
      ne: "आश्रयस्थलका कर्मचारीले तपाईंको सहयोगको अनुरोध स्वीकार गर्नुभएको छ। परिवारका लागि 'म सुरक्षित छु' सन्देश छोड्न १७१ (विपद् आपतकालीन सन्देश डायल) मा फोन गर्न वा web171 प्रयोग गर्न सक्नुहुन्छ।",
    }),
  },
  SHELTER_INFO: {
    code: "S-5", title: "情報の入手先（掲示板・職員の案内・この画面の承認済み通知）", rule: { autonomous: true, faults: ["shelter_info"], ...calm },
    text: () => ({
      ja: "おしらせは ひなんじょの けいじばんに はり、係の 人が つたえます。この ひなんじょに おしらせが ある ときは、この 画面にも でます。わからない ときは 係の 人に きいて ください。",
      en: "Official updates are posted on the shelter's notice board and announced by staff. When this shelter has an approved notice, it also appears on this screen. Ask the staff if you are not sure.",
      bn: "সরকারি খবর আশ্রয়কেন্দ্রের নোটিশ বোর্ডে টাঙানো হয় এবং কর্মীরা ঘোষণা করেন। এই আশ্রয়কেন্দ্রের জন্য অনুমোদিত কোনো নোটিশ থাকলে তা এই স্ক্রিনেও দেখা যাবে। নিশ্চিত না হলে কর্মীদের জিজ্ঞেস করুন।",
      vi: "Thông báo chính thức được dán ở bảng tin của nơi sơ tán và nhân viên sẽ thông báo. Khi nơi sơ tán này có thông báo đã được duyệt, thông báo cũng hiện trên màn hình này. Nếu chưa rõ, hãy hỏi nhân viên.",
      id: "Kabar resmi ditempel di papan pengumuman pengungsian dan diumumkan oleh petugas. Jika tempat pengungsian ini punya pengumuman resmi, pengumuman itu juga muncul di layar ini. Tanyakan kepada petugas jika Anda ragu.",
      ne: "आधिकारिक जानकारी आश्रयस्थलको सूचना पाटीमा टाँसिन्छ र कर्मचारीले घोषणा गर्नुहुन्छ। यो आश्रयस्थलका लागि स्वीकृत सूचना भए यही स्क्रिनमा पनि देखिन्छ। पक्का नभए कर्मचारीलाई सोध्नुहोस्।",
    }),
  },
  SHELTER_STAFF_COMING: {
    code: "S-6", title: "避難所の職員が向かう（待機の依頼）", rule: { ...calm },
    text: () => ({
      ja: "ひなんじょの 係の 人が あなたの ところに きます。ここで まって いて ください。",
      en: "Shelter staff are coming to you. Please wait here.",
      bn: "আশ্রয়কেন্দ্রের কর্মী আপনার কাছে আসছেন। এখানে অপেক্ষা করুন।",
      vi: "Nhân viên nơi sơ tán đang đến chỗ bạn. Hãy chờ ở đây.",
      id: "Petugas pengungsian sedang menuju ke tempat Anda. Silakan tunggu di sini.",
      ne: "आश्रयस्थलका कर्मचारी तपाईंकहाँ आउँदै हुनुहुन्छ। यहीँ पर्खनुहोस्।",
    }),
  },
};
