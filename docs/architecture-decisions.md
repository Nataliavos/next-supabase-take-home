# Architecture Decision Records

This document captures the major engineering decisions taken during the implementation of the Medallo take-home project. Its objective is to make trade-offs explicit: what was chosen, what was rejected, and why those choices remain defensible as the system evolves.

The project was designed for **correctness**, **maintainability**, and **future scalability**. The challenge dataset contains 10,000 records, but every decision below was evaluated against growth scenarios—hundreds of thousands to millions of rows—where poor early choices would become expensive to unwind.

Implementation details (schema DDL, column types, index definitions, ingestion function signatures) live in [`database-design.md`](./database-design.md). This document focuses on **reasoning and consequences**, not repetition of that reference material.

---

# ADR-001 — Hybrid Schema Instead of Full Normalization

## Context

The source dataset is a flat survey export: one row per person with a fixed set of categorical and numeric attributes. There are no many-to-many relationships, no shared dimension tables across multiple fact tables, and no requirement to manage taxonomy metadata (ISO codes, localized labels, admin CRUD) at this stage.

The categorical domains are small and stable:

| Domain | Cardinality in source |
| --- | --- |
| Gender | 3 values (including `other`, required for 226 CSV rows) |
| Sleep quality | 4 values |
| Stress level | 3 values |
| Health issue severity | 4 values |
| Occupation | 5 values |
| Country | 20 fixed values |

The workload is **analytical and read-heavy**: ad hoc filtering over a single dataset, not transactional writes with referential integrity across many entities.

## Alternatives considered

**Fully normalized lookup tables.** Create `countries`, `genders`, `occupations`, etc., with foreign keys from a slim fact table. This is the standard pattern when dimensions are shared, enriched over time, or admin-managed.

**Single flat table with unconstrained TEXT.** Store all categoricals as free-text columns. Minimal schema complexity, but no database-level vocabulary enforcement and high risk of inconsistent values (`Germany` vs `germany`).

**Hybrid schema.** Use PostgreSQL ENUM types for small, fixed categorical domains; store country as canonical lowercase TEXT with a CHECK constraint; keep all attributes on a single fact table `coffee_health_records`.

## Decision

Adopt the **hybrid schema**:

- **Single fact table** (`coffee_health_records`) mapping 1:1 to the normalized CSV row shape.
- **PostgreSQL ENUMs** for gender, sleep quality, stress level, health issue severity, and occupation — all with lowercase canonical labels.
- **Lowercase TEXT + btree index + CHECK** for country, validated against an allow-list in the ingestion layer rather than an ENUM type.
- **BOOLEAN** columns for smoking and alcohol consumption (converted from CSV `0`/`1` at ingest).
- **No lookup tables** and no JOINs required for filter queries.

Country deliberately remains TEXT rather than ENUM: adding a new country value does not require `ALTER TYPE`, while the lowercase CHECK and ingestion allow-list still enforce canonical shape. ENUMs are reserved for domains where the vocabulary is truly fixed and small.

## Consequences

**Positive:**

- Filter queries are single-table scans with sargable equality predicates — no join overhead on every page load.
- ENUM cast failures and CHECK violations reject bad data at insert time.
- EXPLAIN plans stay simple; the query layer in `lib/coffee-health/queries.ts` maps directly to `WHERE column = $canonical`.
- Schema complexity remains proportional to the problem: one migration, one fact table, six ENUM types.

**Negative:**

- Adding a new ENUM value requires a migration (`ALTER TYPE ... ADD VALUE`).
- Country metadata (ISO 3166 codes, regions) is not modeled; a future `countries` reference table would be a deliberate schema evolution, not a casing workaround.
- The `other` gender value exists solely for CSV fidelity; product filters may choose to exclude it.

## Challenge justification

Full normalization would introduce five or more dimension tables, foreign key resolution during bulk load, and JOINs on every filtered read — without unlocking any capability the challenge requires. The dataset has 20 countries and five occupation categories that will not be admin-managed during this exercise.

The hybrid approach matches the **shape of the data** (flat export) and the **shape of the workload** (filter-heavy reads). Lookup tables become preferable when dimensions need metadata, shared reuse across fact tables, or runtime taxonomy management — none of which apply here. For a take-home evaluated on engineering judgment, optimizing for query simplicity over theoretical normalization purity is the correct trade.

---

# ADR-002 — Canonical Lowercase Storage

## Context

The source CSV delivers categorical values in presentation form (`Germany`, `Good`, `Low`, `Male`). Binary flags arrive as string integers (`0`, `1`). Filter predicates on country, gender, sleep quality, and stress level will execute on every page load once the UI is wired.

If casing is inconsistent in storage, filters become fragile: `WHERE country = 'Canada'` misses rows stored as `canada`, and case-insensitive workarounds degrade index utilization at scale.

## Alternatives considered

**Preserve original casing.** Store values exactly as they appear in the CSV. Zero transformation cost, but duplicates the same logical value under different strings and forces every consumer to agree on comparison semantics.

**Normalize at query time with `LOWER()`.** Keep mixed case in the database; wrap columns and parameters in `LOWER()` in SQL. Works functionally, but expressions like `WHERE LOWER(country) = LOWER($1)` typically prevent direct use of standard btree indexes unless additional functional indexes are created and maintained.

**Normalize during ingestion.** Transform all categorical text and country names to lowercase before persistence. Enforce the rule at the database layer via ENUM labels and `CHECK (country = lower(country))`. Apply title-case formatting only in the UI layer (`formatLabel()` in `components/coffee-health/`).

## Decision

Store **canonical lowercase** values during ingestion:

- `lib/ingestion/normalize.ts` trims whitespace and lowercases all categorical fields via `toCanonicalCategory()`.
- PostgreSQL ENUM labels are defined in lowercase in the migration.
- Country has an explicit lowercase CHECK constraint.
- Binary CSV flags are converted to native `BOOLEAN` (`true`/`false`) in `parseBinaryFlag()`, not stored as integers.
- The UI displays human-readable labels (`south korea` → `South Korea`) without mutating stored values.
- URL filter parsing in `lib/coffee-health/search-params.ts` re-applies the same lowercase canonicalization so query parameters always match stored bytes.

## Consequences

**Positive:**

- Filter predicates are simple equality checks: `WHERE country = 'germany'` — directly index-backed.
- One normalization pass at ingest eliminates per-query string transforms across billions of comparisons at scale.
- TypeScript constants in `lib/ingestion/constants.ts` mirror SQL ENUM definitions, giving a single vocabulary source shared by ingestion, URL parsing, and filter dropdowns.
- Presentation concerns (title case, future i18n) are isolated to React components; the database remains a stable system of record.

**Negative:**

- Engineers inspecting raw rows see lowercase labels, not presentation form — by design, but requires team awareness.
- Any alternate write path (manual SQL, future API) must respect the same canonical rules or CHECK/ENUM constraints will reject rows.

## Challenge justification

The challenge explicitly requires filtering. At 10,000 rows, `LOWER()` in SQL is imperceptible. At hundreds of thousands or millions of rows, it becomes a recurring CPU cost on every filtered query and a common source of index regressions.

Canonical storage is a **data engineering discipline** that costs little now and prevents a class of production bugs (silent filter misses, duplicate dimension members) that are expensive to diagnose later. The implementation proves the pattern end-to-end: ingest normalizes, the database enforces, the UI formats, and URL params re-canonicalize before hitting PostgreSQL.

---

# ADR-003 — Validation and Normalization Layer

## Context

The source CSV is external, untrusted input. Column names use PascalCase (`Gender`, `Coffee_Intake`); the database uses snake_case. Values require vocabulary validation, type coercion, and semantic transformation before they are schema-aligned. Database constraints alone cannot produce actionable, row-level error messages during bulk load, and embedding transformation logic in SQL seed files would be difficult to test and maintain.

Three loading mechanisms were available for the challenge: `supabase/seed.sql`, PostgreSQL `COPY`, and a dedicated application loader.

## Alternatives considered

**Direct insertion.** Parse CSV and insert rows with minimal transformation, relying on PostgreSQL to reject invalid data via ENUM casts and CHECK constraints. Fast to write, but bulk failures surface as opaque constraint violations without row numbers or field context.

**Validation only in PostgreSQL.** Define ENUMs, CHECKs, and NOT NULL constraints; skip application-layer validation. The database becomes the sole gatekeeper. Correct for integrity, insufficient for developer experience during iterative import runs.

**Dedicated ingestion layer.** Introduce `lib/ingestion/` as a shared module: constants, types, normalization functions, structured errors (`IngestionValidationError`), and unit tests. Wire it to a TypeScript import script (`scripts/import-coffee-health.ts`) rather than `seed.sql` or raw `COPY`.

## Decision

Implement a **dedicated ingestion layer** at `lib/ingestion/`:

- **`constants.ts`** — canonical vocabularies aligned with PostgreSQL ENUM definitions.
- **`normalize.ts`** — row-level pipeline: validate required fields → trim → lowercase categoricals → parse numerics → convert binary flags.
- **`errors.ts`** — `IngestionValidationError` with row number, field name, and raw value for actionable diagnostics.
- **`normalize.test.ts`** — unit tests for trimming, casing, flag conversion, and rejection of invalid vocabulary.
- **`scripts/import-coffee-health.ts`** — orchestrates CSV read → batch normalization → batched Supabase upsert.

`COPY` was rejected because the CSV is not schema-aligned: transformations (casing, boolean conversion, column naming) must precede load. Using `COPY` would require an equivalent preprocessing step elsewhere — effectively rebuilding this layer in another form. `seed.sql` was retained for the starter `notes` table only; embedding 10,000 transformed rows in SQL would duplicate normalization logic and resist unit testing.

The import script uses batched HTTP upserts (500 rows per batch) through the Supabase client — appropriate for 10k rows and local development, with a documented upgrade path to staging + `COPY` for million-row loads (see ADR-007).

### Ingestion pipeline

End-to-end write path from external file to persisted rows. Invalid data exits the pipeline before any database write.

```
synthetic_coffee_health_10000.csv
                │
                ▼
           CSV Parser                 scripts/import-coffee-health.ts
                │                     parseCsvLine · rawRowFromValues
                ▼
           Validation                 required fields · vocabulary · types
                │
         ┌──────┴──────┐
         ▼             ▼
    Valid Row      Invalid Row
         │             │
         ▼             ▼
   Normalization   IngestionValidationError
   (normalize.ts)  (row number · field · raw value)
         │             │
         ▼             ▼
   Canonical         Import Aborted
   Transformation    (exit code 1 · no DB write)
   trim · lowercase
   booleans · numerics
         │
         ▼
   CoffeeHealthRecord
   (typed · schema-aligned)
         │
         ▼
      Batch Upsert
      (500 rows/batch)
         │
         ▼
      PostgreSQL
   coffee_health_records
```

## Consequences

**Positive:**

- Invalid rows are rejected **before any database write**, with row-level context (`[row 42] Gender: value is not in the allowed vocabulary`).
- Normalization rules are **testable in isolation** without a running database.
- The same module serves the import script, future APIs, batch reprocessing, and URL filter canonicalization (via shared constants).
- Business rules (what is valid, what is canonical) are decoupled from transport (how rows reach Postgres).

**Negative:**

- More code than a one-shot SQL script or naive `COPY`.
- The loader holds the entire CSV in memory and issues HTTP round-trips — acceptable at 10k rows, not at multi-million scale without evolution.

## Challenge justification

The CSV-to-schema gap is the core data engineering problem of this exercise. A thin loader that defers validation to PostgreSQL would pass the happy path but fail the review criteria around **correctness**, **maintainability**, and **operational clarity**. The ingestion layer makes invalid data visible, makes rules explicit and testable, and creates a reusable boundary between external input and the canonical fact table — exactly what a production pipeline would require before trusting analytics downstream.

---

# ADR-004 — UPSERT-Based Idempotent Loading

## Context

The import script (`pnpm import:coffee`) will be executed repeatedly during local development: after schema changes, after normalization bug fixes, on fresh repository clones, and in CI verification. The CSV uses integer `ID` as a stable natural key across all 10,000 rows.

A loader that assumes an empty destination table creates friction on every second run.

## Alternatives considered

**INSERT only.** Simplest write path. Fails on the second execution with duplicate primary key violations unless the table is manually cleared.

**TRUNCATE + INSERT.** Destructively empty the table, then bulk insert all rows. Works for static, disposable datasets and is fast for full reloads. Requires a destructive precondition on every run; removes rows that may have been modified outside the import path; couples success to elevated privileges.

**UPSERT (`INSERT … ON CONFLICT`).** Reconcile the table to the normalized CSV on every run: insert missing rows, update existing rows matched on primary key `id`. Non-destructive and safe to re-execute.

## Decision

Use **UPSERT with `id` as the conflict target**:

```typescript
supabase.from("coffee_health_records").upsert(records, { onConflict: "id" })
```

The import script:

1. Normalizes the full CSV via `normalizeCoffeeHealthBatch()`.
2. Aborts with a non-zero exit code if any row fails validation (no partial corrupt loads).
3. Upserts in batches of 500 rows.
4. Verifies final row count matches the normalized record count via `SELECT count`.

### Idempotent load behavior

Every run reconciles the table to the CSV. The conflict target (`id`) determines whether PostgreSQL inserts or updates — the script logic is identical across runs.

```
              CSV (10,000 normalized rows)
                        │
                        ▼
              UPSERT (ON CONFLICT id)
              ┌─────────┴─────────┐
              ▼                   ▼
     Row does not exist      Row exists
              │                   │
              ▼                   ▼
           INSERT               UPDATE


  FIRST RUN (empty table)              SECOND RUN (same CSV)
  ───────────────────────              ────────────────────────
  CSV ──► UPSERT                       CSV ──► UPSERT
              │                                    │
              ▼                                    ▼
       10,000 × INSERT                      10,000 × UPDATE
              │                                    │
              ▼                                    ▼
       row count = 10,000                   row count = 10,000
       no duplicates                        same outcome · no TRUNCATE
```

## Consequences

**Positive:**

- First run on an empty table inserts all rows; subsequent runs update in place — **no duplicate-key errors**, no manual TRUNCATE.
- The CSV (after normalization) is always the source of truth; the database is reconciled to match it.
- The same code path supports a future incremental feed where only changed rows arrive between runs.
- Post-load count verification catches silent partial failures.

**Negative:**

- Marginally more write overhead than INSERT into an empty table (conflict detection per row). Negligible at 10k rows.
- UPSERT updates all columns on conflict; there is no column-level merge strategy (not required for this static dataset).

## Challenge justification

Idempotency is valuable even for a 10,000-row dataset because the **development loop** is where data pipelines fail in practice. A loader that requires manual cleanup between runs trains bad habits and breaks CI. UPSERT mirrors real-world reconciliation patterns (CDC merges, API syncs, staging-to-fact loads) without adding complexity disproportionate to the challenge scope.

TRUNCATE + INSERT would have worked for a one-time demo load but was rejected because it is destructive, non-idempotent without scripting cleanup, and a poor model for how ingestion behaves in production.

---

# ADR-005 — Server-Side Filtering and Pagination

## Context

The UI must support filtering by country, gender, sleep quality, stress level, and numeric ranges (age, BMI), with paginated results. The dataset may grow well beyond 10,000 rows; the architecture must not assume the browser can hold the full result set.

The read path is implemented as a Next.js Server Component (`app/page.tsx`) calling `fetchCoffeeHealthRecords()` in `lib/coffee-health/queries.ts`.

## Alternatives considered

**Client-side filtering.** Fetch all rows (or a large subset) into the browser; filter and paginate in React state. Simple for tiny datasets; breaks down on memory, initial load time, and PostgREST row limits.

**Client-side pagination with full dataset.** Same fundamental problem: the full dataset must reach the client before pagination is meaningful.

**Server-side filtering and pagination.** Build a Supabase query with conditional `.eq()`, `.gte()`, `.lte()` filters; apply `.order("id")` and `.range(from, to)` for offset pagination; request `count: "exact"` for total matching rows. Execute entirely in PostgreSQL via the Supabase server client.

## Decision

Execute **all filtering, counting, and pagination in PostgreSQL** through the Supabase server client:

- Filters map to indexed columns with canonical equality/range predicates.
- Default page size: 25 rows (`DEFAULT_PAGE_SIZE` in `search-params.ts`).
- Offset pagination via `.range(from, to)` ordered by `id` ascending.
- Exact total count returned alongside the page for UI range display ("Showing 1–25 of 4,832 matching records").
- Only the current page (plus metadata) crosses the network boundary to the React tree.

Single-column btree indexes exist on every filtered column in the migration. Composite indexes are documented but commented out, pending evidence from query plans.

### Read path architecture

The browser never receives the full dataset. Filtering, counting, and pagination execute in PostgreSQL; the client renders one page.

```
Browser
   │
   │  GET /?country=germany&gender=female&page=1
   ▼
URL Search Params
   │
   ▼
app/page.tsx                         Next.js Server Component
   │
   ▼
parseSearchParams()                  lib/coffee-health/search-params.ts
   │
   ▼
fetchCoffeeHealthRecords()           lib/coffee-health/queries.ts
   │
   ▼
Supabase Server Client
   │
   ▼
PostgreSQL  ◄── Filtering    WHERE eq · gte · lte on indexed columns
   │          ◄── Counting     COUNT(*) with same predicates
   │          ◄── Pagination   ORDER BY id · LIMIT/OFFSET via .range()
   ▼
25 rows + totalCount
   │
   ▼
Browser  ◄── Rendering only   RecordsTable · RecordsPagination


  ┌──────────────────────────┬──────────────────────────────────────┐
  │  Browser                 │  PostgreSQL                          │
  ├──────────────────────────┼──────────────────────────────────────┤
  │  · Render current page   │  · Filter matching rows              │
  │  · Display total count   │  · Count matching rows               │
  │  · Submit GET forms      │  · Paginate result set               │
  └──────────────────────────┴──────────────────────────────────────┘
        NOT here ──►                     ◄── happens here
     (no full-table fetch)
```

## Consequences

**Positive:**

- Network transfer scales with page size (25 rows), not dataset size.
- PostgreSQL uses btree indexes on filter columns; the planner can choose index scans for selective predicates.
- PostgREST `max_rows` configuration cannot silently truncate a "full dataset" fetch because no such fetch exists.
- Server Components receive only the data needed to render the current view.

**Negative:**

- Offset pagination degrades for very deep pages (`OFFSET 500000`) — acceptable for early pages and demos; keyset pagination is the documented upgrade (ADR-007).
- Each page load executes a filtered `COUNT(*)` alongside the data query — correct for UI accuracy, potentially optimizable later with approximate counts or cached totals if needed.

## Challenge justification

At 10,000 rows, client-side filtering would appear to work — which is precisely why it is a trap. The challenge evaluates whether the candidate designs for growth. Server-side filtering ensures that adding two zeros to the row count changes latency modestly (with proper indexes) rather than catastrophically (downloading millions of rows to the browser).

The implementation uses the same canonical filter values produced by the ingestion layer, so predicates remain sargable and index-backed without case-insulation workarounds.

---

# ADR-006 — URL-Driven Filter State

## Context

Users need to apply filters, navigate pages, share a specific view with a colleague, and bookmark results. The filter state must survive page refresh and align with Next.js App Router server rendering, where `searchParams` are available to Server Components on each request.

## Alternatives considered

**React local state only.** Filters live in `useState`; pagination is client-managed. Fast interactions, but state is lost on refresh, not shareable, and disconnected from server-side data fetching unless duplicated logic syncs state to fetch calls.

**URL search parameters.** Filters and page number encoded in the query string; Server Component reads `searchParams`, parses into canonical filter state, fetches data, renders result. Forms submit via GET.

**Persistent client storage (localStorage / sessionStorage).** Survives refresh within one browser, but URLs are not shareable and server rendering cannot access client storage on first paint.

## Decision

Treat **URL search parameters as the source of truth** for filter and pagination state:

- `app/page.tsx` awaits `searchParams` and passes them to `parseSearchParams()`.
- `parseSearchParams()` in `lib/coffee-health/search-params.ts` validates and canonicalizes each parameter against the same vocabulary sets used at ingestion. Invalid values are silently ignored (fail-safe, not fail-closed).
- `RecordsFilters` renders a **GET form** (`method="GET"`) — filters submit to the URL without JavaScript.
- `RecordsPagination` builds prev/next links via `buildPageHref()`, preserving active filters across page changes.
- "Clear Filters" navigates to the base path, resetting all parameters.

### Filter state flow

The URL encodes all filter and pagination state. Any navigation that preserves or reconstructs the URL reproduces identical application behavior.

```
User Selects Filters
        │
        ▼
  GET Form Submit                    RecordsFilters (method="GET")
        │
        ▼
   URL Updated                       /?country=germany&age_min=30&page=1
        │
        ▼
 Server Component                   app/page.tsx
        │
        ▼
 parseSearchParams()               canonical filter state
        │
        ▼
  Database Query                    fetchCoffeeHealthRecords()
        │
        ▼
 Rendered Results                  RecordsTable · RecordsPagination


  Share URL ──────┐
  Bookmark URL ───┼──►  Same URL  ──►  Same application state
  Refresh Page ───┘     (no client storage · no server session)
```

## Consequences

**Positive:**

- URLs are **shareable and bookmarkable** — `/?country=germany&gender=female&age_min=30&page=2` fully describes application state.
- Server Components remain **stateless between requests**; no server-side session store for filter state.
- GET form submission provides **progressive enhancement** — filtering works without client-side JavaScript.
- Filter parsing reuses ingestion vocabulary constants, preventing drift between what the UI accepts and what the database stores.

**Negative:**

- Every filter change triggers a full server round-trip (appropriate for this data-fetching model; client-side debouncing would require a parallel client path).
- Invalid URL parameters are dropped silently rather than surfacing validation errors — acceptable for filter UX, but worth documenting.

## Challenge justification

URL-driven state is the natural fit for Next.js App Router server-side data fetching. The server already needs filter values to build the Supabase query; encoding them in the URL eliminates a synchronization layer between client state and server fetches. For a read-only analytics view, shareable URLs are a user-facing feature with zero infrastructure cost — unlike session storage or client caches.

This decision composes directly with ADR-005: because filtering happens in PostgreSQL, the URL is not merely cosmetic — it is the input contract to the query layer.

---

# ADR-007 — Designing for Scale Without Premature Optimization

## Context

The current dataset contains 10,000 records. Several techniques improve performance at large scale but add operational or code complexity disproportionate to today's volume:

- Table partitioning (RANGE on `id`, LIST on `country`)
- Composite btree indexes on common filter combinations
- Keyset (cursor) pagination instead of offset
- Bulk `COPY` into staging tables instead of HTTP batched upserts
- Read replicas, materialized views, warehouse offload

Implementing all of these upfront would optimize for assumptions rather than measured bottlenecks.

## Alternatives considered

**Introduce partitioning immediately.** Split `coffee_health_records` by range or list key. Reduces index size per partition at very large scale; adds DDL complexity, query routing considerations, and maintenance overhead unjustified at 10k rows.

**Introduce keyset pagination immediately.** Replace offset pagination with `WHERE id > $cursor ORDER BY id LIMIT $n`. Better deep-page performance; more complex URL state and edge cases (deletes, filter changes) for a demo UI.

**Implement only what is justified today.** Ship single-column indexes, offset pagination, batched HTTP upserts, and in-memory CSV parsing. Document explicit upgrade triggers and paths; defer complex machinery until evidence demands it.

## Decision

**Keep the implementation simple; document evolution paths explicitly.**

What was built:

| Concern | Current implementation |
| --- | --- |
| Indexes | Single-column btree on each filtered column |
| Pagination | Offset via Supabase `.range()` |
| Ingestion transport | Batched Supabase HTTP upsert (500 rows) |
| CSV handling | Full file read into memory |
| Composite indexes | Commented DDL in migration, ready to enable |
| Partitioning | Not implemented |

What was documented as future evolution (when justified by workload evidence):

1. **Keyset pagination** — when deep-page latency or offset cost appears in profiling.
2. **Composite indexes** — when `EXPLAIN (ANALYZE, BUFFERS)` shows bitmap AND of single-column indexes dominates latency (e.g. `(country, gender)`).
3. **Staging + COPY + MERGE** — when ingest volume makes HTTP upsert throughput unacceptable; normalization layer unchanged, only transport evolves.
4. **Streaming CSV reads** — when file size exceeds practical memory limits.
5. **Partitioning** — when table maintenance or partition pruning provides measurable benefit (typically tens of millions of rows or strict retention policies).
6. **Read replicas / materialized views** — when OLAP-style aggregates or read-heavy traffic warrant separation from the write path.

### Technology evolution path

Current choices are deliberate for 10K rows. Each threshold adds capability only when volume or query evidence justifies the complexity.

```
  10K rows (today)
        │
        ▼
  Current Design
        ├─ Single-column btree indexes
        ├─ Offset pagination (.range)
        └─ HTTP batch UPSERT (500 rows)


  100K+ rows
        │
        ▼
  Enable Composite Indexes           e.g. (country, gender)
        │                            when EXPLAIN shows hot combined filters
        ▼
  Keyset Pagination (optional)       when deep-page offset cost appears


  1M+ rows
        │
        ▼
  COPY + Staging Table               lib/ingestion rules unchanged
        │                            transport layer only evolves
        └─ Streaming CSV reads


  10M+ rows
        │
        ▼
  Partitioning                       RANGE(id) or LIST(country)
        │
        └─ Read replicas · materialized views (OLAP offload)
```

## Consequences

**Positive:**

- Lower complexity today: one migration, one query module, one import script — easier to review, test, and maintain within take-home scope.
- Upgrade paths are **named and concrete**, not vague "we'll optimize later" hand-waving.
- The normalization layer (`lib/ingestion/`) survives transport changes — business rules do not need rewriting when ingest mechanism upgrades.

**Negative:**

- Current loader is not throughput-competitive for million-row initial loads (HTTP overhead, in-memory CSV).
- Offset pagination will degrade on deep pages at scale — acceptable now, requires a deliberate migration later.
- Composite indexes may be needed sooner than partitioning; the team must monitor query plans as data grows.

## Challenge justification

Engineering decisions should be driven by **evidence**, not assumptions. The challenge dataset is small; implementing partitioning or keyset pagination now would demonstrate familiarity with advanced techniques but fail the judgment test — adding moving parts without a measured problem.

The chosen approach shows **scale-aware restraint**: indexes and server-side filtering prove the read path is serious; idempotent upsert and canonical storage prove the write path is disciplined; documented evolution proves the author knows what changes when volume demands it. That combination is more credible in an architecture review than premature optimization that increases review friction without improving current behavior.

---

# Summary

This project intentionally balances four engineering priorities:

| Priority | How it is addressed |
| --- | --- |
| **Simplicity** | Single fact table, no lookup joins, GET-based filters, one shared ingestion module |
| **Correctness** | Ingestion validation before write, ENUM/CHECK enforcement, idempotent UPSERT, post-load count verification |
| **Performance** | Canonical sargable predicates, indexed filter columns, server-side query execution, page-sized network payloads |
| **Scalability** | Architecture avoids client-side full scans; upgrade paths for keyset pagination, composite indexes, COPY staging, and partitioning are documented and do not require redesigning core abstractions |

The resulting architecture is appropriate for the current 10,000-row dataset and the take-home evaluation scope. It is not a minimal CRUD demo — it separates canonical storage from presentation, treats external CSV input as untrusted, and executes reads where indexes live (PostgreSQL) rather than where it is convenient (the browser).

As the dataset grows, the highest-leverage changes are incremental: enable composite indexes when query plans justify them, swap offset pagination for keyset cursors when deep pages hurt, and replace HTTP upsert batches with staging + `COPY` when ingest throughput becomes the bottleneck. The normalization layer, ENUM definitions, and URL-driven filter contract remain stable across those transitions — which is the practical definition of a architecture that scales without rewriting.
