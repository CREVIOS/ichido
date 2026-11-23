// The railway's approved replies for a station Help Point.
import type { PackReply } from "./types.ts";

export const TRANSIT_REPLIES: Record<string, PackReply> = {
  TRANSIT_GUIDE: {
    code: "T-1", title: "改札で行き先を伝える", rule: { faults: ["transit_way", "transit_access"] },
    text: () => ({
      ja: "かいさつで 駅の 係の 人に、いきたい ところを つたえて ください。",
      en: "At the ticket gate, tell station staff where you want to go.",
      bn: "টিকিট গেটে কর্মীকে বলুন কোথায় যেতে চান।",
      vi: "Tại cổng vé, hãy nói với nhân viên nơi bạn muốn đến.",
      id: "Di gerbang tiket, beri tahu petugas tujuan Anda.",
      ne: "टिकट गेटमा कर्मचारीलाई जान चाहेको ठाउँ बताउनुहोस्।",
    }),
  },
  TRANSIT_LAST_TRAIN: {
    code: "T-2", title: "終電後の案内（タクシー乗り場・始発時刻、宿泊先がない場合は職員へ）", rule: { faults: ["transit_last_train"] },
    text: () => ({
      ja: "きょうの さいごの 電車は もう でました。駅の 係の 人が、タクシーのりばと、あさ いちばんの 電車の 時間を おしえます。とまる ところが ない ときは、係の 人に いって ください。",
      en: "Today's last train has already left. Station staff will show you the taxi stand and the time of the first train in the morning. If you have nowhere to stay tonight, please tell the staff.",
      bn: "আজকের শেষ ট্রেন চলে গেছে। স্টেশনের কর্মী আপনাকে ট্যাক্সি স্ট্যান্ড আর সকালের প্রথম ট্রেনের সময় জানাবেন। আজ রাতে থাকার জায়গা না থাকলে কর্মীকে বলুন।",
      vi: "Chuyến tàu cuối hôm nay đã chạy rồi. Nhân viên nhà ga sẽ chỉ cho bạn bến taxi và giờ chuyến tàu đầu tiên buổi sáng. Nếu tối nay bạn không có chỗ ở, hãy nói với nhân viên.",
      id: "Kereta terakhir hari ini sudah berangkat. Petugas stasiun akan menunjukkan tempat taksi dan jam kereta pertama besok pagi. Jika Anda tidak punya tempat menginap malam ini, beri tahu petugas.",
      ne: "आजको अन्तिम रेल गइसक्यो। स्टेसनका कर्मचारीले ट्याक्सी स्ट्यान्ड र बिहानको पहिलो रेलको समय बताउनुहुन्छ। आज राति बस्ने ठाउँ छैन भने कर्मचारीलाई भन्नुहोस्।",
    }),
  },
  TRANSIT_LOST_ITEM: {
    code: "T-3", title: "忘れ物の捜索（鉄道会社で保管後、警察へ引渡し）", rule: { faults: ["transit_lost_item"] },
    text: () => ({
      ja: "駅の 係の 人が、わすれものを いっしょに さがします。電車や 駅で みつかった ものは、まず 鉄道の 会社が あずかり、あとで 警察に わたします。ものの いろや かたちを 係の 人に つたえて ください。カードの 番号は ここに 書かないで ください。",
      en: "Station staff will look for it with you. Things found on trains and in stations are kept by the railway first and later handed to the police. Please tell the staff what it looks like — its colour and shape. Do not type any numbers from cards here.",
      bn: "স্টেশনের কর্মী আপনার সঙ্গে জিনিসটি খুঁজবেন। ট্রেন বা স্টেশনে পাওয়া জিনিস প্রথমে রেল কোম্পানি রাখে, পরে পুলিশের কাছে দেয়। জিনিসটি দেখতে কেমন — রং ও আকার — কর্মীকে বলুন। এখানে কোনো কার্ডের নম্বর লিখবেন না।",
      vi: "Nhân viên nhà ga sẽ cùng bạn tìm đồ. Đồ tìm thấy trên tàu và trong ga được công ty đường sắt giữ trước, sau đó giao cho cảnh sát. Hãy cho nhân viên biết món đồ trông như thế nào — màu sắc và hình dạng. Đừng nhập số trên thẻ ở đây.",
      id: "Petugas stasiun akan mencarinya bersama Anda. Barang yang ditemukan di kereta dan stasiun disimpan dulu oleh perusahaan kereta, lalu diserahkan ke polisi. Beri tahu petugas seperti apa barangnya — warna dan bentuknya. Jangan ketik nomor dari kartu di sini.",
      ne: "स्टेसनका कर्मचारीले तपाईंसँगै सामान खोज्नुहुन्छ। रेल र स्टेसनमा भेटिएका सामान पहिले रेल कम्पनीले राख्छ, पछि प्रहरीलाई बुझाउँछ। सामान कस्तो देखिन्छ — रङ र आकार — कर्मचारीलाई भन्नुहोस्। यहाँ कुनै कार्डको नम्बर नलेख्नुहोस्।",
    }),
  },
  TRANSIT_LOST_ID: {
    code: "T-4", title: "在留カードの紛失（交番へ届出、14日以内に入管で再交付申請）", rule: { faults: ["transit_lost_item"], needsFlags: ["item_card"] },
    text: () => ({
      ja: "在留カードを なくした ときは、交番か 警察で なくした ことを とどけて ください。そのあと 14日 いないに、入管（にゅうかん）で あたらしい カードを たのんで ください。カードの 番号は ここに 書かないで ください。",
      en: "If you lost your residence card, report it at a police box (交番) or police station. Then, within 14 days, apply for a new card at the Immigration Services office (入管). Do not type the card's number here.",
      bn: "রেসিডেন্স কার্ড হারালে পুলিশ বক্স (交番) বা থানায় জানান। তারপর ১৪ দিনের মধ্যে ইমিগ্রেশন অফিসে (入管) নতুন কার্ডের আবেদন করুন। কার্ডের নম্বর এখানে লিখবেন না।",
      vi: "Nếu bạn làm mất thẻ cư trú, hãy trình báo tại đồn cảnh sát nhỏ (交番) hoặc đồn cảnh sát. Sau đó, trong vòng 14 ngày, hãy xin cấp thẻ mới tại Cục Xuất nhập cảnh (入管). Đừng nhập số thẻ ở đây.",
      id: "Jika kartu izin tinggal Anda hilang, laporkan ke pos polisi (交番) atau kantor polisi. Lalu, dalam 14 hari, ajukan kartu baru di kantor Imigrasi (入管). Jangan ketik nomor kartu itu di sini.",
      ne: "रेसिडेन्स कार्ड हरायो भने प्रहरी चौकी (交番) वा प्रहरी कार्यालयमा खबर गर्नुहोस्। त्यसपछि १४ दिनभित्र अध्यागमन कार्यालय (入管) मा नयाँ कार्डका लागि आवेदन दिनुहोस्। कार्डको नम्बर यहाँ नलेख्नुहोस्।",
    }),
  },
  // Fictional railway catalogue. Non-English drafts await native review.
  TRANSIT_LEAVE: {
    code: "T-6", title: "鉄道が照会を受諾・受付番号で後日確認", offersChoice: true,
    rule: { faults: ["transit_lost_item"], needsFlags: ["leave_soon"] },
    text: (s) => ({
      ja: `もう ここを でても いいです。あとで 駅の まどぐちで この 番号を みせて ください。 ${s.reference ?? "—"}`,
      en: `You can leave now. Show this railway reference at the ticket counter to follow up: ${s.reference ?? "—"}`,
      bn: `এখন চলে যেতে পারেন। পরে টিকিট কাউন্টারে এই রেলের রেফারেন্স দেখান: ${s.reference ?? "—"}`,
      vi: `Bạn có thể đi. Sau đó hãy đưa mã tiếp nhận này tại quầy vé để hỏi lại: ${s.reference ?? "—"}`,
      id: `Anda boleh pergi. Tunjukkan referensi kereta ini di loket untuk menanyakan perkembangannya: ${s.reference ?? "—"}`,
      ne: `अब जान सक्नुहुन्छ। पछि टिकट काउन्टरमा यो रेल सन्दर्भ देखाएर सोध्नुहोस्: ${s.reference ?? "—"}`,
    }),
  },
  TRANSIT_ACCESS: {
    code: "T-5", title: "乗降の介助（降車駅への連絡も可能）", rule: { faults: ["transit_access"] },
    text: () => ({
      ja: "駅の 係の 人が きて、のりばや 電車まで てつだいます。おりる 駅の 係の 人にも れんらく できます。ここで まって いて ください。",
      en: "Station staff will come and help you to the platform and onto the train. They can also ask the staff at the station where you get off to meet you. Please wait here.",
      bn: "স্টেশনের কর্মী এসে আপনাকে প্ল্যাটফর্ম ও ট্রেনে উঠতে সাহায্য করবেন। আপনি যে স্টেশনে নামবেন, সেখানকার কর্মীকেও খবর দিতে পারেন। এখানে অপেক্ষা করুন।",
      vi: "Nhân viên nhà ga sẽ đến giúp bạn ra sân ga và lên tàu. Họ cũng có thể nhờ nhân viên ở ga bạn xuống đón bạn. Hãy chờ ở đây.",
      id: "Petugas stasiun akan datang membantu Anda ke peron dan naik kereta. Mereka juga bisa meminta petugas di stasiun tujuan Anda untuk menjemput. Silakan tunggu di sini.",
      ne: "स्टेसनका कर्मचारी आएर तपाईंलाई प्लेटफर्मसम्म र रेलमा चढ्न सहयोग गर्नुहुन्छ। तपाईं ओर्लने स्टेसनका कर्मचारीलाई पनि खबर गर्न सक्नुहुन्छ। यहीँ पर्खनुहोस्।",
    }),
  },
};
