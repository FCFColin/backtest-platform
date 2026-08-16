// CSP 头由 app.ts 与 ssrMiddleware 共用：SSR 缓存命中时须复用渲染时 nonce（缓存 HTML 内联脚本带该 nonce），
// 否则每次请求都换新 nonce 会导致缓存命中页面的全部内联脚本被 CSP 拦截
export function buildCspHeader(nonce: string, includeNonce = true): string {
  const scriptSrc = includeNonce ? `'self' 'nonce-${nonce}'` : "'self'";
  return `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';`;
}
