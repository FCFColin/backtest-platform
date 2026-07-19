import type { ReactNode, ComponentType } from 'react';

export interface PresetButtonProps {
  label: string;
  onClick: () => void;
}

export interface SeoFeature {
  titleKey: string;
  descKey: string;
}

export interface RelatedTool {
  titleKey: string;
  href: string;
}

export interface ComputeToolConfig<S> {
  titleKey: string;
  seoDescKey?: string;
  seoFeatures?: SeoFeature[];
  relatedTools?: RelatedTool[];
  presets?: (state: S) => PresetButtonProps[];
  params: ComponentType<{ state: S }>;
  results?: ComponentType<{ state: S }>;
  extra?: ComponentType<{ state: S }>;
}

export interface StandardPageConfig {
  titleKey: string;
  breadcrumbs?: { label: string; href?: string }[];
  headerExtra?: ReactNode;
}
