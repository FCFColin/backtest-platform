// CSP 头由 app.ts 全局中间件统一设置（页面响应带 per-request nonce）。
// v3.2 纯 SPA 收敛后不再有 SSR 缓存命中场景，nonce 复用逻辑随之移除。
export function buildCspHeader(nonce: string, includeNonce = true): string {
  const scriptSrc = includeNonce ? `'self' 'nonce-${nonce}'` : "'self'";
  return `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';`;
}
