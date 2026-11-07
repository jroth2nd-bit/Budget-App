
import React, { useRef, useState } from 'react';
import ImportData from './ImportData';
import LowBalanceThresholdInput from './LowBalanceThresholdInput';
import type { IncomeHistoryData } from './types';
import { parseSalaryHistoryBackup, SALARY_BACKUP_APP } from './salaryHistoryBackup';
import tracker from './tracker/tracker.js';
import type { TrackerBackupHandle } from './TrackerHost';

export interface BackupData {
  incomes: any[];
  expenses: any[];
  tags: any[];
  startingBalance: number;
  lowBalanceThreshold: number;
  postedMap: Record<string, boolean>;
  background?: string;
  incomeHistory?: IncomeHistoryData;
}

const BACKUP_APP = 'budget-app-backup';

// Allow storage updates from other tabs to be observed after the blocking confirmation dialog.
const settleStorageEvents = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBudgetItem(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
    typeof value.amount !== 'number' || !Number.isFinite(value.amount) ||
    typeof value.startDate !== 'string' || Number.isNaN(Date.parse(value.startDate)) ||
    typeof value.frequency !== 'string' || !['once', 'weekly', 'biweekly', 'bimonthly', 'monthly', 'quarterly', 'semiannual', 'annual'].includes(value.frequency) ||
    typeof value.isRecurring !== 'boolean') return false;
  if (value.endDate !== undefined && (typeof value.endDate !== 'string' || (value.endDate !== '' && Number.isNaN(Date.parse(value.endDate))))) return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every(tag => typeof tag === 'string'))) return false;
  if (value.icon !== undefined && typeof value.icon !== 'string') return false;
  if (value.isPaycheck !== undefined && typeof value.isPaycheck !== 'boolean') return false;
  if (value.skipped !== undefined && (!Array.isArray(value.skipped) || !value.skipped.every(date => typeof date === 'string'))) return false;
  if (value.overrides !== undefined && (!isRecord(value.overrides) || !Object.values(value.overrides).every(amount => typeof amount === 'number' && Number.isFinite(amount)))) return false;
  if (value.amountSchedule !== undefined && (!Array.isArray(value.amountSchedule) || !value.amountSchedule.every(entry =>
    isRecord(entry) && typeof entry.from === 'string' && typeof entry.amount === 'number' && Number.isFinite(entry.amount)))) return false;
  if (value.occurrenceOverrides !== undefined && (!isRecord(value.occurrenceOverrides) || !Object.values(value.occurrenceOverrides).every(entry =>
    isRecord(entry) && (entry.name === undefined || typeof entry.name === 'string') &&
    (entry.tags === undefined || (Array.isArray(entry.tags) && entry.tags.every(tag => typeof tag === 'string'))) &&
    (entry.isPaycheck === undefined || typeof entry.isPaycheck === 'boolean')))) return false;
  return true;
}

function validateFullBudget(data: Record<string, unknown>) {
  if (!Array.isArray(data.incomes) || !data.incomes.every(isBudgetItem) ||
    !Array.isArray(data.expenses) || !data.expenses.every(isBudgetItem) ||
    !Array.isArray(data.tags) || !data.tags.every((tag: unknown) => isRecord(tag) && typeof tag.name === 'string' && typeof tag.icon === 'string' && typeof tag.color === 'string') ||
    typeof data.startingBalance !== 'number' || !Number.isFinite(data.startingBalance) ||
    typeof data.lowBalanceThreshold !== 'number' || !Number.isFinite(data.lowBalanceThreshold) ||
    !isRecord(data.postedMap) || !Object.values(data.postedMap).every(value => typeof value === 'boolean')) {
    throw new Error('The full Budget App backup is incomplete or invalid.');
  }
  return parseSalaryHistoryBackup(data);
}

export default function Administration({
  setBackground,
  BACKGROUNDS,
  addIncomes,
  addExpenses,
  tags = [],
  setTags = () => {},
  lowBalanceThreshold = 0,
  setLowBalanceThreshold = () => {},
  onWipeAll = () => {},
  backup,
  onRestoreAll = () => {},
  onRestoreSalaryHistory,
  salaryImportReady,
  trackerBackup,
}: {
  background: string;
  setBackground: (bg: string) => void;
  BACKGROUNDS: Record<string, string>;
  addIncomes: (newIncomes: any[], replaceAll?: boolean) => void;
  addExpenses: (newExpenses: any[], replaceAll?: boolean) => void;
  tags?: any[];
  setTags?: (tags: any[]) => void;
  lowBalanceThreshold?: number;
  setLowBalanceThreshold?: (value: number) => void;
  onWipeAll?: () => void;
  backup?: BackupData;
  onRestoreAll?: (data: BackupData) => void;
  onRestoreSalaryHistory: (data: IncomeHistoryData) => void;
  salaryImportReady: boolean;
  trackerBackup: React.RefObject<TrackerBackupHandle>;
}) {
  // Visual feedback for destructive/success actions
  const [successMsg, setSuccessMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [salaryBackupMsg, setSalaryBackupMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const salaryRestoreInput = useRef<HTMLInputElement>(null);

  const handleExportSalary = () => {
    if (!backup?.incomeHistory) {
      setSalaryBackupMsg({ text: 'Salary history is unavailable for export.', error: true });
      return;
    }
    const payload = { app: SALARY_BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), incomeHistory: backup.incomeHistory };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `salary-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSalaryBackupMsg({ text: 'Salary history exported. Keep this file private.' });
  };

  const handleRestoreSalary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!salaryImportReady) {
      setSalaryBackupMsg({ text: 'Wait for account sync to finish successfully before importing.', error: true });
      return;
    }
    try {
      const history = parseSalaryHistoryBackup(JSON.parse(await file.text()) as unknown);
      if (!window.confirm(`Replace all current salary history and annual goals with ${history.entries.length} salary entries and ${Object.keys(history.annualGoals).length} goals from this file? Budget and transaction data will not be changed.`)) return;
      onRestoreSalaryHistory(history);
      setSalaryBackupMsg({ text: 'Salary history imported. If signed in, check the account sync status to confirm it is saved.' });
    } catch (err) {
      setSalaryBackupMsg({ text: err instanceof Error ? err.message : 'Could not read the salary history file.', error: true });
    }
  };

  const handleExportAll = async () => {
    setBackupBusy(true);
    try {
      if (!backup || !trackerBackup.current) throw new Error('Backup data is not ready.');
      if (!salaryImportReady) throw new Error('Wait for budget account sync to finish successfully before exporting.');
      const { data: trackerData } = await trackerBackup.current.snapshot();
      const payload = { app: BACKUP_APP, version: 2, exportedAt: new Date().toISOString(), ...backup, tracker: trackerData };
      validateFullBudget(payload);
      if (typeof payload.background !== 'string' || !Object.prototype.hasOwnProperty.call(BACKGROUNDS, payload.background)) throw new Error('The saved background is invalid.');
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `budget-app-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupMsg({ text: 'Full backup exported. Keep this file private.' });
    } catch (err) {
      setBackupMsg({ text: err instanceof Error ? err.message : 'Could not export backup.', error: true });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupBusy(true);
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== BACKUP_APP) {
        const imported = tracker.validateState(data);
        if (!trackerBackup.current) throw new Error('Tracker data is not ready.');
        const raw = await trackerBackup.current.current();
        if (!window.confirm('Replace all tracker data, including Mercy Ledger, Champion Builds and BJJ Skills, with this backup? Budget data will not change.')) return;
        await settleStorageEvents();
        await trackerBackup.current.restore(raw, imported);
        setBackupMsg({ text: 'Tracker backup imported. If signed in, check tracker sync status.' });
        return;
      }
      if ((data.version !== 1 && data.version !== 2) || !Array.isArray(data.incomes) || !Array.isArray(data.expenses)) {
        throw new Error('This is not a supported Budget App backup file.');
      }
      if (data.version === 1 && (!data.incomes.every(isBudgetItem) || !data.expenses.every(isBudgetItem))) {
        throw new Error('The budget backup contains invalid income or expense records.');
      }
      if (!salaryImportReady) throw new Error('Wait for budget account sync to finish successfully before importing.');
      const trackerData = data.version === 2 ? tracker.validateState(data.tracker) : null;
      const salaryHistory = data.version === 2 ? validateFullBudget(data) : null;
      if (data.version === 2 && (typeof data.background !== 'string' || !Object.prototype.hasOwnProperty.call(BACKGROUNDS, data.background))) {
        throw new Error('The backup contains an invalid background.');
      }
      const budgetData: BackupData = {
        incomes: data.incomes,
        expenses: data.expenses,
        tags: Array.isArray(data.tags) ? data.tags : [],
        startingBalance: Number(data.startingBalance) || 0,
        lowBalanceThreshold: Number(data.lowBalanceThreshold) || 0,
        postedMap: data.postedMap && typeof data.postedMap === 'object' ? data.postedMap : {},
        background: typeof data.background === 'string' ? data.background : undefined,
        incomeHistory: salaryHistory || (data.incomeHistory && Array.isArray(data.incomeHistory.entries)
          ? data.incomeHistory
          : { entries: [], annualGoals: {} })
      };
      let raw: string | null = null;
      if (trackerData) {
        if (!trackerBackup.current) throw new Error('Tracker data is not ready.');
        raw = await trackerBackup.current.current();
      }
      const description = trackerData ? 'budget, salary history, and all tracker data' : 'budget and salary history; current tracker data will be kept';
      if (!window.confirm(`Importing replaces ${description}. Continue?`)) return;
      await settleStorageEvents();
      if (trackerData) await trackerBackup.current!.restore(raw, trackerData);
      onRestoreAll(budgetData);
      setBackupMsg({ text: `Backup imported: ${data.incomes.length} incomes, ${data.expenses.length} expenses${trackerData ? ', and tracker data' : '; tracker data unchanged'}. Check account sync if signed in.` });
    } catch (err) {
      setBackupMsg({ text: err instanceof Error ? err.message : 'Could not read backup file.', error: true });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleWipeData = () => {
    if (window.confirm('Are you sure you want to wipe all data? This cannot be undone.')) {
      onWipeAll();
      setBackground('forest');
      setSuccessMsg('All data wiped!');
      setTimeout(() => window.location.reload(), 1200);
    }
  };
  return (
    <div className="adminPage">
      <section className="admin-section card" aria-labelledby="admin-salary-title">
        <h2 className="admin-section-title" id="admin-salary-title">Salary History Transfer</h2>
        <p>Export salary entries and annual goals only, or import them without replacing budget or transaction data. Import replaces existing salary history and goals.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="admin-btn" onClick={handleExportSalary}>Export Salary History</button>
          <button className="admin-btn" disabled={!salaryImportReady} onClick={() => salaryRestoreInput.current?.click()}>Import Salary History</button>
          <input ref={salaryRestoreInput} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleRestoreSalary} />
        </div>
        {!salaryImportReady && <p>Wait for account sync to finish successfully before importing.</p>}
        {salaryBackupMsg && <div role="status" className={salaryBackupMsg.error ? 'admin-error' : 'admin-success'}>{salaryBackupMsg.text}</div>}
      </section>
      <section className="admin-section card" aria-labelledby="admin-threshold-title">
        <h2 className="admin-section-title" id="admin-threshold-title">Low Projected Balance Threshold</h2>
        <LowBalanceThresholdInput threshold={lowBalanceThreshold} setThreshold={setLowBalanceThreshold} inputClassName="admin-input" />
      </section>
      <section className="admin-section admin-section--import card" aria-labelledby="admin-import-title">
        <h2 className="admin-section-title" id="admin-import-title">Import Data <span style={{ fontSize: '1.1em' }}>📥</span></h2>
        <ImportData
          addIncomes={addIncomes}
          addExpenses={addExpenses}
          tags={tags}
          setTags={setTags}
          incomeHistory={backup?.incomeHistory || { entries: [], annualGoals: {} }}
          onRestoreSalaryHistory={onRestoreSalaryHistory}
          salaryImportReady={salaryImportReady}
          trackerBackup={trackerBackup}
        />
      </section>
      <section className="admin-section card" aria-labelledby="admin-backup-title">
        <h2 className="admin-section-title" id="admin-backup-title">Backup <span style={{ fontSize: '1.1em' }}>💾</span></h2>
        <p>Export budget, salary history, and all trackers together. Import a full backup, an older budget backup, or an original Mercy Ledger backup. Imports replace only the data included in the file after confirmation.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="admin-btn" disabled={backupBusy} onClick={handleExportAll} title="Download all data as a JSON file">Export Everything</button>
          <button className="admin-btn" disabled={backupBusy} onClick={() => restoreInput.current?.click()} title="Import data from a backup file">Import Backup</button>
          <input ref={restoreInput} aria-label="Backup file" type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleRestoreFile} />
        </div>
        {backupMsg && <div role="status" className={backupMsg.error ? 'admin-error' : 'admin-success'}>{backupMsg.text}</div>}
      </section>
      <section className="admin-section card admin-dangerZone" aria-labelledby="admin-danger-title">
        <h2 className="admin-section-title" id="admin-danger-title">Danger Zone <span style={{ fontSize: '1.1em' }}>🗑️</span></h2>
        <button className="admin-btn danger" onClick={handleWipeData} title="Wipe all data">
          <span role="img" aria-label="trash">🗑️</span> Wipe All Data
        </button>
        {successMsg && <div className="admin-success">{successMsg}</div>}
      </section>
    </div>
  );
}
