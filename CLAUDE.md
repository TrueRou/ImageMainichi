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

This is a pnpm monorepo for a random image API service. Users create separate GitHub repos as "data sources" (using `template/`), each containing a `manifest.json` with image lists and crawling rules.

### Packages

- **`packages/core`** — Isomorphic library (works in Workers and Node.js). Exports types, manifest parser (`parseManifest`), and rule engine (`executeRule`). The rule engine uses a `Fetcher` injection pattern so it doesn't depend on any specific runtime's `fetch`.

- **`packages/worker`** — Cloudflare Workers API. Routes: `GET /` (302 redirect to random image), `GET /json` (image metadata), `GET /health`. Configured via `SOURCES` env var (JSON array of `SourceConfig`). Loads manifests from GitHub raw URLs, supports both static images and dynamic rule execution. Uses Cache API for manifests, optional KV for dynamic rule results.

- **`packages/action`** — GitHub Action that runs in data source repos. Reads `manifest.json`, executes `scheduled`/`both` mode rules, downloads images to `images/`, updates manifest, with FIFO eviction.

- **`template/`** — Scaffold for data source repos. Contains example manifest, rules, and a GitHub Actions workflow.

### Rule Engine

Three rule types in `packages/core/src/rules/`:
- `json-api` — Fetches JSON API, extracts image URLs via simple JSONPath (`$.data[*].url`)
- `css-selector` — Fetches HTML, extracts via CSS selector + attribute (uses `node-html-parser`)
- `rss` — Parses RSS/Atom feeds via regex (no XML parser dependency)

Each rule has a `mode`: `scheduled` (Actions only), `dynamic` (Worker only), or `both`.

### Static vs Dynamic

- **Static**: GitHub Actions cron runs rules → downloads images into the data source repo → Worker serves from the static `images` list in manifest
- **Dynamic**: Worker executes `dynamic`/`both` rules at request time, caches results in KV

## Key Types

All types are in `packages/core/src/types.ts`: `Manifest`, `ImageEntry`, `Rule` (discriminated union: `JsonApiRule | CssSelectorRule | RssRule`), `SourceConfig`, `Fetcher`.

## Language

Project language is Chinese (README, comments). Code identifiers and git messages are in English.
