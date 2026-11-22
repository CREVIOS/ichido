// Account emails to staff (web/lib/mail.ts sends them). Formal Japanese first, then English, in one message.
// Values in braces come from the server; links and codes are never shown anywhere else.

type Part = { subject: string; lead: string; action?: string; note: string };
export type MailCopy = { ja: Part; en: Part };

export const MAIL = {
  brand: "Ichido",
  footer: {
    ja: "このメールは Ichido のスタッフアカウントについて自動で送信されています。返信はできません。",
    en: "This is an automatic message about your Ichido staff account. Replies are not read.",
  },
  linkFallback: { ja: "ボタンが使えない場合は、次のアドレスをブラウザに貼り付けてください。", en: "If the button does not work, paste this address into your browser." },
  verify: {
    ja: { subject: "メールアドレスの確認", lead: "Ichido のスタッフアカウントのメールアドレスを確認してください。", action: "メールアドレスを確認する", note: "このリンクの有効期限は1時間です。お心当たりがない場合は、このメールを破棄してください。" },
    en: { subject: "Confirm your email address", lead: "Please confirm the email address for your Ichido staff account.", action: "Confirm email address", note: "This link expires in 1 hour. If you did not expect this, you can ignore this email." },
  },
  reset: {
    ja: { subject: "パスワードの再設定", lead: "パスワード再設定のご依頼を受け付けました。下のボタンから新しいパスワードを設定してください。", action: "パスワードを再設定する", note: "このリンクの有効期限は1時間です。再設定すると、すべての端末でサインアウトされます。ご依頼に心当たりがない場合は、このメールを破棄してください。" },
    en: { subject: "Reset your password", lead: "We received a request to reset your password. Use the button below to choose a new one.", action: "Reset password", note: "This link expires in 1 hour. Resetting signs you out on every device. If you did not ask for this, ignore this email." },
  },
  invite: {
    ja: { subject: "スタッフアカウントのご案内", lead: "{name} 様の Ichido スタッフアカウントが作成されました。下のボタンからパスワードを設定し、二段階認証を登録してください。", action: "パスワードを設定する", note: "このリンクの有効期限は72時間です。期限が切れた場合は、管理者に再発行をご依頼ください。" },
    en: { subject: "Your Ichido staff account", lead: "An Ichido staff account has been created for {name}. Use the button below to set a password, then register a second factor.", action: "Set password", note: "This link expires in 72 hours. If it has expired, ask your administrator to send a new invitation." },
  },
  otp: {
    ja: { subject: "サインイン確認コード", lead: "サインインの確認コードは {code} です。", note: "このコードの有効期限は5分です。誰にも伝えないでください。お心当たりがない場合は、パスワードを変更してください。" },
    en: { subject: "Your sign-in code", lead: "Your sign-in code is {code}.", note: "This code expires in 5 minutes. Never share it. If you did not try to sign in, change your password." },
  },
  newSignIn: {
    ja: { subject: "新しい端末からのサインイン", lead: "{time} に、これまで使われていない端末からサインインがありました（{device}）。", note: "ご本人の操作であれば、対応は不要です。お心当たりがない場合は、すぐにパスワードを再設定し、管理者にご連絡ください。" },
    en: { subject: "New sign-in to your account", lead: "Your account was signed in from a new device at {time} ({device}).", note: "If this was you, there is nothing to do. If not, reset your password now and tell your administrator." },
  },
} satisfies Record<string, unknown>;

export type MailKind = "verify" | "reset" | "invite" | "otp" | "newSignIn";
