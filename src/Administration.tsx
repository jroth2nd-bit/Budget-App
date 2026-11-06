
import React, { useRef, useState } from 'react';
import ImportData from './ImportData';
import LowBalanceThresholdInput from './LowBalanceThresholdInput';
import type { IncomeHistoryData } from './types';
import { parseSalaryHistoryBackup, SALARY_BACKUP_APP } from './salaryHistoryBackup';

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

export default function Administration({
  background,
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
}) {
  // Visual feedback for destructive/success actions
  const [successMsg, setSuccessMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [salaryBackupMsg, setSalaryBackupMsg] = useState<{ text: string; error?: boolean } | null>(null);
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

  const handleExportAll = () => {
    if (!backup) return;
    const payload = { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), ...backup };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `budget-app-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupMsg({ text: 'Backup exported.' });
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== BACKUP_APP || !Array.isArray(data.incomes) || !Array.isArray(data.expenses)) {
        throw new Error('This is not a Budget App backup file.');
      }
      if (!window.confirm('Importing replaces ALL current data with the contents of this backup. Continue?')) return;
      onRestoreAll({
        incomes: data.incomes,
        expenses: data.expenses,
        tags: Array.isArray(data.tags) ? data.tags : [],
        startingBalance: Number(data.startingBalance) || 0,
        lowBalanceThreshold: Number(data.lowBalanceThreshold) || 0,
        postedMap: data.postedMap && typeof data.postedMap === 'object' ? data.postedMap : {},
        background: typeof data.background === 'string' ? data.background : undefined,
        incomeHistory: data.incomeHistory && Array.isArray(data.incomeHistory.entries)
          ? data.incomeHistory
          : { entries: [], annualGoals: {} }
      });
      setBackupMsg({ text: `Backup imported: ${data.incomes.length} incomes, ${data.expenses.length} expenses.` });
    } catch (err) {
      setBackupMsg({ text: err instanceof Error ? err.message : 'Could not read backup file.', error: true });
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
    <div className="admin-card">
      <div className="admin-header">
        <span className="admin-header-icon" role="img" aria-label="settings">⚙️</span>
        <h2>Administration</h2>
      </div>
      <hr className="admin-divider" />
      <div className="admin-section">
        <div className="admin-section-title">Salary History Transfer</div>
        <p>Export salary entries and annual goals only, or import them without replacing budget or transaction data. Import replaces existing salary history and goals.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="admin-btn" onClick={handleExportSalary}>Export Salary History</button>
          <button className="admin-btn" disabled={!salaryImportReady} onClick={() => salaryRestoreInput.current?.click()}>Import Salary History</button>
          <input ref={salaryRestoreInput} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleRestoreSalary} />
        </div>
        {!salaryImportReady && <p>Wait for account sync to finish successfully before importing.</p>}
        {salaryBackupMsg && <div role="status" className={salaryBackupMsg.error ? undefined : 'admin-success'} style={salaryBackupMsg.error ? { color: '#ef4444', marginTop: 8 } : undefined}>{salaryBackupMsg.text}</div>}
      </div>
      <hr className="admin-divider" />
      <div className="admin-section">
        <div className="admin-section-title">Low Projected Balance Threshold</div>
        <LowBalanceThresholdInput threshold={lowBalanceThreshold} setThreshold={setLowBalanceThreshold} inputClassName="admin-input" />
      </div>
      <hr className="admin-divider" />
      <div className="admin-section">
        <div className="admin-section-title">Import Data <span style={{ fontSize: '1.1em' }}>📥</span></div>
        <ImportData addIncomes={addIncomes} addExpenses={addExpenses} tags={tags} setTags={setTags} />
      </div>
      <hr className="admin-divider" />
      <div className="admin-section">
        <div className="admin-section-title">Backup <span style={{ fontSize: '1.1em' }}>💾</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="admin-btn" onClick={handleExportAll} title="Download all data as a JSON file">Export Everything</button>
          <button className="admin-btn" onClick={() => restoreInput.current?.click()} title="Replace all data from a backup file">Import Backup</button>
          <input ref={restoreInput} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleRestoreFile} />
        </div>
        {backupMsg && <div className={backupMsg.error ? undefined : 'admin-success'} style={backupMsg.error ? { color: '#ef4444', marginTop: 8 } : undefined}>{backupMsg.text}</div>}
      </div>
      <hr className="admin-divider" />
      <div className="admin-section">
        <div className="admin-section-title" style={{ color: '#ef4444' }}>Danger Zone <span style={{ fontSize: '1.1em' }}>🗑️</span></div>
        <button className="admin-btn danger" onClick={handleWipeData} title="Wipe all data">
          <span role="img" aria-label="trash">🗑️</span> Wipe All Data
        </button>
        {successMsg && <div className="admin-success">{successMsg}</div>}
      </div>
    </div>
  );
}
