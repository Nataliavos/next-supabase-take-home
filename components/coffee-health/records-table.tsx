import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBoolean, formatDecimal, formatLabel } from "@/lib/coffee-health/format";
import type { CoffeeHealthRecord } from "@/lib/ingestion/types";

interface RecordsTableProps {
  rows: CoffeeHealthRecord[];
  clearFiltersHref?: string;
}

export function RecordsTable({
  rows,
  clearFiltersHref = "/",
}: RecordsTableProps) {
  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <CardTitle className="text-base">No matching records</CardTitle>
          <CardDescription>
            No records matched the selected filters. Try adjusting your criteria
            or clear all filters to start over.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Button variant="outline" asChild>
            <Link href={clearFiltersHref}>Clear Filters</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Coffee intake</TableHead>
            <TableHead>Sleep quality</TableHead>
            <TableHead>Stress level</TableHead>
            <TableHead>BMI</TableHead>
            <TableHead>Sleep hours</TableHead>
            <TableHead>Heart rate</TableHead>
            <TableHead>Occupation</TableHead>
            <TableHead>Health issues</TableHead>
            <TableHead>Smoking</TableHead>
            <TableHead>Alcohol</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.id}</TableCell>
              <TableCell>{row.age}</TableCell>
              <TableCell>
                <Badge variant="secondary">{formatLabel(row.gender)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{formatLabel(row.country)}</Badge>
              </TableCell>
              <TableCell>{formatDecimal(row.coffee_intake)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{formatLabel(row.sleep_quality)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{formatLabel(row.stress_level)}</Badge>
              </TableCell>
              <TableCell>{formatDecimal(row.bmi)}</TableCell>
              <TableCell>{formatDecimal(row.sleep_hours)}</TableCell>
              <TableCell>{row.heart_rate}</TableCell>
              <TableCell>
                <Badge variant="secondary">{formatLabel(row.occupation)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{formatLabel(row.health_issues)}</Badge>
              </TableCell>
              <TableCell>{formatBoolean(row.smoking)}</TableCell>
              <TableCell>{formatBoolean(row.alcohol_consumption)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
