// Based on the deployed mintlify-plainrouter Worker; see README.md.
// Mintlify's reserved Markdown handler currently ignores these docs.json rules.
// Keep this finite map in sync with those authored permanent redirects.
const markdownRedirects = new Map([
  ["/docs/signals/why-numbers-differ-meta.md", "/docs/signals/health-and-performance.md#meta-clicks"],
  ["/docs/signals/compare-meta-clicks.md", "/docs/signals/health-and-performance.md#meta-clicks"],
  ["/docs/signals/why-numbers-differ-ga4.md", "/docs/signals/health-and-performance.md#ga4"],
  ["/docs/signals/compare-ga4.md", "/docs/signals/health-and-performance.md#ga4"],
  ["/docs/signals/why-numbers-differ-plausible.md", "/docs/signals/health-and-performance.md#plausible"],
  ["/docs/signals/compare-plausible.md", "/docs/signals/health-and-performance.md#plausible"],
  ["/docs/guides/meta-capi/typescript.md", "/docs/guides/meta-capi/nodejs.md"],
  ["/docs/guides/meta-capi/python.md", "/docs/sdk/python.md#send-a-meta-conversion"],
  ["/docs/guides/meta-capi/go.md", "/docs/sdk/go.md#send-a-meta-conversion"],
]);

export default {
  async fetch(request) {
    const urlObject = new URL(request.url);
    const isRead = request.method === "GET" || request.method === "HEAD";
    const markdownDestination = markdownRedirects.get(urlObject.pathname);
    if (isRead && markdownDestination) {
      return Response.redirect("https://plainrouter.com" + markdownDestination, 308);
    }
    // The hosted reserved endpoint returns 404 despite the docs.json redirect.
    // Keep the application catalog as the sole source.
    if (
      urlObject.pathname === "/docs/.well-known/api-catalog" &&
      isRead
    ) {
      return Response.redirect("https://plainrouter.com/.well-known/api-catalog", 308);
    }
    if (urlObject.pathname.startsWith("/.well-known/")) {
      return fetch(request);
    }
    const isDocsRootMarkdownRequest = urlObject.pathname === "/docs.md";
    const isMintlifyRequest = urlObject.pathname === "/docs" || isDocsRootMarkdownRequest || urlObject.pathname.startsWith("/docs/") || urlObject.pathname.startsWith("/mintlify-assets/") || urlObject.pathname.startsWith("/_mintlify/");
    if (isMintlifyRequest) {
      const DOCS_URL = "plainrouter.mintlify.site";
      const url = new URL(request.url);
      if (isDocsRootMarkdownRequest) {
        url.pathname = "/docs/index.md";
      }
      url.hostname = DOCS_URL;
      url.protocol = "https:";
      const proxyRequest = new Request(url, request);
      proxyRequest.headers.set("Host", DOCS_URL);
      proxyRequest.headers.set("X-Forwarded-Host", "plainrouter.com");
      proxyRequest.headers.set("X-Forwarded-Proto", "https");
      const clientIp = request.headers.get("CF-Connecting-IP");
      if (clientIp) {
        proxyRequest.headers.set("CF-Connecting-IP", clientIp);
      }
      if (isRead && (
        urlObject.pathname === "/docs/llms-full.txt" ||
        urlObject.pathname === "/docs/.well-known/llms-full.txt"
      )) {
        // The legacy .site proxy retains this aggregate even with no-store.
        // Fetch the verified Mintlify subdirectory origin directly for these
        // two URLs, bypassing that extra cache and downstream storage.
        const aggregateUrl = new URL(proxyRequest.url);
        aggregateUrl.hostname = "plainrouter.subdirectory-docs.mintlify.me";
        const aggregateRequest = new Request(aggregateUrl, proxyRequest);
        aggregateRequest.headers.set("Host", aggregateUrl.hostname);
        const upstream = await fetch(aggregateRequest, { cache: "no-store" });
        const response = new Response(upstream.body, upstream);
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("CDN-Cache-Control", "no-store");
        response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
        response.headers.delete("Expires");
        return response;
      }
      return fetch(proxyRequest);
    }
    return fetch(request);
  }
};
