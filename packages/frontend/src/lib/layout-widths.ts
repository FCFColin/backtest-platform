export const INPUT_WIDTHS = {
  ticker: 'w-[220px]',
  weight: 'w-[100px]',
  percent: 'w-[100px]',
  currency: 'w-[180px]',
  currencyLong: 'w-[220px]',
  date: 'w-[180px]',
  integer: 'w-[120px]',
  ratio: 'w-[120px]',
  select: 'w-[220px]',
  selectShort: 'w-[140px]',
  search: 'w-[320px]'
} as const;
export const CARD_WIDTHS = {
  portfolio: { min: 320, max: 460 },
  cashflow: { min: 300, max: 400 },
  saved: { min: 260, max: 340 },
  metric: { min: 200, max: 260 },
  hero: { min: 300, max: 400 }
} as const;
export const CARD_GRID_CLASSES = {
  portfolio: 'grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4',
  cashflow: 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4',
  saved: 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3',
  metric: 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3',
  hero: 'grid grid-cols-1 md:grid-cols-3 gap-6'
} as const;
export const CONTAINER_WIDTHS = {
  page: 'max-w-[1440px] mx-auto px-6',
  content: 'max-w-[1280px] mx-auto',
  narrow: 'max-w-[860px] mx-auto',
  form: 'max-w-[720px] mx-auto'
} as const;
