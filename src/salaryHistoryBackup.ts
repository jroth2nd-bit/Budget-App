import type { IncomeHistoryData, IncomeHistoryEntry } from './types';

export const SALARY_BACKUP_APP = 'budget-app-salary-history';
const FULL_BACKUP_APP = 'budget-app-backup';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isEntry(value: unknown): value is IncomeHistoryEntry {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveDate)
    || typeof value.employer !== 'string' || typeof value.title !== 'string' || typeof value.notes !== 'string'
    || !isNonNegativeNumber(value.annualIncome)
    || (value.age !== undefined && (!isNonNegativeNumber(value.age) || !Number.isInteger(value.age) || value.age > 130))) {
    return false;
  }
  const date = new Date(`${value.effectiveDate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.effectiveDate;
}

export function parseSalaryHistoryBackup(value: unknown): IncomeHistoryData {
  if (!isRecord(value) || (value.app !== SALARY_BACKUP_APP && value.app !== FULL_BACKUP_APP) || value.version !== 1) {
    throw new Error('Choose a supported Salary History export or Budget App backup.');
  }
  const history = value.incomeHistory;
  if (!isRecord(history) || !Array.isArray(history.entries) || !isRecord(history.annualGoals)
    || !history.entries.every(isEntry)
    || !Object.entries(history.annualGoals).every(([year, amount]) => /^\d{4}$/.test(year) && isNonNegativeNumber(amount))) {
    throw new Error('The file has missing or invalid salary history or annual goals.');
  }
  const entries = history.entries;
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    throw new Error('The file contains duplicate salary entry IDs.');
  }
  const annualGoals: Record<string, number> = {};
  for (const [year, amount] of Object.entries(history.annualGoals)) {
    if (!isNonNegativeNumber(amount)) throw new Error('The file has an invalid annual goal.');
    annualGoals[year] = amount;
  }
  return { entries, annualGoals };
}
