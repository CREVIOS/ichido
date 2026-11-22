import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { MAP_STYLE } from "@/lib/map-style";

// Both Supabase Realtime and LiveKit use HTTP discovery and a WebSocket on the configured host.
function connectionOrigins(endpoint: string | undefined): string[] {
  if (!endpoint) return [];
  const { protocol, origin } = new URL(endpoint);
  if (!["http:", "https:", "ws:", "wss:"].includes(protocol)) throw new Error("Invalid connection origin");
  const http = origin.replace(/^ws/, "http");
  return [http, http.replace(/^http/, "ws")];
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/.well-known/workflow/")) {
    // All case signals use server-side resumeHook(). The public webhook has no caller in this app.
    return new NextResponse(null, { status: 404 });
  }
  if (path.startsWith("/h/")) {
    const { limitSource } = await import("@/lib/request-security");
    const denied = await limitSource(request.headers, "handoff-view", 30, 60);
    if (denied) return denied;
  }

  const nonce = randomBytes(18).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const mapOrigin = new URL(MAP_STYLE, request.nextUrl.origin).origin;
  const livekit = process.env.LIVEKIT_URL;
  const connections = [
    "'self'", mapOrigin,
    ...connectionOrigins(process.env.NEXT_PUBLIC_SUPABASE_URL),
    ...connectionOrigins(livekit),
  ];
  if (livekit && /\.(livekit\.cloud|livekit\.run)$/.test(new URL(livekit).hostname)) {
    connections.push("https://*.livekit.cloud", "wss://*.livekit.cloud", "https://*.livekit.run", "wss://*.livekit.run");
  }
  if (dev) connections.push(...connectionOrigins(request.nextUrl.origin));
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'", // React, MapLibre and charts set styles at runtime.
    `connect-src ${connections.join(" ")}`,
    `img-src 'self' data: blob: ${mapOrigin}`,
    "font-src 'self'", "media-src 'self' blob:", "worker-src 'self' blob:",
    "frame-src 'none'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
  ].join("; ");
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/.well-known/workflow/v1/webhook/:path*",
    "/((?!api/|_next/|\\.well-known/|art/|favicon\\.ico$|[^/]+\\.svg$).*)",
  ],
};
