import {
  COUNTRY_SET,
  GENDER_SET,
  HEALTH_ISSUE_SET,
  OCCUPATION_SET,
  SLEEP_QUALITY_SET,
  STRESS_LEVEL_SET,
  type Country,
  type Gender,
  type HealthIssue,
  type Occupation,
  type SleepQuality,
  type StressLevel,
} from "./constants";
import { IngestionValidationError } from "./errors";
import type {
  CoffeeHealthRecord,
  NormalizeBatchResult,
  NormalizeOptions,
  NormalizeResult,
  RawCoffeeHealthCsvRow,
} from "./types";

const REQUIRED_FIELDS: (keyof RawCoffeeHealthCsvRow)[] = [
  "ID",
  "Age",
  "Gender",
  "Country",
  "Coffee_Intake",
  "Caffeine_mg",
  "Sleep_Hours",
  "Sleep_Quality",
  "BMI",
  "Heart_Rate",
  "Stress_Level",
  "Physical_Activity_Hours",
  "Health_Issues",
  "Occupation",
  "Smoking",
  "Alcohol_Consumption",
];

function fail(
  rowNumber: number | undefined,
  field: string,
  message: string,
  rawValue?: string,
): never {
  throw new IngestionValidationError(message, { rowNumber, field, rawValue });
}

/** Trim surrounding whitespace; empty strings are invalid for required text fields. */
export function trimRequired(
  value: string | undefined,
  field: string,
  rowNumber?: number,
): string {
  if (value === undefined || value === null) {
    fail(rowNumber, field, "required field is missing");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    fail(rowNumber, field, "required field is empty after trim", value);
  }
  return trimmed;
}

/** Normalize categorical text to canonical lowercase storage form. */
export function toCanonicalCategory(
  value: string,
  field: string,
  allowed: Set<string>,
  rowNumber?: number,
): string {
  const canonical = value.trim().toLowerCase();
  if (!allowed.has(canonical)) {
    fail(
      rowNumber,
      field,
      `value is not in the allowed vocabulary: ${[...allowed].sort().join(", ")}`,
      value,
    );
  }
  return canonical;
}

/**
 * Convert CSV 0/1 flags to boolean.
 * BOOLEAN storage avoids ambiguous integer semantics in SQL predicates
 * (e.g. WHERE smoking = true vs WHERE smoking = 1).
 */
export function parseBinaryFlag(
  value: string,
  field: string,
  rowNumber?: number,
): boolean {
  const trimmed = trimRequired(value, field, rowNumber);
  if (trimmed === "0") return false;
  if (trimmed === "1") return true;
  fail(rowNumber, field, "expected binary flag 0 or 1", value);
}

function parseInteger(
  value: string,
  field: string,
  rowNumber?: number,
): number {
  const trimmed = trimRequired(value, field, rowNumber);
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== trimmed) {
    fail(rowNumber, field, "expected a valid integer", value);
  }
  return parsed;
}

function parseDecimal(
  value: string,
  field: string,
  rowNumber?: number,
): number {
  const trimmed = trimRequired(value, field, rowNumber);
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    fail(rowNumber, field, "expected a valid decimal number", value);
  }
  return parsed;
}

function parseEnumField<T extends string>(
  value: string,
  field: string,
  allowed: Set<string>,
  rowNumber?: number,
): T {
  return toCanonicalCategory(value, field, allowed, rowNumber) as T;
}

/**
 * Validate and transform one raw CSV row into a canonical CoffeeHealthRecord.
 *
 * Pipeline: validate required → trim → lowercase categoricals → parse numerics → booleans
 */
export function normalizeCoffeeHealthRow(
  raw: RawCoffeeHealthCsvRow,
  options: NormalizeOptions = {},
): NormalizeResult {
  const rowNumber = options.rowNumber;

  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) {
      fail(rowNumber, field, "required field is missing");
    }
  }

  const record: CoffeeHealthRecord = {
    id: parseInteger(raw.ID, "ID", rowNumber),
    age: parseInteger(raw.Age, "Age", rowNumber),
    gender: parseEnumField<Gender>(raw.Gender, "Gender", GENDER_SET, rowNumber),
    country: parseEnumField<Country>(
      raw.Country,
      "Country",
      COUNTRY_SET,
      rowNumber,
    ),
    coffee_intake: parseDecimal(raw.Coffee_Intake, "Coffee_Intake", rowNumber),
    caffeine_mg: parseDecimal(raw.Caffeine_mg, "Caffeine_mg", rowNumber),
    sleep_hours: parseDecimal(raw.Sleep_Hours, "Sleep_Hours", rowNumber),
    sleep_quality: parseEnumField<SleepQuality>(
      raw.Sleep_Quality,
      "Sleep_Quality",
      SLEEP_QUALITY_SET,
      rowNumber,
    ),
    bmi: parseDecimal(raw.BMI, "BMI", rowNumber),
    heart_rate: parseInteger(raw.Heart_Rate, "Heart_Rate", rowNumber),
    stress_level: parseEnumField<StressLevel>(
      raw.Stress_Level,
      "Stress_Level",
      STRESS_LEVEL_SET,
      rowNumber,
    ),
    physical_activity_hours: parseDecimal(
      raw.Physical_Activity_Hours,
      "Physical_Activity_Hours",
      rowNumber,
    ),
    health_issues: parseEnumField<HealthIssue>(
      raw.Health_Issues,
      "Health_Issues",
      HEALTH_ISSUE_SET,
      rowNumber,
    ),
    occupation: parseEnumField<Occupation>(
      raw.Occupation,
      "Occupation",
      OCCUPATION_SET,
      rowNumber,
    ),
    smoking: parseBinaryFlag(raw.Smoking, "Smoking", rowNumber),
    alcohol_consumption: parseBinaryFlag(
      raw.Alcohol_Consumption,
      "Alcohol_Consumption",
      rowNumber,
    ),
  };

  return { record };
}

/**
 * Normalize a batch of rows. Invalid rows are collected in `errors` rather than thrown.
 */
export function normalizeCoffeeHealthBatch(
  rows: RawCoffeeHealthCsvRow[],
  options: { startRowNumber?: number } = {},
): NormalizeBatchResult {
  const startRowNumber = options.startRowNumber ?? 2; // row 1 is header
  const records: CoffeeHealthRecord[] = [];
  const errors: IngestionValidationError[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = startRowNumber + index;
    try {
      const { record } = normalizeCoffeeHealthRow(raw, { rowNumber });
      records.push(record);
    } catch (error) {
      if (error instanceof IngestionValidationError) {
        errors.push(error);
      } else {
        throw error;
      }
    }
  });

  return { records, errors };
}

/** Map CSV header line + data lines to raw row objects */
export function parseCsvLine(line: string): string[] {
  return line.split(",");
}

export function rawRowFromValues(
  headers: string[],
  values: string[],
): RawCoffeeHealthCsvRow {
  const row: Record<string, string> = {};
  headers.forEach((header, i) => {
    row[header.trim()] = values[i] ?? "";
  });
  return row as unknown as RawCoffeeHealthCsvRow;
}
