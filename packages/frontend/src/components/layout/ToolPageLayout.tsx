import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Card } from '@/components/ui/uiComponents';
interface StaticPageShellProps {
  title: string;
  cardClassName?: string;
  titleClassName?: string;
  children: ReactNode;
}
export function StaticPageShell({
  title,
  cardClassName = 'p-6',
  titleClassName = 'text-display',
  children,
}: StaticPageShellProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className={`${titleClassName} text-fg`}>{title}</h1>
      <Card className={cardClassName}>{children}</Card>
    </div>
  );
}
interface ToolPageLayoutProps {
  params: ReactNode;
  results?: ReactNode;
  afterParams?: ReactNode;
  title?: string;
  actions?: ReactNode;
}
export function ToolPageLayout({
  params,
  results,
  afterParams,
  title,
  actions,
}: ToolPageLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <Card id="parameters" className="scroll-mt-32 p-5">
        {title && (
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-body font-semibold text-fg">{title}</h2>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
        <div className="w-full">{params}</div>
      </Card>
      {afterParams}
      {results && (
        <div id="results" className="scroll-mt-32">
          <div className="w-full">{results}</div>
        </div>
      )}
    </div>
  );
}
interface ToolSeoCardProps {
  subtitle?: string;
  desc: ReactNode;
  features: { title: string; desc: string }[];
  related?: { title: string; href: string }[];
  relatedLabel?: string;
}
export function ToolSeoCard({ subtitle, desc, features, related, relatedLabel }: ToolSeoCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="mb-3 p-5">
      {subtitle && <h2 className="mb-3 text-h3 font-medium text-fg-secondary">{subtitle}</h2>}
      {typeof desc === 'string' ? (
        desc
          .split('\n\n')
          .filter(Boolean)
          .map((paragraph, i) => (
            <p key={i} className="mb-3 text-body leading-relaxed text-fg-secondary last:mb-5">
              {paragraph}
            </p>
          ))
      ) : (
        <div className="mb-5 text-body leading-relaxed text-fg-secondary">{desc}</div>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="min-w-0">
            <div className="mb-1.5 flex items-center gap-1.5 text-label font-semibold text-fg">
              <Check className="size-3.5 shrink-0 text-success" />
              {feature.title}
            </div>
            <div className="text-label leading-relaxed text-fg-tertiary">{feature.desc}</div>
          </div>
        ))}
        {related && related.length > 0 && (
          <div className="min-w-0">
            <div className="mb-1.5 text-label font-semibold text-fg">
              {relatedLabel ?? t('Related Tools:')}
            </div>
            <div className="text-label leading-relaxed text-fg-tertiary">
              {related.map((link, i) => (
                <span key={link.href}>
                  {i > 0 && <span className="text-fg-tertiary"> · </span>}
                  <Link
                    to={link.href}
                    className="font-medium text-brand transition-colors duration-150 ease-out-quart hover:text-brand-hover"
                  >
                    {link.title}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
