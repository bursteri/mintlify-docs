// Based on the deployed mintlify-plainrouter Worker; see README.md.
export default {
  async fetch(request) {
    const urlObject = new URL(request.url);
    // The hosted reserved endpoint returns 404 despite the docs.json redirect.
    // Keep the application catalog as the sole source.
    if (
      urlObject.pathname === "/docs/.well-known/api-catalog" &&
      (request.method === "GET" || request.method === "HEAD")
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
      return fetch(proxyRequest);
    }
    return fetch(request);
  }
};
