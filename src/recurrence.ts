import type { Income } from './types';

export type Frequency = 'weekly' | 'biweekly' | 'bimonthly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type AmountScope = 'once' | 'forward';
export type DeleteScope = 'once' | 'forward' | 'all';

export interface PaycheckPeriod {
  lastPaycheck: Date | null;
  nextPaycheck: Date | null;
  nextPayAmount: number;
}

export interface AmountAdjustable {
  amount: number;
  // One-time amounts keyed by occurrence date (YYYY-MM-DD)
  overrides?: Record<string, number>;
  // New base amounts that apply from the given date onward
  amountSchedule?: Array<{ from: string; amount: number }>;
  skipped?: string[];
}

export const FREQUENCIES: Frequency[] = ['weekly', 'biweekly', 'bimonthly', 'monthly', 'quarterly', 'semiannual', 'annual'];

export const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export function stepDate(current: Date, frequency: string) {
  if (frequency === 'weekly') current.setDate(current.getDate() + 7);
  else if (frequency === 'biweekly') current.setDate(current.getDate() + 14);
  else if (frequency === 'bimonthly') current.setMonth(current.getMonth() + 2);
  else if (frequency === 'monthly') current.setMonth(current.getMonth() + 1);
  else if (frequency === 'quarterly') current.setMonth(current.getMonth() + 3);
  else if (frequency === 'semiannual') current.setMonth(current.getMonth() + 6);
  else if (frequency === 'annual') current.setFullYear(current.getFullYear() + 1);
  else current.setMonth(current.getMonth() + 1);
}

// Amount that applies to the occurrence on the given date
export function amountFor(item: AmountAdjustable, date: Date): number {
  const key = dateKey(date);
  const override = item.overrides?.[key];
  if (override !== undefined) return override;
  let amount = item.amount;
  let latest = '';
  (item.amountSchedule || []).forEach(entry => {
    if (entry.from <= key && entry.from >= latest) {
      latest = entry.from;
      amount = entry.amount;
    }
  });
  return amount;
}

export function applyAmountChange<T extends AmountAdjustable>(item: T, date: Date, newAmount: number, scope: AmountScope): T {
  const key = dateKey(date);
  if (scope === 'once') {
    return { ...item, overrides: { ...(item.overrides || {}), [key]: newAmount } };
  }
  // Going forward supersedes any later schedule entries and one-time overrides
  const overrides = Object.fromEntries(Object.entries(item.overrides || {}).filter(([k]) => k < key));
  const schedule = (item.amountSchedule || []).filter(entry => entry.from < key);
  schedule.push({ from: key, amount: newAmount });
  return { ...item, overrides, amountSchedule: schedule };
}

// First occurrence on or after `from`, stepping from `startDate` by `frequency`
export function firstOccurrenceOnOrAfter(startDate: string, frequency: string, from: Date): Date {
  const current = new Date(startDate);
  const floor = new Date(dateKey(from));
  let guard = 0;
  while (current < floor && guard++ < 5000) stepDate(current, frequency);
  return current;
}

export function isSkipped(item: { skipped?: string[] }, date: Date): boolean {
  return !!item.skipped && item.skipped.includes(dateKey(date));
}

export function getPaycheckPeriod(incomes: Income[], now = new Date()): PaycheckPeriod {
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let lastPaycheck: Date | null = null;
  let nextPaycheck: Date | null = null;
  let nextPayAmount = 0;

  incomes.filter(item => item.isPaycheck).forEach(item => {
    const current = new Date(item.startDate);
    if (Number.isNaN(current.getTime())) return;
    let guard = 0;

    while ((!item.endDate || dateKey(current) <= item.endDate) && guard++ < 5000) {
      if (!isSkipped(item, current)) {
        const key = dateKey(current);
        if (key <= todayKey) {
          if (!lastPaycheck || key > dateKey(lastPaycheck)) lastPaycheck = new Date(current);
        } else {
          if (!nextPaycheck || key < dateKey(nextPaycheck)) {
            nextPaycheck = new Date(current);
            nextPayAmount = amountFor(item, current);
          } else if (key === dateKey(nextPaycheck)) {
            nextPayAmount += amountFor(item, current);
          }
          break;
        }
      }

      if (!item.isRecurring) break;
      stepDate(current, item.frequency);
    }
  });

  return { lastPaycheck, nextPaycheck, nextPayAmount };
}

// Returns the updated item, or null when nothing is left of the series
export function applyDelete<T extends AmountAdjustable & { startDate: string; endDate?: string }>(item: T, date: Date, scope: DeleteScope): T | null {
  const key = dateKey(date);
  if (scope === 'all') return null;
  if (scope === 'once') return { ...item, skipped: [...(item.skipped || []), key] };
  if (key <= item.startDate.slice(0, 10)) return null;
  const dayBefore = dateKey(new Date(date.getTime() - 86400000));
  const endDate = item.endDate && item.endDate < dayBefore ? item.endDate : dayBefore;
  return { ...item, endDate };
}
