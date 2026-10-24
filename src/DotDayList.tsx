
import React from 'react';
import { amountFor, dateKey, isSkipped, stepDate } from './recurrence';

interface DotDayListProps {
  incomes: any[];
  expenses: any[];
  postedMap: Record<string, boolean>;
  onPostedChange: (id: string) => void;
}

export default function DotDayList({ incomes, expenses, postedMap, onPostedChange }: DotDayListProps) {

  const t = new Date();
  const todayKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  type Tx = { id: string; name: string; date: Date; amount: number; type: 'income' | 'expense'; pastDue: boolean };
  const txs: Tx[] = [];

  // Every unposted past-due occurrence, plus the next unposted upcoming one for recurring items
  const collect = (item: any, type: 'income' | 'expense') => {
    const current = new Date(item.startDate);
    const push = (amount: number) => txs.push({
      id: item.id + current.toISOString(),
      name: item.name,
      date: new Date(current),
      amount,
      type,
      pastDue: dateKey(current) < todayKey,
    });
    if (!item.isRecurring) {
      if (!postedMap[item.id + current.toISOString()]) push(item.amount);
      return;
    }
    let guard = 0;
    while ((!item.endDate || dateKey(current) <= item.endDate) && guard++ < 5000) {
      if (!isSkipped(item, current) && !postedMap[item.id + current.toISOString()]) {
        push(amountFor(item, current));
        if (dateKey(current) >= todayKey) break;
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
  // Filter out posted transactions
  const pastDue = txs.filter(tx => tx.pastDue);
  const next10 = [...pastDue, ...txs.filter(tx => !tx.pastDue).slice(0, 10)];

  return (
    <div className="dotList">
      {next10.length === 0 && <div className="dotEmpty">No upcoming transactions</div>}
      {next10.map(tx => (
        <label key={tx.id} className={`dotRow ${tx.type}${tx.pastDue ? ' pastDue' : ''}`}>
          <input type="checkbox" checked={!!postedMap[tx.id]} onChange={() => onPostedChange(tx.id)} />
          <span className="dotMain">
            <span className="dotName">{tx.name}</span>
            <span className="dotDate">{tx.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{tx.pastDue && <span className="pastDueTag"> · Past due</span>}</span>
          </span>
          <span className="dotAmt">{tx.type === 'expense' ? '-' : '+'}${tx.amount.toFixed(2)}</span>
        </label>
      ))}
    </div>
  );
}
