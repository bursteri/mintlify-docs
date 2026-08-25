# PlainRouter documentation

This repository contains the customer-facing PlainRouter documentation built
with [Mintlify](https://www.mintlify.com/docs).

## Before editing

Read [`AGENTS.md`](./AGENTS.md), which points to the private Mintlify authoring
instructions. Documentation must describe verified, customer-visible behavior
that has shipped. A pull request title, draft contract, feature flag, or internal
implementation is not release evidence.

## Local development

Node.js 22 or later is recommended. The scripts use an exact Mintlify CLI
version so local and CI checks run against the same release.

```bash
npm run docs:dev
```

The preview is available at `http://localhost:3000` by default.

## AI-assisted editing

Install Mintlify's current authoring skill when you use a local AI coding tool:

```bash
npx skills add https://mintlify.com/docs
```

The Mintlify skill supplies platform and component guidance. The repository's
`.mintlify/AGENTS.md` supplies the PlainRouter-specific rules.

## Validate changes

```bash
npm run docs:check
```

The check validates repository structure, the Mintlify build, internal links,
and accessibility. Run `npm run docs:score -- <public-docs-domain>` after a
deployment when you have Mintlify access and the public documentation domain.
The readiness score is a deployed-site check, not a substitute for source or
release verification.

Mintlify deploys changes from the configured default branch through its GitHub
App. Keep changes in a pull request for review; do not publish unverified product
claims directly to `main`.
