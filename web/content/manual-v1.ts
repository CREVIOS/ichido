import type { L10n } from "./catalogue.ts";

// Frozen wording for sent replies. Slot values come from the stored reply.
export const manual: Record<string, L10n> = {
  "HELD_WAIT_OR_LEAVE": {
    "ja": "カードは ATM の 中に あります。ここで まっても、かえっても いいです。かえった ときは 銀行から れんらくします。カードは 銀行の きまりに そって あつかいます。{branch} の まどぐちでも きけます。あいて いるのは {hours} です。",
    "bn": "আপনার কার্ড মেশিনের ভেতরে আছে। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। চলে গেলে ব্যাংক আপনার সাথে যোগাযোগ করবে। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। {branch}-এর কাউন্টারেও ({hours}) জানতে পারবেন।",
    "en": "Your card is inside the machine. You can wait here, or you can leave. If you leave, the bank will contact you. The card is handled under the bank's own procedure. The {branch} counter ({hours}) can also help.",
    "vi": "Thẻ của bạn đang ở trong máy. Bạn có thể chờ ở đây, hoặc có thể ra về. Nếu bạn ra về, ngân hàng sẽ liên lạc với bạn. Thẻ được xử lý theo quy trình riêng của ngân hàng. Quầy giao dịch của {branch} ({hours}) cũng có thể giúp bạn.",
    "id": "Kartu Anda ada di dalam mesin. Anda bisa menunggu di sini, atau Anda bisa pulang. Jika Anda pulang, bank akan menghubungi Anda. Kartu ditangani sesuai prosedur bank sendiri. Loket {branch} ({hours}) juga dapat membantu.",
    "ne": "तपाईंको कार्ड मेसिनभित्र छ। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। जानुभयो भने बैंकले तपाईंलाई सम्पर्क गर्नेछ। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। {branch} को काउन्टरमा पनि सोध्न सक्नुहुन्छ ({hours})।"
  },
  "HANDSET": {
    "ja": "いま どうなって いるか ききたい ときは、ATM に ついて いる 電話を つかって ください。",
    "bn": "এখানে পরিস্থিতির খবর জানতে চাইলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
    "en": "To ask for an update here, use the handset built into the ATM.",
    "vi": "Nếu muốn hỏi tình hình tại đây, hãy dùng ống nghe gắn trên máy ATM.",
    "id": "Untuk menanyakan perkembangan di sini, gunakan gagang telepon yang terpasang di ATM.",
    "ne": "यहाँ अवस्थाबारे सोध्न चाहनुहुन्छ भने एटीएममा जडान गरिएको फोनको रिसिभर प्रयोग गर्नुहोस्।"
  },
  "OFFICIAL_CHANNEL": {
    "ja": "銀行に ききたい ときは、銀行が きめた まどぐちに れんらくして ください。",
    "bn": "ব্যাংকের সঙ্গে যোগাযোগ করতে হলে ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যম ব্যবহার করুন।",
    "en": "To contact the bank, use the bank's official contact channel.",
    "vi": "Để liên hệ với ngân hàng, hãy dùng kênh liên hệ chính thức của ngân hàng.",
    "id": "Untuk menghubungi bank, gunakan saluran kontak resmi bank.",
    "ne": "बैंकसँग सम्पर्क गर्न बैंकको आधिकारिक सम्पर्क माध्यम प्रयोग गर्नुहोस्।"
  },
  "CARD_FORGOTTEN": {
    "ja": "カードを とらないで いると、ATM は カードを 中に もどします。カードは 銀行の きまりに そって あつかいます。ここで まつ ひつようは ありません。{branch} の まどぐちか、銀行が きめた まどぐちに きいて ください。あいて いるのは {hours} です。",
    "en": "When a card is left in the slot, the machine takes it back inside to keep it safe. The card is handled under the bank's own procedure. You do not need to wait here. Please ask the {branch} counter ({hours}) or the bank's official contact channel.",
    "bn": "কার্ড স্লটে রেখে গেলে, নিরাপত্তার জন্য মেশিন কার্ডটি ভেতরে টেনে নেয়। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। এখানে অপেক্ষা করার দরকার নেই। {branch}-এর কাউন্টারে ({hours}) অথবা ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যমে জিজ্ঞেস করুন।",
    "vi": "Khi thẻ bị để quên ở khe, máy sẽ thu thẻ vào trong để giữ an toàn. Thẻ được xử lý theo quy trình riêng của ngân hàng. Bạn không cần chờ ở đây. Hãy hỏi quầy giao dịch của {branch} ({hours}) hoặc kênh liên hệ chính thức của ngân hàng.",
    "id": "Jika kartu tertinggal di slot, mesin menarik kartu ke dalam agar aman. Kartu ditangani sesuai prosedur bank sendiri. Anda tidak perlu menunggu di sini. Silakan tanyakan ke loket {branch} ({hours}) atau saluran kontak resmi bank.",
    "ne": "कार्ड स्लटमै छोडियो भने सुरक्षाका लागि मेसिनले कार्ड भित्र तान्छ। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। यहाँ पर्खनु पर्दैन। {branch} को काउन्टरमा ({hours}) वा बैंकको आधिकारिक सम्पर्क माध्यममा सोध्नुहोस्।"
  },
  "CARD_KEPT_RULE": {
    "ja": "ATM は 銀行の きまりで カードを あずかりました。たとえば、なくした と とどけた カードや、きげんが きれた カードの ときです。こわれた のでは ありません。カードは 銀行の きまりに そって あつかいます。ここで まつ ひつようは ありません。{branch} の まどぐちに きいて ください。あいて いるのは {hours} です。",
    "en": "The machine kept the card because of the bank's own rules — for example, a card reported lost, or an expired card. This is not a machine fault. The card is handled under the bank's own procedure. You do not need to wait here. Please ask the {branch} counter ({hours}).",
    "bn": "ব্যাংকের নিজস্ব নিয়মের কারণে মেশিন কার্ডটি রেখে দিয়েছে — যেমন হারানোর খবর দেওয়া কার্ড, বা মেয়াদ শেষ হওয়া কার্ড। এটি মেশিনের ত্রুটি নয়। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। এখানে অপেক্ষা করার দরকার নেই। {branch}-এর কাউন্টারে ({hours}) জিজ্ঞেস করুন।",
    "vi": "Máy đã giữ thẻ theo quy định của ngân hàng — ví dụ thẻ đã báo mất hoặc thẻ hết hạn. Đây không phải lỗi máy. Thẻ được xử lý theo quy trình riêng của ngân hàng. Bạn không cần chờ ở đây. Hãy hỏi quầy giao dịch của {branch} ({hours}).",
    "id": "Mesin menahan kartu karena aturan bank sendiri — misalnya kartu yang sudah dilaporkan hilang, atau kartu yang sudah kedaluwarsa. Ini bukan kerusakan mesin. Kartu ditangani sesuai prosedur bank sendiri. Anda tidak perlu menunggu di sini. Silakan tanyakan ke loket {branch} ({hours}).",
    "ne": "बैंकको आफ्नै नियमका कारण मेसिनले कार्ड राख्यो — जस्तै हराएको भनी खबर गरिएको कार्ड, वा म्याद सकिएको कार्ड। यो मेसिनको खराबी होइन। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। यहाँ पर्खनु पर्दैन। {branch} को काउन्टरमा ({hours}) सोध्नुहोस्।"
  },
  "CARD_UNREADABLE": {
    "ja": "ATM が カードを よめませんでした。カードに きずが あるか、ふるく なって いる かもしれません。カードを もって、{branch} の まどぐちに きいて ください。あいて いるのは {hours} です。",
    "en": "The machine could not read the card. The card may be scratched or worn. Please take the card to the {branch} counter ({hours}) and ask there.",
    "bn": "মেশিন কার্ডটি পড়তে পারেনি। কার্ডে দাগ পড়ে থাকতে পারে বা পুরোনো হয়ে যেতে পারে। কার্ডটি নিয়ে {branch}-এর কাউন্টারে ({hours}) জিজ্ঞেস করুন।",
    "vi": "Máy không đọc được thẻ. Thẻ có thể bị trầy xước hoặc đã cũ. Hãy mang thẻ đến quầy giao dịch của {branch} ({hours}) để hỏi.",
    "id": "Mesin tidak bisa membaca kartu. Kartu mungkin tergores atau sudah aus. Silakan bawa kartu ke loket {branch} ({hours}) dan tanyakan di sana.",
    "ne": "मेसिनले कार्ड पढ्न सकेन। कार्डमा कोरिएको वा पुरानो भएको हुन सक्छ। कार्ड लिएर {branch} को काउन्टरमा ({hours}) सोध्नुहोस्।"
  },
  "RESIDENCE_CARD": {
    "ja": "ATM に 「この カードは つかえません」と でた ときは、こわれた のでは なく、在留カード（ざいりゅうカード）の きげんに ついての 銀行の きまり かもしれません。新しい 在留カードを もらったら、{branch} の まどぐちに もって いって ください。あいて いるのは {hours} です。長崎県の 外国から 来た 人の そうだん まどぐちでも、22の ことばで きけます。",
    "en": "If the ATM says your card cannot be used, it may not be a fault: it may be the bank's rule about your residence period. When you get your new residence card, please bring it to the {branch} counter ({hours}). Nagasaki Prefecture's foreign residents' consultation desk can also help, in 22 languages.",
    "bn": "এটিএমে যদি দেখায় কার্ডটি ব্যবহার করা যাবে না, তাহলে এটি ত্রুটি না-ও হতে পারে: আপনার থাকার মেয়াদ নিয়ে ব্যাংকের নিয়মের কারণে হতে পারে। নতুন রেসিডেন্স কার্ড পেলে সেটি নিয়ে {branch}-এর কাউন্টারে ({hours}) যান। নাগাসাকি প্রিফেকচারের বিদেশি বাসিন্দা পরামর্শ কেন্দ্রও ২২টি ভাষায় সাহায্য করতে পারে।",
    "vi": "Nếu máy ATM báo thẻ không dùng được, có thể đó không phải lỗi máy mà là quy định của ngân hàng về thời hạn lưu trú của bạn. Khi có thẻ cư trú mới, hãy mang thẻ đó đến quầy giao dịch của {branch} ({hours}). Quầy tư vấn cho người nước ngoài của tỉnh Nagasaki cũng có thể giúp bạn, bằng 22 ngôn ngữ.",
    "id": "Jika ATM menyatakan kartu Anda tidak bisa digunakan, mungkin itu bukan kerusakan, melainkan aturan bank terkait masa tinggal Anda. Setelah mendapat kartu izin tinggal (residence card) yang baru, bawalah ke loket {branch} ({hours}). Layanan konsultasi warga asing Prefektur Nagasaki juga dapat membantu, dalam 22 bahasa.",
    "ne": "एटीएमले कार्ड प्रयोग गर्न मिल्दैन भन्यो भने त्यो खराबी नहुन सक्छ: तपाईंको बसाइ अवधि सम्बन्धी बैंकको नियमका कारण हुन सक्छ। नयाँ रेसिडेन्स कार्ड पाएपछि त्यसलाई {branch} को काउन्टरमा ({hours}) लैजानुहोस्। नागासाकी प्रिफेक्चरको विदेशी बासिन्दा परामर्श केन्द्रले पनि २२ भाषामा सहयोग गर्न सक्छ।"
  },
  "VISITOR_CARD": {
    "ja": "日本の そとで 作った カードの ときや、ここに もう 来られない ときは、カードを 作った 銀行や 会社に れんらくして、カードを とめて もらって ください。ここの 銀行は、カードを 銀行の きまりに そって あつかいます。",
    "en": "If your card was issued outside Japan, or you cannot come back here, please contact your card issuer (the bank or card company that gave you the card) and ask them to block the card. The bank here handles the card under its own procedure.",
    "bn": "আপনার কার্ড যদি জাপানের বাইরে ইস্যু করা হয়ে থাকে, অথবা আপনি আর এখানে ফিরে আসতে না পারেন, তাহলে যে ব্যাংক বা কার্ড কোম্পানি কার্ডটি দিয়েছে তাদের সাথে যোগাযোগ করে কার্ডটি বন্ধ (ব্লক) করতে বলুন। এখানকার ব্যাংক কার্ডটি নিজস্ব নিয়মে দেখবে।",
    "vi": "Nếu thẻ của bạn được phát hành ở ngoài Nhật Bản, hoặc bạn không thể quay lại đây, hãy liên hệ với nơi phát hành thẻ (ngân hàng hoặc công ty thẻ đã cấp thẻ cho bạn) để yêu cầu khóa thẻ. Ngân hàng ở đây xử lý thẻ theo quy trình riêng của mình.",
    "id": "Jika kartu Anda diterbitkan di luar Jepang, atau Anda tidak bisa kembali ke sini, hubungi penerbit kartu Anda (bank atau perusahaan kartu yang memberikan kartu itu) dan minta kartu diblokir. Bank di sini menangani kartu sesuai prosedurnya sendiri.",
    "ne": "तपाईंको कार्ड जापानबाहिर जारी गरिएको हो, वा तपाईं यहाँ फेरि आउन सक्नुहुन्न भने, कार्ड जारी गर्ने बैंक वा कार्ड कम्पनीलाई सम्पर्क गरेर कार्ड बन्द (ब्लक) गर्न भन्नुहोस्। यहाँको बैंकले कार्डलाई आफ्नै प्रक्रियाअनुसार हेर्छ।"
  },
  "CASH_DEBITED": {
    "ja": "こうざから お金が へったのに お金が でてこなかった ときは、銀行が ATM の 記録を しらべて、こうざの お金を なおします。ATM から でた 紙が あれば、すてないで ください。ここで まつ ひつようは ありません。{branch} の まどぐちでも きけます。あいて いるのは {hours} です。",
    "en": "If money left your account but no cash came out, the bank checks the machine's record and corrects your balance. Please keep the slip if the machine gave you one. You do not need to wait here. The {branch} counter ({hours}) can also help.",
    "bn": "অ্যাকাউন্ট থেকে টাকা কেটে নেওয়া হলেও যদি নগদ টাকা বের না হয়, ব্যাংক মেশিনের রেকর্ড দেখে আপনার ব্যালান্স ঠিক করে দেবে। মেশিন কোনো রসিদ দিয়ে থাকলে সেটি রেখে দিন। এখানে অপেক্ষা করার দরকার নেই। {branch}-এর কাউন্টারেও ({hours}) জানতে পারবেন।",
    "vi": "Nếu tiền đã bị trừ khỏi tài khoản nhưng máy không nhả tiền, ngân hàng sẽ kiểm tra dữ liệu của máy và điều chỉnh số dư cho bạn. Nếu máy có in phiếu, hãy giữ lại. Bạn không cần chờ ở đây. Quầy giao dịch của {branch} ({hours}) cũng có thể giúp bạn.",
    "id": "Jika uang sudah terpotong dari rekening tetapi uang tunai tidak keluar, bank memeriksa catatan mesin dan membetulkan saldo Anda. Jika mesin mengeluarkan struk, simpanlah. Anda tidak perlu menunggu di sini. Loket {branch} ({hours}) juga dapat membantu.",
    "ne": "खाताबाट पैसा काटियो तर नगद निस्किएन भने, बैंकले मेसिनको रेकर्ड जाँचेर तपाईंको मौज्दात मिलाउँछ। मेसिनले रसिद दिएको भए त्यसलाई राख्नुहोस्। यहाँ पर्खनु पर्दैन। {branch} को काउन्टरमा ({hours}) पनि सोध्न सक्नुहुन्छ।"
  },
  "CASH_LEFT": {
    "ja": "お金を とらないで いると、ATM は お金を 中に もどします。銀行が ATM の 記録を しらべて、銀行の きまりに そって こうざの お金を なおします。ATM から でた 紙が あれば、すてないで ください。ここで まつ ひつようは ありません。",
    "en": "When cash is left in the tray, the machine takes it back inside. The bank checks the machine's record and corrects your balance under its own procedure. Please keep the slip if the machine gave you one. You do not need to wait here.",
    "bn": "নগদ টাকা ট্রেতে রেখে গেলে মেশিন টাকাটা ভেতরে টেনে নেয়। ব্যাংক মেশিনের রেকর্ড দেখে নিজস্ব নিয়মে আপনার ব্যালান্স ঠিক করবে। মেশিন কোনো রসিদ দিয়ে থাকলে সেটি রেখে দিন। এখানে অপেক্ষা করার দরকার নেই।",
    "vi": "Nếu tiền bị để quên ở khay, máy sẽ thu tiền vào trong. Ngân hàng kiểm tra dữ liệu của máy và điều chỉnh số dư theo quy trình riêng. Nếu máy có in phiếu, hãy giữ lại. Bạn không cần chờ ở đây.",
    "id": "Jika uang tunai tertinggal, mesin menariknya kembali ke dalam. Bank memeriksa catatan mesin dan membetulkan saldo Anda sesuai prosedurnya sendiri. Jika mesin mengeluarkan struk, simpanlah. Anda tidak perlu menunggu di sini.",
    "ne": "नगद ट्रेमै छोडियो भने मेसिनले पैसा भित्र तान्छ। बैंकले मेसिनको रेकर्ड जाँचेर आफ्नै प्रक्रियाअनुसार तपाईंको मौज्दात मिलाउँछ। मेसिनले रसिद दिएको भए त्यसलाई राख्नुहोस्। यहाँ पर्खनु पर्दैन।"
  },
  "CASH_IN_JAM": {
    "ja": "入れた お金は ATM の 中に あります。銀行が お金と 記録を しらべて、こうざの お金を なおします。ATM から でた 紙が あれば、すてないで ください。ここで まっても、かえっても いいです。かえった ときは 銀行から れんらくします。",
    "en": "The cash you put in is inside the machine. The bank counts it, checks the record and corrects your balance. Please keep the slip if the machine gave you one. You can wait here, or you can leave. If you leave, the bank will contact you.",
    "bn": "আপনি যে টাকা জমা দিয়েছেন তা মেশিনের ভেতরে আছে। ব্যাংক টাকা গুনে, রেকর্ড দেখে আপনার ব্যালান্স ঠিক করবে। মেশিন কোনো রসিদ দিয়ে থাকলে সেটি রেখে দিন। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। চলে গেলে ব্যাংক আপনার সাথে যোগাযোগ করবে।",
    "vi": "Số tiền bạn nạp vào đang ở trong máy. Ngân hàng sẽ đếm tiền, kiểm tra dữ liệu và điều chỉnh số dư cho bạn. Nếu máy có in phiếu, hãy giữ lại. Bạn có thể chờ ở đây, hoặc có thể ra về. Nếu bạn ra về, ngân hàng sẽ liên lạc với bạn.",
    "id": "Uang yang Anda setor ada di dalam mesin. Bank menghitungnya, memeriksa catatan, dan membetulkan saldo Anda. Jika mesin mengeluarkan struk, simpanlah. Anda bisa menunggu di sini, atau Anda bisa pulang. Jika Anda pulang, bank akan menghubungi Anda.",
    "ne": "तपाईंले हालेको पैसा मेसिनभित्र छ। बैंकले पैसा गनेर, रेकर्ड जाँचेर तपाईंको मौज्दात मिलाउँछ। मेसिनले रसिद दिएको भए त्यसलाई राख्नुहोस्। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। जानुभयो भने बैंकले तपाईंलाई सम्पर्क गर्नेछ।"
  },
  "LIMIT_REFUSED": {
    "ja": "とりひきは、銀行が きめた 金額の 上限で とまりました。こわれた のでは ありません。上限に ついては {branch} の まどぐちで きけます。あいて いるのは {hours} です。",
    "en": "The transaction was stopped by a limit the bank sets, such as the daily amount limit. This is not a machine fault. You can ask about the limit at the {branch} counter ({hours}).",
    "bn": "ব্যাংকের ঠিক করা সীমার (যেমন দৈনিক টাকার সীমা) কারণে লেনদেনটি থেমে গেছে। এটি মেশিনের ত্রুটি নয়। সীমা সম্পর্কে {branch}-এর কাউন্টারে ({hours}) জানতে পারবেন।",
    "vi": "Giao dịch đã bị dừng do hạn mức ngân hàng đặt ra, ví dụ hạn mức số tiền trong ngày. Đây không phải lỗi máy. Bạn có thể hỏi về hạn mức tại quầy giao dịch của {branch} ({hours}).",
    "id": "Transaksi dihentikan karena batas yang ditetapkan bank, misalnya batas jumlah per hari. Ini bukan kerusakan mesin. Anda bisa menanyakan batas tersebut di loket {branch} ({hours}).",
    "ne": "बैंकले तोकेको सीमा (जस्तै दैनिक रकम सीमा) का कारण कारोबार रोकियो। यो मेसिनको खराबी होइन। सीमाबारे {branch} को काउन्टरमा ({hours}) सोध्न सक्नुहुन्छ।"
  },
  "PASSBOOK_HELD": {
    "ja": "通帳は ATM の 中に あります。ここで まっても、かえっても いいです。かえった ときは 銀行から れんらくします。通帳は 銀行の きまりに そって あつかいます。{branch} の まどぐちでも きけます。あいて いるのは {hours} です。",
    "en": "Your passbook is inside the machine. You can wait here, or you can leave. If you leave, the bank will contact you. The passbook is handled under the bank's own procedure. The {branch} counter ({hours}) can also help.",
    "bn": "আপনার পাসবই মেশিনের ভেতরে আছে। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। চলে গেলে ব্যাংক আপনার সাথে যোগাযোগ করবে। পাসবইয়ের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। {branch}-এর কাউন্টারেও ({hours}) জানতে পারবেন।",
    "vi": "Sổ tài khoản của bạn đang ở trong máy. Bạn có thể chờ ở đây, hoặc có thể ra về. Nếu bạn ra về, ngân hàng sẽ liên lạc với bạn. Sổ được xử lý theo quy trình riêng của ngân hàng. Quầy giao dịch của {branch} ({hours}) cũng có thể giúp bạn.",
    "id": "Buku tabungan Anda ada di dalam mesin. Anda bisa menunggu di sini, atau Anda bisa pulang. Jika Anda pulang, bank akan menghubungi Anda. Buku tabungan ditangani sesuai prosedur bank sendiri. Loket {branch} ({hours}) juga dapat membantu.",
    "ne": "तपाईंको पासबुक मेसिनभित्र छ। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। जानुभयो भने बैंकले तपाईंलाई सम्पर्क गर्नेछ। पासबुकको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। {branch} को काउन्टरमा ({hours}) पनि सोध्न सक्नुहुन्छ।"
  },
  "HOSP_URGENT": {
    "ja": "いますぐ ちかくの 病院の 人に つたえて ください。うけつけでも、だれでも いいです。病院の そとに いる ときや、ちかくに 人が いない ときは、119に 電話して ください（きゅうきゅうしゃ）。",
    "en": "Tell the hospital staff near you now — at the reception or any staff member. If you are outside the hospital building, or no staff are near, call 119 for an ambulance.",
    "bn": "এখনই কাছের হাসপাতাল কর্মীকে জানান — রিসেপশনে বা যেকোনো কর্মীকে। হাসপাতালের বাইরে থাকলে বা কাছে কোনো কর্মী না থাকলে, অ্যাম্বুলেন্সের জন্য ১১৯-এ ফোন করুন।",
    "vi": "Hãy báo ngay cho nhân viên bệnh viện gần bạn — ở quầy tiếp nhận hoặc bất kỳ nhân viên nào. Nếu bạn đang ở ngoài tòa nhà bệnh viện, hoặc không có nhân viên ở gần, hãy gọi 119 để gọi xe cấp cứu.",
    "id": "Segera beri tahu petugas rumah sakit di dekat Anda — di bagian pendaftaran atau petugas mana pun. Jika Anda berada di luar gedung rumah sakit, atau tidak ada petugas di dekat Anda, telepon 119 untuk ambulans.",
    "ne": "अहिले नै नजिकैको अस्पताल कर्मचारीलाई भन्नुहोस् — रिसेप्सनमा वा जुनसुकै कर्मचारीलाई। अस्पताल भवनबाहिर हुनुहुन्छ वा नजिकै कोही कर्मचारी हुनुहुन्न भने एम्बुलेन्सका लागि ११९ मा फोन गर्नुहोस्।"
  },
  "HOSP_FIRST_VISIT": {
    "ja": "はじめての 人は、{branch} で うけつけを します。うけつけの 紙は、係の 人が いっしょに 書きます。保険証が あれば もって いって ください。番号を ここに 書かないで ください。うけつけの 時間は {hours} です。",
    "en": "On a first visit, you register at the {branch} ({hours}). A clerk will fill in the form with you. Bring your health insurance card if you have one. Please do not type any numbers from your cards here.",
    "bn": "প্রথমবার এলে {branch}-এ ({hours}) নাম লেখাতে হয়। একজন কর্মী আপনার সঙ্গে ফর্ম পূরণ করবেন। স্বাস্থ্যবিমা কার্ড থাকলে সঙ্গে আনুন। এখানে কোনো কার্ডের নম্বর লিখবেন না।",
    "vi": "Lần đầu đến khám, bạn đăng ký tại {branch} ({hours}). Nhân viên sẽ cùng bạn điền giấy tờ. Nếu có thẻ bảo hiểm y tế, hãy mang theo. Xin đừng nhập số trên các thẻ của bạn ở đây.",
    "id": "Pada kunjungan pertama, Anda mendaftar di {branch} ({hours}). Petugas akan mengisi formulir bersama Anda. Bawalah kartu asuransi kesehatan jika ada. Jangan ketik nomor dari kartu Anda di sini.",
    "ne": "पहिलो पटक आउँदा {branch} मा ({hours}) दर्ता गर्नुपर्छ। एक जना कर्मचारीले तपाईंसँगै फारम भर्नुहुन्छ। स्वास्थ्य बीमा कार्ड छ भने ल्याउनुहोस्। यहाँ कुनै कार्डको नम्बर नलेख्नुहोस्।"
  },
  "HOSP_WHERE": {
    "ja": "ちかくの うけつけで 看護師に そうだん してください。いく 科を じぶんで えらばなくて いいです。",
    "en": "Ask for a nurse at reception. You do not need to choose a department yourself.",
    "bn": "রিসেপশনে একজন নার্সের সাহায্য চান। নিজে বিভাগ বেছে নিতে হবে না।",
    "vi": "Hãy hỏi y tá tại quầy tiếp nhận. Bạn không cần tự chọn khoa.",
    "id": "Mintalah bantuan perawat di pendaftaran. Anda tidak harus memilih bagian sendiri.",
    "ne": "दर्ता कक्षमा नर्सको सहयोग माग्नुहोस्। विभाग आफैँ छान्नुपर्दैन।"
  },
  "HOSP_INTERPRETER": {
    "ja": "つうやくを たのみました。まだ 時間は きまって いません。",
    "en": "The desk has requested an interpreter. A time has not been confirmed.",
    "bn": "ডেস্ক থেকে দোভাষীর অনুরোধ করা হয়েছে। সময় এখনও ঠিক হয়নি।",
    "vi": "Quầy đã yêu cầu phiên dịch. Chưa xác nhận thời gian.",
    "id": "Meja layanan sudah meminta penerjemah. Waktunya belum pasti.",
    "ne": "कक्षले दोभाषे मागेको छ। समय अझै तोकिएको छैन।"
  },
  "HOSP_PAYMENT": {
    "ja": "お金の はらいかたと 保険の ことは、会計の まどぐちで 係の 人が せつめい します。カードや 保険証の 番号は、ここに 書かないで ください。",
    "en": "The accounting counter (会計) explains how to pay and how health insurance works here. Please do not type any numbers from your cards here.",
    "bn": "কীভাবে টাকা দিতে হয় এবং স্বাস্থ্যবিমা কীভাবে কাজ করে, তা হিসাব কাউন্টার (会計) বুঝিয়ে দেবে। এখানে কোনো কার্ডের নম্বর লিখবেন না।",
    "vi": "Quầy thu ngân (会計) sẽ giải thích cách thanh toán và cách dùng bảo hiểm y tế ở đây. Xin đừng nhập số trên các thẻ của bạn ở đây.",
    "id": "Loket kasir (会計) akan menjelaskan cara membayar dan cara kerja asuransi kesehatan di sini. Jangan ketik nomor dari kartu Anda di sini.",
    "ne": "भुक्तानी कसरी गर्ने र स्वास्थ्य बीमा कसरी चल्छ भन्ने कुरा हिसाब काउन्टर (会計) ले बुझाउँछ। यहाँ कुनै कार्डको नम्बर नलेख्नुहोस्।"
  },
  "HOSP_NO_CARD": {
    "ja": "保険証が ない ときは、きょう ぜんぶの お金を はらう ことが あります。あとで 保険証を みせると、お金が もどる ことも あります。くわしい ことは うけつけで きいて ください。",
    "en": "Without a health insurance card, you may have to pay the full cost today. Some of it may be returned later when you show the card. Please ask at the reception how it works here.",
    "bn": "স্বাস্থ্যবিমা কার্ড না থাকলে আজ পুরো খরচ দিতে হতে পারে। পরে কার্ড দেখালে কিছু টাকা ফেরত পেতে পারেন। এখানে কীভাবে হয়, রিসেপশনে জিজ্ঞেস করুন।",
    "vi": "Nếu không có thẻ bảo hiểm y tế, hôm nay bạn có thể phải trả toàn bộ chi phí. Sau này khi xuất trình thẻ, bạn có thể được hoàn lại một phần. Hãy hỏi quầy tiếp nhận về cách làm ở đây.",
    "id": "Tanpa kartu asuransi kesehatan, Anda mungkin harus membayar biaya penuh hari ini. Sebagian bisa dikembalikan nanti saat Anda menunjukkan kartunya. Tanyakan di bagian pendaftaran bagaimana caranya di sini.",
    "ne": "स्वास्थ्य बीमा कार्ड नभए आज पूरै खर्च तिर्नुपर्ने हुन सक्छ। पछि कार्ड देखाउँदा केही पैसा फिर्ता हुन सक्छ। यहाँ कसरी हुन्छ, रिसेप्सनमा सोध्नुहोस्।"
  },
  "HOSP_STAFF_COMING": {
    "ja": "かんごしか 病院の 係の 人が、この Help Point に きます。ここで まって いて ください。",
    "en": "A nurse or hospital clerk is coming to this Help Point. Please wait here.",
    "bn": "একজন নার্স বা হাসপাতাল কর্মী এই Help Point-এ আসছেন। এখানে অপেক্ষা করুন।",
    "vi": "Y tá hoặc nhân viên bệnh viện đang đến Help Point này. Hãy chờ ở đây.",
    "id": "Perawat atau petugas rumah sakit sedang menuju Help Point ini. Silakan tunggu di sini.",
    "ne": "नर्स वा अस्पताल कर्मचारी यो Help Point मा आउँदै हुनुहुन्छ। यहीँ पर्खनुहोस्।"
  },
  "CITY_IMMIGRATION": {
    "ja": "在留カードの きげんを のばす 手つづきは、市役所では しません。入管（にゅうかん）で します。ここでは その 手つづきの そうだんは できません。係の 人が 場所を おしえます。きげんが すぎる まえに 手つづきを して ください。",
    "en": "Extending your period of stay is done at the Immigration Services office (入管), not at the city office. This desk cannot advise on immigration. Staff will show you where the office is. Please apply before the date on your card passes.",
    "bn": "থাকার মেয়াদ বাড়ানোর কাজ সিটি অফিসে নয়, ইমিগ্রেশন অফিসে (入管) হয়। এই ডেস্ক ভিসা-বিষয়ে পরামর্শ দিতে পারে না। অফিসটি কোথায়, কর্মীরা দেখিয়ে দেবেন। কার্ডের মেয়াদ শেষ হওয়ার আগে আবেদন করুন।",
    "vi": "Việc gia hạn thời gian lưu trú được làm tại Cục Xuất nhập cảnh (入管), không phải ở tòa thị chính. Quầy này không tư vấn về cư trú. Nhân viên sẽ chỉ cho bạn văn phòng ở đâu. Hãy nộp đơn trước khi thẻ hết hạn.",
    "id": "Perpanjangan masa tinggal dilakukan di kantor Imigrasi (入管), bukan di kantor kota. Meja ini tidak bisa memberi saran imigrasi. Petugas akan menunjukkan letak kantornya. Ajukan sebelum tanggal di kartu Anda lewat.",
    "ne": "बसाइ अवधि थप्ने काम सिटी अफिसमा होइन, अध्यागमन कार्यालय (入管) मा हुन्छ। यो डेस्कले भिसासम्बन्धी सल्लाह दिन सक्दैन। कार्यालय कहाँ छ, कर्मचारीले देखाउनुहुन्छ। कार्डको म्याद सकिनुअघि आवेदन दिनुहोस्।"
  },
  "CITY_MOVING": {
    "ja": "ひっこして きた 人は、ひっこした 日から 14日 いないに、在留カードを もって {branch} で とどけを して ください。あいて いるのは {hours} です。とどけの 紙は 係の 人が いっしょに 書きます。あたらしい じゅうしょは カードの うらに 書かれます。",
    "en": "If you moved here, please register at the {branch} ({hours}) within 14 days of moving in, and bring your residence card. Staff will fill in the form with you. Your new address is written on the back of your card.",
    "bn": "এখানে বাসা বদলে এলে, আসার ১৪ দিনের মধ্যে রেসিডেন্স কার্ড নিয়ে {branch}-এ ({hours}) নিবন্ধন করুন। কর্মীরা আপনার সঙ্গে ফর্ম পূরণ করবেন। নতুন ঠিকানা কার্ডের পেছনে লেখা হবে।",
    "vi": "Nếu bạn chuyển đến đây, hãy đăng ký tại {branch} ({hours}) trong vòng 14 ngày kể từ ngày chuyển đến, và mang theo thẻ cư trú. Nhân viên sẽ cùng bạn điền giấy tờ. Địa chỉ mới được ghi ở mặt sau thẻ.",
    "id": "Jika Anda pindah ke sini, lapor di {branch} ({hours}) dalam 14 hari setelah pindah, dan bawa kartu izin tinggal Anda. Petugas akan mengisi formulir bersama Anda. Alamat baru ditulis di bagian belakang kartu.",
    "ne": "यहाँ सरेर आउनुभएको हो भने सरेको १४ दिनभित्र रेसिडेन्स कार्ड लिएर {branch} मा ({hours}) दर्ता गर्नुहोस्। कर्मचारीले तपाईंसँगै फारम भर्नुहुन्छ। नयाँ ठेगाना कार्डको पछाडि लेखिन्छ।"
  },
  "CITY_MYNUMBER": {
    "ja": "マイナンバー カードの 手つづきは、{branch} で します。あいて いるのは {hours} です。在留カードを もって いって ください。マイナンバーや カードの ひみつの 番号は、だれにも いわないで ください。ここにも 書かないで ください。",
    "en": "My Number card procedures (applying, receiving the card, resetting its passcode, a lost card) are done at the {branch} ({hours}). Bring your residence card. Never tell anyone your My Number or the card's passcode, and do not type them here.",
    "bn": "মাই নাম্বার কার্ডের কাজ (আবেদন, কার্ড নেওয়া, গোপন কোড নতুন করা, হারানো কার্ড) {branch}-এ ({hours}) হয়। রেসিডেন্স কার্ড সঙ্গে আনুন। আপনার মাই নাম্বার বা কার্ডের গোপন কোড কাউকে বলবেন না, এখানেও লিখবেন না।",
    "vi": "Các thủ tục thẻ My Number (làm thẻ, nhận thẻ, đặt lại mã bí mật, mất thẻ) được làm tại {branch} ({hours}). Hãy mang thẻ cư trú. Đừng bao giờ nói số My Number hay mã bí mật của thẻ cho ai, và đừng nhập ở đây.",
    "id": "Urusan kartu My Number (pengajuan, menerima kartu, mengatur ulang kode rahasia, kartu hilang) dilakukan di {branch} ({hours}). Bawa kartu izin tinggal Anda. Jangan pernah memberi tahu siapa pun nomor My Number atau kode rahasia kartu Anda, dan jangan mengetiknya di sini.",
    "ne": "माई नम्बर कार्डका काम (आवेदन, कार्ड लिने, गोप्य कोड फेरि बनाउने, हराएको कार्ड) {branch} मा ({hours}) हुन्छन्। रेसिडेन्स कार्ड ल्याउनुहोस्। आफ्नो माई नम्बर वा कार्डको गोप्य कोड कसैलाई नभन्नुहोस्, यहाँ पनि नलेख्नुहोस्।"
  },
  "CITY_LETTER": {
    "ja": "よめない 手紙は、{branch} に もって きて ください。あいて いるのは {hours} です。通訳の 人が いっしょに よんで、どこの 課からの 手紙か おしえます。お金や 日づけが 書いて あれば、その 課が はらいかたや そうだん先を せつめい します。手紙の 番号は ここに 書かないで ください。",
    "en": "Please bring the letter to the {branch} ({hours}). An interpreter reads it with you and tells you which section sent it. If it shows an amount or a date, that section explains how to pay or whom to ask. Please do not type numbers from the letter here.",
    "bn": "চিঠিটি {branch}-এ ({hours}) নিয়ে আসুন। একজন দোভাষী আপনার সঙ্গে পড়ে বলবেন কোন বিভাগ এটি পাঠিয়েছে। টাকার পরিমাণ বা তারিখ থাকলে সেই বিভাগ বুঝিয়ে দেবে কীভাবে দিতে হয় বা কার কাছে জানতে হয়। চিঠির কোনো নম্বর এখানে লিখবেন না।",
    "vi": "Hãy mang lá thư đến {branch} ({hours}). Phiên dịch viên sẽ cùng bạn đọc và cho biết thư từ phòng ban nào. Nếu thư có ghi số tiền hoặc ngày, phòng ban đó sẽ giải thích cách nộp hoặc hỏi ai. Xin đừng nhập các số trong thư ở đây.",
    "id": "Bawalah surat itu ke {branch} ({hours}). Penerjemah akan membacanya bersama Anda dan memberi tahu bagian mana yang mengirimnya. Jika ada jumlah uang atau tanggal, bagian itu akan menjelaskan cara membayar atau kepada siapa bertanya. Jangan ketik nomor dari surat itu di sini.",
    "ne": "चिठी {branch} मा ({hours}) ल्याउनुहोस्। दोभाषेले तपाईंसँगै पढेर कुन शाखाबाट आएको हो भनिदिनुहुन्छ। रकम वा मिति लेखिएको भए त्यही शाखाले कसरी तिर्ने वा कसलाई सोध्ने बुझाउँछ। चिठीका नम्बर यहाँ नलेख्नुहोस्।"
  },
  "CITY_APPOINTMENT": {
    "ja": "つうやくを たのみました。まだ 時間は きまって いません。",
    "en": "The desk has requested an interpreter. A time has not been confirmed.",
    "bn": "ডেস্ক থেকে দোভাষীর অনুরোধ করা হয়েছে। সময় এখনও ঠিক হয়নি।",
    "vi": "Quầy đã yêu cầu phiên dịch. Chưa xác nhận thời gian.",
    "id": "Meja layanan sudah meminta penerjemah. Waktunya belum pasti.",
    "ne": "कक्षले दोभाषे मागेको छ। समय अझै तोकिएको छैन।"
  },
  "CITY_STAFF_COMING": {
    "ja": "市の つうやくの 人が この Help Point に きます。ここで まって いて ください。",
    "en": "A city interpreter is coming to this Help Point. Please wait here.",
    "bn": "শহরের একজন দোভাষী এই Help Point-এ আসছেন। এখানে অপেক্ষা করুন।",
    "vi": "Phiên dịch viên của thành phố đang đến Help Point này. Hãy chờ ở đây.",
    "id": "Penerjemah dari kantor kota sedang menuju Help Point ini. Silakan tunggu di sini.",
    "ne": "नगरको दोभाषे यो Help Point मा आउँदै हुनुहुन्छ। यहीँ पर्खनुहोस्।"
  },
  "TRANSIT_GUIDE": {
    "ja": "かいさつで 駅の 係の 人に、いきたい ところを つたえて ください。",
    "en": "At the ticket gate, tell station staff where you want to go.",
    "bn": "টিকিট গেটে কর্মীকে বলুন কোথায় যেতে চান।",
    "vi": "Tại cổng vé, hãy nói với nhân viên nơi bạn muốn đến.",
    "id": "Di gerbang tiket, beri tahu petugas tujuan Anda.",
    "ne": "टिकट गेटमा कर्मचारीलाई जान चाहेको ठाउँ बताउनुहोस्।"
  },
  "TRANSIT_LAST_TRAIN": {
    "ja": "きょうの さいごの 電車は もう でました。駅の 係の 人が、タクシーのりばと、あさ いちばんの 電車の 時間を おしえます。とまる ところが ない ときは、係の 人に いって ください。",
    "en": "Today's last train has already left. Station staff will show you the taxi stand and the time of the first train in the morning. If you have nowhere to stay tonight, please tell the staff.",
    "bn": "আজকের শেষ ট্রেন চলে গেছে। স্টেশনের কর্মী আপনাকে ট্যাক্সি স্ট্যান্ড আর সকালের প্রথম ট্রেনের সময় জানাবেন। আজ রাতে থাকার জায়গা না থাকলে কর্মীকে বলুন।",
    "vi": "Chuyến tàu cuối hôm nay đã chạy rồi. Nhân viên nhà ga sẽ chỉ cho bạn bến taxi và giờ chuyến tàu đầu tiên buổi sáng. Nếu tối nay bạn không có chỗ ở, hãy nói với nhân viên.",
    "id": "Kereta terakhir hari ini sudah berangkat. Petugas stasiun akan menunjukkan tempat taksi dan jam kereta pertama besok pagi. Jika Anda tidak punya tempat menginap malam ini, beri tahu petugas.",
    "ne": "आजको अन्तिम रेल गइसक्यो। स्टेसनका कर्मचारीले ट्याक्सी स्ट्यान्ड र बिहानको पहिलो रेलको समय बताउनुहुन्छ। आज राति बस्ने ठाउँ छैन भने कर्मचारीलाई भन्नुहोस्।"
  },
  "TRANSIT_LOST_ITEM": {
    "ja": "駅の 係の 人が、わすれものを いっしょに さがします。電車や 駅で みつかった ものは、まず 鉄道の 会社が あずかり、あとで 警察に わたします。ものの いろや かたちを 係の 人に つたえて ください。カードの 番号は ここに 書かないで ください。",
    "en": "Station staff will look for it with you. Things found on trains and in stations are kept by the railway first and later handed to the police. Please tell the staff what it looks like — its colour and shape. Do not type any numbers from cards here.",
    "bn": "স্টেশনের কর্মী আপনার সঙ্গে জিনিসটি খুঁজবেন। ট্রেন বা স্টেশনে পাওয়া জিনিস প্রথমে রেল কোম্পানি রাখে, পরে পুলিশের কাছে দেয়। জিনিসটি দেখতে কেমন — রং ও আকার — কর্মীকে বলুন। এখানে কোনো কার্ডের নম্বর লিখবেন না।",
    "vi": "Nhân viên nhà ga sẽ cùng bạn tìm đồ. Đồ tìm thấy trên tàu và trong ga được công ty đường sắt giữ trước, sau đó giao cho cảnh sát. Hãy cho nhân viên biết món đồ trông như thế nào — màu sắc và hình dạng. Đừng nhập số trên thẻ ở đây.",
    "id": "Petugas stasiun akan mencarinya bersama Anda. Barang yang ditemukan di kereta dan stasiun disimpan dulu oleh perusahaan kereta, lalu diserahkan ke polisi. Beri tahu petugas seperti apa barangnya — warna dan bentuknya. Jangan ketik nomor dari kartu di sini.",
    "ne": "स्टेसनका कर्मचारीले तपाईंसँगै सामान खोज्नुहुन्छ। रेल र स्टेसनमा भेटिएका सामान पहिले रेल कम्पनीले राख्छ, पछि प्रहरीलाई बुझाउँछ। सामान कस्तो देखिन्छ — रङ र आकार — कर्मचारीलाई भन्नुहोस्। यहाँ कुनै कार्डको नम्बर नलेख्नुहोस्।"
  },
  "TRANSIT_LOST_ID": {
    "ja": "在留カードを なくした ときは、交番か 警察で なくした ことを とどけて ください。そのあと 14日 いないに、入管（にゅうかん）で あたらしい カードを たのんで ください。カードの 番号は ここに 書かないで ください。",
    "en": "If you lost your residence card, report it at a police box (交番) or police station. Then, within 14 days, apply for a new card at the Immigration Services office (入管). Do not type the card's number here.",
    "bn": "রেসিডেন্স কার্ড হারালে পুলিশ বক্স (交番) বা থানায় জানান। তারপর ১৪ দিনের মধ্যে ইমিগ্রেশন অফিসে (入管) নতুন কার্ডের আবেদন করুন। কার্ডের নম্বর এখানে লিখবেন না।",
    "vi": "Nếu bạn làm mất thẻ cư trú, hãy trình báo tại đồn cảnh sát nhỏ (交番) hoặc đồn cảnh sát. Sau đó, trong vòng 14 ngày, hãy xin cấp thẻ mới tại Cục Xuất nhập cảnh (入管). Đừng nhập số thẻ ở đây.",
    "id": "Jika kartu izin tinggal Anda hilang, laporkan ke pos polisi (交番) atau kantor polisi. Lalu, dalam 14 hari, ajukan kartu baru di kantor Imigrasi (入管). Jangan ketik nomor kartu itu di sini.",
    "ne": "रेसिडेन्स कार्ड हरायो भने प्रहरी चौकी (交番) वा प्रहरी कार्यालयमा खबर गर्नुहोस्। त्यसपछि १४ दिनभित्र अध्यागमन कार्यालय (入管) मा नयाँ कार्डका लागि आवेदन दिनुहोस्। कार्डको नम्बर यहाँ नलेख्नुहोस्।"
  },
  "TRANSIT_LEAVE": {
    "ja": "もう ここを でても いいです。あとで 駅の まどぐちで この 番号を みせて ください。 {reference}",
    "en": "You can leave now. Show this railway reference at the ticket counter to follow up: {reference}",
    "bn": "এখন চলে যেতে পারেন। পরে টিকিট কাউন্টারে এই রেলের রেফারেন্স দেখান: {reference}",
    "vi": "Bạn có thể đi. Sau đó hãy đưa mã tiếp nhận này tại quầy vé để hỏi lại: {reference}",
    "id": "Anda boleh pergi. Tunjukkan referensi kereta ini di loket untuk menanyakan perkembangannya: {reference}",
    "ne": "अब जान सक्नुहुन्छ। पछि टिकट काउन्टरमा यो रेल सन्दर्भ देखाएर सोध्नुहोस्: {reference}"
  },
  "TRANSIT_ACCESS": {
    "ja": "駅の 係の 人が きて、のりばや 電車まで てつだいます。おりる 駅の 係の 人にも れんらく できます。ここで まって いて ください。",
    "en": "Station staff will come and help you to the platform and onto the train. They can also ask the staff at the station where you get off to meet you. Please wait here.",
    "bn": "স্টেশনের কর্মী এসে আপনাকে প্ল্যাটফর্ম ও ট্রেনে উঠতে সাহায্য করবেন। আপনি যে স্টেশনে নামবেন, সেখানকার কর্মীকেও খবর দিতে পারেন। এখানে অপেক্ষা করুন।",
    "vi": "Nhân viên nhà ga sẽ đến giúp bạn ra sân ga và lên tàu. Họ cũng có thể nhờ nhân viên ở ga bạn xuống đón bạn. Hãy chờ ở đây.",
    "id": "Petugas stasiun akan datang membantu Anda ke peron dan naik kereta. Mereka juga bisa meminta petugas di stasiun tujuan Anda untuk menjemput. Silakan tunggu di sini.",
    "ne": "स्टेसनका कर्मचारी आएर तपाईंलाई प्लेटफर्मसम्म र रेलमा चढ्न सहयोग गर्नुहुन्छ। तपाईं ओर्लने स्टेसनका कर्मचारीलाई पनि खबर गर्न सक्नुहुन्छ। यहीँ पर्खनुहोस्।"
  },
  "SHELTER_TELL_NOW": {
    "ja": "いますぐ ひなんじょの 係の 人に つたえて ください。ちかくに 係の 人が いなくて、ひどい けがや びょうきの 人が いる ときは、119に 電話して ください。",
    "en": "Tell the shelter staff now. If no staff are near and someone is badly hurt or very sick, call 119.",
    "bn": "এখনই আশ্রয়কেন্দ্রের কর্মীকে জানান। কাছে কোনো কর্মী না থাকলে এবং কেউ গুরুতর আহত বা খুব অসুস্থ হলে ১১৯-এ ফোন করুন।",
    "vi": "Hãy báo ngay cho nhân viên nơi sơ tán. Nếu không có nhân viên ở gần và có người bị thương nặng hoặc ốm nặng, hãy gọi 119.",
    "id": "Segera beri tahu petugas pengungsian. Jika tidak ada petugas di dekat Anda dan ada orang yang terluka parah atau sakit berat, telepon 119.",
    "ne": "अहिले नै आश्रयस्थलका कर्मचारीलाई भन्नुहोस्। नजिकै कर्मचारी नभए र कोही गम्भीर घाइते वा धेरै बिरामी भए ११९ मा फोन गर्नुहोस्।"
  },
  "SHELTER_CHECKIN": {
    "ja": "ようこそ。ひなんじょは、どこの 国の 人でも つかえます。在留カードや カードの 番号を みせる ひつようは ありません。うけつけの 係の 人が、ここに いる 人の 紙を いっしょに 書きます。",
    "en": "Welcome. Anyone can use this shelter, whatever their nationality. You do not need to show your residence card or give any ID numbers. The reception staff will fill in the shelter's sheet with you.",
    "bn": "স্বাগতম। যেকোনো দেশের মানুষ এই আশ্রয়কেন্দ্র ব্যবহার করতে পারেন। রেসিডেন্স কার্ড দেখাতে বা কোনো পরিচয় নম্বর দিতে হবে না। রিসেপশনের কর্মীরা আপনার সঙ্গে আশ্রয়কেন্দ্রের ফর্ম পূরণ করবেন।",
    "vi": "Chào mừng bạn. Người thuộc bất kỳ quốc tịch nào cũng có thể dùng nơi sơ tán này. Bạn không cần xuất trình thẻ cư trú hay cung cấp số giấy tờ nào. Nhân viên tiếp nhận sẽ cùng bạn điền phiếu của nơi sơ tán.",
    "id": "Selamat datang. Siapa pun boleh memakai tempat pengungsian ini, apa pun kewarganegaraannya. Anda tidak perlu menunjukkan kartu izin tinggal atau memberi nomor identitas apa pun. Petugas penerimaan akan mengisi formulir pengungsian bersama Anda.",
    "ne": "स्वागत छ। जुनसुकै देशका मानिसले यो आश्रयस्थल प्रयोग गर्न सक्नुहुन्छ। रेसिडेन्स कार्ड देखाउनु वा कुनै परिचय नम्बर दिनु पर्दैन। रिसेप्सनका कर्मचारीले तपाईंसँगै आश्रयस्थलको फारम भर्नुहुन्छ।"
  },
  "SHELTER_NEEDS": {
    "ja": "ひなんじょの 係の 人が あなたの たのみを うけつけました。",
    "en": "A shelter worker has accepted your request for help.",
    "bn": "আশ্রয়কেন্দ্রের একজন কর্মী আপনার সাহায্যের অনুরোধ গ্রহণ করেছেন।",
    "vi": "Một nhân viên nơi sơ tán đã nhận yêu cầu hỗ trợ của bạn.",
    "id": "Petugas pengungsian sudah menerima permintaan bantuan Anda.",
    "ne": "आश्रयस्थलका कर्मचारीले तपाईंको सहयोगको अनुरोध स्वीकार गर्नुभएको छ।"
  },
  "SHELTER_MEDICINE": {
    "ja": "くすりの ことは、ひなんじょの 保健師（ほけんし）と はなして ください。お薬手帳や くすりの はこが あれば みせて ください。",
    "en": "Please talk to the shelter's public health nurse (保健師) about your medicine. If you have your medicine notebook (お薬手帳) or the medicine box, show it to them.",
    "bn": "ওষুধের বিষয়ে আশ্রয়কেন্দ্রের জনস্বাস্থ্য নার্সের (保健師) সঙ্গে কথা বলুন। ওষুধের খাতা (お薬手帳) বা ওষুধের বাক্স থাকলে দেখান।",
    "vi": "Hãy nói chuyện với y tá y tế công cộng (保健師) của nơi sơ tán về thuốc của bạn. Nếu có sổ thuốc (お薬手帳) hoặc hộp thuốc, hãy cho họ xem.",
    "id": "Bicarakan obat Anda dengan perawat kesehatan masyarakat (保健師) di pengungsian. Jika Anda punya buku catatan obat (お薬手帳) atau kotak obatnya, tunjukkan kepada mereka.",
    "ne": "औषधिबारे आश्रयस्थलका जनस्वास्थ्य नर्स (保健師) सँग कुरा गर्नुहोस्। औषधि पुस्तिका (お薬手帳) वा औषधिको बट्टा छ भने देखाउनुहोस्।"
  },
  "SHELTER_FAMILY": {
    "ja": "ひなんじょの 係の 人が あなたの たのみを うけつけました。 係の 人は ほかの ひなんじょとも れんらくを とります。家族に ぶじを つたえる ときは、171 に 電話して こえを のこせます。",
    "en": "A shelter worker has accepted your request for help. To leave a 'safe' message for your family, you can call 171 (the Disaster Emergency Message Dial) or use web171.",
    "bn": "আশ্রয়কেন্দ্রের একজন কর্মী আপনার সাহায্যের অনুরোধ গ্রহণ করেছেন। পরিবারের জন্য 'নিরাপদ আছি' বার্তা রাখতে ১৭১ (দুর্যোগ জরুরি বার্তা ডায়াল) নম্বরে ফোন করতে বা web171 ব্যবহার করতে পারেন।",
    "vi": "Một nhân viên nơi sơ tán đã nhận yêu cầu hỗ trợ của bạn. Để để lại lời nhắn 'tôi an toàn' cho gia đình, bạn có thể gọi 171 (đường dây nhắn tin khẩn cấp khi thiên tai) hoặc dùng web171.",
    "id": "Petugas pengungsian sudah menerima permintaan bantuan Anda. Untuk meninggalkan pesan 'saya selamat' bagi keluarga, Anda bisa menelepon 171 (layanan pesan darurat bencana) atau memakai web171.",
    "ne": "आश्रयस्थलका कर्मचारीले तपाईंको सहयोगको अनुरोध स्वीकार गर्नुभएको छ। परिवारका लागि 'म सुरक्षित छु' सन्देश छोड्न १७१ (विपद् आपतकालीन सन्देश डायल) मा फोन गर्न वा web171 प्रयोग गर्न सक्नुहुन्छ।"
  },
  "SHELTER_INFO": {
    "ja": "おしらせは ひなんじょの けいじばんに はり、係の 人が つたえます。この ひなんじょに おしらせが ある ときは、この 画面にも でます。わからない ときは 係の 人に きいて ください。",
    "en": "Official updates are posted on the shelter's notice board and announced by staff. When this shelter has an approved notice, it also appears on this screen. Ask the staff if you are not sure.",
    "bn": "সরকারি খবর আশ্রয়কেন্দ্রের নোটিশ বোর্ডে টাঙানো হয় এবং কর্মীরা ঘোষণা করেন। এই আশ্রয়কেন্দ্রের জন্য অনুমোদিত কোনো নোটিশ থাকলে তা এই স্ক্রিনেও দেখা যাবে। নিশ্চিত না হলে কর্মীদের জিজ্ঞেস করুন।",
    "vi": "Thông báo chính thức được dán ở bảng tin của nơi sơ tán và nhân viên sẽ thông báo. Khi nơi sơ tán này có thông báo đã được duyệt, thông báo cũng hiện trên màn hình này. Nếu chưa rõ, hãy hỏi nhân viên.",
    "id": "Kabar resmi ditempel di papan pengumuman pengungsian dan diumumkan oleh petugas. Jika tempat pengungsian ini punya pengumuman resmi, pengumuman itu juga muncul di layar ini. Tanyakan kepada petugas jika Anda ragu.",
    "ne": "आधिकारिक जानकारी आश्रयस्थलको सूचना पाटीमा टाँसिन्छ र कर्मचारीले घोषणा गर्नुहुन्छ। यो आश्रयस्थलका लागि स्वीकृत सूचना भए यही स्क्रिनमा पनि देखिन्छ। पक्का नभए कर्मचारीलाई सोध्नुहोस्।"
  },
  "SHELTER_STAFF_COMING": {
    "ja": "ひなんじょの 係の 人が あなたの ところに きます。ここで まって いて ください。",
    "en": "Shelter staff are coming to you. Please wait here.",
    "bn": "আশ্রয়কেন্দ্রের কর্মী আপনার কাছে আসছেন। এখানে অপেক্ষা করুন।",
    "vi": "Nhân viên nơi sơ tán đang đến chỗ bạn. Hãy chờ ở đây.",
    "id": "Petugas pengungsian sedang menuju ke tempat Anda. Silakan tunggu di sini.",
    "ne": "आश्रयस्थलका कर्मचारी तपाईंकहाँ आउँदै हुनुहुन्छ। यहीँ पर्खनुहोस्।"
  }
};
