import { type SVGProps } from 'react';
const ICON_BASE = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
export function BarChart3(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
export function Check(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function ChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
export function Loader2(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
export function Play(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}
