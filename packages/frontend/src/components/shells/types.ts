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
  seoSubtitleKey?: string;
  seoDescKey?: string;
  seoFeatures?: SeoFeature[];
  relatedTools?: RelatedTool[];
  presets?: (state: S) => PresetButtonProps[];
  params: ComponentType<{ state: S }>;
  results?: ComponentType<{ state: S }>;
  afterParams?: ComponentType<{ state: S }>;
  extra?: ComponentType<{ state: S }>;
  hideParamsTitle?: boolean;
  paramsTitleKey?: string;
  paramsTitle?: string;
}

export interface StandardPageConfig {
  titleKey: string;
  breadcrumbs?: { label: string; href?: string }[];
  headerExtra?: ReactNode;
}
