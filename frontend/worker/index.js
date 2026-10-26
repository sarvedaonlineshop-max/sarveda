/* Runs before the generated cache rules. The old rainstick address was cached
   as a permanent jump to the wide rainstick. Answer that navigation here so a
   returning browser does not reuse the saved jump. */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/product/bamboo-rainstick") return;
  event.respondWith(
    Response.redirect(`${url.origin}/product/new-bamboo-rainstick${url.search}`, 302)
  );
  event.stopImmediatePropagation();
});
