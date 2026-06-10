import { describe, expect, it } from "vitest";

import { IngestionValidationError } from "./errors";
import {
  normalizeCoffeeHealthBatch,
  normalizeCoffeeHealthRow,
  parseBinaryFlag,
  toCanonicalCategory,
} from "./normalize";
import type { RawCoffeeHealthCsvRow } from "./types";

const validRaw: RawCoffeeHealthCsvRow = {
  ID: "1",
  Age: "40",
  Gender: "Male",
  Country: "Germany",
  Coffee_Intake: "3.5",
  Caffeine_mg: "328.1",
  Sleep_Hours: "7.5",
  Sleep_Quality: "Good",
  BMI: "24.9",
  Heart_Rate: "78",
  Stress_Level: "Low",
  Physical_Activity_Hours: "14.5",
  Health_Issues: "None",
  Occupation: "Other",
  Smoking: "0",
  Alcohol_Consumption: "0",
};

describe("normalizeCoffeeHealthRow", () => {
  it("trims whitespace and lowercases categoricals", () => {
    const { record } = normalizeCoffeeHealthRow({
      ...validRaw,
      Gender: "  Female  ",
      Country: "South Korea",
      Sleep_Quality: "EXCELLENT",
      Stress_Level: " High ",
      Health_Issues: "Mild",
      Occupation: "Healthcare",
    });

    expect(record.gender).toBe("female");
    expect(record.country).toBe("south korea");
    expect(record.sleep_quality).toBe("excellent");
    expect(record.stress_level).toBe("high");
    expect(record.health_issues).toBe("mild");
    expect(record.occupation).toBe("healthcare");
  });

  it("converts 0/1 flags to booleans", () => {
    const { record } = normalizeCoffeeHealthRow({
      ...validRaw,
      Smoking: "1",
      Alcohol_Consumption: "0",
    });

    expect(record.smoking).toBe(true);
    expect(record.alcohol_consumption).toBe(false);
  });

  it("rejects invalid enum values with row context", () => {
    expect(() =>
      normalizeCoffeeHealthRow(
        { ...validRaw, Gender: "Unknown" },
        { rowNumber: 42 },
      ),
    ).toThrow(IngestionValidationError);

    try {
      normalizeCoffeeHealthRow(
        { ...validRaw, Gender: "Unknown" },
        { rowNumber: 42 },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(IngestionValidationError);
      expect((error as IngestionValidationError).toDetail()).toContain("row 42");
      expect((error as IngestionValidationError).field).toBe("Gender");
    }
  });

  it("rejects non-binary smoking values", () => {
    expect(() =>
      normalizeCoffeeHealthRow({ ...validRaw, Smoking: "2" }),
    ).toThrow(IngestionValidationError);
  });
});

describe("parseBinaryFlag", () => {
  it("maps 0 and 1 to false and true", () => {
    expect(parseBinaryFlag("0", "Smoking")).toBe(false);
    expect(parseBinaryFlag("1", "Smoking")).toBe(true);
  });
});

describe("toCanonicalCategory", () => {
  it("lowercases and validates against allowed set", () => {
    const allowed = new Set(["canada", "usa"]);
    expect(toCanonicalCategory("Canada", "Country", allowed)).toBe("canada");
  });
});

describe("normalizeCoffeeHealthBatch", () => {
  it("collects errors without aborting the whole batch", () => {
    const { records, errors } = normalizeCoffeeHealthBatch([
      validRaw,
      { ...validRaw, ID: "2", Country: "Narnia" },
    ]);

    expect(records).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});
