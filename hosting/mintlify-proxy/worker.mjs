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
  ["/docs/guides/meta-capi/typescript.md", "/docs/sdk/recipes/meta-conversions.md"],
  ["/docs/guides/meta-capi/python.md", "/docs/sdk/python.md#send-a-meta-conversion"],
  ["/docs/guides/meta-capi/go.md", "/docs/sdk/go.md#send-a-meta-conversion"],
  ["/docs/actions/connect-agent.md", "/docs/mcp/setup.md"],
  ["/docs/actions/workspace-tokens.md", "/docs/mcp/workspace-tokens.md"],
  ["/docs/reference/mcp-tools.md", "/docs/mcp/tools.md"],
  ["/docs/api-reference/introduction.md", "/docs/api/introduction.md"],
  ["/docs/auth.md", "/docs/api/authentication.md"],
  ["/docs/sandbox.md", "/docs/api/sandbox.md"],
  ["/docs/reference/conversion-api.md", "/docs/api/conversions.md"],
  ["/docs/reference/api-resource-index.md", "/docs/api/resources.md"],
  ["/docs/reference/api-catalog.md", "/docs/api/catalog.md"],
  ["/docs/guides/meta-capi/nodejs.md", "/docs/sdk/recipes/meta-conversions.md"],
  ["/docs/cli/quickstart.md", "/docs/sdk/cli/quickstart.md"],
  ["/docs/cli/commands.md", "/docs/sdk/cli/commands.md"],
  ["/docs/api-reference/sandbox/discover-the-zero-auth-sandbox.md", "/docs/api/sandbox/discover.md"],
  ["/docs/api-reference/sandbox/get-a-sandbox-api-key.md", "/docs/api/sandbox/get-key.md"],
  ["/docs/api-reference/sandbox/create-a-sandbox-api-key.md", "/docs/api/sandbox/create-key.md"],
  ["/docs/api-reference/sandbox/validate-a-synthetic-event.md", "/docs/api/sandbox/validate-event.md"],
  ["/docs/api-reference/sandbox/validate-a-synthetic-event-with-a-sandbox-key.md", "/docs/api/sandbox/validate-keyed-event.md"],
  ["/docs/api-reference/event/submit-a-conversion-event.md", "/docs/api/events/create.md"],
  ["/docs/api-reference/event/verify-server-side-signal-ingestion.md", "/docs/api/events/verify-ingestion.md"],
  ["/docs/api-reference/event/get-an-event-and-delivery-trace.md", "/docs/api/events/get.md"],
  ["/docs/api-reference/operations/list-recent-events.md", "/docs/api/events/list.md"],
  ["/docs/api-reference/operations/list-recent-events-by-cursor.md", "/docs/api/events/list-by-cursor.md"],
  ["/docs/api-reference/operations/configure-destination-test-mode.md", "/docs/api/destinations/test-mode.md"],
  ["/docs/api-reference/operations/send-a-controlled-test-purchase.md", "/docs/api/destinations/test-purchase.md"],
  ["/docs/api-reference/operations/replay-eligible-deliveries.md", "/docs/api/deliveries/replay.md"],
  ["/docs/api-reference/operations/get-a-reconciliation-report.md", "/docs/api/reports/reconciliation.md"],
  ["/docs/api-reference/operations/get-event-match-quality-history.md", "/docs/api/reports/emq.md"],
  ["/docs/api-reference/operations/delete-user-data-by-verified-identifier.md", "/docs/api/privacy/delete-user-data.md"],
  ["/docs/reference/authentication.md", "/docs/api/authentication.md"],
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
