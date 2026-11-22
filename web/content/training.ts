// AI response training (AI応対トレーニング): scenarios, rubric and staff copy (Japanese).
// Caller lines are in the persona's language; `ja` is the scripted Japanese gloss for the trainee.
// Facts, correct intents and the guard decision are the hidden ground truth, shown only in the debrief.
import { CASES, REPLIES, SLA, type Fact, type L10n, type Lang } from "./catalogue";

export type Line = { text: string; ja?: string };
export type RubricKey = "time" | "intent" | "held" | "guard" | "numbers" | "human";
export type Result = "pass" | "partial" | "fail";
export type ScoreItem = { key: RubricKey; result: Result; points: number; max: number; seconds?: number | null };

export type Scenario = {
  id: string;
  title: string;
  persona: string;                       // what the trainee is told about the caller
  brief: string;                         // persona instructions for the simulated caller (model)
  lang: Lang;
  facts: { card_back: Fact; cash_received: Fact };
  intents: string[];                     // approved replies that fit this case
  dispatch: boolean;                     // whether a guard site check is the right call
  asksHuman?: boolean;                   // the caller asks for a person straight away
  readsNumber?: boolean;                 // the caller tries to read out a card number straight away
  rubric: Partial<Record<RubricKey, number>>;   // scored items and their points
  script: { opening: Line; human?: Line; number?: Line; answers: Line[]; confirm: Line; after: Record<string, Line> & { default: Line } };
  model: string;                         // the model answer, in plain Japanese
  tip: string;                           // a veteran's know-how for newcomers
};

// Slots for the approved replies in training: a fictional branch, never a real station row.
export const TRAINING_SLOTS: { branch: L10n; hours: L10n } = {
  branch: { ja: "訓練支店", bn: "প্রশিক্ষণ শাখা", en: "Training Branch" },
  hours: { ja: "平日 9:00〜15:00", bn: "সোম–শুক্র ৯:০০–১৫:০০", en: "weekdays 9:00–15:00" },
};

export const SCENARIOS: Scenario[] = [
  {
    id: "bn_card_kept",
    title: "カードが出てこず、現金も受け取れていない",
    persona: "長崎の造船所で働くベンガル語話者の技能実習生（20代）。給料日の夜、ATMでカードが出てこず、現金も受け取れていない。日本語はあいさつ程度。",
    brief: "A Bengali-speaking technical intern in his twenties who works at a shipyard in Nagasaki. It is payday evening. Polite, worried about his salary card. Uses simple, everyday Bengali.",
    lang: "bn",
    facts: { card_back: "no", cash_received: "no" },
    intents: ["HELD_WAIT_OR_LEAVE"],
    dispatch: true,
    rubric: { time: 2, intent: 3, held: 2, guard: 2, numbers: 1 },
    script: {
      opening: { text: "হ্যালো? আমার কার্ড এটিএম থেকে বের হয়নি। টাকাও পাইনি। এখন কী করব?", ja: "もしもし？カードがATMから出てきません。お金も受け取っていません。どうしたらいいですか？" },
      answers: [
        { text: "জি, কার্ডটা মেশিনের ভেতরেই আটকে আছে। স্ক্রিনে কিছু লেখা এসেছিল, কিন্তু আমি পড়তে পারিনি।", ja: "はい、カードは機械の中に入ったままです。画面に何か出ましたが、読めませんでした。" },
        { text: "টাকা বের হয়নি। আমি শুধু জানতে চাই কার্ডটা ফেরত পাব কিনা।", ja: "お金は出てきませんでした。カードが戻ってくるのかだけ知りたいです。" },
        { text: "আমি জানি না। আমি শুধু এটুকুই জানি।", ja: "わかりません。わかるのはそれだけです。" },
      ],
      confirm: { text: "হ্যাঁ, ঠিক আছে। কার্ড ফেরত আসেনি, টাকাও পাইনি।", ja: "はい、合っています。カードは戻っていないし、お金も受け取っていません。" },
      after: {
        HELD_WAIT_OR_LEAVE: { text: "বুঝেছি। আমি এখানে অপেক্ষা করব।", ja: "わかりました。ここで待ちます。" },
        default: { text: "দুঃখিত, আমার কার্ডটা তো মেশিনের ভেতরে। এখন কী হবে?", ja: "すみません、カードは機械の中なんです。これからどうなりますか？" },
      },
    },
    model: "カードは機械の中、現金も未受領。A-3（保管中・待つ／帰る）を送り、警備員に現地確認を依頼するのが基本です。",
    tip: "給料日の夜は外国人の利用者が増えます。待つか帰るかを本人に選んでもらい、帰る場合も銀行から連絡が来ることを必ず伝えます。",
  },
  {
    id: "ja_elderly",
    title: "高齢のお客様が不安で、話が行ったり来たりする",
    persona: "佐世保に住む80代の女性。年金を引き出しに来たがカードが出てこない。耳が少し遠く、不安で同じことを何度も聞く。現金が出たかは本人もわからない。",
    brief: "An anxious woman in her eighties in Sasebo who came to withdraw her pension. Her card did not come out. She is hard of hearing, repeats herself, and does not know whether cash came out. Speaks slow, polite, plain Japanese.",
    lang: "ja",
    facts: { card_back: "no", cash_received: "unknown" },
    intents: ["HELD_WAIT_OR_LEAVE"],
    dispatch: true,
    rubric: { time: 2, intent: 3, held: 2, guard: 2 },
    script: {
      opening: { text: "もしもし、あのね、カードが出てこないのよ。どうしましょう。" },
      answers: [
        { text: "お金？お金は…出たかしらねえ。ちょっとわからないの。" },
        { text: "カードはね、機械に入ったまま。息子に怒られちゃうわ。" },
        { text: "ごめんなさいね、もう一度ゆっくり言ってくださる？" },
      ],
      confirm: { text: "ええ、そう。カードは出てきてないの。お金はわからないわ。" },
      after: {
        HELD_WAIT_OR_LEAVE: { text: "ここで待っていてもいいし、帰ってもいいのね。わかりました、ありがとう。" },
        default: { text: "あら、カードはどうなるのかしら。まだ機械の中なのよ。" },
      },
    },
    model: "カードは機械の中、現金は本人も不明。「不明」を「受け取っていない」と決めつけず、A-3 と現地確認で対応します。",
    tip: "高齢のお客様には、一度に一つずつ、短い文で。「わからない」は「いいえ」ではありません。不明のまま確認し、決めつけないことが大切です。",
  },
  {
    id: "en_tourist_card_back",
    title: "カードは戻ったが、現金が出てこない（A-3 は使えない）",
    persona: "ハウステンボス帰りの英語圏の旅行者。カードは戻ってきたが、現金が出てこなかった。電車の時間が迫っていて苛立っている。",
    brief: "An English-speaking tourist on the way back from Huis Ten Bosch. The card came back out of the ATM, but no cash came out. In a hurry for a train, a little irritated, wants to know whether the account was charged.",
    lang: "en",
    facts: { card_back: "yes", cash_received: "no" },
    intents: ["OFFICIAL_CHANNEL"],
    dispatch: false,
    rubric: { time: 2, intent: 3, held: 3, guard: 2 },
    script: {
      opening: { text: "Hi, the ATM gave my card back but no cash came out. Was I charged?", ja: "もしもし、ATMからカードは戻ってきたのですが、現金が出てきませんでした。引き落とされていますか？" },
      answers: [
        { text: "Yes, I have the card right here in my hand. It's just the money that never came out.", ja: "はい、カードはいま手元にあります。お金だけ出てきませんでした。" },
        { text: "I don't know if it was charged. That's what I'm asking you.", ja: "引き落とされたかはわかりません。それを聞いているんです。" },
        { text: "Look, I have a train to catch. What should I do?", ja: "電車の時間があるんです。どうすればいいですか？" },
      ],
      confirm: { text: "Yes, that's right. The card's back, no cash.", ja: "はい、その通りです。カードは戻って、現金は出ていません。" },
      after: {
        OFFICIAL_CHANNEL: { text: "OK, so I contact the bank through its official channel. Got it, thanks.", ja: "わかりました。銀行の公式窓口に連絡すればいいんですね。ありがとう。" },
        HELD_WAIT_OR_LEAVE: { text: "Inside the machine? No, I told you, the card is in my hand.", ja: "機械の中？いいえ、カードは手元にあると言いましたよね。" },
        default: { text: "Sorry, but what do I do about the missing cash?", ja: "すみません、出てこなかったお金はどうすればいいんですか？" },
      },
    },
    model: "カードは戻っているので A-3 は送れません。現金の件は A-7（銀行の公式窓口）へ。回収するカードがないため、警備員の出動は不要です。",
    tip: "「カードが出てこない」という障害通知でも、お客様の申告が優先です。カードが戻っているのに「カードは機械の中にあります」と送ると誤案内になります。",
  },
  {
    id: "bn_wants_person",
    title: "AI ではなく人と話したいと求められる",
    persona: "介護施設で働くベンガル語話者の女性。カードは出てこなかったが、現金は受け取った。AI を信用できず、人と話したいと強く求めている。",
    brief: "A Bengali-speaking woman who works at a care home. Her card is stuck in the ATM, but she got her cash. She does not trust the AI assistant and keeps asking to talk to a real person.",
    lang: "bn",
    facts: { card_back: "no", cash_received: "yes" },
    intents: ["HELD_WAIT_OR_LEAVE"],
    dispatch: true,
    asksHuman: true,
    rubric: { time: 2, intent: 2, held: 2, guard: 2, human: 3 },
    script: {
      opening: { text: "আমার কার্ড মেশিনে আটকে গেছে। টাকা পেয়েছি, কিন্তু কার্ড আসেনি।", ja: "カードが機械に詰まりました。お金は受け取りましたが、カードが出てきません。" },
      human: { text: "আমি একজন মানুষের সাথে কথা বলতে চাই, মেশিনের সাথে নয়।", ja: "機械ではなく、人と話したいです。" },
      answers: [
        { text: "দয়া করে, কোনো মানুষকে দিন। আমার ভয় লাগছে।", ja: "お願いです、人に代わってください。不安です。" },
        { text: "টাকা হাতে আছে। শুধু কার্ডটা ভেতরে।", ja: "お金は手元にあります。カードだけが中にあります。" },
        { text: "আমি জানি না। আমি শুধু কার্ডটা চাই।", ja: "わかりません。カードを返してほしいだけです。" },
      ],
      confirm: { text: "হ্যাঁ, ঠিক। কার্ড আসেনি, টাকা পেয়েছি।", ja: "はい、そうです。カードは出てこず、お金は受け取りました。" },
      after: {
        HANDSET: { text: "ঠিক আছে, আমি রিসিভার দিয়ে কথা বলব।", ja: "わかりました、受話器で話します。" },
        HELD_WAIT_OR_LEAVE: { text: "বুঝেছি, কার্ডটা ভেতরে আছে। কিন্তু আমি এখনো একজন মানুষের সাথে কথা বলতে চাই।", ja: "カードが中にあるのはわかりました。でも、やはり人と話したいです。" },
        default: { text: "আমি একজন মানুষের সাথে কথা বলতে চাই।", ja: "人と話したいです。" },
      },
    },
    model: "人との会話の希望には A-6（受話器の案内）ですぐに応え、カードは機械の中なので A-3 と現地確認も行います。",
    tip: "「人と話したい」は最優先の合図です。A-6 で受話器を案内すれば、すぐ人の声につながります。AI とのやりとりを無理に続けさせないこと。",
  },
  {
    id: "ja_reads_number",
    title: "お客様がカード番号を読み上げようとする",
    persona: "急いでいる40代の会社員。カードが出てこず、現金は受け取った。早く済ませようと、カード番号を読み上げようとする。",
    brief: "A hurried office worker in his forties. His card is stuck in the ATM; he did get his cash. He wants to speed things up and keeps offering details. Speaks brisk, polite Japanese.",
    lang: "ja",
    facts: { card_back: "no", cash_received: "yes" },
    intents: ["HELD_WAIT_OR_LEAVE"],
    dispatch: true,
    readsNumber: true,
    rubric: { time: 2, intent: 2, held: 2, guard: 2, numbers: 3 },
    script: {
      opening: { text: "すみません、カードが出てこないんです。急いでいるんですが。" },
      number: { text: "早く調べられるように、カード番号を言いますね。4980 1234 5678 9012 です。" },
      answers: [
        { text: "お金は出てきました。カードだけ吸い込まれたままです。" },
        { text: "番号があったほうが早いんじゃないですか？" },
        { text: "わかりました。じゃあ、どうすればいいですか。" },
      ],
      confirm: { text: "はい、カードは出てきていません。お金は受け取りました。" },
      after: {
        HELD_WAIT_OR_LEAVE: { text: "ここで待つか帰るか選べるんですね。わかりました。" },
        default: { text: "それで、カードはどうなるんですか？" },
      },
    },
    model: "番号はシステムが自動で伏せました。担当者は番号を求めず「番号は言わないでください」と止め、A-3 と現地確認で対応します。",
    tip: "カード番号・暗証番号は、どんなに急いでいても聞きません。お客様が言いかけたら「番号は言わないでください」と止めます。システムも自動で伏せます。",
  },
];

export const scenarioOf = (id: unknown): Scenario | undefined => SCENARIOS.find((s) => s.id === id);

const dur = (s: number) => (s < 90 ? `${s}秒` : `${(s / 60).toFixed(1)}分`);
const codes = (intents: string[]) => intents.map((k) => `${REPLIES[k]?.code ?? k}（${REPLIES[k]?.title ?? k}）`).join("・");

// Staff copy for /training.
export const TRAINING = {
  title: "AI応対トレーニング",
  lead: "模擬のお客様（AI）を相手に、実際の監視センターと同じ部品で応対を練習します。ベテランの判断のコツを、新人が安全に身につけるためのモードです。",
  isolated: "訓練モード：本物の案件・お客様・警備員には一切つながりません。案件一覧とインサイトには記録されず、接続コード・警備員への通知・Gemini 提案も使いません。",
  scenarios: "シナリオ",
  start: "開始",
  starting: "準備しています…",
  rubricItems: "採点項目",
  history: "これまでの訓練",
  noHistory: "まだ訓練の記録はありません。シナリオを選んで始めてください。",
  trend: "得点の推移",
  trendNote: "終了した訓練の得点（満点に対する割合）",
  passPct: 80,
  passLine: "目安 80%",
  inProgress: "途中",
  head: { scenario: "シナリオ", date: "日時", score: "得点" },
  practice: "訓練中",
  persona: "お客様の人物像",
  language: "お客様の言語",
  lang: CASES.languages as Record<string, string>,
  started: "開始",
  timer: SLA.label.reply,
  replied: (s: number) => `初回返答 ${dur(s)}`,
  convo: "お客様とのやりとり",
  caller: "お客様（模擬）",
  you: "あなた",
  assistant: "AI アシスタントの読み返し",
  gloss: { script: "台本の訳", model: "機械翻訳", catalogue: "日本語" } as Record<string, string>,
  wantsHuman: "担当者との会話を希望",
  withheldCaller: "番号のような内容があったため、伏せました（担当者には表示されません）。",
  withheldOperator: "番号のような内容があったため、送信していません。",
  replyTurn: (code: string, title: string) => `承認済み返答を送信：${code} ${title}`,
  dispatchTurn: "警備会社へ現地確認を依頼（訓練のため通知はされません）",
  sayLabel: "お客様への声かけ（受話器で話す想定）",
  sayPlaceholder: "例：カードは機械から出てきましたか？",
  say: "話す",
  sayNote: "カード・暗証・口座などの番号は聞かないでください。",
  readback: { title: "読み返しと確認", body: "AI アシスタントが、お客様の話をお客様の言語で読み返し、お客様が確認します。確認が済むと返答を送れます。", ask: "読み返して確認してもらう", done: "お客様が確認しました" },
  guard: { uid: "training-guard", display_name: "訓練用の警備員" },
  end: "終了して採点",
  endNote: "返答と出動の判断が済んだら、終了して採点します。",
  debrief: "振り返り",
  score: "得点",
  points: (p: number, m: number) => `${p} / ${m}点`,
  percent: (n: number) => `${n}%`,
  result: { pass: "できた", partial: "あと少し", fail: "要練習" } as Record<Result, string>,
  tone: { pass: "guided", partial: "received", fail: "alert" } as Record<Result, string>,
  model: "模範対応",
  truth: "実際の状況",
  tip: "ベテランのコツ",
  transcript: "やりとりの記録",
  again: "もう一度",
  back: "シナリオ一覧へ",
  dispatchYes: "警備員の現地確認：必要",
  dispatchNo: "警備員の現地確認：不要",
  rubric: {
    time: "初回返答の速さ",
    intent: "返答の選択",
    held: "カード保管の案内ルール",
    guard: "警備員の出動判断",
    numbers: "番号を聞かない",
    human: "「人と話したい」への対応",
  } as Record<RubricKey, string>,
};

// Plain-Japanese feedback for one rubric item.
export function feedback(item: ScoreItem, s: Scenario): string {
  const target = dur(SLA.firstReplyS);
  switch (item.key) {
    case "time":
      if (item.seconds == null) return `返答を送っていません。目標は障害通知から${target}以内です。`;
      return item.result === "pass" ? `${dur(item.seconds)}で返答できました。目標の${target}以内です。`
        : item.result === "partial" ? `${dur(item.seconds)}かかりました。目標は${target}以内です。読み返しの確認が済んだら、すぐ返答を選びましょう。`
        : `${dur(item.seconds)}かかりました。目標の${target}を大きく超えています。お客様は待つほど不安になります。`;
    case "intent":
      return item.result === "pass" ? "状況に合った承認済み返答を選べました。" : `この状況では ${codes(s.intents)} が適切です。`;
    case "held":
      return item.result === "pass"
        ? "「カードは機械の中にあります」という案内を、お客様が「戻っていない」と確認したときだけに使えました。"
        : "カードが戻っているのに A-3（カード保管中）を送りました。実際の監視センターの画面では送信できず、送れば誤案内になります。";
    case "guard":
      if (item.result === "pass") return s.dispatch ? "カードが機械の中にあるため、現地確認を依頼できました。" : "回収するカードがないため、出動を依頼しない判断ができました。";
      return s.dispatch ? "カードが機械の中にあるため、警備会社への現地確認の依頼が必要でした。" : "カードは戻っているため、警備員の出動は不要でした。";
    case "numbers":
      return item.result === "pass" ? (s.readsNumber ? "番号を求めず、言わないよう伝えられました。" : "番号を求めませんでした。")
        : item.result === "partial" ? "番号は求めませんでしたが、お客様が言いかけたときに「番号は言わないでください」と止めましょう。"
        : "番号を求める、または入力しました。カード・暗証・口座番号はどんな場合も聞きません。";
    case "human":
      return item.result === "pass" ? "A-6 で受話器を案内し、すぐ人につなげました。"
        : item.result === "partial" ? "声はかけましたが、A-6（受話器の案内）を送っていません。人と話せる手段を示しましょう。"
        : "人との会話の希望に応えていません。A-6 で受話器を案内します。";
  }
}
