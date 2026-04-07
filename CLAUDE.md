# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (core → worker + action)
pnpm dev                  # Start worker dev server (wrangler dev)
pnpm lint                 # Type-check all packages (tsc --noEmit)

# Per-package
pnpm --filter @image-mainichi/core build
pnpm --filter @image-mainichi/worker build    # wrangler deploy --dry-run
pnpm --filter @image-mainichi/action build

# Deploy worker to Cloudflare
cd packages/worker && pnpm deploy
```

Build order matters: `core` must build before `worker` and `action` (they depend on it via `workspace:*`).

## Architecture

This is a pnpm monorepo for a random image API service. Users create separate GitHub repos as "data sources" (using `template/`), where `manifest.json` and `images/` are public outputs, while crawl rules live separately under `rules/`.

### Packages

- **`packages/core`** — Isomorphic library (works in Workers and Node.js). Exports types, public manifest parser (`parseManifest`), rule parser (`parseRule`), and rule engine (`executeRule`). The rule engine uses a `Fetcher` injection pattern so it doesn't depend on any specific runtime's `fetch`.

- **`packages/worker`** — Cloudflare Workers API. Routes: `GET /` (302 redirect to random image), `GET /json` (image metadata), `GET /health`. Configured via `SOURCES` env var (JSON array of `SourceConfig`). Loads public manifests from GitHub raw URLs and serves static images from them.

- **`packages/action`** — GitHub Action that runs in data source repos. Reads public `manifest.json`, loads crawl rules from `rules/*.json`, downloads images to `images/`, updates the public manifest, with FIFO eviction.

- **`template/`** — Scaffold for data source repos. Contains public manifest, private rules examples, and a GitHub Actions workflow.

### Rule Engine

Supported rule types in `packages/core/src/rules/`:
- `json-api` — Fetches JSON API, extracts image URLs via simple JSONPath (`$.data[*].url`)
- `css-selector` — Fetches HTML, extracts via CSS selector + attribute (uses `node-html-parser`)
- `rss` — Parses RSS/Atom feeds via regex (no XML parser dependency)
- `manhuagui` — Fetches comic pages from 看漫画 and expands them into image page URLs

Each rule has a `mode`. Current default flow only consumes `crawl` rules from `rules/*.json`; `on-demand` is reserved for future extension.

### Public outputs vs private rules

- **Public**: `manifest.json`, `images/`
- **Private**: `rules/*.json`
- **Crawl**: GitHub Actions reads private rules and writes public results
- **Worker**: consumes only public manifest/images in the current implementation

## Key Types

All types are in `packages/core/src/types.ts`: `Manifest`, `ImageEntry`, `Rule` (discriminated union: `JsonApiRule | CssSelectorRule | RssRule`), `SourceConfig`, `Fetcher`.

## Language

Project language is Chinese (README, comments). Code identifiers and git messages are in English.
