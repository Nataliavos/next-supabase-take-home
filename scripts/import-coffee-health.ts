/**
 * Load synthetic_coffee_health_10000.csv into coffee_health_records.
 *
 * Pipeline: CSV → validation/normalization (lib/ingestion) → batched Supabase upsert
 *
 * Usage:
 *   pnpm import:coffee
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  IngestionValidationError,
  normalizeCoffeeHealthBatch,
  parseCsvLine,
  rawRowFromValues,
  type CoffeeHealthRecord,
  type RawCoffeeHealthCsvRow,
} from "../lib/ingestion";

const BATCH_SIZE = 500;
const CSV_PATH = resolve(
  process.cwd(),
  "data/synthetic_coffee_health_10000.csv",
);

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function readCsvRows(filePath: string): RawCoffeeHealthCsvRow[] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error(`CSV file is empty or missing data rows: ${filePath}`);
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => rawRowFromValues(headers, parseCsvLine(line)));
}

async function upsertBatch(
  supabase: SupabaseClient,
  records: CoffeeHealthRecord[],
): Promise<void> {
  const { error } = await supabase
    .from("coffee_health_records")
    .upsert(records as never, { onConflict: "id" });
  if (error) {
    throw new Error(`Upsert failed: ${error.message}`);
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local",
    );
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Reading ${CSV_PATH}...`);
  const rawRows = readCsvRows(CSV_PATH);
  console.log(`Parsed ${rawRows.length} data rows`);

  const { records, errors } = normalizeCoffeeHealthBatch(rawRows);

  if (errors.length > 0) {
    console.error(`Validation failed for ${errors.length} row(s):`);
    for (const err of errors.slice(0, 10)) {
      console.error(
        err instanceof IngestionValidationError ? err.toDetail() : err,
      );
    }
    if (errors.length > 10) {
      console.error(`... and ${errors.length - 10} more`);
    }
    process.exit(1);
  }

  console.log(`Normalized ${records.length} records; upserting in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await upsertBatch(supabase, batch);
    console.log(`  upserted ${Math.min(i + BATCH_SIZE, records.length)} / ${records.length}`);
  }

  const { count, error: countError } = await supabase
    .from("coffee_health_records")
    .select("*", { count: "exact", head: true });

  if (countError) {
    throw new Error(`Count verification failed: ${countError.message}`);
  }

  console.log(`Done. coffee_health_records row count: ${count}`);
  if (count !== records.length) {
    console.warn(
      `Warning: expected ${records.length} rows but database reports ${count}`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
