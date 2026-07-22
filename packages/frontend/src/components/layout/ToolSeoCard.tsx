import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ToolSeoFeature {
  title: string;
  desc: string;
}

interface ToolSeoRelatedLink {
  title: string;
  href: string;
}

interface ToolSeoCardProps {
  subtitle?: string;
  desc: ReactNode;
  features: ToolSeoFeature[];
  related?: ToolSeoRelatedLink[];
  relatedLabel?: string;
}

export function ToolSeoCard({ subtitle, desc, features, related, relatedLabel }: ToolSeoCardProps) {
  const { t } = useTranslation();

  const renderDesc = () => {
    if (typeof desc === 'string') {
      return desc
        .split('\n\n')
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className="bt-seo-desc">
            {paragraph}
          </p>
        ));
    }
    return <div className="bt-seo-desc">{desc}</div>;
  };

  return (
    <div className="bt-seo-card card">
      {subtitle && <h2 className="bt-seo-subtitle">{subtitle}</h2>}
      {renderDesc()}
      <div className="bt-seo-columns">
        {features.map((feature) => (
          <div className="bt-seo-column" key={feature.title}>
            <div className="bt-seo-column-title">{feature.title}</div>
            <div className="bt-seo-column-desc">{feature.desc}</div>
          </div>
        ))}
        {related && related.length > 0 && (
          <div className="bt-seo-column">
            <div className="bt-seo-column-title">
              {relatedLabel ?? t('layout.toolSeoCard.relatedTools')}
            </div>
            <div className="bt-seo-column-desc">
              {related.map((link, i) => (
                <span key={link.href}>
                  {i > 0 && <span className="bt-seo-link-separator"> · </span>}
                  <Link to={link.href} className="bt-seo-link">
                    {link.title}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
