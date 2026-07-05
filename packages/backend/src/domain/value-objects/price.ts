export class Price {
  private constructor(
    public readonly value: number,
    public readonly currency: string = 'CNY',
  ) {
    if (value < 0) throw new Error(`Price cannot be negative: ${value}`);
  }

  static create(value: number, currency?: string): Price {
    return new Price(value, currency);
  }

  equals(other: Price): boolean {
    return this.value === other.value && this.currency === other.currency;
  }
}
