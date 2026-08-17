export function Navigate({ to }: { to: string }) {
  return <div data-testid="navigate">{to}</div>;
}
export function Link({ to, children }: { to: string; children: React.ReactNode }) {
  return <a href={to}>{children}</a>;
}
export function useLocation() {
  return { pathname: '/test', search: '', hash: '' };
}
export function useNavigate() {
  return () => {};
}
