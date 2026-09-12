# Published documentation checks

`npm run docs:live` makes read-only public requests to Plainrouter documentation.
It does not deploy anything, call product APIs, authenticate an agent, or contact
search platforms. Python 3.9+ and curl are required. This directory is excluded
from Mintlify publication by `.mintignore`.

## Run and interpret

```sh
npm run docs:live
npm run docs:live -- --attempts 6 --retry-delay 30 --report /tmp/docs-live.json
# After deploying the separate docs proxy discovery fix:
npm run docs:live -- --fail-on-warnings --report /tmp/docs-live-strict.json
npm run docs:live:test
```

The default is one attempt, three concurrent requests, a 25-second timeout per
request and a 10 MB response limit. Retries fetch only failed resources, so the
report contains per-resource observation times. It records status, content type,
cache evidence, failures and warnings without saving response bodies.

The `Docs live` GitHub workflow runs after a successful **main push** run of
`Docs quality`, or manually on main. PR quality checks include only offline
fixture tests; a PR cannot be expected to exist on the live site. The live job
uses the validated source SHA, skips a superseded main revision, grants only
repository read permission, and retries six times with a 30-second delay. The
request step has a 16-minute bound and the job a 20-minute bound. New runs cancel
older live jobs. The Actions summary and 14-day JSON artifact retain evidence.
There is no timed monitoring schedule.

## Coverage

- Every authored navigation page: HTML 200, one H1, one self-canonical, nonempty
  metadata, current source title/description, no indexing prohibition in HTML
  robots metadata or `X-Robots-Tag`, and all six expected discovery `Link` values.
- Every generated API page found in the sitemap: the same HTML checks except
  source metadata comparison. The generated page count must match API operations
  in navigation. Operation descriptors such as `POST /events` are never fetched.
- Every page's Markdown twin, plus `/docs.md`: 200, Markdown content type and a
  heading; authored titles must match source. Markdown `noindex` is expected.
- Sitemap: all authored canonicals, unique URLs, expected generated API count,
  and no unexpected URL outside the documentation API namespace. This checks
  the count, not a one-to-one operation-to-generated-slug mapping.
- Every configured redirect: permanent status and exact destination including
  fragments, with the narrowly enumerated legacy exceptions below. Redirects
  are not followed; external marketing targets are not crawled by this tool.
- API catalog alias GET and HEAD, and the root catalog JSON linkset separately.
- `robots.txt`: docs sitemap advertisement and authored-page access for Google,
  Bing, OpenAI search, ChatGPT user fetches and Perplexity search.
- Docs `llms.txt`, `llms-full.txt`, MCP card, agent card, skill index and skill
  Markdown. Docs discovery must retain its docs scope. MCP itself is not called.

## Known upstream warnings

Two live behaviors observed on 2026-09-12 remain visible warnings rather than
making every run fail:

1. Nine retired Markdown aliases return **307 to the corresponding HTML page**,
   despite their permanent Markdown redirect configuration. The exact aliases
   are enumerated in `LEGACY_MARKDOWN_ALIASES`; arbitrary targets, other statuses
   and new temporary redirects still fail. A configured permanent Markdown
   redirect passes normally if Mintlify later honors it. Fixing this behavior
   requires Mintlify support or a separately authorized docs proxy Worker change.
2. `llms-full.txt` currently sends `Cache-Control: public, max-age=86400` and can
   retain older titles while individual HTML/Markdown pages are current. Missing
   authored source entries fail; stale titles warn and retain cache headers in
   the report. Inspect aggregate content before claiming it reflects a new
  publication. Cache invalidation is a separate hosting dependency.

The proxy source now contains fixes for both behaviors; they require a separate
Worker deployment. `--fail-on-warnings` makes these unresolved behaviors fail
the command so deployment verification cannot pass with the old warnings.
The main-only workflow keeps its current warning policy until the Worker fix
has been deployed and verified.

A successful job means its blocking public-response contracts passed. Warnings
are unresolved evidence, not proof of freshness. These checks do not establish
the exact deployed commit, all body content, redirect anchor validity, visual
layout, indexing, rankings, AI citations or product behavior. Keep local docs
validation and rendered reviews for content changes.

References: [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[Mintlify Markdown](https://www.mintlify.com/docs/ai/markdown).
