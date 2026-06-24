export class Weight {
  private constructor(public readonly value: number) {
    if (value < 0 || value > 1) throw new Error(`Weight must be between 0 and 1: ${value}`);
  }

  static create(value: number): Weight {
    return new Weight(value);
  }

  equals(other: Weight): boolean {
    return Math.abs(this.value - other.value) < 1e-10;
  }
}
