import path from "node:path";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Pin the project root to web/: otherwise Turbopack may pick the repository root and watch sibling folders
  // (agent worktrees, the mobile app, firmware builds), and every write there triggers a full page reload in dev.
  turbopack: { root: path.resolve(__dirname) },
};

// Workflow DevKit: compiles "use workflow" / "use step" (workflows/case-bot.ts) and serves /.well-known/workflow/*.
export default withWorkflow(nextConfig);
