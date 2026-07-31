import type { TFunction } from 'i18next';
export function validateDateChange(field: 'startDate' | 'endDate', value: string, otherDate: string, t: TFunction): string | null {
  if (!value) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (field === 'endDate' && value > today) return t('params.endDateAfterToday');
  if (field === 'startDate' && otherDate && value > otherDate) return t('params.startDateAfterEnd');
  if (field === 'endDate' && otherDate && value < otherDate) return t('params.endDateBeforeStart');
  return null;
}
