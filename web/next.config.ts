import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
};

// Workflow DevKit: compiles "use workflow" / "use step" (workflows/case-bot.ts) and serves /.well-known/workflow/*.
export default withWorkflow(nextConfig);
