import type { L10n } from "./catalogue.ts";

// Frozen wording for sent replies (retained-card/v3): an ATM is often in a convenience store, so "where to ask"
// names whoever runs that ATM (a bank counter, or the ATM operator's help line), and questions about the card
// itself go to the bank that issued it. Slot values come from the stored reply.
export const manual: Record<string, L10n> = {
  "HELD_WAIT_OR_LEAVE": {
    "bn": "আপনার কার্ড মেশিনের ভেতরে আছে। এখানে অপেক্ষা করতে পারেন, বা চলে যেতে পারেন। খবর এখানেই দেখাবে। {branch}-এর কাছেও জানতে পারবেন ({hours})।",
    "vi": "Thẻ của bạn đang ở trong máy. Bạn có thể chờ ở đây hoặc ra về. Tin mới sẽ hiện ở đây. Bạn cũng có thể hỏi {branch} ({hours}).",
    "id": "Kartu Anda ada di dalam mesin. Anda bisa menunggu di sini atau pulang. Kabar terbaru akan muncul di sini. Anda juga bisa bertanya ke {branch} ({hours}).",
    "ne": "तपाईंको कार्ड मेसिनभित्र छ। यहीँ पर्खन वा जान सक्नुहुन्छ। नयाँ जानकारी यहीँ देखिन्छ। {branch} मा पनि सोध्न सक्नुहुन्छ ({hours})।",
    "en": "Your card is inside the machine. You can wait here or leave. Updates will show here. You can also ask {branch} ({hours}).",
    "ja": "カードは ATM の 中に あります。ここで まっても、かえっても いいです。おしらせは この 画面に でます。{branch} にも きく ことが できます。{hours} きけます。"
  },
  "CARD_FORGOTTEN": {
    "bn": "নিরাপত্তার জন্য মেশিন কার্ডটি ভেতরে টেনে নিয়েছে। এখানে অপেক্ষা করার দরকার নেই। {branch} ({hours}) অথবা যে ব্যাংক কার্ডটি দিয়েছে, তাদের জিজ্ঞেস করুন।",
    "vi": "Máy đã thu thẻ vào trong để giữ an toàn. Bạn không cần chờ ở đây. Hãy hỏi {branch} ({hours}) hoặc ngân hàng phát hành thẻ.",
    "id": "Mesin menarik kartu ke dalam agar aman. Anda tidak perlu menunggu di sini. Tanyakan ke {branch} ({hours}) atau bank penerbit kartu.",
    "ne": "सुरक्षाका लागि मेसिनले कार्ड भित्र तान्यो। यहाँ पर्खनु पर्दैन। {branch} ({hours}) वा कार्ड जारी गर्ने बैंकलाई सोध्नुहोस्।",
    "en": "The machine took the card back inside to keep it safe. No need to wait here. Ask {branch} ({hours}) or the bank that issued the card.",
    "ja": "ATM が カードを 中に もどしました。ここで まつ ひつようは ありません。{branch} に きく ことが できます。{hours} きけます。カードを 出した 銀行でも きけます。"
  },
  "CARD_KEPT_RULE": {
    "bn": "ব্যাংকের নিয়মে মেশিন কার্ডটি রেখে দিয়েছে (যেমন হারানো বা মেয়াদ শেষ হওয়া কার্ড)। এটি ত্রুটি নয়। এখানে অপেক্ষা করার দরকার নেই। যে ব্যাংক কার্ডটি দিয়েছে, তাদের জিজ্ঞেস করুন।",
    "vi": "Máy giữ thẻ theo quy định của ngân hàng (ví dụ thẻ đã báo mất hoặc hết hạn). Máy không hỏng. Bạn không cần chờ ở đây. Hãy hỏi ngân hàng phát hành thẻ.",
    "id": "Mesin menahan kartu karena aturan bank (misalnya kartu yang dilaporkan hilang atau kedaluwarsa). Mesin tidak rusak. Anda tidak perlu menunggu di sini. Tanyakan ke bank penerbit kartu.",
    "ne": "बैंकको नियमअनुसार मेसिनले कार्ड राख्यो (जस्तै हराएको वा म्याद सकिएको कार्ड)। मेसिन बिग्रेको होइन। यहाँ पर्खनु पर्दैन। कार्ड जारी गर्ने बैंकलाई सोध्नुहोस्।",
    "en": "The machine kept the card under the bank's rules (for example, a lost or expired card). It is not broken. No need to wait here. Ask the bank that issued the card.",
    "ja": "ATM は 銀行の きまりで カードを あずかりました（なくした カード、きげんが きれた カード など）。こわれた のでは ありません。ここで まつ ひつようは ありません。カードを 出した 銀行に きいて ください。"
  },
  "CARD_UNREADABLE": {
    "bn": "মেশিন কার্ডটি পড়তে পারেনি। কার্ডে দাগ থাকতে পারে বা পুরোনো হতে পারে। যে ব্যাংক কার্ডটি দিয়েছে, সেখানে নিয়ে যান।",
    "vi": "Máy không đọc được thẻ. Thẻ có thể bị trầy hoặc đã cũ. Hãy mang thẻ đến ngân hàng phát hành thẻ.",
    "id": "Mesin tidak bisa membaca kartu. Kartu mungkin tergores atau aus. Bawa kartu ke bank penerbitnya.",
    "ne": "मेसिनले कार्ड पढ्न सकेन। कार्ड कोरिएको वा पुरानो हुन सक्छ। कार्ड जारी गर्ने बैंकमा लैजानुहोस्।",
    "en": "The machine could not read the card. It may be scratched or worn. Take it to the bank that issued it.",
    "ja": "ATM が カードを よめませんでした。カードに きずが あるか、ふるい かもしれません。カードを 出した 銀行に もって いって ください。"
  },
  "RESIDENCE_CARD": {
    "bn": "এটিএম যদি বলে কার্ডটি ব্যবহার করা যাবে না, তা আপনার থাকার মেয়াদ নিয়ে ব্যাংকের নিয়ম হতে পারে। নতুন রেসিডেন্স কার্ড পেলে, যে ব্যাংক আপনার কার্ড দিয়েছে সেখানে নিয়ে যান। নাগাসাকি প্রিফেকচারের বিদেশি বাসিন্দা পরামর্শ কেন্দ্র ২২টি ভাষায় সাহায্য করে।",
    "vi": "Nếu ATM báo thẻ không dùng được, có thể do quy định của ngân hàng về thời hạn lưu trú. Khi có thẻ cư trú mới, hãy mang đến ngân hàng phát hành thẻ của bạn. Quầy tư vấn người nước ngoài của tỉnh Nagasaki hỗ trợ 22 ngôn ngữ.",
    "id": "Jika ATM menyatakan kartu tidak bisa dipakai, mungkin karena aturan bank tentang masa tinggal Anda. Setelah mendapat kartu izin tinggal (residence card) baru, bawa ke bank penerbit kartu Anda. Layanan konsultasi warga asing Prefektur Nagasaki membantu dalam 22 bahasa.",
    "ne": "एटीएमले कार्ड चल्दैन भन्यो भने, तपाईंको बसाइ अवधिबारे बैंकको नियम हुन सक्छ। नयाँ रेसिडेन्स कार्ड पाएपछि कार्ड जारी गर्ने बैंकमा लैजानुहोस्। नागासाकी प्रिफेक्चरको विदेशी बासिन्दा परामर्श केन्द्रले २२ भाषामा सहयोग गर्छ।",
    "en": "If the ATM says the card cannot be used, it may be the bank's rule about your residence period. When you get a new residence card, take it to the bank that issued your card. Nagasaki Prefecture's foreign residents' desk can help in 22 languages.",
    "ja": "「この カードは つかえません」と でたら、在留カード（ざいりゅうカード）の きげんに ついての 銀行の きまり かもしれません。新しい 在留カードを、カードを 出した 銀行に もって いって ください。長崎県の 外国から 来た 人の そうだん まどぐちでも、22の ことばで きけます。"
  },
  "CASH_DEBITED": {
    "bn": "টাকা কেটে নেওয়া হলেও নগদ বের না হলে, ব্যাংক দেখে ব্যালান্স ঠিক করে দেবে। কোনো রসিদ পেলে রেখে দিন। এখানে অপেক্ষা করার দরকার নেই। {branch}-এর কাছেও জানতে পারবেন ({hours})।",
    "vi": "Nếu tiền bị trừ mà máy không nhả tiền, ngân hàng sẽ kiểm tra và điều chỉnh số dư. Hãy giữ lại phiếu nếu có. Bạn không cần chờ ở đây. Bạn cũng có thể hỏi {branch} ({hours}).",
    "id": "Jika saldo terpotong tetapi uang tidak keluar, bank akan memeriksa dan membetulkan saldo Anda. Simpan struk jika ada. Anda tidak perlu menunggu di sini. Anda juga bisa bertanya ke {branch} ({hours}).",
    "ne": "खाताबाट पैसा काटियो तर नगद निस्किएन भने, बैंकले जाँचेर मौज्दात मिलाउँछ। रसिद भए राख्नुहोस्। यहाँ पर्खनु पर्दैन। {branch} मा पनि सोध्न सक्नुहुन्छ ({hours})।",
    "en": "If money left your account but no cash came out, the bank will check and fix your balance. Keep any slip. No need to wait here. You can also ask {branch} ({hours}).",
    "ja": "お金が でないのに こうざの お金が へった ときは、銀行が しらべて なおします。ATM から でた 紙は すてないで ください。ここで まつ ひつようは ありません。{branch} にも きく ことが できます。{hours} きけます。"
  },
  "LIMIT_REFUSED": {
    "bn": "ব্যাংকের সীমার (যেমন দৈনিক সীমা) কারণে লেনদেন থেমেছে। এটি ত্রুটি নয়। যে ব্যাংক আপনার কার্ড দিয়েছে, তাদের জিজ্ঞেস করুন।",
    "vi": "Giao dịch dừng do hạn mức của ngân hàng (ví dụ hạn mức trong ngày). Máy không hỏng. Hãy hỏi ngân hàng phát hành thẻ.",
    "id": "Transaksi berhenti karena batas dari bank (misalnya batas harian). Mesin tidak rusak. Tanyakan ke bank penerbit kartu Anda.",
    "ne": "बैंकको सीमा (जस्तै दैनिक सीमा) का कारण कारोबार रोकियो। मेसिन बिग्रेको होइन। कार्ड जारी गर्ने बैंकलाई सोध्नुहोस्।",
    "en": "A bank limit (such as the daily limit) stopped this transaction. It is not broken. Ask the bank that issued your card.",
    "ja": "銀行が きめた 上限で とりひきが とまりました。こわれた のでは ありません。カードを 出した 銀行に きいて ください。"
  },
  "PASSBOOK_HELD": {
    "bn": "আপনার পাসবই মেশিনের ভেতরে আছে। এখানে অপেক্ষা করতে পারেন, বা চলে যেতে পারেন। খবর এখানেই দেখাবে। {branch}-এর কাছেও জানতে পারবেন ({hours})।",
    "vi": "Sổ tài khoản của bạn đang ở trong máy. Bạn có thể chờ ở đây hoặc ra về. Tin mới sẽ hiện ở đây. Bạn cũng có thể hỏi {branch} ({hours}).",
    "id": "Buku tabungan Anda ada di dalam mesin. Anda bisa menunggu di sini atau pulang. Kabar terbaru akan muncul di sini. Anda juga bisa bertanya ke {branch} ({hours}).",
    "ne": "तपाईंको पासबुक मेसिनभित्र छ। यहीँ पर्खन वा जान सक्नुहुन्छ। नयाँ जानकारी यहीँ देखिन्छ। {branch} मा पनि सोध्न सक्नुहुन्छ ({hours})।",
    "en": "Your passbook is inside the machine. You can wait here or leave. Updates will show here. You can also ask {branch} ({hours}).",
    "ja": "通帳は ATM の 中に あります。ここで まっても、かえっても いいです。おしらせは この 画面に でます。{branch} にも きく ことが できます。{hours} きけます。"
  }
};
