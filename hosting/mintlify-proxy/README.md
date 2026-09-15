# Mintlify docs proxy

This is infrastructure source for the separate Cloudflare Worker
`mintlify-plainrouter`. The directory is excluded from Mintlify publication by
`.mintignore`. Pushing this repository validates the source; it does **not**
deploy this Worker. Do not use the Signals collector deployment workflow.

## Source and routing

`worker.mjs` was recovered from the deployed Worker on 2026-09-12. Its baseline
is version `1d4006f5-d7db-4f0c-a0c1-3ebfd26c190a`, deployed on 2026-08-27.
The recovered JavaScript module SHA-256 is recorded in the private research
report in `plainrouter-content/seo/research/2026-09-12-docs-catalog-proxy/`.

The deployed route mappings are:

- `plainrouter.com/docs*`
- `plainrouter.com/_mintlify/*`
- `plainrouter.com/mintlify-assets/*`

The baseline proxies docs to `plainrouter.mintlify.site`, preserves the `/docs`
prefix, and maps `/docs.md` to `/docs/index.md`. Other application requests pass
through. The production compatibility date is `2026-08-09` with no compatibility
flags. This fix does not require changes to routes, bindings or runtime settings.

## Catalog fix

GET and HEAD requests to exactly `/docs/.well-known/api-catalog` return **308**
with `Location: https://plainrouter.com/.well-known/api-catalog`, without an
upstream request. Query parameters are discarded in favor of the fixed canonical
URL. Other methods and paths retain the deployed behavior.

This resolves the URL advertised by the docs response's `Link` header. Hosted
Mintlify returns 404 from its reserved API-catalog handler even with the existing
`docs.json` redirect. Laravel already serves the working root catalog; do not
duplicate that catalog in Mintlify or route the root namespace into this Worker.

## Aggregate freshness and retired Markdown aliases

This change was based on deployed version
`c3071038-0fec-454a-af2c-11323c529001`. It has two bounded behaviors:

- GET/HEAD on nine retired `.md` paths return 308 to the exact Markdown
  destinations and fragments already configured in `docs.json`. Mintlify's
  reserved Markdown handler currently sends 307 to the corresponding HTML
  pages. Tests compare every authored Markdown redirect with the Worker output.
- GET/HEAD on `/docs/llms-full.txt` and its documented
  `/docs/.well-known/llms-full.txt` alias fetch directly from the verified
  `plainrouter.subdirectory-docs.mintlify.me` origin with `cache: "no-store"`
  and return `no-store` browser/CDN cache headers. The body streams unchanged.
  Other docs, assets and methods retain their existing caching and routing.

The public aggregate was stale while a query-varied request and Mintlify's
public origin returned identical current content. A normal `Cache-Control:
no-cache` client request still hit the stale public object. An inactive Worker
preview also proved that `no-store` against the legacy `.mintlify.site` proxy
alone was insufficient: that extra proxy still returned an old cache object.
The fix uses the current origin directly for the two aggregate URLs and
prevents storage downstream; it cannot refresh
already-cached browser objects before they make another request or guarantee
that Mintlify's own generator is always current. No custom aggregate is stored
in this repository and no per-request page fan-out is introduced.

This source update is **not deployed by a Mintlify main push**. After an
authorized Worker deployment, use `npm run docs:live -- --fail-on-warnings`
to require the old discovery warnings to disappear. Check GET and HEAD on both
aggregate routes for `no-store`, verify all nine redirects return 308 to their
configured `.md` destinations, and then enable strict checks in the live
workflow. Retain the current Worker routes, bindings and runtime settings.

Deployed on 2026-09-12 as version `37be626d-0858-4d60-9176-fd7a66f77823`
at 100% traffic, from source commit `41c71bd`. The inactive preview and production
both passed 22 targeted GET/HEAD checks; production passed all 142 strict live
checks with zero warnings. Deployed source matched the tested bundle and all
settings/routes were preserved. The live GitHub workflow now fails on warnings.

## Validation and release

Run `npm run docs:check`; `docs:proxy` exercises the redirect and existing
forwarding behavior with mocked fetches. These local tests do not establish
production routing or indexing.

Deployment requires separate authorization. Before an authorized deployment,
re-read the currently deployed source and compare it with the recorded baseline.
If it changed, reconcile that delta before replacing the Worker module. Retain
the existing Worker settings and routes and apply only this source change.

After an authorized deployment, verify GET and HEAD on the alias return 308 to
the exact root URL, and following the redirect ends at a 200
`application/linkset+json` response. Check `/docs/quickstart`, its Markdown twin,
`/docs.md`, `/docs/llms.txt`, `/docs/sitemap.xml` and the other advertised discovery
documents. Confirm docs canonical URLs and asset/navigation rendering remain
correct. Do not infer indexing or AI citations from those responses.

References: [Mintlify Cloudflare proxy setup](https://www.mintlify.com/docs/deploy/cloudflare),
[Cloudflare Response API](https://developers.cloudflare.com/workers/runtime-apis/response/).

Discovery references: [Cloudflare fetch cache modes](https://developers.cloudflare.com/workers/runtime-apis/fetch/),
[Mintlify aggregate files and aliases](https://www.mintlify.com/docs/ai/llmstxt).

## September 15 tab URL migration: pending Worker deployment

The Mintlify navigation now uses `/docs/mcp/`, `/docs/api/`, and `/docs/sdk/`.
The source map in `worker.mjs` includes all 38 authored Markdown redirects:
the previous nine, 28 moved pages, and the historical authentication alias.
The TypeScript recipe alias now points directly to the SDK recipe, avoiding
an intermediate retired Node.js page. HTML redirects are configured in
`docs.json`; this map preserves Markdown-to-Markdown 308 behavior where
Mintlify's reserved handler otherwise returns a temporary HTML redirect.

This map update is prepared and locally tested, but pushing Mintlify main
**does not deploy it**. The exact dependency is a source-only update to the
separate `mintlify-plainrouter` Worker. Before deployment, retrieve its current
module and reconcile any changes since the recorded baseline. Retain routes,
bindings, settings, and the existing catalog and aggregate behavior. Validate
GET and HEAD for every `.md` rule against `docs.json`, then run the strict live
checks. Until deployed, report legacy Markdown redirect failures separately
from working new pages and HTML redirects; do not suppress them in CI.
