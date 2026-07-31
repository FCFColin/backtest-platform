const FETCH_TIMEOUT_MS = 10_000;
let accessToken = '';
export function getAccessToken(): string {
  return accessToken;
}
export function setTokens(access: string): void {
  accessToken = access;
}
export function clearTokens(): void {
  accessToken = '';
}
let inflightRefresh: Promise<boolean> | null = null;
export function refreshTokens(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const body = await res.json();
      const data = body?.data;
      if (data?.accessToken) {
        setTokens(data.accessToken);
        return true;
      }
      clearTokens();
      return false;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}
