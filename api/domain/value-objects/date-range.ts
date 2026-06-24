export class DateRange {
  private constructor(public readonly start: Date, public readonly end: Date) {
    if (start > end) throw new Error(`Start date must be before end date`);
  }

  static create(start: Date, end: Date): DateRange {
    return new DateRange(start, end);
  }

  get tradingDays(): number {
    // Simplified: actual trading days would exclude weekends and holidays
    const diff = this.end.getTime() - this.start.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}
