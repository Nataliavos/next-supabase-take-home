import type { CoffeeHealthRecord } from "@/lib/ingestion/types";
import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_PAGE_SIZE,
  type CoffeeHealthFilters,
  type ParsedSearchParams,
} from "./search-params";

const COFFEE_HEALTH_COLUMNS =
  "id, age, gender, country, coffee_intake, caffeine_mg, sleep_hours, sleep_quality, bmi, heart_rate, stress_level, physical_activity_hours, health_issues, occupation, smoking, alcohol_consumption" as const;

export interface CoffeeHealthQueryResult {
  rows: CoffeeHealthRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export type FetchCoffeeHealthRecordsInput = CoffeeHealthFilters & {
  pageSize?: number;
};

/**
 * Fetch a paginated page of coffee health records with server-side filtering.
 * Uses the Supabase server client; intended for Server Components and Route Handlers.
 */
export async function fetchCoffeeHealthRecords(
  filters: FetchCoffeeHealthRecordsInput | ParsedSearchParams,
): Promise<CoffeeHealthQueryResult> {
  const page = filters.page;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();

  let query = supabase
    .from("coffee_health_records")
    .select(COFFEE_HEALTH_COLUMNS, { count: "exact" })
    .order("id", { ascending: true });

  if (filters.country !== undefined) {
    query = query.eq("country", filters.country);
  }
  if (filters.gender !== undefined) {
    query = query.eq("gender", filters.gender);
  }
  if (filters.sleep_quality !== undefined) {
    query = query.eq("sleep_quality", filters.sleep_quality);
  }
  if (filters.stress_level !== undefined) {
    query = query.eq("stress_level", filters.stress_level);
  }
  if (filters.age_min !== undefined) {
    query = query.gte("age", filters.age_min);
  }
  if (filters.age_max !== undefined) {
    query = query.lte("age", filters.age_max);
  }
  if (filters.bmi_min !== undefined) {
    query = query.gte("bmi", filters.bmi_min);
  }
  if (filters.bmi_max !== undefined) {
    query = query.lte("bmi", filters.bmi_max);
  }
  if (filters.coffee_intake_min !== undefined) {
    query = query.gte("coffee_intake", filters.coffee_intake_min);
  }
  if (filters.coffee_intake_max !== undefined) {
    query = query.lte("coffee_intake", filters.coffee_intake_max);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new Error(`Failed to fetch coffee health records: ${error.message}`);
  }

  return {
    rows: (data ?? []) as CoffeeHealthRecord[],
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}
