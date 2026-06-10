import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildFilterSearchParams,
  type CoffeeHealthFilters,
} from "@/lib/coffee-health/search-params";

interface RecordsPaginationProps {
  filters: CoffeeHealthFilters;
  totalCount: number;
  pageSize: number;
  /** Base path for pagination links (e.g. "/"). Defaults to current route. */
  basePath?: string;
}

function buildPageHref(filters: CoffeeHealthFilters, page: number): string {
  const query = buildFilterSearchParams(filters, page).toString();
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
