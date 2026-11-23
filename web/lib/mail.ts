import "server-only";
import { MAIL, type MailCopy, type MailKind } from "@/content/mail";
import { entry } from "@/lib/log";

// Account email. With BREVO_API_KEY set: Brevo's transactional API (production). Otherwise MAILPIT_URL: a local
// Mailpit catcher's send API (development and tests read the messages back from it). With neither, sending fails
// loudly: an invite or reset that silently goes nowhere is worse than an error.

// Brevo transactional email API: https://developers.brevo.com/reference/sendtransacemail
const BREVO_SEND = new URL("/v3/smtp/email", "https://api.brevo.com");

type Message = { to: string; kind: MailKind; vars?: Record<string, string>; url?: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

export function render({ kind, vars = {}, url }: Omit<Message, "to">) {
  const copy: MailCopy = MAIL[kind];
  const subject = `${copy.ja.subject} / ${copy.en.subject} | ${MAIL.brand}`;
  const block = (lang: "ja" | "en") => {
    const p = copy[lang];
    const button = url && p.action
      ? `<p><a href="${esc(url)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111;color:#fff;text-decoration:none">${esc(p.action)}</a></p>
<p style="color:#555;font-size:13px">${esc(MAIL.linkFallback[lang])}<br><span style="word-break:break-all">${esc(url)}</span></p>` : "";
    return `<section lang="${lang}"><p>${esc(fill(p.lead, vars))}</p>${button}<p style="color:#555;font-size:13px">${esc(p.note)}</p><p style="color:#888;font-size:12px">${esc(MAIL.footer[lang])}</p></section>`;
  };
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,'Hiragino Sans',sans-serif;font-size:15px;line-height:1.6;color:#111;background:#fff">
<main style="max-width:520px">${block("ja")}<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0">${block("en")}</main></body></html>`;
  const plain = (lang: "ja" | "en") => [fill(copy[lang].lead, vars), url && copy[lang].action ? `${copy[lang].action}: ${url}` : "", copy[lang].note, MAIL.footer[lang]].filter(Boolean).join("\n\n");
  return { subject, html, text: `${plain("ja")}\n\n---\n\n${plain("en")}` };
}

function sender() {
  const from = process.env.MAIL_FROM ?? "";
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>\s*$|^\s*([^<>\s]+@[^<>\s]+)\s*$/.exec(from);
  if (!m) throw new Error("MAIL_FROM is not set to an address, e.g. Ichido <no-reply@example.jp>");
  return { email: m[2] ?? m[3], name: m[1]?.trim() || MAIL.brand };
}

// A production build may use the local mail catcher only when the app itself is served from this machine.
function onThisMachine(): boolean {
  const url = process.env.BETTER_AUTH_URL;
  return !!url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
}

export async function sendMail(msg: Message): Promise<void> {
  const { subject, html, text } = render(msg);
  const from = sender();
  const brevo = process.env.BREVO_API_KEY;
  const mailpit = process.env.MAILPIT_URL;
  let res: Response;
  if (brevo) {
    res = await fetch(BREVO_SEND, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "api-key": brevo, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: from, to: [{ email: msg.to }], subject, htmlContent: html, textContent: text, tags: [`auth-${msg.kind}`] }),
    });
  } else if (mailpit && (process.env.NODE_ENV !== "production" || onThisMachine())) {
    res = await fetch(new URL("/api/v1/send", mailpit), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ From: { Email: from.email, Name: from.name }, To: [{ Email: msg.to }], Subject: subject, HTML: html, Text: text, Tags: [`auth-${msg.kind}`] }),
    });
  } else {
    throw new Error("no mail transport: set BREVO_API_KEY (or MAILPIT_URL for a server on this machine)");
  }
  if (!res.ok) {
    entry("error", "mail_failed", { code: msg.kind, status: res.status });
    throw new Error(`mail transport answered HTTP ${res.status}`);
  }
  entry("info", "mail_sent", { code: msg.kind });
}
