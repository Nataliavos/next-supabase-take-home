# Database Design: Coffee Health Records

## Overview

PostgreSQL schema and ingestion pipeline for the Medallo take-home: load `data/synthetic_coffee_health_10000.csv` (10,000 rows) into Supabase and serve filtered reads to Next.js.

| Artifact | Path |
| --- | --- |
| Migration (schema) | [`supabase/migrations/20260609120000_create_coffee_health_records.sql`](../supabase/migrations/20260609120000_create_coffee_health_records.sql) |
| Migration (coffee_intake index) | [`supabase/migrations/20260610180000_add_coffee_intake_index.sql`](../supabase/migrations/20260610180000_add_coffee_intake_index.sql) |
| Ingestion library | [`lib/ingestion/`](../lib/ingestion/) |
| Import script | [`scripts/import-coffee-health.ts`](../scripts/import-coffee-health.ts) |
| Query + URL filters | [`lib/coffee-health/`](../lib/coffee-health/) (`queries.ts`, `search-params.ts`, `format.ts`) |
| UI | [`components/coffee-health/`](../components/coffee-health/) |

---

## Design Summary

| Decision | Choice |
| --- | --- |
| Table model | Single fact table: `coffee_health_records` |
| Categorical storage | PostgreSQL `ENUM` (lowercase labels) |
| Country | Lowercase `TEXT` + btree index + lowercase `CHECK` |
| Binary flags | `BOOLEAN` (converted from CSV `0`/`1` at ingest) |
| Canonical form | **Lowercase** in DB; title case in UI |
| Lookup tables | **Not used** |
| Ingestion | Validate → trim → lowercase → boolean → upsert |
| Idempotency | UPSERT on `id` — safe to re-run without TRUNCATE |

---

## Ingestion Pipeline

```
CSV (mixed case, 0/1 flags)
        ↓
  Validation (required fields, vocabularies)
        ↓
  Trim whitespace
        ↓
  Lowercase categoricals + country
        ↓
  Convert Smoking / Alcohol_Consumption → BOOLEAN
        ↓
  UPSERT into coffee_health_records (on conflict: id)
```

Run after migrations:

```bash
pnpx supabase db reset   # migrations + seed.sql
pnpm import:coffee       # loads 10,000 rows (safe to re-run)
```

---

# Ingestion Strategy

The challenge permits several reasonable loading approaches: a **seed script** (`supabase/seed.sql`), a **one-off loader script**, or native PostgreSQL **`COPY`**. This project uses a dedicated TypeScript loader ([`scripts/import-coffee-health.ts`](../scripts/import-coffee-health.ts)) backed by a shared normalization library ([`lib/ingestion/`](../lib/ingestion/)). The starter `seed.sql` remains in place for the sample `notes` table only; coffee health data is loaded separately via `pnpm import:coffee`.

## Why a One-Off Loading Script Was Chosen

The source CSV is **not fully aligned** with the target schema. Column names use PascalCase (`Gender`, `Coffee_Intake`) while the table uses snake_case (`gender`, `coffee_intake`). Categorical values arrive in presentation form (`Germany`, `Good`, `Low`) but must be stored as canonical lowercase labels compatible with PostgreSQL ENUMs and CHECK constraints. Binary fields arrive as `0`/`1` integers but are persisted as `BOOLEAN`. Loading raw CSV bytes directly into `coffee_health_records` would fail ENUM casts, violate lowercase constraints, or silently store inconsistent data.

A dedicated ingestion script was selected to apply those transformations **before** persistence, with explicit validation at each step:

```
CSV
        ↓
  Validation (required fields, vocabularies, types)
        ↓
  Trim whitespace
        ↓
  Lowercase categorical fields + country
        ↓
  ENUM-compatible vocabulary validation
        ↓
  Convert 0/1 flags → BOOLEAN
        ↓
  PostgreSQL UPSERT (on conflict: id)
```

This approach provides:

- **Strong data quality guarantees** — invalid rows are rejected with row-level context before any database write (see [Data Integrity Layers](#data-integrity-layers)).
- **Reusable transformation logic** — [`lib/ingestion/`](../lib/ingestion/) is shared by the import script, tests, and future APIs or UI filter normalization.
- **Better error reporting** — `IngestionValidationError` surfaces field, row number, and raw value; bulk `COPY` failures are harder to diagnose row-by-row.
- **Idempotent execution** — UPSERT reconciles the table to the CSV on every run (detailed in [Idempotent Data Ingestion](#idempotent-data-ingestion)).
- **Separation between business rules and persistence** — normalization rules live in TypeScript; the database enforces schema integrity via ENUMs, CHECKs, and indexes.

## Why PostgreSQL COPY Was Not Chosen

`COPY` is extremely efficient for bulk loading data that is **already aligned** with the target schema — matching column order, types, and canonical values. It is the right tool for warehouse-style full refreshes when the file on disk is indistinguishable from what the table expects.

In this dataset, several transformations are required first:

- **Categorical standardization** — `Germany` → `germany`, `South Korea` → `south korea`
- **ENUM-compatible validation** — values must match fixed vocabularies before cast
- **Binary flag transformation** — `0`/`1` → `true`/`false`
- **Invalid row detection** — bad data should fail with actionable errors, not mid-load constraint violations

`COPY` does not provide these capabilities on its own. Achieving the same result with `COPY` would require a preprocessing step (external ETL, staging table + SQL transforms, or a pre-normalized export file) — effectively rebuilding the transformation layer elsewhere.

COPY would be a valid choice for a canonical dataset already aligned with the database schema. In this project, a dedicated ingestion layer was preferred because the source data requires validation and transformation before insertion.

## Why seed.sql Was Not Used for Coffee Health Data

`supabase/seed.sql` is appropriate for small, static SQL inserts bundled with `db reset` — as the starter uses for `notes`. The coffee health dataset is a 10,000-row CSV with non-trivial transformation requirements. Embedding that logic in SQL seed files would duplicate normalization rules already expressed in TypeScript, be harder to test, and couple schema bootstrap to a large generated SQL file. Keeping seed.sql for the starter example and using a dedicated loader for coffee health preserves a clear boundary: **migrations define structure; the import script defines data reconciliation**.

## Scalability Considerations

### Does This Scale to Millions of Rows?

Two separate concerns must not be conflated:

1. **Querying and filtering data** at read time
2. **Loading data** at ingest time

For **reads**, the current database design is already prepared for large datasets. Indexed filter columns, canonical storage format, server-side filtering, pagination strategies, and idempotent ingestion semantics are documented in [Scaling Considerations](#scaling-considerations). Postgres handles millions of rows comfortably when queries use btree indexes and the application never attempts to load the full result set into the browser.

For **writes**, the current ingestion script is intentionally optimized for **simplicity and correctness** rather than maximum throughput. That is an appropriate trade-off for a 10,000-row challenge dataset, but it would become a bottleneck at multi-million-row scale.

Current loader characteristics:

| Characteristic | Implication at 10k rows | Implication at millions |
| --- | --- | --- |
| Entire CSV loaded into memory | Trivial (~10k rows) | Problematic — requires streaming |
| HTTP-based Supabase upserts | Simple, uses project credentials | High per-batch overhead vs. direct SQL |
| Batch size of 500 | ~20 round-trips, fast enough | Thousands of round-trips, slow |

These limitations are **acceptable trade-offs** for 10,000 rows and local development. They are not architectural dead ends.

### Future Evolution for Large-Scale Loads

If the dataset grew to millions of records, the **transformation layer would remain valuable**; only the **transport mechanism** would change. The normalization and validation rules in [`lib/ingestion/`](../lib/ingestion/) stay unchanged — they would be applied per chunk rather than to the entire file at once:

```
CSV (streaming, chunked reads)
        ↓
  Validation and normalization (lib/ingestion, per chunk)
        ↓
  Staging table (canonical rows, schema-aligned)
        ↓
  COPY or bulk SQL load into staging
        ↓
  MERGE / UPSERT into coffee_health_records
```

The normalization and validation rules remain unchanged; only the transport mechanism evolves.

This separation is intentional: business rules (what is valid, what is canonical) are decoupled from delivery (how rows reach Postgres). A team could swap HTTP upserts for `COPY` + SQL merge without rewriting validation logic or ENUM definitions.

## Engineering Trade-Off

`COPY` (or staging + bulk SQL) would likely outperform the current loader for multi-million-row initial imports. The current solution was chosen because the challenge dataset contains only 10,000 rows, and the primary objectives were **correctness**, **validation**, **maintainability**, and **idempotency** — not raw ingest throughput.

The architecture preserves a clear upgrade path: keep [`lib/ingestion/`](../lib/ingestion/) as the single source of transformation truth; evolve the write path when volume demands it. For the scope of this take-home, a TypeScript loader with batched UPSERT is the right balance. For a production pipeline ingesting millions of rows from messy upstream files, the same rules would apply — only the last mile would look different.

---

# Idempotent Data Ingestion

## What idempotency means here

In ETL and data-loading workflows, **idempotency** means that running the same load operation multiple times produces the same final state in the target table — without side effects such as duplicate rows, constraint violations, or the need for manual cleanup between runs.

For this project, idempotency is defined concretely as:

- The first execution of `pnpm import:coffee` inserts all 10,000 rows from the CSV.
- Every subsequent execution updates existing rows (matched by primary key `id`) and inserts any rows that are not yet present.
- The table always ends with exactly 10,000 rows when the source CSV is unchanged.
- No `TRUNCATE`, `DELETE`, or `db reset` is required between runs.

The import script achieves this via PostgreSQL `INSERT … ON CONFLICT` semantics, exposed through the Supabase client as `.upsert(records, { onConflict: "id" })`.

## Why repeated execution should be safe

During local development and CI, ingestion scripts are run repeatedly: after schema changes, after fixing normalization bugs, or when validating a fresh clone of the repository. A non-idempotent `INSERT`-only loader fails on the second run with duplicate-key errors, forcing developers into ad hoc recovery steps that are easy to forget and hard to automate.

An idempotent loader treats every run as authoritative: the CSV (after validation and normalization) is the source of truth, and the database is reconciled to match it. This mirrors how production pipelines reconcile staging data into a fact table without assuming an empty destination.

## Why manual TRUNCATE is less desirable

`TRUNCATE coffee_health_records` followed by a bulk `INSERT` works for a static, disposable dataset, but it is **destructive**: it removes all rows unconditionally, including any legitimate changes that may have been applied outside the import path (manual corrections, partial backfills, or rows from a future incremental feed).

TRUNCATE also requires elevated privileges, cannot be combined trivially with row-level policies in all deployment contexts, and offers no per-row merge semantics. It is a blunt instrument suited to full reloads in isolated environments, not to repeatable, low-risk ingestion during day-to-day development.

## Why UPSERT was selected

UPSERT (`ON CONFLICT (id) DO UPDATE`) was chosen because:

1. **Natural key alignment** — `id` is the CSV's stable natural key and the table's primary key; conflict resolution is unambiguous.
2. **Idempotent reconciliation** — existing rows are updated in place; new rows are inserted; no duplicates are created.
3. **No pre-load cleanup** — the script does not need to inspect table state or issue destructive DDL/DML before loading.
4. **Incremental-ready** — the same code path supports a future scenario where only a subset of rows changes between runs.
5. **Supabase-native** — the PostgREST `.upsert()` API maps directly to PostgreSQL upsert semantics with minimal client code.

### Engineering rationale

For this challenge, the dataset is static and could technically be reloaded using a TRUNCATE + INSERT workflow. However, an UPSERT-based approach was selected because it provides idempotent behavior, avoids destructive operations, supports repeated execution during local development, and more closely resembles real-world data ingestion pipelines where records may be loaded multiple times or updated incrementally.

## UPSERT vs TRUNCATE + INSERT

| Dimension | TRUNCATE + INSERT | UPSERT (`ON CONFLICT`) |
| --- | --- | --- |
| **Idempotency** | Requires empty table before each run (or TRUNCATE first) | Inherently idempotent on conflict key |
| **Destructiveness** | Removes all rows unconditionally | Updates matching rows; inserts missing ones |
| **Simplicity** | Very simple for one-off full reloads | Slightly more complex (conflict target + update columns) |
| **Performance (full reload)** | Fast — bulk insert into empty table | Comparable for 10k rows; marginal write overhead on conflict |
| **Partial / incremental loads** | Not supported without custom diff logic | Supported — changed rows update, new rows insert |
| **Development ergonomics** | Second run fails unless TRUNCATE is scripted | Second run succeeds with identical row count |
| **Production realism** | Typical of batch warehouse reloads | Typical of CDC, staging merges, and API sync jobs |

**TRUNCATE + INSERT** is simple and fast when the dataset is fully static, the table is disposable, and every load is a complete replacement. It is a valid pattern for initial bootstrap or scheduled full refreshes in analytics pipelines.

**UPSERT** is preferable when:

- The load must be safely re-executable without manual intervention.
- Records may arrive more than once with updated field values.
- Destructive pre-load steps are undesirable or unavailable.
- The ingestion code should remain valid as the pipeline evolves toward incremental feeds.

**Conclusion:** TRUNCATE + INSERT was rejected for the import script because it couples load success to a destructive precondition and breaks on repeated execution. UPSERT on `id` provides idempotent, non-destructive reconciliation that matches both the current static CSV and plausible future ingestion requirements.

## Correctness guarantees

After refactoring the import script to use UPSERT, the following behaviors are guaranteed:

| Guarantee | Mechanism |
| --- | --- |
| First run succeeds on an empty table | `INSERT` branch of `ON CONFLICT` |
| Second and subsequent runs succeed | `UPDATE` branch of `ON CONFLICT` — no duplicate-key errors |
| Row count remains 10,000 | Post-load `COUNT(*)` verification; PK uniqueness prevents duplicates |
| No duplicate rows | Primary key on `id` + conflict resolution on `id` |
| Existing rows reflect latest CSV values | `DO UPDATE` overwrites all columns for matching `id` |
| Invalid rows never reach the database | Validation layer rejects bad rows before any upsert batch |

Verify locally:

```bash
pnpm import:coffee   # first run — inserts 10,000 rows
pnpm import:coffee   # second run — upserts 10,000 rows, count unchanged
```

```sql
SELECT COUNT(*) FROM coffee_health_records;                      -- 10000
SELECT COUNT(*) = COUNT(DISTINCT id) FROM coffee_health_records; -- true (no duplicates)
```

---

# Data Standardization Strategy

## Why canonical storage?

Source CSV values arrive in **presentation form** (`Germany`, `Good`, `Low`, `0`/`1`). The database stores **canonical form** (`germany`, `good`, `low`, `true`/`false`) so every consumer—SQL, PostgREST, Supabase JS—agrees on a single representation.

Benefits:

1. **One transformation, once** — normalization at ingest avoids `LOWER()`, `INITCAP()`, or case-insensitive compares on every read.
2. **Predictable filters** — application and API always pass lowercase literals matching stored values.
3. **Fewer data quality incidents** — `Germany` and `germany` cannot coexist as distinct dimension members.
4. **Operational clarity** — DBAs and engineers inspect rows without guessing casing rules.

## Why lowercase in the database?

Lowercase is a **lossless, reversible normalization** for these English labels:

- No locale-specific collation surprises in equality checks.
- ENUM labels and `country` CHECK align on one rule: `value = lower(value)`.
- UI can apply `titleCase('south korea')` → `South Korea` without ambiguity.

## Why formatting belongs in the UI

The database is a **system of record**, not a presentation layer.

| Stored (canonical) | Displayed (UI) |
| --- | --- |
| `canada` | Canada |
| `south korea` | South Korea |
| `healthcare` | Healthcare |
| `good` | Good |

Separating concerns means:

- Marketing copy or i18n can change without migrations.
- SQL exports and analytics use stable keys.
- Filter dropdowns map `value` (canonical) → `label` (formatted) via [`formatLabel()`](../lib/coffee-health/format.ts) in `components/coffee-health/`.

## Why ingest-time normalization beats query-time transforms

Anti-pattern at scale:

```sql
WHERE LOWER(country) = LOWER($1)   -- often not index-friendly
```

Preferred:

```sql
-- App passes canonical filter from the same normalizer used at ingest
WHERE country = 'canada'           -- uses coffee_health_records_country_idx
```

Centralizing normalization in [`lib/ingestion/`](../lib/ingestion/) gives:

- **Single source of truth** for vocabularies (TypeScript constants mirror SQL ENUMs).
- **Testable validation** (see `lib/ingestion/normalize.test.ts`).
- **Reusable** across seed scripts, future APIs, and batch reprocessing.

## Consistency and operational risk

Without a standardization layer, mixed casing enters the DB through:

- Manual SQL fixes
- Alternate import scripts
- Third-party integrations

That produces silent filter misses (`WHERE country = 'Canada'` returns zero rows). Canonical ingest + ENUM/CHECK constraints **fail fast** on bad rows instead of polluting the fact table.

---

## Why a Single Fact Table?

Flat survey export: one row per person, no many-to-many relationships, no enrichable dimensions in scope.

- Maps 1:1 to CSV after normalization
- No JOINs for filters
- Simple EXPLAIN plans
- Read-heavy, ad hoc filter workload

---

## Why ENUMs Instead of Lookup Tables?

| Enum type | Canonical values |
| --- | --- |
| `coffee_health_gender` | male, female, other* |
| `coffee_health_sleep_quality` | poor, fair, good, excellent |
| `coffee_health_stress_level` | low, medium, high |
| `coffee_health_issue_severity` | none, mild, moderate, severe |
| `coffee_health_occupation` | healthcare, office, service, student, other |

\*226 CSV rows use `Other`; enum includes `other` for lossless ingest.

ENUMs enforce vocabulary at insert time with compact storage and no join tax. Lookup tables would add FK resolution during bulk load for no product capability.

---

## Why Country Remains Lowercase TEXT

### Consistent filtering

```sql
WHERE country = 'canada'
```

Not:

```sql
WHERE LOWER(country) = LOWER('Canada')  -- defeats simple btree usage
```

The ingestion layer maps `Canada` → `canada` before insert. The UI sends `canada` when the user picks Canada.

### Better index utilization

B-tree indexes on `country` support direct equality. Wrapping frequently filtered columns with LOWER() may prevent efficient use of standard B-tree indexes unless dedicated functional indexes are introduced.

Migration enforces canonical shape:

```sql
constraint coffee_health_records_country_lowercase_check
  check (country = lower(country))
```

### Canonical data model

| Layer | Responsibility |
| --- | --- |
| Ingestion (`lib/ingestion`) | Validate country against allow-list; store lowercase |
| PostgreSQL | Index + CHECK integrity |
| Next.js UI | Display labels via [`lib/coffee-health/format.ts`](../lib/coffee-health/format.ts); submit canonical filter values |

When ISO codes or regions are needed later, introduce a `countries` reference table **with metadata**—not for casing alone.

---

## Boolean Fields (Smoking, Alcohol_Consumption)

CSV stores `0` and `1`. PostgreSQL stores `BOOLEAN`.

| Approach | Drawback |
| --- | --- |
| `smallint` 0/1 | Ambiguous semantics; `WHERE smoking = 1` reads like magic |
| `BOOLEAN` | Native `true`/`false`; clear predicates; better planner stats |

Conversion happens only in [`parseBinaryFlag()`](../lib/ingestion/normalize.ts)—never in SQL at read time.

---

## Data Integrity Layers

1. **Ingestion validation** — required fields, vocabularies, types (`lib/ingestion`)
2. **NOT NULL** — no partial rows
3. **Lowercase ENUM labels** — categorical integrity
4. **`country = lower(country)` CHECK** — TEXT canonical rule
5. **Range CHECKs** — age, heart_rate, sleep_hours, bmi, non-negative numerics
6. **Primary key on `id`**
7. **RLS** — public read for local demo

---

## Next.js UI: filters and results table

Server Component at [`app/page.tsx`](../app/page.tsx) reads URL search params, fetches one page from Supabase, and renders filter form + table.

### Supported filters

| Filter | URL param(s) | Query predicate |
| --- | --- | --- |
| Country | `country` | `eq` on indexed `country` |
| Gender | `gender` | `eq` on indexed `gender` |
| Sleep quality | `sleep_quality` | `eq` on indexed `sleep_quality` |
| Stress level | `stress_level` | `eq` on indexed `stress_level` |
| Age range | `age_min`, `age_max` | `gte` / `lte` on indexed `age` |
| BMI range | `bmi_min`, `bmi_max` | `gte` / `lte` on indexed `bmi` |
| Coffee intake range | `coffee_intake_min`, `coffee_intake_max` | `gte` / `lte` on indexed `coffee_intake` |

[`parseSearchParams()`](../lib/coffee-health/search-params.ts) validates and canonicalizes URL input. [`buildFilterSearchParams()`](../lib/coffee-health/search-params.ts) rebuilds the query string for pagination links so active filters survive page changes.

Applying filters submits a GET form with a hidden `page=1` input so a new filter always resets to the first results page.

### Results table columns

[`fetchCoffeeHealthRecords()`](../lib/coffee-health/queries.ts) selects all fact-table columns; [`RecordsTable`](../components/coffee-health/records-table.tsx) displays a focused subset with horizontal scroll:

ID, age, gender, country, coffee intake, sleep quality, stress level, BMI, sleep hours, heart rate, occupation, health issues, smoking, alcohol consumption.

Presentation helpers live in [`lib/coffee-health/format.ts`](../lib/coffee-health/format.ts) (`formatLabel`, `formatDecimal`, `formatBoolean`) — separate from canonical storage in PostgreSQL.

---

## Filtering Performance

```sql
SELECT id, age, gender, country, coffee_intake, sleep_quality, stress_level, bmi
FROM coffee_health_records
WHERE country = 'germany'
  AND gender = 'female'
  AND age BETWEEN 30 AND 50
  AND bmi <= 25
  AND coffee_intake BETWEEN 2 AND 5
ORDER BY id
LIMIT 50;
```

| Index | Column(s) |
| --- | --- |
| `coffee_health_records_country_idx` | `country` |
| `coffee_health_records_gender_idx` | `gender` |
| `coffee_health_records_sleep_quality_idx` | `sleep_quality` |
| `coffee_health_records_stress_level_idx` | `stress_level` |
| `coffee_health_records_age_idx` | `age` |
| `coffee_health_records_bmi_idx` | `bmi` |
| `coffee_health_records_coffee_intake_idx` | `coffee_intake` |

### Composite indexes (add when justified)

1. `(country, gender)`
2. `(country, stress_level)`
3. `(sleep_quality, stress_level)`

---

# Scaling Considerations

## Canonical lowercase and scale

At millions of rows, **simple predicates win**:

- No per-row `LOWER()` in hot queries → CPU saved across billions of comparisons over time.
- btree indexes remain **sargable** — planner chooses index scans confidently.
- Filter parameters from the app match stored bytes exactly → no collation edge cases in production.

Canonical storage does not replace indexing or pagination; it removes a class of full-scan regressions introduced by case-insensitive SQL.

## Indexing strategy

- Single-column B-trees on every filtered column (initial migration + [`20260610180000_add_coffee_intake_index.sql`](../supabase/migrations/20260610180000_add_coffee_intake_index.sql) for coffee intake ranges).
- Partial indexes if product focuses on subsets (e.g. `WHERE stress_level = 'high'`).
- Defer composite indexes until `EXPLAIN (ANALYZE, BUFFERS)` proves combined filters are dominant.

## Composite indexes

Add when bitmap AND of two single-column indexes plus heap fetches dominate. Lead with the most selective column (often `country`).

## Pagination strategy

| Approach | Use when |
| --- | --- |
| Offset (`.range()`) | Early pages, demos |
| Keyset (`WHERE id > $cursor`) | Deep pagination at scale |

## Why filtering must happen in PostgreSQL, not React

1. Row volume exceeds browser memory at scale.
2. PostgREST `max_rows = 1000` caps payload size.
3. Only the database uses btree indexes.
4. `COUNT(*)` with filters belongs in SQL.

Pass **canonical** filter strings from the UI layer to match stored values.

## Future partitioning

- RANGE on `id` for monotonic bulk loads.
- LIST on `country` if queries are always single-country.

Partitioning is intentionally not implemented because the dataset contains only 10,000 rows and PostgreSQL performs efficiently without it at this scale.

For this workload, partitioning would likely introduce more operational complexity than performance benefit until the dataset reaches tens of millions of rows.

## Read replicas

Primary for writes/imports; replicas for read-heavy Next.js queries.

## Analytical vs transactional

| Workload | Fit |
| --- | --- |
| Filtered OLTP reads | ✅ Current schema |
| Heavy OLAP aggregates | Materialized views or warehouse |

---

## Tradeoffs and Limitations

| Tradeoff | Impact |
| --- | --- |
| ENUM additions | Require migration (`ALTER TYPE ... ADD VALUE`) |
| Lowercase display | UI must format labels |
| Country allow-list in TS | New countries need ingestion constant + backfill |
| `other` gender | Present for CSV fidelity; filters can exclude if needed |

---

## When Lookup Tables Become Preferable

1. Country needs ISO codes, regions, localization.
2. Occupation taxonomy is admin-managed and grows beyond ENUM.
3. Multiple fact tables share dimensions.
4. Renames must cascade globally.

---

## Verification

```bash
pnpm test:run
pnpm import:coffee        # first run
pnpm import:coffee        # idempotency check — must succeed with same row count
```

```sql
SELECT COUNT(*) FROM coffee_health_records;                 -- 10000
SELECT COUNT(DISTINCT country) FROM coffee_health_records;  -- 20
SELECT country, COUNT(*) FROM coffee_health_records GROUP BY 1 ORDER BY 1 LIMIT 5;
-- expect lowercase: australia, belgium, ...
```

---

## Evaluation Alignment

| Goal | How |
| --- | --- |
| Simplicity | One fact table, shared ingestion module, GET-based filters |
| Maintainability | Constants mirror ENUMs; tested normalizer; shared `format.ts` |
| Query performance | Sargable lowercase equality + range indexes (incl. `coffee_intake`) |
| Data integrity | Ingest validation + ENUM + CHECK |
| Idempotent ingestion | UPSERT on `id`; safe repeated execution |
| Ingestion strategy | One-off TS loader; COPY/seed rejected for transform needs; upgrade path documented |
| Scalability | Canonical storage, server-side filters, keyset path documented |

The design deliberately avoids over-normalization while treating **data engineering discipline** (canonical ingest) as a first-class concern.
