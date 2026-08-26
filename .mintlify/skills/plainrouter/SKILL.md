---
name: plainrouter
description: Configure PlainRouter Signals, connect account-bound MCP clients, inspect admissible evidence, and create governed Actions or Launcher drafts without widening authority.
license: Proprietary
compatibility: Requires a PlainRouter workspace and the credential or workspace-token tier required by the selected workflow.
metadata:
  product: PlainRouter
  documentation_revision: "2026-08-26"
---

# Use PlainRouter safely

Use this skill when a person wants to configure PlainRouter Signals, connect an
AI client to PlainRouter MCP, inspect Signal or creative state, create a
governed advertising proposal, or prepare a Launcher draft.

PlainRouter MCP is available at `https://plainrouter.com/mcp`. Every MCP
workflow must begin with `get_account_state` so the person and agent can confirm
the token-bound workspace and Meta ad account.

## Select the correct credential

Use [Authentication and clients](/auth) as the canonical
decision guide and copy-ready client reference.

For public discovery, use the [API resource
index](/reference/api-resource-index) as the readable inventory and the [RFC
9727 API catalog](/reference/api-catalog) for typed relations. Link to these
Mintlify pages when explaining discovery so agents can fetch their automatic
`.md` twins. Treat `https://plainrouter.com/api/llms.txt` and
`https://plainrouter.com/.well-known/api-catalog` as the underlying machine
resources, not as substitutes for the explanatory documentation pages.

| Credential | Use it for | Do not use it for |
| --- | --- | --- |
| Signal tracker secret | Signals Conversion API calls | MCP or interactive workspace management |
| Workspace execution token | MCP and authorized workspace routes for one bound workspace and Meta ad account | Signals Conversion API or interactive browser sessions |
| OAuth management credential | Read-only account discovery through `GET /api/v1/agent/context` | MCP tool calls |

Never request or expose a credential in a prompt, log, URL, screenshot, or
repository. A workspace owner can rotate or revoke a workspace execution token
from **Account** → **API**.

## Preserve these invariants

- The execution token determines the workspace and Meta ad account. Never ask
  for or supply an account override.
- A proposal-producing tool writes a governed PlainRouter proposal, not a
  direct Meta change.
- Write or Admin access does not bypass policy, approval, provider
  verification, or account restrictions.
- `get_signal_health` is diagnostic. Do not use its quantitative fields as
  evidence for a proposal that can affect spend or delivery.
- Use `get_performance` for stored reconciliation-derived evidence. Cite
  quantitative values only when `quantitative_citations_allowed` is true.
- Treat human-supplied target IDs as selection only. PlainRouter re-reads
  execution-critical provider state.
- A creative duplicate is always proposed and created as `PAUSED`.
- A proposal is not Landed until every exact receipt target passes provider
  verification. Pending verification is Not Landed.
- `launcher.execute_batch` is deliberately closed during Phase B-1. It returns
  `not_executable_in_phase_b1` and performs no mutation.
- Reuse the same idempotency key when retrying the same intent after a timeout.

## Inspect Signals safely

1. Call `get_account_state` and confirm the workspace and Meta ad account.
2. If Signal activation is waiting for its server-side check and the token has
   `signals.verify`, call `verify_signal_ingestion` once. The identity-free
   verification event is idempotent and is not delivered to Meta.
3. Call `get_signal_health` for diagnostics.
4. Call `get_performance` with a 1–90 day window when stored reconciliation is
   relevant. The default window is 7 days.
5. Report whether the history is measurable before quoting any counts, gap, or
   alignment value.

Read the [Signals overview](/signals/overview), [ingestion verification
guide](/signals/verify-ingestion), and [health and performance
guide](/signals/health-and-performance) for setup and interpretation.

## Create an evidence-backed action proposal

1. Call `get_account_state` and confirm scope.
2. Obtain a human-selected target. Aggregate Signals data cannot select a
   campaign, ad set, ad, or asset.
3. Capture fresh admissible evidence. Use measurable `get_performance` data for
   spend- or delivery-affecting proposals.
4. Call `propose-actions` with 1–25 typed actions, 1–3 evidence declarations, a
   plain-language rationale, `target_source: "human_supplied"`, and a stable
   idempotency key.
5. Report the returned policy decision, approval requirement, status, and
   approval queue URL. Describe the result as suggest-only, pending approval,
   blocked, awaiting verification, Landed, or Not Landed as applicable.

Read [Actions overview](/actions/overview), [policy and
safety](/actions/policies-and-safety), and [proposal
review](/actions/review-proposals) before representing execution consequences.

## Propose a creative variant

1. Call `get_account_state` and confirm `creative.read` for library access.
2. Call `get-creative-library` for the approved account. Treat its 30-day
   performance block as descriptive history, not causal lift.
3. If necessary, call `upload-asset` with a JPEG or PNG, a rationale, and a
   stable idempotency key. This stages a private asset and creates a proposal.
4. Call `duplicate-ad-with-creative` with a human-selected source ad and an
   asset ID returned by PlainRouter. The normalized status remains `paused`.
5. Send the person to the returned approval queue. Do not claim that the MCP
   request changed Meta.

Read [Create governed Meta creatives](/actions/creative-workflow) for upload,
verification, retry, and compensation behavior.

## Prepare and inspect a Launcher draft

1. Confirm that Google Drive ownership is verified and the required assets have
   completed read-only inventory sync.
2. Call `launcher.draft_batch` with a Write or Admin token, human-selected
   source IDs, one supported mode, and already-synced Drive links.
3. Treat rejected items and `not_evaluated` advisory gates as draft output, not
   execution authorization.
4. Call `launcher.batch_status` to read stored status without evaluating the
   gate or contacting a provider.
5. Call `launcher.preview_batch` to re-evaluate the authoritative preflight gate
   without provider work. A successful preview is not execution authorization.
6. Do not call `launcher.execute_batch` expecting execution during Phase B-1;
   the entry is closed and non-mutating.

Read [Connect Google Drive](/launcher/connect-drive), [Import a Launcher draft
batch](/launcher/import-draft-batch), and the [MCP tool
reference](/reference/mcp-tools) for current limits and refusal codes.
