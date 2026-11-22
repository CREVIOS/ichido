// Database errors can echo row values (e.g. "Failing row contains …"), so only their code is kept.
export function errorFields(e: unknown) {
  const code = e && typeof e === "object" && "code" in e ? e.code : null;
  return {
    error: e instanceof TypeError ? "TypeError" : "Error",
    error_code: typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code) ? code : undefined,
  };
}
