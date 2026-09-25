# The Drop

Full-stack rave/EDM event discovery platform. Aggregates events from multiple sources (Ticketmaster, community submissions) and deduplicates them into a single canonical listing per real-world event.

Built from scratch as a portfolio project -- no starter templates, no scaffolding tools.

## What makes this interesting

The event-deduplication engine (`apps/api/src/dedup/`) is the core technical problem. The same event appears across Ticketmaster and community submissions with different titles, venue name spellings, artist capitalization, and metadata. The dedup pipeline resolves these into a single canonical event through:

1. **Text normalization** -- strips filler phrases ("live at", "presents"), leading articles, venue suffixes, and normalizes casing/whitespace independently for titles, venues, and artist names.
2. **Candidate finding** -- narrows the search space to events within +/-1 day and the same city before scoring anything.
3. **Weighted composite scoring** -- four signals combined: venue match (0.30 weight), date match (0.25), artist overlap via Jaccard similarity (0.25), title similarity via trigram matching (0.20). Venue is weighted highest because two events at the same venue on the same date are almost certainly the same event.
4. **Three-band decision routing** -- AUTO_MERGE (>= 0.85), REVIEW (0.55-0.84), NO_MATCH (< 0.55). Ships in **REVIEW_ONLY mode** (`DEDUP_AUTO_MERGE_ENABLED=false`) -- nothing auto-merges; everything scoring >= 0.55 goes to the admin review queue. Auto-merge stays disabled until false-merge rates are validated against real data.
5. **Same-venue-adjacent-date guard** -- even when auto-merge is enabled, events at the same venue on consecutive nights (e.g., DJ residency Friday + Saturday) are forced to REVIEW regardless of composite score.

An external-ID fast path handles re-syncs of known events in O(1), skipping scoring entirely. Field-level merge rules use source priority (Admin > Ticketmaster > Community) to resolve conflicts, with provenance tracking per field.

## Stack

| Layer | Tech | Why |
|-------|------|-----|
| Backend | Node.js, Express, TypeScript | Domain logic (dedup, provenance, multi-source ingestion) is the complexity here, not the framework. Express iterates fastest for a solo developer. |
| ORM | Drizzle | SQL-native TypeScript, no binary dependencies. Lets you drop to raw SQL for tsvector/pg_trgm queries without fighting the ORM. |
| Database | PostgreSQL 16 | Full-text search (tsvector + ts_rank), trigram similarity (pg_trgm), JSONB provenance columns, advisory locks for concurrent dedup. |
| Frontend | React, Vite, TypeScript | react-router-dom v6 (not v7), @tanstack/react-query v5, axios (interceptor model makes the 401-refresh-retry flow clean). CSS Modules + custom properties -- no Tailwind. |
| Auth | Custom JWT | httpOnly/Secure/SameSite=Strict refresh cookies, in-memory access tokens (never localStorage), CSRF tokens, bcrypt-12, token rotation with reuse detection. No Passport.js -- two OAuth strategies don't justify the abstraction. |
| Infra | AWS CDK | VPC, RDS, Elastic Beanstalk, S3+CloudFront, EventBridge + SQS. No Lambda -- a NAT Gateway ($32/mo) would be required for Lambda-in-VPC to reach the internet. Background jobs run on the EB instance via a long-polling SQS consumer (`apps/api/src/jobs/poller.ts`). |
| Monorepo | Turborepo + npm workspaces | Build caching and task ordering on top of native workspaces. |
| Module format | CommonJS | ESM broke drizzle-kit. Deliberate choice, not an oversight. |

## Project structure

```
the-drop/
  apps/
    api/          @the-drop/api    -- Express backend
    web/          @the-drop/web    -- React frontend
  packages/
    types/        @the-drop/types  -- shared types and enums
  infra/
    cdk/          @the-drop/infra  -- AWS CDK stack
  docker-compose.yml
  turbo.json
  package.json
```

`apps/web` never imports from `apps/api` or vice versa. Everything shared goes through `packages/types`.

## Local development

### Prerequisites

- Node.js >= 20
- npm (workspaces used; no yarn/pnpm)
- Docker (for PostgreSQL)

### Setup

```bash
# Install all workspace dependencies
npm install

# Start the database
# Note: host port 5433, not 5432 -- a native PostgreSQL install
# already occupies 5432 on the dev machine. Container-internal
# port is still 5432; the api service connects via db:5432 inside
# the Docker network, so this only matters for direct host access.
docker compose up -d db

# Run database migrations
npm run db:migrate -w apps/api

# Seed genres (58 genres)
npm run db:seed:genres -w apps/api
```

### Running

```bash
# Start everything (api + web) via Turborepo
npm run dev

# Or individually:
npm run dev -w apps/api     # API on port 3000
npm run dev -w apps/web     # Vite dev server
```

### Other commands

```bash
npm run build       # Build all packages
npm run lint        # Lint all packages
npm run typecheck   # Type-check all packages
npm test            # Run all test suites
```

## Tests

986 tests (919 backend, 67 frontend), all passing. Both suites use Vitest.

```
@the-drop/api   84 test files   919 tests
@the-drop/web   19 test files    67 tests
```

Nearly all tests run against **mocked dependencies** -- a fake Drizzle transaction object for the backend, axios-mock-adapter for the frontend. This is standard for unit/integration tests but does not prove the system works end-to-end against real infrastructure.

The dedup pipeline, schema migrations, auth flow, full-text search, autocomplete, admin merge, and audit logging have been separately verified against a real running PostgreSQL instance. Two real bugs (port collision with a native Postgres install, a JWT_SECRET placeholder failing config validation) were found only through that live verification -- mocked tests could not have caught either.


