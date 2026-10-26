
import { amountFor, dateKey, getPaycheckPeriod, isSkipped, stepDate } from './recurrence';
import type { Expense, Income } from './types';

interface DotDayListProps {
  incomes: Income[];
  expenses: Expense[];
  postedMap: Record<string, boolean>;
  onPostedChange: (id: string) => void;
}

export default function DotDayList({ incomes, expenses, postedMap, onPostedChange }: DotDayListProps) {

  const t = new Date();
  const todayKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const paycheckPeriod = getPaycheckPeriod(incomes, t);
  const paycheckStart = paycheckPeriod.lastPaycheck ? dateKey(paycheckPeriod.lastPaycheck) : null;
  const paycheckEnd = paycheckPeriod.nextPaycheck ? dateKey(paycheckPeriod.nextPaycheck) : null;
  const hasPayPeriod = !!paycheckStart;
  const horizon = new Date(t);
  horizon.setFullYear(horizon.getFullYear() + 1);
  const displayEnd = paycheckEnd || dateKey(horizon);
  type Tx = { id: string; name: string; date: Date; amount: number; type: 'income' | 'expense'; pastDue: boolean; posted: boolean };
  const txs: Tx[] = [];

  const collect = (item: Income | Expense, type: 'income' | 'expense') => {
    const current = new Date(item.startDate);
    const push = (amount: number) => txs.push({
      id: item.id + current.toISOString(),
      name: item.name,
      date: new Date(current),
      amount,
      type,
      pastDue: dateKey(current) < todayKey,
      posted: !!postedMap[item.id + current.toISOString()],
    });
    if (!item.isRecurring) {
      const key = dateKey(current);
      if (hasPayPeriod) {
        if (key >= paycheckStart! && key < displayEnd) push(item.amount);
      } else if (!postedMap[item.id + current.toISOString()]) {
        push(item.amount);
      }
      return;
    }
    let guard = 0;
    while ((!item.endDate || dateKey(current) <= item.endDate) && guard++ < 5000) {
      const key = dateKey(current);
      if (hasPayPeriod) {
        if (key >= displayEnd) break;
        if (key >= paycheckStart! && !isSkipped(item, current)) push(amountFor(item, current));
      } else if (!isSkipped(item, current) && !postedMap[item.id + current.toISOString()]) {
        push(amountFor(item, current));
        if (key >= todayKey) break;
      }
      stepDate(current, item.frequency);
    }
  };
  incomes.forEach(item => collect(item, 'income'));
  expenses.forEach(item => collect(item, 'expense'));
  // Sort by date ascending, then by type (expenses first)
  txs.sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    if (d !== 0) return d;
    if (a.type === b.type) return 0;
    return a.type === 'expense' ? -1 : 1;
  });
  const pastDue = txs.filter(tx => tx.pastDue);
  const next10 = hasPayPeriod
    ? txs
    : [...pastDue, ...txs.filter(tx => !tx.pastDue).slice(0, 10)];

  return (
    <div className="dotList">
      {next10.length === 0 && <div className="dotEmpty">{hasPayPeriod ? 'No transactions in this pay period' : 'No upcoming transactions'}</div>}
      {next10.map(tx => (
        <label key={tx.id} className={`dotRow ${tx.type}${tx.pastDue ? ' pastDue' : ''}${tx.posted ? ' isPosted' : ''}`}>
          <input type="checkbox" checked={tx.posted} onChange={() => onPostedChange(tx.id)} />
          <span className="dotMain">
            <span className="dotName">{tx.name}</span>
            <span className="dotDate">{new Date(`${dateKey(tx.date)}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{tx.pastDue && <span className="pastDueTag"> · Past due</span>}</span>
          </span>
          <span className="dotAmt">{tx.type === 'expense' ? '-' : '+'}${tx.amount.toFixed(2)}</span>
        </label>
      ))}
    </div>
  );
}
