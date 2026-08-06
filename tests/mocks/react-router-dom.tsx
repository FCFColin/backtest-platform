export function Navigate({ to }: { to: string }) {
  return <div data-testid="navigate">{to}</div>;
}

export function useLocation() {
  return { pathname: '/test' };
}

export function useNavigate() {
  return () => {};
}
