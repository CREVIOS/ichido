import path from "node:path";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

if (process.env.WORKFLOW_QUEUE_AUTH?.trim().toLowerCase() === "off") {
  throw new Error("Ichido requires authenticated workflow queue deliveries");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/^\/h\//, /^\/\.well-known\/workflow\/v1\/webhook\//] } },
  async headers() {
    const restricted = "camera=(), geolocation=(), microphone=()";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: restricted },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
        ],
      },
      {
        source: "/caller",
        headers: [{ key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" }],
      },
      {
        source: "/h/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  // Pin the project root to web/: otherwise Turbopack may pick the repository root and watch sibling folders
  // (agent worktrees, the mobile app, firmware builds), and every write there triggers a full page reload in dev.
  turbopack: { root: path.resolve(__dirname) },
};

// Workflow DevKit: compiles "use workflow" / "use step" (workflows/case-bot.ts) and serves /.well-known/workflow/*.
export default withWorkflow(nextConfig);
