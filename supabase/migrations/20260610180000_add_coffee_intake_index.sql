-- Btree index for coffee_intake range filters (gte/lte in lib/coffee-health/queries.ts).
-- Aligns with existing single-column indexes on age and bmi.

create index coffee_health_records_coffee_intake_idx
  on public.coffee_health_records (coffee_intake);
