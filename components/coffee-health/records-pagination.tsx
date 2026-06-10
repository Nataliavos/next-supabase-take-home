import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CoffeeHealthFilters } from "@/lib/coffee-health/search-params";

interface RecordsPaginationProps {
  filters: CoffeeHealthFilters;
  totalCount: number;
  pageSize: number;
  /** Base path for pagination links (e.g. "/"). Defaults to current route. */
  basePath?: string;
}

function buildPageHref(filters: CoffeeHealthFilters, page: number): string {
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
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function RecordsPagination({
  filters,
  totalCount,
  pageSize,
  basePath = "",
}: RecordsPaginationProps) {
  const page = filters.page;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  const previousHref = `${basePath}${buildPageHref(filters, page - 1)}`;
  const nextHref = `${basePath}${buildPageHref(filters, page + 1)}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasPrevious ? (
        <Button variant="outline" asChild>
          <Link href={previousHref}>Previous</Link>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          Previous
        </Button>
      )}

      <Badge variant="secondary">
        Page {page} of {totalPages}
      </Badge>
      <Badge variant="outline">{totalCount.toLocaleString()} records</Badge>

      {hasNext ? (
        <Button variant="outline" asChild>
          <Link href={nextHref}>Next</Link>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          Next
        </Button>
      )}
    </div>
  );
}
