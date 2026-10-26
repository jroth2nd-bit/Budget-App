import { useState } from 'react';
import type { Income, Expense, Tag } from './types';
import { AmountScope, DeleteScope, FREQUENCIES, amountFor, applyAmountChange, applyDelete, dateKey, getPaycheckPeriod, isSkipped, stepDate } from './recurrence';
import { AmountScopeDialog, DeleteScopeDialog, MakeRecurringDialog, MakeRecurringResult } from './RecurrenceDialogs';

type Kind = 'income' | 'expense';
type Item = Income | Expense;

interface Row {
  id: string;
  kind: Kind;
  date: Date;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  orig: Item;
}

interface EditRow { date: string; name: string; category: string; amount: string; frequency: string; isPaycheck: boolean }

const ICON_OPTIONS = ['💼', '💰', '💸', '🏠', '🛒', '🍔', '🚗', '🎓', '🎁', '🩺', '📈', '💡', '🧾', '📦', '🪙'];

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: Date) => {
  const displayDate = new Date(`${dateKey(d)}T00:00:00`);
  return displayDate.toLocaleDateString(undefined, displayDate.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function buildRows(items: Item[], kind: Kind): Row[] {
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() + 1);
  const out: Row[] = [];
  const push = (item: Item, date: Date, amount: number) => out.push({
    id: item.id + date.toISOString(),
    kind,
    date: new Date(date),
    name: item.name,
    category: item.tags && item.tags.length > 0 ? item.tags[0] : '',
    amount,
    frequency: item.frequency,
    orig: item,
  });
  items.forEach(item => {
    const current = new Date(item.startDate);
    if (item.isRecurring) {
      while (current <= limit && (!item.endDate || dateKey(current) <= item.endDate)) {
        if (!isSkipped(item, current)) push(item, current, amountFor(item, current));
        stepDate(current, item.frequency);
      }
    } else {
      push(item, current, item.amount);
    }
  });
  return out;
}

interface Props {
  incomes: Income[];
  expenses: Expense[];
  tags: Tag[];
  postedMap: Record<string, boolean>;
  onPostedChange: (id: string) => void;
  onAdd: (kind: Kind, item: Item) => void;
  onUpdate: (kind: Kind, item: Item) => void;
  onDelete: (kind: Kind, id: string) => void;
}

export default function TransactionsPage({ incomes, expenses, tags, postedMap, onPostedChange, onAdd, onUpdate, onDelete }: Props) {
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'pending' | 'posted' | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [editAll, setEditAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [menuId, setMenuId] = useState<string | null>(null);
  const [recurTarget, setRecurTarget] = useState<Row | null>(null);
  const [amountQueue, setAmountQueue] = useState<Array<{ row: Row; newAmount: number }>>([]);
  const [deleteQueue, setDeleteQueue] = useState<Row[]>([]);

  const paycheckPeriod = getPaycheckPeriod(incomes);
  const paycheckStart = paycheckPeriod.lastPaycheck ? dateKey(paycheckPeriod.lastPaycheck) : null;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const targetMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  const lastDayOfTargetMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  targetMonth.setDate(Math.min(today.getDate(), lastDayOfTargetMonth));
  const transactionsEnd = targetMonth;
  const transactionsEndKey = `${transactionsEnd.getFullYear()}-${String(transactionsEnd.getMonth() + 1).padStart(2, '0')}-${String(transactionsEnd.getDate()).padStart(2, '0')}`;
  const allRows = [...buildRows(incomes, 'income'), ...buildRows(expenses, 'expense')]
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const categories = Array.from(new Set([...tags.map(t => t.name), ...allRows.map(r => r.category).filter(Boolean)])).sort();

  const rows = allRows.filter(row => {
    const day = dateKey(row.date);
    const isPosted = !!postedMap[row.id];
    return (
      (kindFilter === 'all' || row.kind === kindFilter) &&
      (dateFrom || dateTo || (day >= (paycheckStart ?? todayKey) && day <= transactionsEndKey)) &&
      (!search || row.name.toLowerCase().includes(search.toLowerCase())) &&
      (!dateFrom || day >= dateFrom) &&
      (!dateTo || day <= dateTo) &&
      (!category || row.category === category) &&
      (!frequency || row.frequency === frequency) &&
      (!amountMin || row.amount >= parseFloat(amountMin)) &&
      (!amountMax || row.amount <= parseFloat(amountMax)) &&
      (status === 'all' || (status === 'posted' ? isPosted : !isPosted))
    );
  });

  const activeFilters = [dateFrom, dateTo, category, frequency, amountMin, amountMax].filter(Boolean).length;
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setCategory(''); setFrequency(''); setAmountMin(''); setAmountMax(''); };

  const toEdit = (row: Row): EditRow => ({ date: dateKey(row.date), name: row.name, category: row.category, amount: String(row.amount), frequency: row.frequency, isPaycheck: row.kind === 'income' && !!(row.orig as Income).isPaycheck });
  const startEditAll = () => {
    setEditingId(null);
    setEditAll(true);
    setEdits(Object.fromEntries(rows.map(r => [r.id, toEdit(r)])));
  };
  const startEditRow = (row: Row) => {
    setMenuId(null);
    setEditAll(false);
    setEditingId(row.id);
    setEdits({ [row.id]: toEdit(row) });
  };
  const stopEditing = () => { setEditAll(false); setEditingId(null); setEdits({}); };
  const setField = (id: string, field: keyof EditRow, value: string | boolean) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const saveRows = (ids: string[]) => {
    const queue: Array<{ row: Row; newAmount: number }> = [];
    ids.forEach(id => {
      const row = allRows.find(r => r.id === id);
      const edit = edits[id];
      if (!row || !edit) return;
      const base = row.orig;
      const updated: Item = {
        ...base,
        name: edit.name,
        tags: [edit.category],
        frequency: edit.frequency as Item['frequency'],
        ...(row.kind === 'income' ? { isPaycheck: edit.isPaycheck } : {}),
      };
      const newAmount = parseFloat(edit.amount);
      // Recurring rows keep their series start; amount changes go through the scope dialog
      if (!base.isRecurring) {
        updated.amount = newAmount;
        if (edit.date) updated.startDate = edit.date;
      } else if (!isNaN(newAmount) && newAmount !== row.amount) {
        queue.push({ row, newAmount });
      }
      onUpdate(row.kind, updated);
    });
    setAmountQueue(queue);
    stopEditing();
  };

  const listFor = (kind: Kind): Item[] => (kind === 'income' ? incomes : expenses);

  const confirmAmount = (scope: AmountScope) => {
    const [current, ...rest] = amountQueue;
    const item = listFor(current.row.kind).find(i => i.id === current.row.orig.id);
    if (item) onUpdate(current.row.kind, applyAmountChange(item, current.row.date, current.newAmount, scope));
    setAmountQueue(rest);
  };

  const confirmRecurring = (result: MakeRecurringResult) => {
    if (!recurTarget) return;
    const item = recurTarget.orig;
    if (result.startDate === item.startDate) {
      onUpdate(recurTarget.kind, { ...item, isRecurring: true, frequency: result.frequency, endDate: result.endDate });
    } else {
      // Keep the uploaded item as a one-time record and start the series from the chosen date
      onAdd(recurTarget.kind, { ...item, id: Math.random().toString(36).slice(2), isRecurring: true, frequency: result.frequency, startDate: result.startDate, endDate: result.endDate, overrides: undefined, amountSchedule: undefined });
    }
    setRecurTarget(null);
  };

  const deleteSelected = () => {
    const recurring: Row[] = [];
    const removed = new Set<string>();
    selected.forEach(id => {
      const row = allRows.find(r => r.id === id);
      if (!row) return;
      if (row.orig.isRecurring) recurring.push(row);
      else if (!removed.has(row.orig.id)) {
        removed.add(row.orig.id);
        onDelete(row.kind, row.orig.id);
      }
    });
    setDeleteQueue(recurring);
    setSelected([]);
  };
  const deleteRow = (row: Row) => {
    setMenuId(null);
    if (row.orig.isRecurring) setDeleteQueue(q => [...q, row]);
    else if (window.confirm(`Delete "${row.name}"?`)) onDelete(row.kind, row.orig.id);
  };
  const confirmDelete = (scope: DeleteScope) => {
    const [current, ...rest] = deleteQueue;
    const item = listFor(current.kind).find(i => i.id === current.orig.id);
    if (item) {
      const result = applyDelete(item, current.date, scope);
      if (result) onUpdate(current.kind, result);
      else onDelete(current.kind, item.id);
    }
    setDeleteQueue(rest);
  };

  const toggleSelect = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const allSelected = rows.length > 0 && rows.every(r => selected.includes(r.id));
  const toggleSelectAll = () => setSelected(allSelected ? [] : rows.map(r => r.id));
  const editing = editAll || editingId !== null;

  return (
    <div className="tx">
      <div className="pageHead">
        <h2>Transactions</h2>
        <button className="primary" onClick={() => setShowAdd(v => !v)}>{showAdd ? 'Close' : '+ Add'}</button>
      </div>

      {showAdd && (
        <AddForm
          tags={tags}
          defaultKind={kindFilter === 'income' ? 'income' : 'expense'}
          onAdd={(kind, item) => { onAdd(kind, item); setShowAdd(false); }}
        />
      )}

      <div className="txBar">
        <div className="seg">
          {([['all', 'All'], ['income', 'Income'], ['expense', 'Expenses']] as const).map(([v, l]) => (
            <button key={v} className={kindFilter === v ? 'on' : ''} onClick={() => setKindFilter(v)}>{l}</button>
          ))}
        </div>
        <input className="txSearch" type="search" aria-label="Search by name" placeholder="Search name" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
          <option value="pending">Not posted</option>
          <option value="posted">Posted</option>
          <option value="all">All</option>
        </select>
        <button className={showFilters || activeFilters ? 'active' : ''} onClick={() => setShowFilters(v => !v)}>
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="txFilters">
          <label>From<input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); if (dateTo && e.target.value > dateTo) setDateTo(e.target.value); }} /></label>
          <label>To<input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); if (dateFrom && e.target.value < dateFrom) setDateFrom(e.target.value); }} /></label>
          <label>Category
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Any</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Frequency
            <select value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="">Any</option>
              {FREQUENCIES.map(f => <option key={f} value={f}>{cap(f)}</option>)}
            </select>
          </label>
          <label>Min amount<input type="number" inputMode="decimal" placeholder="0" value={amountMin} onChange={e => setAmountMin(e.target.value)} /></label>
          <label>Max amount<input type="number" inputMode="decimal" placeholder="Any" value={amountMax} onChange={e => setAmountMax(e.target.value)} /></label>
          {activeFilters > 0 && <button className="txClear" onClick={clearFilters}>Clear filters</button>}
        </div>
      )}

      <div className="txMeta">
        <span className="muted">{rows.length} transaction{rows.length === 1 ? '' : 's'}</span>
        {!dateFrom && !dateTo && <span className="muted">{paycheckStart ? `Since paycheck ${fmtDate(new Date(`${paycheckStart}T00:00:00`))}` : 'Next 3 months'}</span>}
        <span className="spacer" />
        {selected.length > 0 && <button className="danger" onClick={deleteSelected}>Delete selected ({selected.length})</button>}
        {editAll ? (
          <>
            <button className="primary" onClick={() => saveRows(Object.keys(edits))}>Save all</button>
            <button onClick={stopEditing}>Cancel</button>
          </>
        ) : (
          <button onClick={startEditAll} disabled={rows.length === 0 || editingId !== null}>Edit all</button>
        )}
      </div>

      <div className="txWrap">
        <div className={`txList${editing ? ' editing' : ''}`}>
          <div className="txRow txHead">
            <div className="cChk"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleSelectAll} /></div>
            <div className="cDate">Date</div>
            <div className="cName">Name</div>
            <div className="cCat">Category</div>
            <div className="cFreq">Frequency</div>
            <div className="cAmt">Amount</div>
            <div className="cPost">Posted</div>
            <div className="cAct" />
          </div>

          {rows.map(row => {
            const edit = edits[row.id];
            const isEditing = !!edit && (editAll || editingId === row.id);
            const isPosted = !!postedMap[row.id];
            const meta = [fmtDate(row.date), row.category, cap(row.frequency)].filter(Boolean).join(' · ');
            return (
              <div key={row.id} className={`txRow${isPosted ? ' isPosted' : ''}${isEditing ? ' isEditing' : ''}`}>
                <div className="cChk"><input type="checkbox" aria-label="Select row" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} /></div>
                {isEditing ? (
                  <>
                    <div className="cDate"><input type="date" value={edit.date} disabled={row.orig.isRecurring} title={row.orig.isRecurring ? 'Recurring series start date cannot be changed here' : undefined} onChange={e => setField(row.id, 'date', e.target.value)} /></div>
                    <div className="cName">
                      <input value={edit.name} onChange={e => setField(row.id, 'name', e.target.value)} />
                      {row.kind === 'income' && !editAll && <label className="paycheckEdit"><input type="checkbox" checked={edit.isPaycheck} onChange={e => setField(row.id, 'isPaycheck', e.target.checked)} /> Paycheck</label>}
                    </div>
                    <div className="cCat">
                      <select value={edit.category} onChange={e => setField(row.id, 'category', e.target.value)}>
                        <option value="">None</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="cFreq">
                      <select value={edit.frequency} onChange={e => setField(row.id, 'frequency', e.target.value)}>
                        {FREQUENCIES.map(f => <option key={f} value={f}>{cap(f)}</option>)}
                      </select>
                    </div>
                    <div className="cAmt"><input type="number" step="0.01" inputMode="decimal" value={edit.amount} onChange={e => setField(row.id, 'amount', e.target.value)} /></div>
                  </>
                ) : (
                  <>
                    <div className="cDate">{fmtDate(row.date)}</div>
                    <div className="cName">
                      <span className="txName" title={row.name}>{row.name}{row.orig.isRecurring && <span className="recurMark" title="Recurring"> ↻</span>}</span>
                      <span className="cMeta">{meta}</span>
                      {row.kind === 'income' && (row.orig as Income).isPaycheck && <span className="paycheckBadge">Paycheck</span>}
                    </div>
                    <div className="cCat">{row.category}</div>
                    <div className="cFreq">{cap(row.frequency)}</div>
                    <div className={`cAmt ${row.kind === 'income' ? 'pos' : 'neg'}`}>{row.kind === 'income' ? '+' : '-'}{money(row.amount)}</div>
                  </>
                )}
                <div className="cPost"><input type="checkbox" aria-label="Posted" checked={isPosted} onChange={() => onPostedChange(row.id)} /></div>
                <div className="cAct">
                  {editingId === row.id ? (
                    <>
                      <button className="primary" onClick={() => saveRows([row.id])}>Save</button>
                      <button onClick={stopEditing}>Cancel</button>
                    </>
                  ) : !editAll && (
                    <>
                      <button className="iconBtn" aria-label="Row actions" aria-expanded={menuId === row.id} onClick={() => setMenuId(menuId === row.id ? null : row.id)}>⋯</button>
                      {menuId === row.id && (
                        <>
                          <div className="menuScrim" onClick={() => setMenuId(null)} />
                          <div className="menu">
                            <button onClick={() => startEditRow(row)}>Edit</button>
                            {!row.orig.isRecurring && <button onClick={() => { setMenuId(null); setRecurTarget(row); }}>Make recurring</button>}
                            <button className="danger" onClick={() => deleteRow(row)}>Delete</button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="txEmpty muted">
              {editing ? '' : status === 'pending' && allRows.length > 0 ? 'Nothing left to post. Change Status to see posted items.' : 'No transactions match.'}
            </div>
          )}
        </div>
      </div>

      {recurTarget && (
        <MakeRecurringDialog name={recurTarget.name} itemDate={recurTarget.orig.startDate} frequency={recurTarget.orig.frequency} onConfirm={confirmRecurring} onCancel={() => setRecurTarget(null)} />
      )}
      {deleteQueue[0] && (
        <DeleteScopeDialog name={deleteQueue[0].name} date={deleteQueue[0].date} onConfirm={confirmDelete} onCancel={() => setDeleteQueue(deleteQueue.slice(1))} />
      )}
      {amountQueue[0] && (
        <AmountScopeDialog name={amountQueue[0].row.name} date={amountQueue[0].row.date} oldAmount={amountQueue[0].row.amount} newAmount={amountQueue[0].newAmount} onConfirm={confirmAmount} onCancel={() => setAmountQueue(amountQueue.slice(1))} />
      )}
    </div>
  );
}

function AddForm({ tags, defaultKind, onAdd }: { tags: Tag[]; defaultKind: Kind; onAdd: (kind: Kind, item: Item) => void }) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Item['frequency']>('monthly');
  const [startDate, setStartDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [isPaycheck, setIsPaycheck] = useState(false);
  const [category, setCategory] = useState('');
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [customIcon, setCustomIcon] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const item: Item = {
      id: Math.random().toString(36).slice(2),
      name,
      amount: parseFloat(amount),
      frequency,
      startDate,
      isRecurring,
      tags: category ? [category] : [],
      ...(kind === 'income' ? { isPaycheck } : {}),
    };
    if (kind === 'income') item.icon = customIcon.trim() || icon;
    onAdd(kind, item);
  };

  return (
    <form className="card txAdd" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>Income</button>
        <button type="button" className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Expense</button>
      </div>
      <div className="txAddGrid">
        <label>Name<input value={name} onChange={e => {
          const value = e.target.value;
          setName(value);
          if (/\bpaychecks?\b/i.test(value)) setIsPaycheck(true);
        }} required /></label>
        <label>Amount<input type="number" step="0.01" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
        <label>Date<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></label>
        <label>Category
          <select value={category} onChange={e => setCategory(e.target.value)} required>
            <option value="" disabled>Select</option>
            {tags.map(t => <option key={t.name} value={t.name}>{t.icon} {t.name}</option>)}
          </select>
        </label>
        <label>Frequency
          <select value={frequency} onChange={e => setFrequency(e.target.value as Item['frequency'])}>
            {FREQUENCIES.map(f => <option key={f} value={f}>{cap(f)}</option>)}
          </select>
        </label>
        {kind === 'income' && (
          <label>Icon
            <select value={icon} onChange={e => setIcon(e.target.value)}>
              {ICON_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="custom">Custom…</option>
            </select>
          </label>
        )}
        {kind === 'income' && <label className="paycheckEdit"><input type="checkbox" checked={isPaycheck} onChange={e => setIsPaycheck(e.target.checked)} /> Paycheck</label>}
        {kind === 'income' && icon === 'custom' && (
          <label>Custom icon<input value={customIcon} onChange={e => setCustomIcon(e.target.value)} /></label>
        )}
      </div>
      <div className="txAddFoot">
        <label className="check"><input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /> Recurring</label>
        <button className="primary" type="submit">Add {kind === 'income' ? 'income' : 'expense'}</button>
      </div>
    </form>
  );
}
