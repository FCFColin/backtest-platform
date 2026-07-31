import { useEffect, type ReactNode } from 'react';
import { loadNamespace } from '../i18n/index.js';
export default function NsBoundary({ ns, children }: { ns: string; children: ReactNode }) {
  useEffect(() => {
    loadNamespace(ns).catch(() => {});
  }, [ns]);
  return <>{children}</>;
}
