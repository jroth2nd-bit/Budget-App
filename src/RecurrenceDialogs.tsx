import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AmountScope, DeleteScope, FREQUENCIES, Frequency, dateKey, firstOccurrenceOnOrAfter } from './recurrence';

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000
};
const card: React.CSSProperties = {
  background: '#1f262d', color: '#fff', borderRadius: 10, padding: 20, minWidth: 320,
  display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #facc15'
};

export interface MakeRecurringResult {
  frequency: Frequency;
  startDate: string;
  endDate?: string;
}

export function MakeRecurringDialog({ name, itemDate, frequency, onConfirm, onCancel }: {
  name: string;
  itemDate: string;
  frequency: string;
  onConfirm: (result: MakeRecurringResult) => void;
  onCancel: () => void;
}) {
  const initialFrequency = (FREQUENCIES as string[]).includes(frequency) ? (frequency as Frequency) : 'monthly';
  const [freq, setFreq] = useState<Frequency>(initialFrequency);
  // Recurrence starts today or later; past occurrences are not generated
  const [startDate, setStartDate] = useState(() => dateKey(firstOccurrenceOnOrAfter(itemDate, initialFrequency, new Date())));
  const [endDate, setEndDate] = useState('');

  return (
  createPortal(
    <div style={overlay}>
      <form style={card} onSubmit={e => { e.preventDefault(); onConfirm({ frequency: freq, startDate, endDate: endDate || undefined }); }}>
        <h3 style={{ margin: 0 }}>Make "{name}" recurring</h3>
        <label>Frequency
          <select value={freq} onChange={e => setFreq(e.target.value as Frequency)} style={{ width: '100%' }}>
            {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label>First occurrence
          <input type="date" required value={startDate} min={dateKey(new Date())} onChange={e => setStartDate(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>End date (optional)
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%' }} />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit">Make Recurring</button>
        </div>
      </form>
    </div>,
    document.body
  ));
}

export function AmountScopeDialog({ name, date, oldAmount, newAmount, onConfirm, onCancel }: {
  name: string;
  date: Date;
  oldAmount: number;
  newAmount: number;
  onConfirm: (scope: AmountScope) => void;
  onCancel: () => void;
}) {
  const [scope, setScope] = useState<AmountScope>('once');
  return (
  createPortal(
    <div style={overlay}>
      <form style={card} onSubmit={e => { e.preventDefault(); onConfirm(scope); }}>
        <h3 style={{ margin: 0 }}>Adjust "{name}"</h3>
        <div>${oldAmount.toFixed(2)} → ${newAmount.toFixed(2)} on {date.toLocaleDateString()}</div>
        <label><input type="radio" checked={scope === 'once'} onChange={() => setScope('once')} /> This occurrence only (1x)</label>
        <label><input type="radio" checked={scope === 'forward'} onChange={() => setScope('forward')} /> This and all future occurrences</label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit">Apply</button>
        </div>
      </form>
    </div>,
    document.body
  ));
}

export function DeleteScopeDialog({ name, date, onConfirm, onCancel }: {
  name: string;
  date: Date;
  onConfirm: (scope: DeleteScope) => void;
  onCancel: () => void;
}) {
  const [scope, setScope] = useState<DeleteScope>('once');
  return (
    createPortal(
      <div style={overlay}>
        <form style={card} onSubmit={e => { e.preventDefault(); onConfirm(scope); }}>
          <h3 style={{ margin: 0 }}>Delete "{name}"</h3>
          <div>Occurrence on {date.toLocaleDateString()}</div>
          <label><input type="radio" checked={scope === 'once'} onChange={() => setScope('once')} /> This occurrence only</label>
          <label><input type="radio" checked={scope === 'forward'} onChange={() => setScope('forward')} /> This and all future occurrences</label>
          <label><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> The entire series</label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="submit">Delete</button>
          </div>
        </form>
      </div>,
      document.body
    )
  );
}
