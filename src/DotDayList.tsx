
import React from 'react';
import { amountFor, isSkipped } from './recurrence';

interface DotDayListProps {
  incomes: any[];
  expenses: any[];
  postedMap: Record<string, boolean>;
  onPostedChange: (id: string) => void;
}

export default function DotDayList({ incomes, expenses, postedMap, onPostedChange }: DotDayListProps) {

  // Gather all future transactions (income and expense)
  const today = new Date();
  today.setHours(0,0,0,0);
  let txs = [];
  incomes.forEach(item => {
    let current = new Date(item.startDate);
    if (item.isRecurring) {
      while (current < today || isSkipped(item, current)) {
        if (item.frequency === 'weekly') current.setDate(current.getDate() + 7);
        else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14);
        else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2);
        else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1);
        else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3);
        else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6);
        else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1);
      }
      if (!item.endDate || new Date(item.endDate) >= current) {
        txs.push({
          id: item.id + current.toISOString(),
          name: item.name,
          date: new Date(current),
          amount: amountFor(item, current),
          type: 'income',
        });
      }
    } else {
      if (current >= today) {
        txs.push({
          id: item.id + current.toISOString(),
          name: item.name,
          date: new Date(current),
          amount: item.amount,
          type: 'income',
        });
      }
    }
  });
  expenses.forEach(item => {
    let current = new Date(item.startDate);
    if (item.isRecurring) {
      while (current < today || isSkipped(item, current)) {
        if (item.frequency === 'weekly') current.setDate(current.getDate() + 7);
        else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14);
        else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2);
        else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1);
        else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3);
        else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6);
        else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1);
      }
      if (!item.endDate || new Date(item.endDate) >= current) {
        txs.push({
          id: item.id + current.toISOString(),
          name: item.name,
          date: new Date(current),
          amount: amountFor(item, current),
          type: 'expense',
        });
      }
    } else {
      if (current >= today) {
        txs.push({
          id: item.id + current.toISOString(),
          name: item.name,
          date: new Date(current),
          amount: item.amount,
          type: 'expense',
        });
      }
    }
  });
  // Sort by date ascending, then by type (expenses first)
  txs.sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    if (d !== 0) return d;
    if (a.type === b.type) return 0;
    return a.type === 'expense' ? -1 : 1;
  });
  // Filter out posted transactions
  const unpostedTxs = txs.filter(tx => !postedMap[tx.id]);
  const next10 = unpostedTxs.slice(0, 10);

  return (
    <div className="dotList">
      {next10.length === 0 && <div className="dotEmpty">No upcoming transactions</div>}
      {next10.map(tx => (
        <label key={tx.id} className={`dotRow ${tx.type}`}>
          <input type="checkbox" checked={!!postedMap[tx.id]} onChange={() => onPostedChange(tx.id)} />
          <span className="dotMain">
            <span className="dotName">{tx.name}</span>
            <span className="dotDate">{tx.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </span>
          <span className="dotAmt">{tx.type === 'expense' ? '-' : '+'}${tx.amount.toFixed(2)}</span>
        </label>
      ))}
    </div>
  );
}
