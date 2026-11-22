// Marketing pages for monitoring centres and banks: /enterprise and /pricing (English, like the landing page).
// Every feature named here exists in this repo; sourced figures cite docs/research/10-real-stories.md.

// Placeholder sales address (reserved .example domain); replace before a real launch. See README.
export const CONTACT = { href: "mailto:pilot@ichido.example?subject=Ichido%20pilot", label: "pilot@ichido.example" };

export const SITE = {
  footer: {
    cols: [
      { title: "Product", links: [{ href: "/enterprise", label: "Enterprise" }, { href: "/pricing", label: "Pricing" }, { href: "/#how", label: "How it works" }] },
      { title: "Screens", links: [{ href: "/operator", label: "Console" }, { href: "/s/TABLE-A", label: "Help Point" }, { href: "/insights", label: "Insights" }] },
      { title: "Project", links: [{ href: "https://github.com/CREVIOS/ichido", label: "GitHub" }, { href: "https://github.com/CREVIOS/ichido/blob/main/docs/DEPLOY.md", label: "Deploy guide" }, { href: CONTACT.href, label: "Contact" }] },
    ],
    legal: "© Ichido 2026 · MIT licence",
    made: "Built for TSUNAGU, Nagasaki",
  },
};

export const ENTERPRISE = {
  meta: { title: "Ichido for monitoring centres", description: "One record from the machine's alert to the hand-off, in the caller's language. Customizable, controlled, connected." },
  title: "Ichido for monitoring centres",
  sub: "One record from the machine's alert to the hand-off.",
  start: { href: "#pilot", label: "Go live in 30 days" },
  pillars: [
    { icon: "customize", t: "Customize", b: "Fit the replies, fault rules, response targets and stations to how your centre works." },
    { icon: "control", t: "Control", b: "Row-level security for every role, approved words for every reply, an audit trail for every step." },
    { icon: "connect", t: "Connect", b: "Help Points, your logs, your uptime monitors and your own AI client through MCP." },
  ],
  // Hero composition: the insights board and the Ichido Bot panel, with sample numbers.
  preview: {
    sample: "Sample numbers",
    board: "Insights",
    filter: "Filter",
    range: "Last 14 days",
    download: "CSV",
    tiles: [
      { t: "Cases", v: "184", d: "+12 vs last period" },
      { t: "Reached guidance", v: "61%", d: "caller explained the next step" },
      { t: "First reply", v: "2.4 min", d: "median, target 3 min" },
      { t: "Languages", v: "6", d: "bn · vi · id · ne · en · ja" },
    ],
    daily: "Daily cases",
    hours: "Busiest hours",
    received: [9, 11, 10, 14, 12, 13, 16, 15, 12, 14, 17, 15, 13, 9],
    guided: [5, 6, 6, 9, 7, 8, 10, 9, 8, 9, 11, 10, 8, 6],
    slots: [{ slot: "0", n: 4 }, { slot: "4", n: 2 }, { slot: "8", n: 18 }, { slot: "12", n: 31 }, { slot: "16", n: 27 }, { slot: "20", n: 22 }],
    series: { received: "Cases", guided: "Reached guidance", hours: "Cases" },
    bot: {
      title: "Ichido Bot",
      case: "Nagasaki Station ATM · Bengali",
      steps: [
        { t: "Recommended operator", s: "done", at: "21:40:06" },
        { t: "Gemini suggestion prepared (A-3)", s: "done", at: "21:41:12" },
        { t: "Reminder before first-reply target", s: "waiting", at: "21:43:00" },
        { t: "After-call record", s: "waiting", at: "" },
      ],
      note: "The bot recommends, prepares and reminds. The operator claims, replies and dispatches.",
      input: "Ask about this case in your MCP client",
    },
  },
  // Three sourced facts in place of customer logos.
  facts: [
    { v: "5,244", t: "cards and passbooks captured in the 2021 Mizuho outage; 1,244 came back the same day.", s: "Mizuho investigation committee, June 2021" },
    { v: "3,018 · 2,342 · 1,753", t: "Vietnamese, Indonesian and Nepali workers in Nagasaki Prefecture.", s: "End of October 2025" },
    { v: "62%", t: "of Nepali residents surveyed in Sasebo named Japanese as their biggest problem.", s: "Sasebo City survey, 2019–20" },
  ],
  why: {
    title: "Why centres switch",
    sub: ["One record for the caller,", "the operator and the bank."],
    tag: "1.0",
    items: [
      { icon: "record", t: "One record, alert to hand-off", b: "The machine's alert, the caller's confirmed facts, every decision and the guard's arrival land on one append-only timeline." },
      { icon: "lang", t: "Callers explain once", b: "In Bengali, Vietnamese, Indonesian, Nepali, English or easy Japanese. They correct the read-back themselves, so nobody retells it." },
      { icon: "words", t: "Operators decide with approved words", b: "Replies come only from the bank's catalogue. Gemini suggests one with reasons; the operator sends it." },
    ],
  },
  yours: {
    title: "Make it yours",
    sub: ["Fit every layer of the desk", "to how your centre runs."],
    tag: "2.0",
    catalogue: {
      t: "Reply catalogue and manual versions",
      b: "Approved replies with codes and slots for branch and hours, written once per language and pinned to a manual version.",
      head: "Approved replies",
      filter: "Search replies",
    },
    rules: {
      t: "Fault types and rules",
      b: "Faults and their facts live in the catalogue, and the server refuses a reply the case does not qualify for.",
      name: "Held-card rule",
      when: "When",
      and: "and",
      allow: "Then allow",
      conditions: [["Fault", "is", "Card not returned"], ["Card came back", "is", "No"], ["Remote release", "is not", "Succeeded"]],
      result: ["Reply", "A-3 Wait or leave"],
    },
    targets: {
      t: "Response targets",
      b: "Targets live in the database. pg_cron escalates a case the moment one passes.",
      head: ["Timer", "Target"],
      rows: [["Unclaimed", "60 s"], ["No first reply", "3 min"], ["Guard not on the way", "10 min"]],
    },
    bot: {
      t: "Ichido Bot workflow",
      b: "One durable workflow per case: route, prepare, remind, record.",
      name: "Retained card · TABLE-A",
      state: "Running",
      steps: ["Recommend an operator", "Prepare Gemini's suggestion", "Remind before the target", "Write the after-call record"],
    },
    access: {
      t: "Access",
      b: "Row-level security on every table, down to the case and the assignment.",
      add: "Add staff account",
      roles: [
        { r: "Operator", n: "Monitoring centre", a: "Open cases" },
        { r: "Guard", n: "Security company", a: "Own assignments" },
        { r: "Manager", n: "Bank or centre", a: "Counts only" },
        { r: "Caller", n: "Anonymous, by code", a: "Own case" },
      ],
    },
  },
  specs: {
    title: "Built for enterprise",
    sub: ["Everything a monitoring desk needs,", "from the reply catalogue to the audit trail."],
    tag: "3.0",
    groups: [
      {
        name: "Customize",
        cols: [
          { h: "Catalogue", items: ["Approved replies with codes", "Manual versions", "Fault types with server rules"] },
          { h: "Desk", items: ["Response targets in the database", "Station records: branch and hours", "Printable QR sticker per station"] },
          { h: "Languages and training", items: [{ t: "Six caller languages", tag: "Native review pending" }, "Voice or typed intake", "AI response training"] },
        ],
      },
      {
        name: "Control",
        cols: [
          { h: "Access", items: ["Row-level security on every table", "Operator, guard and manager roles", "Single-use five-minute pairing code"] },
          { h: "Decisions", items: ["Approved replies only", "Held-card rule on the server", "Numbers withheld before they leave the server"] },
          { h: "Bot guardrails", items: ["Never claims, replies or dispatches", "Reminders before each target", "pg_cron escalation"] },
        ],
      },
      {
        name: "Compliance",
        cols: [
          { h: "Audit", items: ["Append-only case timeline", "After-call record with durations", "Gemini's suggestions recorded"] },
          { h: "Hand-off", items: ["Links expire after 24 hours", "Revocable at any time", "Every view audited"] },
          { h: "Privacy", items: ["Insights count, never read", "Logs without caller words", "Gemini sees confirmed facts only"] },
        ],
      },
      {
        name: "Connect",
        cols: [
          { h: "Devices", items: ["ESP32 Help Point heartbeat", "Signed OTA with automatic rollback", "Live station map with device health"] },
          { h: "Operations", items: ["Better Stack structured logs", "Health endpoint for uptime", "Heartbeat monitor per station"] },
          { h: "Agents and API", items: [{ t: "MCP server", tag: "Read-only" }, "Gemini decision support", "Case history CSV export"] },
        ],
      },
    ],
  },
  open: {
    title: "Open by design",
    sub: ["Use our assistant, or bring yours."],
    tag: "4.0",
    tabs: [
      { k: "Claude Code", lines: [["$", "claude mcp add --transport http ichido https://<your-app>/api/mcp \\"], ["", "  --header \"Authorization: Bearer $ICHIDO_MCP_TOKEN\""]] },
      { k: "Tools", lines: [["›", "list_open_cases"], ["›", "get_case"], ["›", "station_health"], ["›", "insights"], ["›", "suggest_next_step"]] },
      { k: "Token", lines: [["$", "node --env-file=web/.env.local \\"], ["", "  scripts/mcp-token.mjs operator@your-centre"]] },
    ],
    copy: "Copy",
    items: [
      { t: "API and MCP", b: "Every write goes through one command route; the MCP server reads the desk for your own AI client." },
      { t: "One permission model", b: "MCP queries run as the signed-in staff member, so row-level security applies there too. Guards and callers are refused." },
      { t: "Use our assistant or yours", b: "Gemini recommends a reply in the console, or ask Claude or any MCP client about open cases." },
      { t: "Your data stays in your project", b: "Ichido runs on your own Supabase project, in the region you choose." },
    ],
    docs: { href: "https://github.com/CREVIOS/ichido#mcp-server", label: "Read the docs" },
  },
  rollout: {
    title: "Go live in 30 days",
    sub: ["Pilot first, then decide."],
    tag: "5.0",
    lead: "A working desk and a team that fits it to your centre. Every pilot starts with your catalogue and ends with operators who have practised on it.",
    steps: [
      { d: "Days 1–7", t: "Design", b: "Reply catalogue, fault rules and stations agreed with the bank." },
      { d: "Days 8–14", t: "Install", b: "Help Points fitted and paired. QR stickers printed for each station." },
      { d: "Days 15–21", t: "Train", b: "Operators practise in AI response training until the scorecard holds." },
      { d: "Days 22–30", t: "Launch", b: "Live cases on the desk, targets switched on, insights from day one." },
    ],
    team: {
      title: "Team",
      roles: [
        { t: "Deployment lead", b: "Owns the plan from kickoff to launch and is your main contact." },
        { t: "Catalogue editor", b: "Turns the bank's manual into approved replies, with native-speaker review." },
        { t: "Device engineer", b: "Help Point install, Wi-Fi setup, heartbeats and signed firmware updates." },
      ],
    },
    questions: {
      title: "Questions",
      items: [
        { q: "Do we need new ATMs?", a: "No. A Help Point sits beside the machine and reports the fault itself; the QR sticker brings the caller in. The ATM's own handset keeps working." },
        { q: "Can we start with one branch?", a: "Yes. The pilot runs up to five Help Points from one desk. Add stations later from the station records." },
        { q: "Who writes the replies?", a: "Your bank. We put its wording into the catalogue, in each language, under a manual version." },
      ],
    },
  },
  cta: {
    title: ["Start with one station.", "Explain once, everywhere."],
    card: { t: "Plan your pilot", b: "Tell us how your desk runs today, and we will scope the first 30 days with you.", button: "Go live in 30 days" },
  },
  faq: {
    title: "Questions we hear most",
    groups: [
      {
        name: "Callers and privacy",
        items: [
          { q: "Who can read what the caller wrote?", a: "The operator sees the caller's original words beside the facts they confirmed, and never the unconfirmed draft. Insights and logs hold counts and codes only. Hand-off links never carry the caller's free text, and Gemini sees only confirmed facts." },
          { q: "Will Ichido ever ask for a PIN?", a: "No. It never asks for a PIN, card, account or ID number, and text that looks like one is withheld on the server before anyone sees it." },
          { q: "How does a caller reach a case?", a: "Only with the operator's single-use, five-minute code. Scanning the sticker alone reveals nothing, and guesses are rate-limited." },
        ],
      },
      {
        name: "Banks and replies",
        items: [
          { q: "Does the bank approve every reply?", a: "Yes. Callers receive only replies from the bank's catalogue, pinned to a manual version. No model writes a message to the caller." },
          { q: "Who checks the translations?", a: "Each language is written in the catalogue, and TypeScript refuses a reply missing one. The current Bengali, Vietnamese, Indonesian, Nepali and Japanese wording is a draft awaiting native-speaker review, which is part of every rollout." },
        ],
      },
      {
        name: "Infrastructure",
        items: [
          { q: "Where is our data hosted?", a: "In your own Supabase project, in the region you choose, Tokyo included. The code is MIT-licensed, so it can also run on a self-hosted Supabase in your own data centre." },
          { q: "What if the network goes down?", a: "A Help Point shows that it is offline, keeps the unsent alert in flash and resends it with backoff; repeats open one case, not two. The ATM's own handset is never replaced, and Better Stack opens an incident when a station's heartbeat stops." },
        ],
      },
    ],
  },
};

export const PRICING = {
  meta: { title: "Pricing — Ichido", description: "Proposed pricing for the 2027 pilot, for monitoring centres and banks." },
  title: "Pricing",
  note: "Proposed pricing for the 2027 pilot — subject to agreement",
  plans: [
    {
      name: "Pilot", for: "For one desk trying Ichido", price: "¥0", unit: "", per: "Free for 90 days",
      includesLabel: "Includes",
      includes: ["Operator console with queue and targets", "Caller page in six languages", "Approved reply catalogue", "Hand-off links, audited", "Insights, counts only"],
      limit: "Up to 5 Help Points",
      support: ["Catalogue setup call", "Email support"],
      cta: { href: CONTACT.href, label: "Start the pilot" },
    },
    {
      name: "Centre", for: "For a monitoring centre", price: "¥9,800", unit: "/Help Point/mo", per: "Billed monthly",
      includesLabel: "Everything in Pilot, plus",
      includes: ["Voice intake with read-back", "Gemini decision support", "Ichido Bot workflow", "Live station map with device health", "Case history and CSV export", "AI response training"],
      limit: "Up to 100 Help Points",
      support: ["Includes everything in Pilot", "Catalogue built from your manual", "Printed QR stickers per station", "Business-hours support"],
      cta: { href: "/operator", label: "Sign in to the console" },
    },
    {
      name: "Network", for: "For a regional bank network", price: "¥7,800", unit: "/Help Point/mo", per: "Billed annually, volume pricing",
      includesLabel: "Everything in Centre, plus",
      includes: ["pg_cron escalation on every target", "Signed OTA firmware updates", "MCP server for your AI client", "Better Stack logs and heartbeats", "Training scorecards and trends"],
      limit: "100 Help Points and up",
      support: ["Includes everything in Centre", "Dedicated deployment lead", "Operator training sessions", "Native-speaker review of replies"],
      cta: { href: CONTACT.href, label: "Talk to us" },
      recommended: true,
    },
    {
      name: "Enterprise", for: "For custom requirements", price: "Custom", unit: "", per: "Billed annually",
      includesLabel: "Everything in Network, plus",
      includes: ["Your own Supabase project and region", "Custom fault types and facts", "Your own manual versions", "Self-hosting option (MIT)"],
      limit: "Custom",
      support: ["Includes everything in Network", "SSO through Supabase Auth", "Data residency review", "Custom integrations"],
      cta: { href: CONTACT.href, label: "Contact us" },
    },
  ],
  limitLabel: "Help Points",
  recommended: "Recommended",
  supportLabel: "Implementation and support",
  langs: { title: "Callers can use" },
  platform: {
    badge: "Platform",
    title: "One record instead of four",
    body: "Ichido replaces the phone note, the relayed dispatch, the retold story and the end-of-day spreadsheet with one case everyone sees.",
    rows: [
      { t: "Machine alert", b: "A Help Point reports the fault itself; duplicate events open one case." },
      { t: "Caller intake", b: "Voice or typed, read back and confirmed by the caller in their language." },
      { t: "Operator console", b: "Queue with targets, original words beside confirmed facts, approved replies." },
      { t: "Guard dispatch", b: "Own assignments only, with the guard's own estimate sent to the caller." },
      { t: "Hand-off record", b: "A read-only link for the bank, police or security company, expiring in 24 hours." },
      { t: "Insights", b: "Counts only: first reply, guidance reached, languages and busiest hours." },
    ],
  },
  trust: {
    label: "Security",
    title: "Built for trust",
    sub: ["Each role sees only what it needs,", "and every step is on the record."],
    tiles: [
      { icon: "lock", t: "Row-level security" },
      { icon: "audit", t: "Append-only audit trail" },
      { icon: "pin", t: "Never a PIN or card number" },
      { icon: "chip", t: "Signed firmware", tag: "Rollback" },
    ],
  },
  faq: {
    title: "Common questions",
    items: [
      { q: "What counts as a Help Point?", a: "One ESP32 Help Point beside one ATM, with its station record and QR sticker. Screens for operators, guards and managers are not counted." },
      { q: "What happens after the 90-day pilot?", a: "You keep your catalogue, stations and history, and choose a plan. The data already sits in your own Supabase project, so stopping moves nothing." },
      { q: "Do callers pay or sign up?", a: "Never. Callers join anonymously with the operator's single-use code." },
      { q: "Are speech and AI costs included?", a: "In this proposal, voice (Soniox, ElevenLabs via LiveKit) and Gemini usage are included at pilot volumes and reviewed with you for larger networks." },
      { q: "Is this price list final?", a: "No. These are proposed prices for the 2027 pilot programme and are subject to agreement with each centre or bank." },
    ],
  },
  cards: [
    { t: "Learn more", b: "Read the README and the deploy guide to see how Ichido works.", cta: { href: "https://github.com/CREVIOS/ichido", label: "View docs" } },
    { t: "Talk to our team", b: "Tell us about your centre and we will suggest the right plan.", cta: { href: CONTACT.href, label: "Book a call" }, dark: true },
  ],
};
