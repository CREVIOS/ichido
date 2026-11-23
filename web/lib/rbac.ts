// The one permission matrix for staff. Plain data with no imports, so the web server, the web client and the mobile
// app (mobile/tsconfig.json "@rbac") read the same file. web/lib/auth.ts builds Better Auth access control from it;
// /api/cmd, /api/admin, /api/mcp and every staff page check a permission from it. Anything not listed is denied.
//
// Every staff permission also needs a session that passed a second factor (aal2): MFA is mandatory for every role,
// so an aal1 session can only finish enrolment. Elevated actions (account administration, takeover, dispatch) are
// therefore never reachable without aal2.

export const ROLES = ["operator", "field", "manager", "admin", "auditor"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r);

export const STATEMENTS = {
  case: ["read", "act", "dispatch", "takeover"],
  training: ["use"],
  field: ["act"],
  insights: ["read"],
  stations: ["read", "disaster"],
  audit: ["read"],
  mcp: ["use"],
  assistant: ["use"],   // Ask Ichido (/api/assistant): read-only questions over the MCP tools, as the person asking
  // Better Auth admin plugin statements (account administration), plus resetting someone's second factor.
  user: ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "set-phone", "get", "update", "reset-mfa"],
  session: ["list", "revoke", "delete"],
} as const;
type Statements = typeof STATEMENTS;
export type Grants = { [K in keyof Statements]?: Statements[K][number][] };
export type Permission = { [K in keyof Statements]: `${K}:${Statements[K][number]}` }[keyof Statements];

export const MATRIX: Record<Role, Grants> = {
  operator: { case: ["read", "act", "dispatch", "takeover"], training: ["use"], insights: ["read"], stations: ["read", "disaster"], mcp: ["use"], assistant: ["use"] },
  field: { field: ["act"] },
  manager: { insights: ["read"], stations: ["read", "disaster"], mcp: ["use"], assistant: ["use"] },
  // A manager's reach plus accounts. Never impersonation, deletion or setting someone's password: people set their own.
  admin: {
    insights: ["read"], stations: ["read", "disaster"], mcp: ["use"], assistant: ["use"], audit: ["read"],
    user: ["create", "list", "set-role", "ban", "get", "update", "reset-mfa"], session: ["list", "revoke"],
  },
  auditor: { case: ["read"], insights: ["read"], stations: ["read"], audit: ["read"], mcp: ["use"], assistant: ["use"] },
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!isRole(role)) return false;
  const [resource, action] = permission.split(":") as [keyof Statements, string];
  return (MATRIX[role][resource] as readonly string[] | undefined)?.includes(action) ?? false;
}

// What each /api/cmd command needs. "any": anyone (answers who they are); "caller": a Supabase anonymous caller.
export type Access = Permission | "any" | "caller";
export const COMMANDS: Record<string, Access> = {
  me: "any", mine: "any",
  // Caller
  pair: "caller", draft: "caller", confirm: "caller", set_lang: "caller", choose: "caller", teachback: "caller", human: "caller",
  rate: "caller", flag: "caller", followup: "caller", silent_alert: "caller", disaster_info: "caller",
  // Operator on a case
  simulate: "case:act", suggest: "case:act", summary_draft: "case:act", summary_save: "case:act", handoff_create: "case:act", handoff_list: "case:act", handoff_revoke: "case:act",
  review: "case:act", staff_list: "case:act", claim: "case:act", remote_release: "case:act", send: "case:act", outcome: "case:act",
  reset_caller: "case:act", abandon: "case:act", set_fault: "case:act", stated_amount: "case:act", bank_status: "case:act",
  issue_code: "case:act", show_code_on_device: "case:act", broadcast: "case:act", promise: "case:act", promise_done: "case:act",
  abusive: "case:act",
  assign: "case:dispatch", fraud: "case:dispatch",
  takeover: "case:takeover",
  training_start: "training:use", training_say: "training:use", training_readback: "training:use", training_reply: "training:use",
  training_dispatch: "training:use", training_end: "training:use",
  field: "field:act",
  disaster_set: "stations:disaster", disaster_clear: "stations:disaster",
};
