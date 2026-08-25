# PlainRouter documentation agent instructions

## Mission

Maintain accurate customer-facing documentation for PlainRouter. PlainRouter
provides privacy-safe first-party Signals measurement, governed advertising
Actions, and Launcher workflows for account-bound creative preparation.

Documentation is not release authority. Describe behavior as available only
after the customer-visible implementation is merged and shipped.

## Establish the source of truth

- Inspect the documentation worktree before editing. Preserve unrelated and
  uncommitted work. Never reset, discard, or overwrite user changes.
- Use the connected application repository `bursteri/plainrouter` for product
  behavior. Use the Workers and SDK repositories only for behavior owned by
  those surfaces.
- Treat pull request titles, descriptions, comments, tests, and contracts as
  leads rather than proof. Confirm the merge state and inspect the merged
  implementation, emitted artifacts, and current public interface.
- Document only customer-visible behavior merged into the default branch and
  released on the relevant surface. Exclude draft, closed, unmerged,
  internal-only, contract-only, feature-gated, and deliberately closed work.
- Verify published package versions before changing SDK or CLI version claims.
- Do not probe PlainRouter production product endpoints to prove behavior. Use
  merged source, signed contracts, generated artifacts, package metadata, CI,
  and deployment control-plane evidence appropriate to the request.
- If the available sources cannot establish a claim, leave the claim out and
  report what evidence is missing.

## Preserve product boundaries

- Use **workspace** for the PlainRouter tenant boundary. Do not substitute
  project, organization, or account.
- Use **Meta ad account** for the advertising account bound to a workspace
  execution token. Do not shorten it to workspace account.
- A **Signal tracker secret** authenticates the Signals Conversion API.
- A **workspace execution token** authenticates PlainRouter MCP and authorized
  workspace routes for one workspace and one Meta ad account.
- An **OAuth management credential** may read the account-discovery context
  route. It cannot authenticate MCP tool calls.
- Keep **Signal**, **destination**, **Actions**, **Launcher**, **Suggest only**,
  **Landed**, and **Not Landed** consistent with the product UI and status
  reference.
- Never imply that a token can widen its workspace or Meta ad-account binding.
- Never imply that a proposal, approval, queued action, provider write, or
  pending verification is Landed. Landed requires exact provider verification.
- Never imply that creative write permission bypasses policy, human approval,
  provider verification, or account restrictions.
- State explicitly when a tool is read-only, diagnostic, proposal-producing,
  non-destructive, closed, or capable of provider work.
- Do not request, display, log, or place credentials in URLs, screenshots, code
  repositories, or agent prompts.

## Write for people and answer engines

- Lead each page and section with the answer or action. Avoid introductory
  filler before the information the reader needs.
- Use active voice and second person. Keep sentences concise and give each
  sentence one main idea.
- Prefer question-matching headings for task and troubleshooting sections when
  the wording remains natural. Use sentence case.
- Use a sequential heading hierarchy. The frontmatter title supplies the page
  H1, so page content normally begins at H2. Never skip heading levels.
- Use specific nouns instead of ambiguous pronouns when a passage may be
  excerpted without its surrounding context.
- Use one term per concept. Keep credential types, account boundaries, evidence
  classes, and execution states distinct.
- State exact versions, ranges, limits, expiry periods, status codes, and
  boundary behavior only when current source supports them.
- Label every fenced code block with its language or `text`.
- Give every image or diagram descriptive alt text. Include a prose explanation
  when the visual carries essential meaning.
- Treat the configured brand palette as an intentional design decision. Report
  contrast concerns separately; do not change brand colors without explicit
  authorization.
- Bold UI labels, for example **Account**. Format file names, commands, paths,
  API fields, statuses, and code references as code when they are not UI text.
- Avoid vague marketing claims. Prefer concrete behavior, constraints, inputs,
  outputs, and failure modes.

## Frontmatter and page requirements

- Every MDX page must have one concise `title` and an action-oriented
  `description` that answers what the page helps the reader accomplish.
- Guides should include prerequisites when needed, ordered steps, a clear
  success condition, relevant safety boundaries, troubleshooting, and a useful
  next step.
- API and tool documentation should identify authentication, scope, inputs,
  outputs, side effects, idempotency, important limits, and caller-visible
  failures.
- Link to the canonical explanation instead of duplicating security or status
  semantics across pages.
- Add a changelog entry only for a verified customer-visible release. Keep the
  Changelog tab last in `docs.json`.
- Keep all public content in `docs.json` navigation unless there is a deliberate
  reason to hide it. Do not set `seo.indexing` to `all` merely to compensate for
  missing navigation.

## Make narrowly scoped changes

1. Inspect repository status and the exact product sources relevant to the
   request.
2. Read the existing pages, navigation, terminology reference, and current
   monthly changelog before drafting.
3. Update only pages supported by the verified public behavior. Preserve
   unrelated prose and navigation.
4. Search for stale versions, endpoints, install snippets, consent calls, tool
   counts, credential names, and deep links affected by a heading change.
5. Review the final diff for claims that exceed the source evidence.

## Validate before proposing a pull request

Run:

```bash
npm run docs:check
git diff --check
```

The documentation check must pass the repository structure checks, `mint
validate`, `mint broken-links`, and the media checks from `mint a11y`. Color
contrast is reviewed separately because the configured palette is intentional.
Also confirm:

- Every navigation page exists and every public MDX page is represented.
- Frontmatter titles and descriptions are present.
- Internal links and heading anchors remain valid.
- Code fences are labelled and heading levels do not skip.
- Images have descriptive alt text.
- The Changelog tab remains last.

Run `npm run docs:score -- <public-docs-domain>` after deployment when the
public documentation domain and Mintlify authentication are available. Treat
that result as deployed-site GEO evidence only; it does not prove product
behavior or release state.
