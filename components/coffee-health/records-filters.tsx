import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLabel } from "@/lib/coffee-health/format";
import type { CoffeeHealthFilters } from "@/lib/coffee-health/search-params";
import {
  COUNTRIES,
  GENDERS,
  SLEEP_QUALITIES,
  STRESS_LEVELS,
} from "@/lib/ingestion/constants";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
);

interface RecordsFiltersProps {
  filters: CoffeeHealthFilters;
  /** Path the form submits to (e.g. "/"). Omit for current URL. */
  action?: string;
}

export function RecordsFilters({ filters, action }: RecordsFiltersProps) {
  const clearHref = action ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="GET"
          {...(action !== undefined ? { action } : {})}
          className="space-y-6"
        >
          <input type="hidden" name="page" value="1" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <select
                id="country"
                name="country"
                defaultValue={filters.country ?? ""}
                className={selectClassName}
              >
                <option value="">All</option>
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {formatLabel(country)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                name="gender"
                defaultValue={filters.gender ?? ""}
                className={selectClassName}
              >
                <option value="">All</option>
                {GENDERS.map((gender) => (
                  <option key={gender} value={gender}>
                    {formatLabel(gender)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sleep_quality">Sleep quality</Label>
              <select
                id="sleep_quality"
                name="sleep_quality"
                defaultValue={filters.sleep_quality ?? ""}
                className={selectClassName}
              >
                <option value="">All</option>
                {SLEEP_QUALITIES.map((quality) => (
                  <option key={quality} value={quality}>
                    {formatLabel(quality)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stress_level">Stress level</Label>
              <select
                id="stress_level"
                name="stress_level"
                defaultValue={filters.stress_level ?? ""}
                className={selectClassName}
              >
                <option value="">All</option>
                {STRESS_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {formatLabel(level)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age_min">Age min</Label>
              <Input
                id="age_min"
                name="age_min"
                type="number"
                min={0}
                step={1}
                defaultValue={filters.age_min ?? ""}
                placeholder="Min"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="age_max">Age max</Label>
              <Input
                id="age_max"
                name="age_max"
                type="number"
                min={0}
                step={1}
                defaultValue={filters.age_max ?? ""}
                placeholder="Max"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bmi_min">BMI min</Label>
              <Input
                id="bmi_min"
                name="bmi_min"
                type="number"
                min={0}
                step={0.1}
                defaultValue={filters.bmi_min ?? ""}
                placeholder="Min"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bmi_max">BMI max</Label>
              <Input
                id="bmi_max"
                name="bmi_max"
                type="number"
                min={0}
                step={0.1}
                defaultValue={filters.bmi_max ?? ""}
                placeholder="Max"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coffee_intake_min">Coffee intake min</Label>
              <Input
                id="coffee_intake_min"
                name="coffee_intake_min"
                type="number"
                min={0}
                step={0.1}
                defaultValue={filters.coffee_intake_min ?? ""}
                placeholder="Min"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coffee_intake_max">Coffee intake max</Label>
              <Input
                id="coffee_intake_max"
                name="coffee_intake_max"
                type="number"
                min={0}
                step={0.1}
                defaultValue={filters.coffee_intake_max ?? ""}
                placeholder="Max"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit">Apply filters</Button>
            <Button type="button" variant="outline" asChild>
              <Link href={clearHref}>Clear Filters</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
