import type { Instrumentation } from "next";

// Unhandled server errors (rendering, route handlers, actions) go to stdout and Better Stack.
// Framework route templates keep hand-off tokens and other URL parameters out of telemetry.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { entry, errorFields, ship } = await import("@/lib/log");
  await ship([entry("error", "unhandled_error", {
    method: request.method,
    route_path: context.routePath, route_type: context.routeType, ...errorFields(err),
  })]);
};
