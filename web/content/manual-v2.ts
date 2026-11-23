import type { L10n } from "./catalogue.ts";

// Frozen wording for sent replies. Slot values come from the stored reply.
export const manual: Record<string, L10n> = {
  "HELD_WAIT_OR_LEAVE": {
    "ja": "カードは ATM の 中に あります。ここで まっても、かえっても いいです。あとで この 画面で おしらせを みて ください。カードは 銀行の きまりに そって あつかいます。{branch} の まどぐちでも きけます。あいて いるのは {hours} です。",
    "bn": "আপনার কার্ড মেশিনের ভেতরে আছে। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। নতুন খবরের জন্য এই কেসটি এখানে দেখুন। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। {branch}-এর কাউন্টারেও ({hours}) জানতে পারবেন।",
    "en": "Your card is inside the machine. You can wait here, or you can leave. Check this case here for updates. The card is handled under the bank's own procedure. The {branch} counter ({hours}) can also help.",
    "vi": "Thẻ của bạn đang ở trong máy. Bạn có thể chờ ở đây, hoặc có thể ra về. Hãy xem lại hồ sơ tại đây để biết tin mới. Thẻ được xử lý theo quy trình riêng của ngân hàng. Quầy giao dịch của {branch} ({hours}) cũng có thể giúp bạn.",
    "id": "Kartu Anda ada di dalam mesin. Anda bisa menunggu di sini, atau Anda bisa pulang. Periksa kasus ini di sini untuk kabar terbaru. Kartu ditangani sesuai prosedur bank sendiri. Loket {branch} ({hours}) juga dapat membantu.",
    "ne": "तपाईंको कार्ड मेसिनभित्र छ। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। नयाँ जानकारीका लागि यहीँ केस हेर्नुहोस्। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। {branch} को काउन्टरमा पनि सोध्न सक्नुहुन्छ ({hours})।"
  },
  "CASH_IN_JAM": {
    "ja": "入れた お金は ATM の 中に あります。銀行が お金と 記録を しらべて、こうざの お金を なおします。ATM から でた 紙が あれば、すてないで ください。ここで まっても、かえっても いいです。あとで この 画面で おしらせを みて ください。",
    "en": "The cash you put in is inside the machine. The bank counts it, checks the record and corrects your balance. Please keep the slip if the machine gave you one. You can wait here, or you can leave. Check this case here for updates.",
    "bn": "আপনি যে টাকা জমা দিয়েছেন তা মেশিনের ভেতরে আছে। ব্যাংক টাকা গুনে, রেকর্ড দেখে আপনার ব্যালান্স ঠিক করবে। মেশিন কোনো রসিদ দিয়ে থাকলে সেটি রেখে দিন। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। নতুন খবরের জন্য এই কেসটি এখানে দেখুন।",
    "vi": "Số tiền bạn nạp vào đang ở trong máy. Ngân hàng sẽ đếm tiền, kiểm tra dữ liệu và điều chỉnh số dư cho bạn. Nếu máy có in phiếu, hãy giữ lại. Bạn có thể chờ ở đây, hoặc có thể ra về. Hãy xem lại hồ sơ tại đây để biết tin mới.",
    "id": "Uang yang Anda setor ada di dalam mesin. Bank menghitungnya, memeriksa catatan, dan membetulkan saldo Anda. Jika mesin mengeluarkan struk, simpanlah. Anda bisa menunggu di sini, atau Anda bisa pulang. Periksa kasus ini di sini untuk kabar terbaru.",
    "ne": "तपाईंले हालेको पैसा मेसिनभित्र छ। बैंकले पैसा गनेर, रेकर्ड जाँचेर तपाईंको मौज्दात मिलाउँछ। मेसिनले रसिद दिएको भए त्यसलाई राख्नुहोस्। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। नयाँ जानकारीका लागि यहीँ केस हेर्नुहोस्।"
  },
  "PASSBOOK_HELD": {
    "ja": "通帳は ATM の 中に あります。ここで まっても、かえっても いいです。あとで この 画面で おしらせを みて ください。通帳は 銀行の きまりに そって あつかいます。{branch} の まどぐちでも きけます。あいて いるのは {hours} です。",
    "en": "Your passbook is inside the machine. You can wait here, or you can leave. Check this case here for updates. The passbook is handled under the bank's own procedure. The {branch} counter ({hours}) can also help.",
    "bn": "আপনার পাসবই মেশিনের ভেতরে আছে। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। নতুন খবরের জন্য এই কেসটি এখানে দেখুন। পাসবইয়ের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। {branch}-এর কাউন্টারেও ({hours}) জানতে পারবেন।",
    "vi": "Sổ tài khoản của bạn đang ở trong máy. Bạn có thể chờ ở đây, hoặc có thể ra về. Hãy xem lại hồ sơ tại đây để biết tin mới. Sổ được xử lý theo quy trình riêng của ngân hàng. Quầy giao dịch của {branch} ({hours}) cũng có thể giúp bạn.",
    "id": "Buku tabungan Anda ada di dalam mesin. Anda bisa menunggu di sini, atau Anda bisa pulang. Periksa kasus ini di sini untuk kabar terbaru. Buku tabungan ditangani sesuai prosedur bank sendiri. Loket {branch} ({hours}) juga dapat membantu.",
    "ne": "तपाईंको पासबुक मेसिनभित्र छ। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। नयाँ जानकारीका लागि यहीँ केस हेर्नुहोस्। पासबुकको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। {branch} को काउन्टरमा ({hours}) पनि सोध्न सक्नुहुन्छ।"
  }
};
