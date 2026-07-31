import type { ReactNode } from 'react';
import { Card } from '@/components/ui/uiComponents';
export interface LegalSection {
  title: string;
  body: string[];
}
interface LegalPageLayoutProps {
  title: string;
  lastUpdated?: string;
  intro?: string;
  sections: LegalSection[];
  children?: ReactNode;
}
export default function LegalPageLayout({ title, lastUpdated, intro, sections, children }: LegalPageLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{title}</h1>
      {lastUpdated && <p className="text-caption text-fg-tertiary">{lastUpdated}</p>}
      <Card className="p-6">
        {intro && <p className="mb-6 text-body leading-loose text-fg-secondary">{intro}</p>}
        <div className="flex flex-col gap-6">
          {sections.map((section, idx) => (
            <section key={idx}>
              <h2 className="mb-2 text-h3 font-bold text-fg">{section.title}</h2>
              {section.body.map((paragraph, pIdx) => (
                <p key={pIdx} className="mb-2 text-body leading-loose text-fg-secondary last:mb-0">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
        {children}
      </Card>
    </div>
  );
}
