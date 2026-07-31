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
  strokeLinejoin: 'round'
} as const;
export function AlertCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}
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
export function Database(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}
export function Info(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
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
export function Plus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
export function X(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_BASE} {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
