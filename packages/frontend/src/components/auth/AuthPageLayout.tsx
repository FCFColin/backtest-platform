import type { CSSProperties, ReactNode } from 'react';
import { BrandIconBadge } from './formFields.js';
interface AuthPageLayoutProps {
  icon?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  centered?: boolean;
}
export default function AuthPageLayout({ icon, title, children, footer, maxWidth = 420, centered = false }: AuthPageLayoutProps) {
  const cardStyle: CSSProperties = centered ? { padding: 28, marginTop: 40, textAlign: 'center' } : { padding: 28, marginTop: 40 };
  return (
    <div className="bt-page" style={{ maxWidth, margin: '0 auto' }}>
      <div className="bt-main-card card" style={cardStyle}>
        {centered ? (
          <>
            {icon}
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-strong)',
                ...(icon ? { marginBottom: 8 } : {})
              }}
            >
              {title}
            </h1>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            {icon && <BrandIconBadge icon={icon} />}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{title}</h1>
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>{footer}</div>}
      </div>
    </div>
  );
}
