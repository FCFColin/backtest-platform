import { isValidTicker } from '../../utils/tickerValidation.js';

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainValidationError';
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

// 与 data-fetcher / utils.isValidTicker 同一口径（允许 - _ . 最长 20 位），避免领域层更严口径误杀合法标的（如 BRK-B）
export class Ticker {
  private constructor(public readonly value: string) {}

  static create(value: string): Ticker {
    const upper = value.toUpperCase().trim();
    if (!isValidTicker(upper)) {
      throw new DomainValidationError(`Invalid ticker: ${value}`);
    }
    return new Ticker(upper);
  }

  toString(): string {
    return this.value;
  }
}
