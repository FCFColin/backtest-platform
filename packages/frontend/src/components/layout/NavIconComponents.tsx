/**
 * @file NavIconButton & NavIconLink — tiny presentational components for the navbar toolbar
 */
import { type ReactNode, type MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';

const iconButtonBase: React.CSSProperties = {
  color: 'var(--text-muted)',
  borderRadius: 14,
  height: 44,
  minWidth: 44,
  background: 'transparent',
  cursor: 'pointer',
};

export function NavIconButton({
  onClick,
  title,
  children,
}: {
  onClick: MouseEventHandler;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex flex-col items-center justify-center px-2.5 no-underline transition-colors"
      style={{ ...iconButtonBase, border: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );
}

export function NavIconLink({
  to,
  title,
  variant,
  children,
}: {
  to: string;
  title: string;
  variant?: 'brand';
  children: ReactNode;
}) {
  const isBrand = variant === 'brand';
  return (
    <Link
      to={to}
      title={title}
      className={`flex flex-col items-center justify-center px-2.5 no-underline transition-colors ${isBrand ? 'text-white' : ''}`}
      style={{
        ...iconButtonBase,
        backgroundColor: isBrand ? 'var(--brand)' : undefined,
        borderRadius: 14,
        height: 44,
        minWidth: 44,
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isBrand ? 'var(--brand-hover)' : 'var(--bg-subtle)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isBrand ? 'var(--brand)' : 'transparent';
      }}
    >
      {children}
    </Link>
  );
}
