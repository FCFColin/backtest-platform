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
  desc: string;
  features: ToolSeoFeature[];
  related?: ToolSeoRelatedLink[];
  relatedLabel?: string;
}

export function ToolSeoCard({ desc, features, related, relatedLabel }: ToolSeoCardProps) {
  const { t } = useTranslation();
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">{desc}</p>
      <div className="bt-seo-features">
        {features.map((feature) => (
          <div className="bt-seo-feature" key={feature.title}>
            <div className="bt-seo-feature-title">{feature.title}</div>
            <div className="bt-seo-feature-desc">{feature.desc}</div>
          </div>
        ))}
      </div>
      {related && related.length > 0 && (
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">
            {relatedLabel ?? t('layout.toolSeoCard.relatedTools')}
          </span>
          {related.map((link, i) => (
            <span key={link.href}>
              {i > 0 && <span style={{ color: 'var(--text-muted)' }}> · </span>}
              <Link to={link.href} className="link-blue" style={{ fontWeight: 700 }}>
                {link.title}
              </Link>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
