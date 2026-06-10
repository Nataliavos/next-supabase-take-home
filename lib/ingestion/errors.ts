export class IngestionValidationError extends Error {
  readonly rowNumber: number | undefined;
  readonly field: string;
  readonly rawValue: string | undefined;

  constructor(
    message: string,
    options: { rowNumber?: number; field: string; rawValue?: string },
  ) {
    super(message);
    this.name = "IngestionValidationError";
    this.rowNumber = options.rowNumber;
    this.field = options.field;
    this.rawValue = options.rawValue;
  }

  toDetail(): string {
    const location =
      this.rowNumber !== undefined ? `row ${this.rowNumber}` : "unknown row";
    const value =
      this.rawValue !== undefined ? ` (received: ${JSON.stringify(this.rawValue)})` : "";
    return `[${location}] ${this.field}: ${this.message}${value}`;
  }
}
