export class DomainValidationError extends Error {
  readonly field?: string;
  readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message);
    this.name = 'DomainValidationError';
    this.field = field;
    this.value = value;
  }
}

export class Weight {
  private constructor(public readonly value: number) {
    if (value < 0 || value > 100) {
      throw new DomainValidationError(`Weight must be between 0 and 100 (percent): ${value}`);
    }
  }

  static create(value: number): Weight {
    return new Weight(value);
  }
}

const DOMAIN_TICKER_PATTERN = /^[A-Z0-9]{1,10}(\.[A-Z]{2})?$/;

export class Ticker {
  private constructor(public readonly value: string) {}

  static create(value: string): Ticker {
    const upper = value.toUpperCase().trim();
    if (!DOMAIN_TICKER_PATTERN.test(upper)) {
      throw new DomainValidationError(`Invalid ticker: ${value}`);
    }
    return new Ticker(upper);
  }

  toString(): string {
    return this.value;
  }
}
