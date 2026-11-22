import type { Instrumentation } from "next";

// Unhandled server errors (rendering, route handlers, actions) go to stdout and Better Stack.
// Only the path without its query string is kept; the error message is dropped for database errors (see errorFields).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { entry, errorFields, ship } = await import("@/lib/log");
  await ship([entry("error", "unhandled_error", {
    path: request.path.split("?")[0], method: request.method,
    route_path: context.routePath, route_type: context.routeType, ...errorFields(err),
  })]);
};
