/**
 * @file NavIconButton & NavIconLink — tiny presentational components for the navbar toolbar
 */
import { type ReactNode, type MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';

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
    <button onClick={onClick} title={title} className="navbar-icon-btn">
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
    <Link to={to} title={title} className={`navbar-icon-link${isBrand ? ' brand' : ''}`}>
      {children}
    </Link>
  );
}
