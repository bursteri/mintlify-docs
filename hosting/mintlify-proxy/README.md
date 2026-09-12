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
