// Ichido staff notifications (web/lib/alerts.ts sends them, /account turns them on). The payload is a title, a body
// with a place name, a same-site link and a tag: never caller text. Nothing is cached; this worker only shows pushes.
self.addEventListener("push", (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = {}; }
  if (typeof m.title !== "string") return;
  const url = typeof m.url === "string" && m.url.startsWith("/") && !m.url.startsWith("//") ? m.url : "/";
  event.waitUntil(Promise.all([
    self.registration.showNotification(m.title, { body: typeof m.body === "string" ? m.body : "", tag: m.tag, data: { url }, icon: "/icon.svg", lang: "ja" }),
    // Open Ichido tabs hear about it too (tests and an in-page toast can use it).
    self.clients.matchAll({ type: "window" }).then((tabs) => tabs.forEach((t) => t.postMessage({ type: "ichido-push", tag: m.tag, url }))),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
    const same = tabs.find((t) => t.url.startsWith(self.location.origin));
    return same ? same.navigate(url).then((t) => t?.focus()) : self.clients.openWindow(url);
  }));
});
