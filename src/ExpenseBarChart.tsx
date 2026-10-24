
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ExpenseBarChartProps {
  data: Record<string, number>;
  total: number;
  mode: 'percent' | 'dollar';
  transactions: any[];
}

function CustomTooltip({ active, payload, label, transactions }: any) {
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0];
  // Find transactions for this category (label)
  const txs = transactions.filter((tx: any) => (tx.category || tx.name || 'Other') === label);
  const total = txs.reduce((sum: number, tx: any) => sum + (tx.expense || 0), 0);
  return (
    <div
      style={{
        background: 'rgba(20,25,30,0.97)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 13,
        color: '#facc15',
        pointerEvents: 'none',
        zIndex: 10,
        boxShadow: '0 2px 12px #0008',
        minWidth: 180,
        whiteSpace: 'nowrap',
        fontWeight: 500
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{label}</div>
      <div>
        Amount: <span style={{ color: '#fff' }}>
          {typeof entry.value === 'number'
            ? (entry.dataKey === 'value' && entry.payload && entry.payload.value !== undefined
                ? (entry.payload.value.toFixed(2) + (entry.payload.percent ? '%' : ''))
                : entry.value.toFixed(2))
            : entry.value}
          {entry.unit || (entry.payload && entry.payload.unit) || ''}
        </span>
      </div>
      {txs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {txs.length <= 5 ? (
            <>
              <div style={{ color: '#fffbe6', fontWeight: 400, marginBottom: 2 }}>Transactions:</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {txs.map((tx: any, i: number) => (
                  <li key={i} style={{ color: '#fff', fontSize: 13, marginBottom: 2 }}>
                    {tx.name} <span style={{ color: '#aaa', fontSize: 12 }}>({tx.date.toLocaleDateString ? tx.date.toLocaleDateString() : String(tx.date)})</span> <span style={{ color: '#ef4444', fontWeight: 600 }}>-${tx.expense?.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div style={{ color: '#fffbe6', fontWeight: 400 }}>
              {txs.length} transactions<br />
              Total: <span style={{ color: '#ef4444', fontWeight: 600 }}>-${total.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExpenseBarChart({ data, total, mode, transactions }: ExpenseBarChartProps) {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({
      name,
      value: mode === 'percent' && total > 0 ? (value / total) * 100 : value
    }))
    .sort((a, b) => b.value - a.value);
  const tick = { fill: '#8d93a1', fontSize: 12 };

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 30 + 40)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
      >
        <XAxis type="number" tick={tick} axisLine={false} tickLine={false} domain={[0, mode === 'percent' ? 100 : 'dataMax']} tickFormatter={v => mode === 'percent' ? `${v.toFixed(0)}%` : `$${Math.round(v).toLocaleString()}`} />
        <YAxis type="category" dataKey="name" width={96} tick={tick} axisLine={false} tickLine={false} interval={0} />
        <Tooltip content={<CustomTooltip transactions={transactions} />} cursor={{ fill: 'rgba(250,204,21,0.08)' }} />
        <Bar dataKey="value" fill="#facc15" radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
