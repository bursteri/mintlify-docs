import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import worker from "./worker.mjs";

const origin = "https://plainrouter.com";
const alias = "/docs/.well-known/api-catalog";

for (const method of ["GET", "HEAD"]) {
  test(`${method} catalog alias redirects without an upstream request`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => {
      assert.fail("The catalog alias must not reach Mintlify or fetch the catalog");
    });
    for (const query of ["", "?source=docs&next=https://example.org"]) {
      const response = await worker.fetch(new Request(origin + alias + query, { method }));
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), origin + "/.well-known/api-catalog");
      assert.equal(await response.text(), "");
    }
    assert.equal(fetch.mock.callCount(), 0);
  });
}

for (const path of [
  "/docs", "/docs/quickstart", "/docs/quickstart.md", "/docs.md",
  "/docs/llms.txt", "/docs/sitemap.xml",
  "/docs/.well-known/mcp/server-card.json", "/docs/.well-known/agent-card.json",
  "/docs/.well-known/agent-skills/index.json", "/mintlify-assets/main.css",
  "/_mintlify/api/example", alias + ".md", alias + "/extra", alias + "/",
]) {
  test(`${path} retains deployed Mintlify forwarding`, async (t) => {
    const upstream = new Response("upstream content", {
      headers: { link: "</docs/llms.txt>; rel=llms-txt", "x-test-upstream": "kept" },
    });
    const fetch = t.mock.method(globalThis, "fetch", async (request) => {
      const expectedPath = path === "/docs.md" ? "/docs/index.md" : path;
      assert.equal(request.url, "https://plainrouter.mintlify.site" + expectedPath + "?q=example");
      assert.equal(request.headers.get("host"), "plainrouter.mintlify.site");
      assert.equal(request.headers.get("x-forwarded-host"), "plainrouter.com");
      assert.equal(request.headers.get("x-forwarded-proto"), "https");
      assert.equal(request.headers.get("cf-connecting-ip"), "192.0.2.1");
      assert.equal(request.headers.get("accept"), "text/markdown");
      return upstream;
    });
    const request = new Request(origin + path + "?q=example", {
      headers: { "cf-connecting-ip": "192.0.2.1", accept: "text/markdown" },
    });
    assert.equal(await worker.fetch(request), upstream);
    assert.equal(fetch.mock.callCount(), 1);
  });
}

for (const path of ["/", "/login", "/docs-other", "/.well-known/api-catalog", "/.well-known/acme-challenge/example"]) {
  test(`${path} passes the original request through`, async (t) => {
    const request = new Request(origin + path);
    const upstream = new Response("application content");
    const fetch = t.mock.method(globalThis, "fetch", async (forwarded) => {
      assert.equal(forwarded, request);
      return upstream;
    });
    assert.equal(await worker.fetch(request), upstream);
    assert.equal(fetch.mock.callCount(), 1);
  });
}

for (const path of [alias, "/_mintlify/api/example", "/docs/guides/meta-capi/python.md", "/docs/llms-full.txt", "/docs/.well-known/llms-full.txt"]) {
  test(`POST ${path} still forwards its method and body`, async (t) => {
    const upstream = new Response("upstream response", { status: 202 });
    t.mock.method(globalThis, "fetch", async (request) => {
      assert.equal(request.url, "https://plainrouter.mintlify.site" + path);
      assert.equal(request.method, "POST");
      assert.equal(await request.text(), '{"example":true}');
      assert.equal(request.headers.get("content-type"), "application/json");
      assert.equal(request.headers.get("cf-connecting-ip"), null);
      return upstream;
    });
    const request = new Request(origin + path, {
      method: "POST", headers: { "content-type": "application/json" }, body: '{"example":true}',
    });
    assert.equal(await worker.fetch(request), upstream);
  });
}

test("hosting source and operational notes stay out of the published docs", () => {
  const ignore = readFileSync(new URL("../../.mintignore", import.meta.url), "utf8");
  assert.match(ignore, /^hosting\/$/m);
});

const config = JSON.parse(readFileSync(new URL("../../docs.json", import.meta.url), "utf8"));
const markdownRules = config.redirects.filter(rule => rule.source.endsWith(".md"));
for (const rule of markdownRules) {
  test(`${rule.source} GET and HEAD honor the authored permanent Markdown destination`, async (t) => {
    t.mock.method(globalThis, "fetch", () => assert.fail("Retired Markdown aliases must not fetch upstream"));
    assert.equal(rule.permanent, true);
    for (const method of ["GET", "HEAD"]) {
      for (const query of ["", "?next=https://example.org&source=docs"]) {
        const response = await worker.fetch(new Request(origin + "/docs" + rule.source + query, { method }));
        assert.equal(response.status, 308);
        assert.equal(response.headers.get("location"), rule.destination);
        assert.equal(await response.text(), "");
      }
    }
  });
}

for (const path of ["/docs/llms-full.txt", "/docs/.well-known/llms-full.txt"]) {
  for (const method of ["GET", "HEAD"]) {
    test(`${method} ${path} bypasses upstream cache and disables downstream storage`, async (t) => {
      const upstream = new Response(method === "GET" ? "# Current documentation" : null, {
        headers: {
          "content-type": "text/plain", "cache-control": "public, max-age=86400",
          "cdn-cache-control": "max-age=86400", "cloudflare-cdn-cache-control": "max-age=86400",
          expires: "Wed, 01 Jan 2031 00:00:00 GMT", etag: '"origin-version"',
          link: "</docs/llms.txt>; rel=llms-txt",
        },
      });
      t.mock.method(globalThis, "fetch", async (request, options) => {
        assert.equal(request.url, "https://plainrouter.subdirectory-docs.mintlify.me" + path + "?source=test");
        assert.equal(request.method, method);
        assert.equal(request.headers.get("host"), "plainrouter.subdirectory-docs.mintlify.me");
        assert.equal(request.headers.get("x-forwarded-host"), "plainrouter.com");
        assert.deepEqual(options, { cache: "no-store" });
        return upstream;
      });
      const response = await worker.fetch(new Request(origin + path + "?source=test", { method }));
      assert.equal(response.body, upstream.body, "Stream the upstream body without buffering or rewriting it");
      assert.equal(response.status, 200);
      for (const name of ["cache-control", "cdn-cache-control", "cloudflare-cdn-cache-control"]) {
        assert.equal(response.headers.get(name), "no-store");
      }
      assert.equal(response.headers.get("expires"), null);
      assert.equal(response.headers.get("content-type"), "text/plain");
      assert.equal(response.headers.get("etag"), '"origin-version"');
      assert.equal(response.headers.get("link"), "</docs/llms.txt>; rel=llms-txt");
      assert.equal(await response.text(), method === "GET" ? "# Current documentation" : "");
    });
  }
}

test("aggregate failures retain upstream status and never become a successful stale fallback", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  const response = await worker.fetch(new Request(origin + "/docs/llms-full.txt"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "Unavailable");
});

for (const path of ["/docs/llms-full.txt/extra", "/docs/.well-known/llms-full.txt/extra", "/llms-full.txt", "/docs/guides/meta-capi/python.md/extra"]) {
  test(`${path} is outside the exact discovery exceptions`, async (t) => {
    const upstream = new Response("Existing behavior", { headers: { "cache-control": "max-age=3600" } });
    t.mock.method(globalThis, "fetch", async (_, options) => {
      assert.equal(options, undefined);
      return upstream;
    });
    assert.equal(await worker.fetch(new Request(origin + path)), upstream);
  });
}
