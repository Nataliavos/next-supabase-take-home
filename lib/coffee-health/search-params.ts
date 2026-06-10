import {
  COUNTRIES,
  COUNTRY_SET,
  GENDER_SET,
  GENDERS,
  SLEEP_QUALITIES,
  SLEEP_QUALITY_SET,
  STRESS_LEVEL_SET,
  STRESS_LEVELS,
  type Country,
  type Gender,
  type SleepQuality,
  type StressLevel,
} from "@/lib/ingestion/constants";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;

/** Canonical filter state derived from URL search params. */
export interface CoffeeHealthFilters {
  country?: Country;
  gender?: Gender;
  sleep_quality?: SleepQuality;
  stress_level?: StressLevel;
  age_min?: number;
  age_max?: number;
  bmi_min?: number;
  bmi_max?: number;
  coffee_intake_min?: number;
  coffee_intake_max?: number;
  page: number;
}

export interface ParsedSearchParams extends CoffeeHealthFilters {
  pageSize: number;
}

export type CoffeeHealthSearchParamsInput = Record<
  string,
  string | string[] | undefined
>;

function getSingleParam(
  params: CoffeeHealthSearchParamsInput,
  key: string,
): string | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseCategorical<T extends string>(
  raw: string | undefined,
  allowed: Set<string>,
): T | undefined {
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const canonical = trimmed.toLowerCase();
  if (!allowed.has(canonical)) return undefined;

  return canonical as T;
}

function parseIntegerParam(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== trimmed) return undefined;

  return parsed;
}

function parseDecimalParam(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return undefined;

  return parsed;
}

function parsePage(raw: string | undefined): number {
  const parsed = parseIntegerParam(raw);
  if (parsed === undefined || parsed < 1) return DEFAULT_PAGE;
  return parsed;
}

/**
 * Validate and normalize URL search params into canonical filter state.
 * Invalid categorical and numeric values are silently ignored.
 */
export function parseSearchParams(
  params: CoffeeHealthSearchParamsInput,
): ParsedSearchParams {
  return {
    country: parseCategorical<Country>(
      getSingleParam(params, "country"),
      COUNTRY_SET,
    ),
    gender: parseCategorical<Gender>(
      getSingleParam(params, "gender"),
      GENDER_SET,
    ),
    sleep_quality: parseCategorical<SleepQuality>(
      getSingleParam(params, "sleep_quality"),
      SLEEP_QUALITY_SET,
    ),
    stress_level: parseCategorical<StressLevel>(
      getSingleParam(params, "stress_level"),
      STRESS_LEVEL_SET,
    ),
    age_min: parseIntegerParam(getSingleParam(params, "age_min")),
    age_max: parseIntegerParam(getSingleParam(params, "age_max")),
    bmi_min: parseDecimalParam(getSingleParam(params, "bmi_min")),
    bmi_max: parseDecimalParam(getSingleParam(params, "bmi_max")),
    coffee_intake_min: parseDecimalParam(
      getSingleParam(params, "coffee_intake_min"),
    ),
    coffee_intake_max: parseDecimalParam(
      getSingleParam(params, "coffee_intake_max"),
    ),
    page: parsePage(getSingleParam(params, "page")),
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/** Build URLSearchParams from canonical filter state (for pagination links). */
export function buildFilterSearchParams(
  filters: CoffeeHealthFilters,
  page?: number,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.country !== undefined) params.set("country", filters.country);
  if (filters.gender !== undefined) params.set("gender", filters.gender);
  if (filters.sleep_quality !== undefined) {
    params.set("sleep_quality", filters.sleep_quality);
  }
  if (filters.stress_level !== undefined) {
    params.set("stress_level", filters.stress_level);
  }
  if (filters.age_min !== undefined) params.set("age_min", String(filters.age_min));
  if (filters.age_max !== undefined) params.set("age_max", String(filters.age_max));
  if (filters.bmi_min !== undefined) params.set("bmi_min", String(filters.bmi_min));
  if (filters.bmi_max !== undefined) params.set("bmi_max", String(filters.bmi_max));
  if (filters.coffee_intake_min !== undefined) {
    params.set("coffee_intake_min", String(filters.coffee_intake_min));
  }
  if (filters.coffee_intake_max !== undefined) {
    params.set("coffee_intake_max", String(filters.coffee_intake_max));
  }
  if (page !== undefined && page > 1) params.set("page", String(page));

  return params;
}

/** Allowed categorical values for filter UIs (re-exported for convenience). */
export const FILTER_OPTIONS = {
  countries: COUNTRIES,
  genders: GENDERS,
  sleepQualities: SLEEP_QUALITIES,
  stressLevels: STRESS_LEVELS,
} as const;
