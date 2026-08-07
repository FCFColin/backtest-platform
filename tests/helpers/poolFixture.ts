export function createWithTransactionMock(getClient: () => unknown) {
  return async <T>(fn: (client: unknown) => Promise<T>): Promise<T> => {
    const client = (await getClient()) as {
      query: (...args: unknown[]) => Promise<unknown>;
      release: () => void;
    };
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
}
