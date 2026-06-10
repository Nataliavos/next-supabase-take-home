/**
 * Canonical vocabularies for coffee health ingestion.
 * Values are lowercase; must stay aligned with PostgreSQL ENUM definitions.
 */

export const GENDERS = ["male", "female", "other"] as const;
export const SLEEP_QUALITIES = ["poor", "fair", "good", "excellent"] as const;
export const STRESS_LEVELS = ["low", "medium", "high"] as const;
export const HEALTH_ISSUES = ["none", "mild", "moderate", "severe"] as const;
export const OCCUPATIONS = [
  "healthcare",
  "office",
  "service",
  "student",
  "other",
] as const;

export const COUNTRIES = [
  "australia",
  "belgium",
  "brazil",
  "canada",
  "china",
  "finland",
  "france",
  "germany",
  "india",
  "italy",
  "japan",
  "mexico",
  "netherlands",
  "norway",
  "south korea",
  "spain",
  "sweden",
  "switzerland",
  "uk",
  "usa",
] as const;

export type Gender = (typeof GENDERS)[number];
export type SleepQuality = (typeof SLEEP_QUALITIES)[number];
export type StressLevel = (typeof STRESS_LEVELS)[number];
export type HealthIssue = (typeof HEALTH_ISSUES)[number];
export type Occupation = (typeof OCCUPATIONS)[number];
export type Country = (typeof COUNTRIES)[number];

const toSet = <T extends string>(values: readonly T[]) =>
  new Set<string>(values);

export const GENDER_SET = toSet(GENDERS);
export const SLEEP_QUALITY_SET = toSet(SLEEP_QUALITIES);
export const STRESS_LEVEL_SET = toSet(STRESS_LEVELS);
export const HEALTH_ISSUE_SET = toSet(HEALTH_ISSUES);
export const OCCUPATION_SET = toSet(OCCUPATIONS);
export const COUNTRY_SET = toSet(COUNTRIES);
