-- Coffee health dataset: ENUM types, fact table, indexes, and RLS.
--
-- Architecture: single fact table + lowercase ENUMs for categoricals + lowercase TEXT
-- for country. Canonical values are enforced at ingest time (see lib/ingestion/) and
-- at the database layer (ENUM labels + country lowercase CHECK).

-- ---------------------------------------------------------------------------
-- ENUM types (lowercase canonical labels)
--
-- Why ENUMs: fixed vocabularies with integrity at cast/insert time, compact storage,
-- and index-friendly equality predicates without JOINs to lookup tables.
--
-- Why lowercase: ingestion normalizes all categoricals before insert so queries use
-- simple equality (WHERE gender = 'female') without LOWER() wrappers that defeat
-- btree indexes. Display title-casing belongs in the application layer.
-- ---------------------------------------------------------------------------

create type public.coffee_health_gender as enum (
  'male',
  'female',
  'other'  -- 226 rows in source CSV; required for lossless ingestion
);

comment on type public.coffee_health_gender is
  'Canonical lowercase gender labels. Populated by the ingestion pipeline; UI formats for display.';

create type public.coffee_health_sleep_quality as enum (
  'poor',
  'fair',
  'good',
  'excellent'
);

comment on type public.coffee_health_sleep_quality is
  'Canonical lowercase sleep quality buckets (ordinal meaning preserved in UI ordering).';

create type public.coffee_health_stress_level as enum (
  'low',
  'medium',
  'high'
);

comment on type public.coffee_health_stress_level is
  'Canonical lowercase stress levels for filter predicates and ENUM integrity.';

create type public.coffee_health_issue_severity as enum (
  'none',
  'mild',
  'moderate',
  'severe'
);

comment on type public.coffee_health_issue_severity is
  'Canonical lowercase health issue severity (maps from CSV Health_Issues after normalization).';

create type public.coffee_health_occupation as enum (
  'healthcare',
  'office',
  'service',
  'student',
  'other'
);

comment on type public.coffee_health_occupation is
  'Canonical lowercase occupation categories; ENUM avoids typos vs free TEXT.';

-- ---------------------------------------------------------------------------
-- Fact table
--
-- One row per survey record. No lookup tables: country stays TEXT (20 values) with
-- a lowercase CHECK so btree indexes on country remain sargable for WHERE country = 'canada'.
-- ---------------------------------------------------------------------------

create table public.coffee_health_records (
  id                      integer not null,
  age                     smallint not null,
  gender                  public.coffee_health_gender not null,
  country                 text not null,
  coffee_intake           numeric(4, 1) not null,
  caffeine_mg             numeric(7, 1) not null,
  sleep_hours             numeric(3, 1) not null,
  sleep_quality           public.coffee_health_sleep_quality not null,
  bmi                     numeric(4, 1) not null,
  heart_rate              smallint not null,
  stress_level            public.coffee_health_stress_level not null,
  physical_activity_hours numeric(4, 1) not null,
  health_issues           public.coffee_health_issue_severity not null,
  occupation              public.coffee_health_occupation not null,
  smoking                 boolean not null,
  alcohol_consumption     boolean not null,

  constraint coffee_health_records_pkey primary key (id),
  constraint coffee_health_records_age_check
    check (age between 0 and 150),
  constraint coffee_health_records_heart_rate_check
    check (heart_rate between 0 and 300),
  constraint coffee_health_records_coffee_intake_check
    check (coffee_intake >= 0),
  constraint coffee_health_records_caffeine_mg_check
    check (caffeine_mg >= 0),
  constraint coffee_health_records_sleep_hours_check
    check (sleep_hours >= 0 and sleep_hours <= 24),
  constraint coffee_health_records_bmi_check
    check (bmi > 0),
  constraint coffee_health_records_physical_activity_hours_check
    check (physical_activity_hours >= 0),
  constraint coffee_health_records_country_not_empty_check
    check (char_length(trim(country)) > 0),
  constraint coffee_health_records_country_lowercase_check
    check (country = lower(country))
);

comment on table public.coffee_health_records is
  'Synthetic coffee/health fact table. Stores canonical lowercase categoricals; '
  'ingestion layer (lib/ingestion) validates and normalizes before insert.';

comment on column public.coffee_health_records.id is
  'Natural key from CSV (ID). Enables idempotent reloads and row-level verification.';

comment on column public.coffee_health_records.country is
  'Lowercase canonical country name (e.g. south korea, uk). TEXT not ENUM: new countries '
  'can be added without ALTER TYPE; lowercase CHECK keeps btree equality indexes effective.';

comment on column public.coffee_health_records.smoking is
  'BOOLEAN not integer: CSV 0/1 is converted at ingest; predicates use smoking = true/false '
  'without magic numbers and match PostgreSQL boolean column statistics.';

comment on column public.coffee_health_records.alcohol_consumption is
  'BOOLEAN derived from CSV Alcohol_Consumption (0/1) during ingestion.';

-- ---------------------------------------------------------------------------
-- Indexes for filter columns (sargable equality / range — no LOWER() needed)
-- ---------------------------------------------------------------------------

create index coffee_health_records_country_idx
  on public.coffee_health_records (country);

create index coffee_health_records_gender_idx
  on public.coffee_health_records (gender);

create index coffee_health_records_sleep_quality_idx
  on public.coffee_health_records (sleep_quality);

create index coffee_health_records_stress_level_idx
  on public.coffee_health_records (stress_level);

create index coffee_health_records_age_idx
  on public.coffee_health_records (age);

create index coffee_health_records_bmi_idx
  on public.coffee_health_records (bmi);

-- ---------------------------------------------------------------------------
-- Composite indexes (enable when EXPLAIN ANALYZE shows combined filters are hot)
-- ---------------------------------------------------------------------------

-- create index coffee_health_records_country_gender_idx
--   on public.coffee_health_records (country, gender);

-- create index coffee_health_records_country_stress_level_idx
--   on public.coffee_health_records (country, stress_level);

-- create index coffee_health_records_sleep_quality_stress_level_idx
--   on public.coffee_health_records (sleep_quality, stress_level);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.coffee_health_records enable row level security;

create policy "Allow public read access"
  on public.coffee_health_records
  as permissive
  for select
  to public
  using (true);

-- ---------------------------------------------------------------------------
-- API grants
-- ---------------------------------------------------------------------------

grant delete on table public.coffee_health_records to anon;
grant insert on table public.coffee_health_records to anon;
grant references on table public.coffee_health_records to anon;
grant select on table public.coffee_health_records to anon;
grant trigger on table public.coffee_health_records to anon;
grant truncate on table public.coffee_health_records to anon;
grant update on table public.coffee_health_records to anon;

grant delete on table public.coffee_health_records to authenticated;
grant insert on table public.coffee_health_records to authenticated;
grant references on table public.coffee_health_records to authenticated;
grant select on table public.coffee_health_records to authenticated;
grant trigger on table public.coffee_health_records to authenticated;
grant truncate on table public.coffee_health_records to authenticated;
grant update on table public.coffee_health_records to authenticated;

grant delete on table public.coffee_health_records to service_role;
grant insert on table public.coffee_health_records to service_role;
grant references on table public.coffee_health_records to service_role;
grant select on table public.coffee_health_records to service_role;
grant trigger on table public.coffee_health_records to service_role;
grant truncate on table public.coffee_health_records to service_role;
grant update on table public.coffee_health_records to service_role;
