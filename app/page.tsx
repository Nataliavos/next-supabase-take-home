import { Suspense } from "react";

import { RecordsFilters } from "@/components/coffee-health/records-filters";
import { RecordsPagination } from "@/components/coffee-health/records-pagination";
import { RecordsTable } from "@/components/coffee-health/records-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchCoffeeHealthRecords } from "@/lib/coffee-health/queries";
import {
  parseSearchParams,
  type CoffeeHealthSearchParamsInput,
} from "@/lib/coffee-health/search-params";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<CoffeeHealthSearchParamsInput>;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Coffee Health Records
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Explore synthetic health and coffee consumption data. Filter by
            demographics, sleep quality, stress level, and numeric ranges. Results
            are loaded from Supabase with server-side filtering and pagination.
          </p>
        </header>

        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading records…</p>
          }
        >
          <CoffeeHealthRecordsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function CoffeeHealthRecordsContent({
  searchParams,
}: {
  searchParams: Promise<CoffeeHealthSearchParamsInput>;
}) {
  const filters = parseSearchParams(await searchParams);
  const { rows, totalCount, pageSize } =
    await fetchCoffeeHealthRecords(filters);

  const page = filters.page;
  const rangeStart =
    totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = rangeStart + rows.length - 1;

  return (
    <div className="flex flex-col gap-6">
      <RecordsFilters filters={filters} action="/" />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-lg">Results</CardTitle>
            <CardDescription>
              {totalCount === 0
                ? "No records match the selected filters."
                : rows.length === 1
                  ? `Showing ${rangeStart} of ${totalCount.toLocaleString()} matching records`
                  : `Showing ${rangeStart}–${rangeEnd} of ${totalCount.toLocaleString()} matching records`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Page {page}</Badge>
            {totalCount > 0 && (
              <Badge variant="outline">
                {totalCount.toLocaleString()} total
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <RecordsTable rows={rows} clearFiltersHref="/" />
          {totalCount > 0 && (
            <RecordsPagination
              filters={filters}
              totalCount={totalCount}
              pageSize={pageSize}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
