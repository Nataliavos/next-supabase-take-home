import type {
  Country,
  Gender,
  HealthIssue,
  Occupation,
  SleepQuality,
  StressLevel,
} from "./constants";
import type { IngestionValidationError } from "./errors";

/** Raw row shape as it appears in synthetic_coffee_health_10000.csv */
export interface RawCoffeeHealthCsvRow {
  ID: string;
  Age: string;
  Gender: string;
  Country: string;
  Coffee_Intake: string;
  Caffeine_mg: string;
  Sleep_Hours: string;
  Sleep_Quality: string;
  BMI: string;
  Heart_Rate: string;
  Stress_Level: string;
  Physical_Activity_Hours: string;
  Health_Issues: string;
  Occupation: string;
  Smoking: string;
  Alcohol_Consumption: string;
}

/** Canonical record ready for insert into coffee_health_records */
export interface CoffeeHealthRecord {
  id: number;
  age: number;
  gender: Gender;
  country: Country;
  coffee_intake: number;
  caffeine_mg: number;
  sleep_hours: number;
  sleep_quality: SleepQuality;
  bmi: number;
  heart_rate: number;
  stress_level: StressLevel;
  physical_activity_hours: number;
  health_issues: HealthIssue;
  occupation: Occupation;
  smoking: boolean;
  alcohol_consumption: boolean;
}

export interface NormalizeOptions {
  /** 1-based row number in source file (for error messages) */
  rowNumber?: number;
}

export interface NormalizeResult {
  record: CoffeeHealthRecord;
}

export interface NormalizeBatchResult {
  records: CoffeeHealthRecord[];
  errors: IngestionValidationError[];
}
