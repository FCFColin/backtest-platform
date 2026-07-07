export function Navigate({ to }: { to: string }) {
  return <div data-testid="navigate">{to}</div>;
}

export function useLocation() {
  return { pathname: '/test' };
}

export function MemoryRouter({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useNavigate() {
  return () => {};
}
