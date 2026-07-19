interface AsyncSlice {
  loading: boolean;
  error: string | null;
}

export function asyncStart(): Partial<AsyncSlice> {
  return { loading: true, error: null };
}

export function asyncFail(error: unknown): Partial<AsyncSlice> {
  return { loading: false, error: String(error) };
}

export function asyncSuccess(): Partial<AsyncSlice> {
  return { loading: false, error: null };
}
