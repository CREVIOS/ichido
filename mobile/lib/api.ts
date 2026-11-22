// The web origin: every write (/api/cmd), staff sign-in (/api/auth) and the staff database token.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
