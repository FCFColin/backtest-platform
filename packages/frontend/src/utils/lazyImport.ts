import { lazy, type ComponentType } from 'react';
export const lazyNamed = (importer: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() =>
    importer().then((m) => ({ default: m[name] as ComponentType<Record<string, unknown>> })),
  );
