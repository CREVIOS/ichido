// Staff sign-in, second factors, account and administration screens (Japanese, like every staff screen).

export const AUTH = {
  passkey: "パスキーでサインイン",
  or: "または",
  forgot: "パスワードをお忘れの場合",
  back: "サインインに戻る",
  working: "確認しています…",
  twoFactor: {
    title: "確認コード",
    lead: "認証アプリに表示されている6桁のコードを入力してください。",
    code: "確認コード",
    verify: "確認する",
    useBackup: "バックアップコードを使う",
    backupLead: "保存しておいたバックアップコードを1つ入力してください。使ったコードは無効になります。",
    backup: "バックアップコード",
    useTotp: "認証アプリのコードを使う",
    email: "メールでコードを受け取る",
    emailLead: "登録されたメールアドレスに6桁のコードを送信しました。有効期限は5分です。",
    emailSent: "コードを送信しました。",
  },
  forgotFlow: {
    title: "パスワードの再設定",
    lead: "スタッフ用のメールアドレスを入力してください。再設定用のリンクをお送りします。",
    send: "リンクを送信",
    sent: "そのアドレスがスタッフとして登録されていれば、再設定用のメールが届きます。メールのリンクは1時間有効です。",
  },
  enrol: {
    title: "二段階認証の登録",
    lead: "スタッフアカウントには二段階認証が必要です。どちらかを登録してください。",
    totp: "認証アプリを使う",
    totpHint: "Google Authenticator、1Password など",
    passkey: "パスキーを使う",
    passkeyHint: "この端末の生体認証やセキュリティキー",
    password: "確認のため、パスワードを入力してください。",
    next: "次へ",
    scan: "認証アプリでこの QR コードを読み取り、表示された6桁のコードを入力してください。",
    qrAlt: "認証アプリ登録用の QR コード",
    manual: "読み取れない場合は、次のキーを手入力してください。",
    backupTitle: "バックアップコード",
    backupLead: "端末をなくしたときにサインインするためのコードです。今だけ表示します。安全な場所に保存してください。各コードは1回だけ使えます。",
    copy: "コピー",
    copied: "コピーしました",
    saved: "保存しました。続ける",
    passkeyAdd: "パスキーを登録",
    passkeyConfirm: "登録したパスキーでサインインを完了してください。",
    passkeyName: "Ichido スタッフ",
  },
  stepUp: {
    title: "パスキーで確認",
    lead: "このアカウントはパスキーで二段階認証を行います。登録したパスキーで確認してください。",
  },
  // The mobile app: TOTP enrolment opens the authenticator app on the same phone; passkeys are web only for now.
  app: {
    openAuthenticator: "認証アプリで開く",
    secret: "セットアップキー",
    passkeyOnWeb: "アプリではパスキーを使えません。ウェブの画面でサインインするか、ここで認証アプリを登録してください。",
  },
  password: {
    title: "パスワードの再設定",
    inviteTitle: "パスワードの設定",
    lead: "12文字以上で、ほかのサービスで使っていないパスワードにしてください。過去に漏えいしたパスワードは使えません。",
    new: "新しいパスワード",
    confirm: "確認のためもう一度",
    mismatch: "2つのパスワードが一致しません。",
    save: "設定する",
    done: "パスワードを設定しました。サインインして、二段階認証を登録してください。",
    resetDone: "パスワードを再設定しました。すべての端末でサインアウトしています。新しいパスワードでサインインしてください。",
    toSignIn: "サインインへ",
    invalid: "このリンクは無効か、有効期限が切れています。もう一度お手続きください。",
  },
  errors: {
    credentials: "メールアドレスまたはパスワードが正しくありません。",
    unverified: "メールアドレスの確認が済んでいません。確認用のメールを送信しましたので、リンクを開いてからサインインしてください。",
    tooMany: "試行回数が多すぎます。しばらく待ってから、もう一度お試しください。",
    code: "コードが正しくないか、有効期限が切れています。",
    short: "パスワードは12文字以上にしてください。",
    compromised: "このパスワードは過去の漏えいで見つかっています。別のパスワードにしてください。",
    token: "リンクの有効期限が切れています。もう一度お手続きください。",
    banned: "このアカウントは利用できません。管理者にお問い合わせください。",
    passkey: "パスキーで確認できませんでした。もう一度お試しください。",
    lastFactor: "最後の二段階認証は削除できません。先に別の方法を登録してください。",
    generic: "うまくいきませんでした。もう一度お試しください。",
  },
};

// Better Auth error codes → the message staff see. Unknown codes get the generic message, never the raw text.
export function authError(code: string | undefined, status?: number): string {
  const e = AUTH.errors;
  if (status === 429) return e.tooMany;
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD": case "INVALID_EMAIL": case "INVALID_PASSWORD": case "USER_NOT_FOUND": case "CREDENTIAL_ACCOUNT_NOT_FOUND": return e.credentials;
    case "EMAIL_NOT_VERIFIED": return e.unverified;
    case "TOO_MANY_ATTEMPTS": case "ACCOUNT_TEMPORARILY_LOCKED": case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE": return e.tooMany;
    case "INVALID_CODE": case "INVALID_TWO_FACTOR_COOKIE": case "INVALID_BACKUP_CODE": case "OTP_HAS_EXPIRED": return e.code;
    case "PASSWORD_TOO_SHORT": return e.short;
    case "PASSWORD_COMPROMISED": return e.compromised;
    case "INVALID_TOKEN": return e.token;
    case "BANNED_USER": return e.banned;
    case "LAST_FACTOR": return e.lastFactor;
    default: return e.generic;
  }
}

export const ACCOUNT = {
  title: "アカウント",
  sessions: "サインイン中の端末",
  sessionsLead: "身に覚えのない端末があれば、サインアウトさせてパスワードを変更してください。",
  current: "この端末",
  since: (t: string) => `最終利用 ${t}`,
  revoke: "サインアウトさせる",
  revokeOthers: "ほかの端末をすべてサインアウト",
  unknownDevice: "不明な端末",
  app: "Ichido アプリ",
  passkeys: "パスキー",
  passkeysEmpty: "パスキーは登録されていません。",
  addPasskey: "パスキーを追加",
  removePasskey: "削除",
  added: (t: string) => `登録 ${t}`,
  password: "パスワードの変更",
  passwordLead: "変更すると、この端末以外のすべての端末でサインアウトされます。",
  currentPassword: "現在のパスワード",
  newPassword: "新しいパスワード",
  change: "変更する",
  changed: "パスワードを変更しました。ほかの端末はサインアウトされました。",
  backup: "バックアップコード",
  backupLead: "新しいコードを発行すると、これまでのコードは使えなくなります。",
  regenerate: "新しいコードを発行",
  totpOn: "認証アプリ：登録済み",
  totpOff: "認証アプリ：未登録",
  done: "完了しました。",
};

export const ADMIN = {
  title: "アカウント管理",
  users: "スタッフ",
  invite: "招待する",
  inviteTitle: "スタッフを招待",
  inviteLead: "招待メールのリンクからパスワードを設定し、二段階認証を登録すると使えるようになります。リンクは72時間有効です。",
  name: "表示名",
  email: "メールアドレス",
  role: "役割",
  send: "招待メールを送信",
  invited: "招待メールを送信しました。",
  head: { name: "名前", role: "役割", mfa: "二段階認証", status: "状態", active: "最終利用", actions: "" },
  mfa: (totp: boolean, passkeys: number) => [totp && "認証アプリ", passkeys > 0 && `パスキー ${passkeys}`].filter(Boolean).join("・") || "未登録",
  status: { active: "有効", invited: "招待中", disabled: "停止中" },
  never: "—",
  actions: { role: "役割を変更", disable: "利用を停止", enable: "利用を再開", resetMfa: "二段階認証をリセット", revoke: "全端末をサインアウト", resend: "招待を再送" },
  confirm: {
    disable: "このスタッフの利用を停止し、すべての端末でサインアウトさせますか？",
    resetMfa: "このスタッフの認証アプリ・バックアップコード・パスキーを削除しますか？ 次回のサインインで登録し直しになります。",
    revoke: "このスタッフをすべての端末でサインアウトさせますか？",
  },
  self: "自分自身のアカウントは、ほかの管理者が変更します。",
  saved: "変更しました。",
  audit: "監査ログ",
  auditLead: "アカウントに関する操作の記録です。記録は変更・削除できません。",
  auditEmpty: "記録はまだありません。",
  auditHead: { at: "日時", actor: "操作した人", action: "操作", target: "対象" },
  auditAction: {
    user_invited: "招待", invite_resent: "招待の再送", role_changed: "役割の変更", user_disabled: "利用停止", user_enabled: "利用再開",
    mfa_reset: "二段階認証のリセット", sessions_revoked: "全端末サインアウト",
  } as Record<string, string>,
  roleChange: (from: string, to: string) => `${from} → ${to}`,
  errors: { exists: "このメールアドレスはすでに登録されています。", conflict: "自分自身には実行できません。", bad_request: "入力内容を確認してください。", forbidden: "この操作を行う権限がありません。", mfa_required: "二段階認証を完了したセッションが必要です。" } as Record<string, string>,
  loadError: "読み込めませんでした。",
};
