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
  "/docs/llms.txt", "/docs/llms-full.txt", "/docs/sitemap.xml",
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

for (const path of [alias, "/_mintlify/api/example"]) {
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
