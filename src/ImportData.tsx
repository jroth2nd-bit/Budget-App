import { useState, type ChangeEvent, type RefObject } from 'react';
import * as XLSX from 'xlsx';
import type { TrackerBackupHandle } from './TrackerHost';
import tracker from './tracker/tracker.js';
import type { BjjSkill, ChampionBuild, DemonLordRecord, MercyHistoryEntry, TrackerState } from './tracker/tracker.js';
import type { IncomeHistoryData, IncomeHistoryEntry } from './types';

type ImportTarget = 'income' | 'expense' | 'salary' | 'mercy-pulls' | 'demon-lord' | 'champions' | 'bjj-skills';
type ImportField = { key: string; label: string; required?: boolean; aliases?: string[] };
type ImportMessage = { text: string; error?: boolean };
type ImportDataProps = {
  addIncomes: (newIncomes: any[], replaceAll?: boolean) => void;
  addExpenses: (newExpenses: any[], replaceAll?: boolean) => void;
  tags: any[];
  setTags: (tags: any[]) => void;
  incomeHistory: IncomeHistoryData;
  onRestoreSalaryHistory: (data: IncomeHistoryData) => void;
  salaryImportReady: boolean;
  trackerBackup: RefObject<TrackerBackupHandle>;
};

const targets: Array<{ value: ImportTarget; label: string }> = [
  { value: 'income', label: 'Income transactions' },
  { value: 'expense', label: 'Expense transactions' },
  { value: 'salary', label: 'Salary history' },
  { value: 'mercy-pulls', label: 'Mercy Ledger pulls' },
  { value: 'demon-lord', label: 'Mercy Ledger reward days' },
  { value: 'champions', label: 'Champion Builds' },
  { value: 'bjj-skills', label: 'BJJ Skills' },
];

const transactionFields: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['description', 'transaction'] },
  { key: 'amount', label: 'Amount', required: true, aliases: ['value', 'cost'] },
  { key: 'frequency', label: 'Frequency', aliases: ['interval'] },
  { key: 'startDate', label: 'Start date', aliases: ['date', 'start date'] },
  { key: 'endDate', label: 'End date', aliases: ['end date'] },
  { key: 'category', label: 'Category', aliases: ['tag'] },
  { key: 'icon', label: 'Icon' },
  { key: 'isRecurring', label: 'Recurring' },
  { key: 'isPaycheck', label: 'Paycheck', aliases: ['paycheck'] },
];

const fieldsByTarget: Record<ImportTarget, ImportField[]> = {
  income: transactionFields,
  expense: transactionFields.filter(field => field.key !== 'isPaycheck'),
  salary: [
    { key: 'effectiveDate', label: 'Effective date', required: true, aliases: ['date'] },
    { key: 'annualIncome', label: 'Annual income', required: true, aliases: ['salary', 'income', 'amount'] },
    { key: 'employer', label: 'Employer' },
    { key: 'title', label: 'Title / position', aliases: ['position', 'job title'] },
    { key: 'age', label: 'Age' },
    { key: 'notes', label: 'Notes' },
    { key: 'annualGoal', label: 'Annual goal', aliases: ['goal'] },
  ],
  'mercy-pulls': [
    { key: 'createdAt', label: 'Date', required: true, aliases: ['created at', 'timestamp'] },
    { key: 'kind', label: 'Pull type', required: true, aliases: ['kind', 'type'] },
    { key: 'source', label: 'Source', required: true },
    { key: 'rarity', label: 'Rarity', required: true },
    { key: 'quantity', label: 'Quantity', required: true, aliases: ['count'] },
    { key: 'rank', label: 'Soul rank' },
  ],
  'demon-lord': [
    { key: 'date', label: 'Date', required: true },
    { key: 'difficulty', label: 'Difficulty', required: true },
    { key: 'chests', label: 'Chests', required: true },
    { key: 'books', label: 'Legendary books', aliases: ['legendary books'] },
    { key: 'epicBooks', label: 'Epic books' },
    { key: 'sacred', label: 'Sacred shards', aliases: ['sacred'] },
    { key: 'void', label: 'Void shards', aliases: ['void'] },
    { key: 'ancient', label: 'Ancient shards', aliases: ['ancient'] },
  ],
  champions: [
    { key: 'name', label: 'Champion name', required: true, aliases: ['champion'] },
    { key: 'blessing', label: 'Blessing' },
    { key: 'books', label: 'Books' },
    { key: 'masteries', label: 'Masteries' },
    { key: 'gear', label: 'Gear' },
    { key: 'glyphs', label: 'Glyphs' },
    { key: 'relic', label: 'Relic' },
    { key: 'notes', label: 'Notes' },
  ],
  'bjj-skills': [
    { key: 'name', label: 'Skill name', required: true, aliases: ['skill'] },
    { key: 'type', label: 'Type' },
    { key: 'positions', label: 'Starting positions', aliases: ['position', 'starting position'] },
    { key: 'description', label: 'Description' },
    { key: 'link', label: 'Video link', aliases: ['url'] },
    { key: 'video', label: 'Video quality' },
    { key: 'practice', label: 'Practice' },
    { key: 'live', label: 'Live rolls' },
    { key: 'preference', label: 'Preference' },
    { key: 'mastered', label: 'Mastered' },
  ],
};

const targetLabel = (target: ImportTarget) => targets.find(item => item.value === target)!.label;
const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');

function inferMapping(headers: string[], fields: ImportField[]) {
  return Object.fromEntries(fields.map(field => {
    const candidates = [field.key, field.label, ...(field.aliases || [])].map(normalize);
    return [field.key, headers.find(header => candidates.includes(normalize(header))) || ''];
  }));
}

function readRows(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const isCsv = /\.csv$/i.test(file.name);
  const source = isCsv ? file.text() : file.arrayBuffer();
  return source.then(data => {
    const workbook = XLSX.read(data, { type: isCsv ? 'string' : 'array', dateNF: 'yyyy-mm-dd' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The selected file has no worksheet.');
    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    const headers = records.length ? Object.keys(records[0]) : [];
    if (!headers.length) throw new Error('The selected file has no column headers or data rows.');
    const rows = records.map(record => Object.fromEntries(headers.map(header => [
      header,
      record[header] instanceof Date ? record[header].toISOString() : String(record[header] ?? ''),
    ])));
    if (!rows.length) throw new Error('The selected file has headers but no data rows.');
    return { headers, rows };
  });
}

function getValue(row: Record<string, string>, mapping: Record<string, string>, key: string) {
  return (mapping[key] ? row[mapping[key]] : '').trim();
}

function parseNumber(value: string, label: string, rowNumber: number, options: { integer?: boolean; allowBlank?: boolean } = {}) {
  if (!value && options.allowBlank) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  if (!value || !Number.isFinite(parsed) || (options.integer && !Number.isSafeInteger(parsed))) {
    throw new Error(`Row ${rowNumber}: enter a valid ${options.integer ? 'whole-number ' : ''}${label}.`);
  }
  return parsed;
}

function parseDate(value: string, label: string, rowNumber: number) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(`Row ${rowNumber}: enter a valid ${label}.`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value) {
      throw new Error(`Row ${rowNumber}: enter a valid ${label}.`);
    }
    return value;
  }
  return date.toISOString();
}

function parseBoolean(value: string, label: string, rowNumber: number, fallback = false) {
  if (!value) return fallback;
  const normalized = value.trim().toLocaleLowerCase();
  if (['true', 'yes', 'y', '1', 'on', 'mastered'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'off', 'not mastered'].includes(normalized)) return false;
  throw new Error(`Row ${rowNumber}: ${label} must be Yes or No.`);
}

function normalizeStatus<T extends string>(value: string, label: string, allowed: readonly T[], fallback: T): T {
  const normalized = value.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return fallback;
  const aliases: Record<string, string> = {
    'in_progress': 'progress',
    'not_started': 'needed',
    'not_yet': 'not_yet',
    'like_it': 'liked',
    'find_better': 'replace',
    'not_mastered': 'false',
    'ultra_nightmare': 'ultra',
  };
  const status = aliases[normalized] || normalized;
  const matched = allowed.find(option => option === status);
  if (!matched) throw new Error(`Invalid ${label} value "${value}".`);
  return matched;
}

function rowIsBlank(row: Record<string, string>) {
  return Object.values(row).every(value => !value.trim());
}

export default function ImportData({
  addIncomes,
  addExpenses,
  tags,
  setTags,
  incomeHistory,
  onRestoreSalaryHistory,
  salaryImportReady,
  trackerBackup,
}: ImportDataProps) {
  const [target, setTarget] = useState<ImportTarget>('expense');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewMode, setPreviewMode] = useState(false);
  const [replaceAll, setReplaceAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ImportMessage | null>(null);

  const reset = () => {
    setRows([]);
    setHeaders([]);
    setMapping({});
    setPreviewMode(false);
    setReplaceAll(false);
    setMessage(null);
  };

  const clearImportFile = () => {
    setRows([]);
    setHeaders([]);
    setMapping({});
    setPreviewMode(false);
    setReplaceAll(false);
  };

  const handleTargetChange = (nextTarget: ImportTarget) => {
    setTarget(nextTarget);
    reset();
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      const imported = await readRows(file);
      setHeaders(imported.headers);
      setRows(imported.rows);
      setMapping(inferMapping(imported.headers, fieldsByTarget[target]));
      setPreviewMode(true);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not read the selected file.', error: true });
    }
  };

  const handleImport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const fields = fieldsByTarget[target];
      const missingMappings = fields.filter(field => field.required && !mapping[field.key]);
      if (missingMappings.length) throw new Error(`Map a column for ${missingMappings.map(field => field.label).join(', ')}.`);
      const validRows = rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(item => !rowIsBlank(item.row));
      if (!validRows.length) throw new Error('There are no non-empty rows to import.');

      if (target === 'income' || target === 'expense') {
        const newItems = validRows.map(({ row, rowNumber }) => {
          const name = getValue(row, mapping, 'name');
          if (!name) throw new Error(`Row ${rowNumber}: enter a name.`);
          const amount = parseNumber(getValue(row, mapping, 'amount'), 'amount', rowNumber)!;
          const frequencyValue = getValue(row, mapping, 'frequency').toLocaleLowerCase() || 'monthly';
          const frequencies = ['once', 'weekly', 'biweekly', 'bimonthly', 'monthly', 'quarterly', 'semiannual', 'annual'];
          if (!frequencies.includes(frequencyValue)) throw new Error(`Row ${rowNumber}: "${frequencyValue}" is not a supported frequency.`);
          const startValue = getValue(row, mapping, 'startDate');
          const startDate = startValue ? parseDate(startValue, 'start date', rowNumber).slice(0, 10) : new Date().toISOString().slice(0, 10);
          const endValue = getValue(row, mapping, 'endDate');
          const category = getValue(row, mapping, 'category');
          const paycheck = target === 'income' && parseBoolean(getValue(row, mapping, 'isPaycheck'), 'Paycheck', rowNumber, /\bpaychecks?\b/i.test(name));
          const item: Record<string, unknown> = {
            id: crypto.randomUUID(),
            name,
            amount,
            frequency: frequencyValue,
            startDate,
            isRecurring: parseBoolean(getValue(row, mapping, 'isRecurring'), 'Recurring', rowNumber),
            tags: category ? [category] : [],
            icon: getValue(row, mapping, 'icon'),
          };
          if (endValue) item.endDate = parseDate(endValue, 'end date', rowNumber).slice(0, 10);
          if (target === 'income') item.isPaycheck = paycheck;
          return item;
        });
        if (replaceAll && !window.confirm(`Replace all ${target} transactions with ${newItems.length} imported rows?`)) return;
        if (categoryTags(newItems).length) {
          const existing = new Set(tags.map(tag => tag.name));
          const newTags = categoryTags(newItems).filter(name => !existing.has(name));
          if (newTags.length) setTags([...tags, ...newTags.map(name => ({ name, icon: '', color: '#2a2f35' }))]);
        }
        if (target === 'income') addIncomes(newItems, replaceAll);
        else addExpenses(newItems, replaceAll);
        setMessage({ text: `Imported ${newItems.length} ${targetLabel(target).toLocaleLowerCase()}.` });
        clearImportFile();
        return;
      }

      if (target === 'salary') {
        if (!salaryImportReady) throw new Error('Wait for account sync to finish successfully before importing salary history.');
        const entries: IncomeHistoryEntry[] = [];
        const annualGoals = { ...incomeHistory.annualGoals };
        for (const { row, rowNumber } of validRows) {
          const effectiveDate = parseDate(getValue(row, mapping, 'effectiveDate'), 'effective date', rowNumber).slice(0, 10);
          const annualIncome = parseNumber(getValue(row, mapping, 'annualIncome'), 'annual income', rowNumber)!;
          const ageValue = getValue(row, mapping, 'age');
          const age = ageValue ? parseNumber(ageValue, 'age', rowNumber, { integer: true })! : undefined;
          if (age !== undefined && (age < 0 || age > 130)) throw new Error(`Row ${rowNumber}: age must be between 0 and 130.`);
          const goalValue = getValue(row, mapping, 'annualGoal');
          if (goalValue) annualGoals[effectiveDate.slice(0, 4)] = parseNumber(goalValue, 'annual goal', rowNumber)!;
          entries.push({
            id: crypto.randomUUID(),
            effectiveDate,
            annualIncome,
            employer: getValue(row, mapping, 'employer'),
            title: getValue(row, mapping, 'title'),
            age,
            notes: getValue(row, mapping, 'notes'),
          });
        }
        onRestoreSalaryHistory({ entries: [...incomeHistory.entries, ...entries], annualGoals });
        setMessage({ text: `Imported ${entries.length} salary ${entries.length === 1 ? 'entry' : 'entries'}.` });
        clearImportFile();
        return;
      }

      const backup = trackerBackup.current;
      if (!backup) throw new Error('Tracker data is not ready.');
      const raw = await backup.current();
      const current = raw === null ? tracker.emptyState() : tracker.validateState(JSON.parse(raw));
      let next: TrackerState = current;

      if (target === 'mercy-pulls') {
        const imported: MercyHistoryEntry[] = validRows.map(({ row, rowNumber }) => {
          const kind = getValue(row, mapping, 'kind').toLocaleLowerCase();
          if (kind !== 'shard' && kind !== 'soul') throw new Error(`Row ${rowNumber}: pull type must be shard or soul.`);
          const createdAt = parseDate(getValue(row, mapping, 'createdAt'), 'date', rowNumber);
          const quantity = parseNumber(getValue(row, mapping, 'quantity'), 'quantity', rowNumber, { integer: true })!;
          const source = getValue(row, mapping, 'source');
          const rarity = getValue(row, mapping, 'rarity');
          const entry: MercyHistoryEntry = {
            id: crypto.randomUUID(),
            createdAt: createdAt.includes('T') ? createdAt : `${createdAt}T12:00:00.000Z`,
            kind,
            source,
            rarity,
            quantity,
          };
          const rankValue = getValue(row, mapping, 'rank');
          if (kind === 'soul') entry.rank = parseNumber(rankValue, 'soul rank', rowNumber, { integer: true })!;
          return entry;
        });
        next = tracker.validateState({ ...current, entries: [...current.entries, ...imported] });
      } else if (target === 'demon-lord') {
        const records = new Map<string, DemonLordRecord>(
          current.clanBoss.map(record => [record.date, { date: record.date, difficulties: { ...record.difficulties } }])
        );
        for (const { row, rowNumber } of validRows) {
          const date = parseDate(getValue(row, mapping, 'date'), 'date', rowNumber).slice(0, 10);
          const difficultyValue = getValue(row, mapping, 'difficulty');
          if (!difficultyValue) throw new Error(`Row ${rowNumber}: enter a Demon Lord difficulty.`);
          const difficulty = normalizeStatus(difficultyValue, 'difficulty', ['ultra', 'nightmare', 'brutal', 'hard'], 'hard');
          const chests = parseNumber(getValue(row, mapping, 'chests'), 'chests', rowNumber, { integer: true })!;
          const reward = (key: string) => parseNumber(getValue(row, mapping, key), key, rowNumber, { integer: true, allowBlank: true });
          const day = records.get(date) || { date, difficulties: {} };
          day.difficulties[difficulty] = {
            chests,
            books: reward('books') ?? 0,
            epicBooks: reward('epicBooks'),
            sacred: reward('sacred') ?? 0,
            void: reward('void') ?? 0,
            ancient: reward('ancient') ?? 0,
          };
          records.set(date, day);
        }
        next = tracker.validateState({ ...current, clanBoss: [...records.values()] });
      } else if (target === 'champions') {
        const imported: ChampionBuild[] = validRows.map(({ row, rowNumber }) => {
          const name = getValue(row, mapping, 'name');
          if (!name) throw new Error(`Row ${rowNumber}: enter a champion name.`);
          const blessingValue = getValue(row, mapping, 'blessing').toLocaleLowerCase();
          const blessing = blessingValue === '' || blessingValue === 'unknown' ? null : parseNumber(blessingValue, 'blessing level', rowNumber, { integer: true });
          const status = (key: string) => normalizeStatus(getValue(row, mapping, key), key, ['needed', 'progress', 'complete'], 'needed');
          return {
            id: crypto.randomUUID(),
            name,
            statuses: {
              blessing,
              books: status('books'),
              masteries: status('masteries'),
              gear: status('gear'),
              glyphs: status('glyphs'),
              relic: status('relic'),
            },
            notes: getValue(row, mapping, 'notes'),
          };
        });
        next = tracker.validateState({ ...current, champions: [...current.champions, ...imported] });
      } else {
        const imported: BjjSkill[] = validRows.map(({ row, rowNumber }) => {
          const name = getValue(row, mapping, 'name');
          if (!name) throw new Error(`Row ${rowNumber}: enter a skill name.`);
          const positions = getValue(row, mapping, 'positions').split(/[;,|]/).map(value => value.trim()).filter(Boolean);
          const video = normalizeStatus(getValue(row, mapping, 'video'), 'video quality', ['unset', 'liked', 'replace'], 'unset');
          const practice = normalizeStatus(getValue(row, mapping, 'practice'), 'practice', ['unset', 'not_yet', 'learning', 'sometimes', 'consistently'], 'unset');
          const live = normalizeStatus(getValue(row, mapping, 'live'), 'live rolls', ['unset', 'not_yet', 'learning', 'sometimes', 'consistently'], 'unset');
          const preference = normalizeStatus(getValue(row, mapping, 'preference'), 'preference', ['unset', 'low', 'medium', 'high'], 'unset');
          return {
            id: crypto.randomUUID(),
            name,
            type: getValue(row, mapping, 'type') || 'Other',
            positions,
            description: getValue(row, mapping, 'description'),
            link: getValue(row, mapping, 'link'),
            video,
            practice,
            live,
            preference,
            mastered: parseBoolean(getValue(row, mapping, 'mastered'), 'Mastered', rowNumber),
          };
        });
        next = tracker.validateState({ ...current, bjj: { ...current.bjj, skills: [...current.bjj.skills, ...imported] } });
      }

      await backup.restore(raw, next);
      setMessage({ text: `Imported ${validRows.length} ${validRows.length === 1 ? 'row' : 'rows'} to ${targetLabel(target)}. Other tracker data was left unchanged.` });
      clearImportFile();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not import the selected data.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const selectedFields = fieldsByTarget[target];

  return (
    <div className="adminImporter">
      <div className="adminImportControls">
        <label>
          Import to
          <select value={target} disabled={previewMode || busy} onChange={event => handleTargetChange(event.target.value as ImportTarget)}>
            {targets.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        {!previewMode && (
          <label>
            Choose CSV or Excel file
            <input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={handleFileUpload} />
          </label>
        )}
        {previewMode && <p className="adminImportFile">{rows.length} rows ready for {targetLabel(target)}.</p>}
        {(target === 'income' || target === 'expense') && !previewMode && (
          <label className="adminReplaceOption">
            <input type="checkbox" checked={replaceAll} onChange={event => setReplaceAll(event.target.checked)} />
            Replace all {targetLabel(target).toLocaleLowerCase()}
          </label>
        )}
      </div>
      <p className="adminImportHint">Choose a destination first, then map your file’s columns. Imports add to the selected destination only.</p>
      {previewMode && (
        <div className="adminImportMapping">
          <h3>Match columns</h3>
          <div className="adminMappingGrid">
            {selectedFields.map(field => (
              <label key={field.key}>
                {field.label}{field.required ? ' *' : ' (optional)'}
                <select value={mapping[field.key] || ''} onChange={event => setMapping(previous => ({ ...previous, [field.key]: event.target.value }))}>
                  <option value="">-- Don't import --</option>
                  {headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <details className="adminImportPreview">
            <summary>Preview {Math.min(rows.length, 5)} of {rows.length} rows</summary>
            <div className="table-container">
              <table className="importTable">
                <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((row, index) => (
                  <tr key={index}>{headers.map(header => <td key={header}>{row[header]}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          </details>
          <div className="adminImportActions">
            <button type="button" className="admin-btn" disabled={busy || (target === 'salary' && !salaryImportReady)} onClick={handleImport}>
              {busy ? 'Importing…' : `Import ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
            </button>
            <button type="button" onClick={reset} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {message && <div role="status" className={message.error ? 'admin-error' : 'admin-success'}>{message.text}</div>}
      <p className="adminRequiredHint">* Required column. Blank optional fields use the destination’s default value.</p>
    </div>
  );
}

function categoryTags(items: Record<string, unknown>[]) {
  return [...new Set(items.flatMap(item => Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : []))];
}
