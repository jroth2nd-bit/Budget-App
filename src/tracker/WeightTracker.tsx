import { forwardRef, useEffect, useImperativeHandle, useState, type FormEvent } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrackerStorage } from '../TrackerHost';
import tracker from './tracker.js';
import { addMonths, dateNumber, dateString, expectedWeight, makePlan, monthsBetween, projection, trackStatus, validDate } from './weight.js';
import type { WeightData, WeightPlan, WeighIn } from './weight.js';
import './weight.css';

const KEY = 'mercy-ledger-v1';
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const formatDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const pounds = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(1)} lb`;
const pace = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} lb/mo`;
const label = (type: WeightPlan['type']) => type === 'bulk' ? 'Bulk' : 'Cut';
const reached = (plan: WeightPlan, weight: number) => plan.type === 'bulk' ? weight >= plan.targetWeight : weight <= plan.targetWeight;

export type WeightTrackerHandle = { openPlan(): void; openWeighIn(): void };
export type WeightActionState = { ready: boolean; hasPlans: boolean; hasActivePlan: boolean };

const WeightTracker = forwardRef<WeightTrackerHandle, { storage: TrackerStorage; onActionState: (state: WeightActionState) => void }>(function WeightTracker({ storage, onActionState }, ref) {
  const [snapshot, setSnapshot] = useState(() => {
    try {
      const raw = storage.getItem(KEY);
      return { raw, state: raw ? tracker.validateState(JSON.parse(raw)) : tracker.emptyState(), error: '' };
    } catch (error) {
      return { raw: null, state: null, error: `Could not load weight tracker: ${error instanceof Error ? error.message : String(error)}` };
    }
  });
  const [error, setError] = useState('');
  const [form, setForm] = useState<'plan' | 'weigh-in' | null>(null);
  const [editing, setEditing] = useState<WeighIn | null>(null);
  const [type, setType] = useState<WeightPlan['type']>('bulk');
  const [startDate, setStartDate] = useState(todayKey);
  const [startWeight, setStartWeight] = useState('');
  const [startWeightOverridden, setStartWeightOverridden] = useState(false);
  const [targetWeight, setTargetWeight] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [entryDate, setEntryDate] = useState(todayKey);
  const [entryWeight, setEntryWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [range, setRange] = useState('90');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const today = todayKey();
  const data = snapshot.state?.weight;
  const plans = data?.plans || [];
  const entries = [...(data?.weighIns || [])].sort((a, b) => b.date.localeCompare(a.date));
  const active = plans.find(plan => plan.status === 'active');
  const hasActivePlan = !!active;
  const ready = !!snapshot.state;
  const latest = entries[0];
  const planEntry = active ? entries.find(entry => entry.planId === active.id) : undefined;
  const comparison = active && planEntry ? planEntry.weight - planEntry.expectedWeight : null;
  const trend = active ? projection(active, entries, today) : null;
  const targetPace = active ? (active.targetWeight - active.startWeight) / monthsBetween(active.startDate, active.plannedEndDate) : null;
  let preview: string | null = null;
  if (form === 'plan' && startWeight.trim() && (targetWeight.trim() || targetDate)) {
    try {
      if (!validDate(startDate) || startDate > today) throw new Error('Choose today or a past start date.');
      const proposed = makePlan({ id: 'preview', type, startDate, startWeight: Number(startWeight), targetWeight: targetWeight.trim() ? Number(targetWeight) : null, targetDate: targetDate || null });
      preview = `Planned target: ${pounds(proposed.targetWeight)} by ${formatDate(proposed.plannedEndDate)} · ${pace((proposed.targetWeight - proposed.startWeight) / monthsBetween(proposed.startDate, proposed.plannedEndDate))}`;
    } catch (failure) {
      preview = failure instanceof Error ? failure.message : String(failure);
    }
  }
  const start = range === 'all' ? '' : range === 'custom' ? rangeStart : dateString(dateNumber(today) - Number(range) + 1);
  const end = range === 'custom' ? rangeEnd : today;
  const inRange = (date: string) => (!start || date >= start) && (!end || date <= end);
  const filtered = [...entries].filter(entry => inRange(entry.date)).reverse();
  const shownPlans = plans.filter(plan => (!end || plan.startDate <= end) && (!start || (plan.actualEndDate || today) >= start));
  const chartDates = new Set(filtered.map(entry => entry.date));
  shownPlans.forEach(plan => {
    [plan.startDate, plan.actualEndDate || (plan.plannedEndDate < today ? plan.plannedEndDate : today), start, end].forEach(date => {
      if (date && inRange(date) && date >= plan.startDate && date <= (plan.actualEndDate || today)) chartDates.add(date);
    });
    const last = plan.actualEndDate || today;
    for (let month = 1; month <= 1200; month++) {
      const date = addMonths(plan.startDate, month);
      if (date > last || date > plan.plannedEndDate) break;
      if (inRange(date)) chartDates.add(date);
    }
  });
  const chartRows = [...chartDates].sort().map(date => {
    const entry = filtered.find(item => item.date === date);
    const row: Record<string, string | number | null> = { date: dateNumber(date), actual: entry?.weight ?? null };
    shownPlans.forEach(plan => {
      row[`target-${plan.id}`] = date >= plan.startDate && date <= (plan.actualEndDate || today) ? expectedWeight(plan, date) : null;
    });
    return row;
  });

  const save = (next: WeightData) => {
    if (!snapshot.state) return false;
    try {
      if (storage.getItem(KEY) !== snapshot.raw) throw new Error('Tracker data changed in another tab. Reload before editing.');
      const state = tracker.validateState({ ...snapshot.state, weight: next });
      const raw = JSON.stringify(state);
      storage.setItem(KEY, raw);
      setSnapshot({ raw, state, error: '' });
      setError('');
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    }
  };
  const openPlan = () => {
    setType('bulk'); setStartDate(today); setStartWeight(latest ? String(latest.weight) : ''); setStartWeightOverridden(false); setTargetWeight(''); setTargetDate(''); setError(''); setForm('plan');
  };
  const submitPlan = (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    try {
      if (!validDate(startDate) || startDate > today) throw new Error('Choose today or a past start date.');
      const previous = plans[plans.length - 1];
      if (active && startDate < active.startDate) throw new Error('The new plan cannot start before the current plan started.');
      if (!active && previous?.actualEndDate && startDate < previous.actualEndDate) throw new Error(`The new plan cannot start before the last plan ended on ${formatDate(previous.actualEndDate)}.`);
      if (active && entries.some(entry => entry.planId === active.id && entry.date > startDate)) throw new Error('The current plan has weigh-ins after this start date. Choose a later start date or correct those weigh-ins first.');
      const plan = makePlan({ id: crypto.randomUUID(), type, startDate, startWeight: Number(startWeight), targetWeight: targetWeight.trim() ? Number(targetWeight) : null, targetDate: targetDate || null });
      if (active && !window.confirm(`Start this new plan and cancel the current active plan on ${formatDate(startDate)}?`)) return;
      const nextPlans = plans.map(item => item.id === active?.id ? { ...item, status: 'cancelled' as const, actualEndDate: startDate } : item);
      if (save({ ...data, plans: [...nextPlans, plan] })) setForm(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const openEntry = (entry?: WeighIn) => {
    setEditing(entry || null); setEntryDate(entry?.date || today); setEntryWeight(entry ? String(entry.weight) : ''); setNotes(entry?.notes || ''); setError(''); setForm('weigh-in');
  };
  useImperativeHandle(ref, () => ({ openPlan, openWeighIn: () => openEntry() }));
  useEffect(() => {
    onActionState({ ready, hasPlans: plans.length > 0, hasActivePlan });
    return () => onActionState({ ready: false, hasPlans: false, hasActivePlan: false });
  }, [ready, plans.length, hasActivePlan, onActionState]);
  const submitEntry = (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    try {
      if (!entryDate || entryDate > today) throw new Error('Choose today or a past date.');
      const owner = editing ? plans.find(plan => plan.id === editing.planId) : [...plans].reverse().find(plan => plan.startDate <= entryDate && (!plan.actualEndDate || plan.actualEndDate >= entryDate));
      if (!owner || entryDate < owner.startDate || (owner.actualEndDate && entryDate > owner.actualEndDate)) throw new Error('The date must belong to a plan.');
      if (entries.some(item => item.date === entryDate && item.id !== editing?.id)) throw new Error('A weigh-in already exists on this date. Edit that entry instead.');
      const weight = Number(entryWeight);
      if (!entryWeight.trim() || !Number.isFinite(weight) || weight <= 0) throw new Error('Enter a weight greater than zero.');
      if (notes.length > 4000) throw new Error('Notes must be 4,000 characters or fewer.');
      if (editing && !window.confirm('Save these changes to the historical weigh-in?')) return;
      const expected = expectedWeight(owner, entryDate);
      const entry: WeighIn = { id: editing?.id || crypto.randomUUID(), date: entryDate, weight, notes, planId: owner.id, planType: owner.type, expectedWeight: expected, difference: weight - expected };
      const nextEntries = [...entries.filter(item => item.id !== editing?.id), entry];
      let nextPlans = plans;
      if (owner.status === 'active' && reached(owner, weight)) {
        const later = nextEntries.some(item => item.planId === owner.id && item.date > entryDate);
        if (!later && window.confirm('This weigh-in reached the target. Complete the plan on this date?')) {
          nextPlans = plans.map(plan => plan.id === owner.id ? { ...plan, status: 'completed', actualEndDate: entryDate } : plan);
        }
      }
      if (save({ plans: nextPlans, weighIns: nextEntries })) setForm(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const deleteEntry = (entry: WeighIn) => {
    if (data && window.confirm(`Delete the weigh-in on ${formatDate(entry.date)}? This cannot be undone.`)) save({ ...data, weighIns: entries.filter(item => item.id !== entry.id) });
  };
  const reopen = (plan: WeightPlan) => {
    if (!data) return;
    if (active || plans[plans.length - 1]?.id !== plan.id) {
      setError('Only the most recent completed plan can be reopened, and only when no plan is active.');
      return;
    }
    if (window.confirm('Reopen this completed plan?')) save({ ...data, plans: plans.map(item => item.id === plan.id ? { ...item, status: 'active', actualEndDate: null } : item) });
  };
  const complete = () => {
    if (!data || !active || !planEntry || !reached(active, planEntry.weight)) return;
    if (window.confirm(`Complete this plan on ${formatDate(planEntry.date)}?`)) save({ ...data, plans: plans.map(plan => plan.id === active.id ? { ...plan, status: 'completed', actualEndDate: planEntry.date } : plan) });
  };

  if (!snapshot.state || !data) return <p role="alert">{snapshot.error}</p>;
  return <div className="weightPage">
    {error && <p className="weightError" role="alert">{error}</p>}
    {form === 'plan' && <section className="card weightForm"><h3>New plan</h3><p>Choose today or a past start date. Enter a target weight, a target date, or both. Maximum: bulk 2 lb/month; cut 5 lb/month.</p><form onSubmit={submitPlan}><div className="weightFormGrid">
      <label>Plan type<select value={type} onChange={event => setType(event.target.value as WeightPlan['type'])}><option value="bulk">Bulk</option><option value="cut">Cut</option></select></label>
      <label>Start date<input type="date" max={today} required value={startDate} onChange={event => {
        const date = event.target.value;
        setStartDate(date);
        if (!startWeightOverridden) {
          const previousWeight = entries.find(entry => entry.date <= date);
          setStartWeight(previousWeight ? String(previousWeight.weight) : '');
        }
      }} /></label>
      <label>Starting weight (lb)<input type="number" step="any" min="0.01" required value={startWeight} onChange={event => { setStartWeight(event.target.value); setStartWeightOverridden(true); }} /></label>
      <label>Target weight (lb)<input type="number" step="any" min="0.01" value={targetWeight} onChange={event => setTargetWeight(event.target.value)} /></label>
      <label>Target date<input type="date" min={startDate || undefined} value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label>
    </div>{preview && <p role="status">{preview}</p>}<div className="weightActions"><button className="primary" type="submit">Save plan</button><button type="button" onClick={() => { setForm(null); setError(''); }}>Cancel</button></div></form></section>}
    {form === 'weigh-in' && <section className="card weightForm"><h3>{editing ? 'Edit weigh-in' : 'Add weigh-in'}</h3><p>One entry per date. The date must fall within a plan.</p><form onSubmit={submitEntry}><div className="weightFormGrid">
      <label>Date<input type="date" max={today} required value={entryDate} onChange={event => setEntryDate(event.target.value)} /></label>
      <label>Weight (lb)<input type="number" step="any" min="0.01" required value={entryWeight} onChange={event => setEntryWeight(event.target.value)} /></label>
      <label className="weightNotes">Notes<textarea maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional context" /></label>
    </div><div className="weightActions"><button className="primary" type="submit">Save weigh-in</button><button type="button" onClick={() => { setForm(null); setError(''); }}>Cancel</button></div></form></section>}
    {active ? <section className="card weightOverview"><div className="weightSectionHead"><div><p className="weightKicker">CURRENT PHASE</p><h3>{label(active.type)} <span className="weightPlanStatus">Active</span></h3></div><div className="weightActions">{comparison !== null ? <span className={`weightBadge ${trackStatus(comparison).replace(/ /g, '-').toLowerCase()}`}>{trackStatus(comparison)}</span> : <span className="weightPlanStatus">Awaiting plan weigh-in</span>}{planEntry && reached(active, planEntry.weight) && <button onClick={complete}>Complete plan</button>}</div></div>
      <div className="weightStats">
        <Metric name="Starting weight" value={pounds(active.startWeight)} detail={formatDate(active.startDate)} />
        <Metric name="Current weight" value={pounds(latest?.weight)} detail={latest ? `Latest: ${formatDate(latest.date)}` : 'No weigh-ins yet'} />
        <Metric name="Target weight" value={pounds(active.targetWeight)} />
        <Metric name="Expected today" value={pounds(expectedWeight(active, today))} />
        <Metric name="Actual weight today" value={pounds(latest?.weight)} detail={latest ? `Latest recorded: ${formatDate(latest.date)}` : 'No weigh-ins yet'} />
        <Metric name="Difference" value={comparison === null ? '—' : `${comparison > 0 ? '+' : ''}${comparison.toFixed(1)} lb`} detail={planEntry ? `Compared on ${formatDate(planEntry.date)}` : 'No weigh-in in this plan'} />
        <Metric name="Days remaining" value={String(Math.max(0, dateNumber(active.plannedEndDate) - dateNumber(today)))} />
        <Metric name="Planned end" value={formatDate(active.plannedEndDate)} />
        <Metric name="Projected completion" value={trend?.completion ? formatDate(trend.completion) : 'Unavailable'} />
        <Metric name="Projected weight at end" value={pounds(trend?.endWeight)} />
        <Metric name="Current monthly pace" value={pace(trend?.currentMonthlyRate)} detail={`Difference from target pace: ${pace(trend?.differenceRate)}`} />
        <Metric name="Target monthly pace" value={pace(targetPace)} />
      </div>
      <p className="weightHint">{comparison !== null ? `${comparison > 0 ? 'Above' : comparison < 0 ? 'Below' : 'At'} expected weight on the latest plan weigh-in date${comparison === 0 ? '' : ` (${active.type === 'bulk' ? comparison > 0 ? 'gaining faster' : 'gaining slower' : comparison > 0 ? 'losing slower' : 'losing faster'} than planned)`}. ` : ''}Projections use a linear trend of at least two plan weigh-ins within the last 30 days; completion is unavailable when the trend is moving away from the goal.</p>
    </section> : <section className="card"><h3>No active plan</h3><p>Start a bulk or cut to track progress against a fixed goal. {latest && `Your latest weigh-in was ${pounds(latest.weight)} on ${formatDate(latest.date)}.`}</p></section>}
    <section className="card weightHistory"><div className="weightSectionHead"><div><p className="weightKicker">YOUR HISTORY</p><h3>Progress over time</h3></div><label>History range<select value={range} onChange={event => setRange(event.target.value)}><option value="30">Last 30 Days</option><option value="60">Last 60 Days</option><option value="90">Last 90 Days</option><option value="custom">Custom Range</option><option value="all">All Time</option></select></label></div>
      {range === 'custom' && <div className="weightFormGrid"><label>From<input type="date" value={rangeStart} onChange={event => setRangeStart(event.target.value)} /></label><label>To<input type="date" value={rangeEnd} onChange={event => setRangeEnd(event.target.value)} /></label></div>}
      {range === 'custom' && rangeStart && rangeEnd && rangeStart > rangeEnd ? <p role="alert" className="weightError">The start of the range must be on or before its end.</p> : <>
        <div className="weightCharts"><Chart title="Weight history" rows={chartRows} plans={[]} /><Chart title="Actual vs target" rows={chartRows} plans={shownPlans} /></div>
        <h3>Plan timeline</h3><p className="weightHint">Bulk and cut dates are shown for each phase; cancelled and completed phases end on their actual end date.</p>
        <div className="weightTimeline">{shownPlans.length ? [...shownPlans].reverse().map(plan => {
          const first = start || shownPlans.reduce((min, item) => item.startDate < min ? item.startDate : min, plan.startDate);
          const last = end || today;
          const duration = Math.max(1, dateNumber(last) - dateNumber(first) + 1);
          const phaseStart = Math.max(dateNumber(first), dateNumber(plan.startDate));
          const phaseEnd = Math.min(dateNumber(last), dateNumber(plan.actualEndDate || today));
          return <div key={plan.id} className={`weightPhase ${plan.type}`}><strong>{label(plan.type)}</strong><span>{formatDate(plan.startDate)} – {formatDate(plan.actualEndDate || today)}</span><div className="weightTimelineTrack"><div className="weightTimelineBar" style={{ marginLeft: `${(phaseStart - dateNumber(first)) / duration * 100}%`, width: `${Math.max(1, (phaseEnd - phaseStart + 1) / duration * 100)}%` }} /></div><span>{plan.status} · target {pounds(plan.targetWeight)} by {formatDate(plan.plannedEndDate)}</span>{plan.status === 'completed' && <button onClick={() => reopen(plan)}>Reopen</button>}</div>;
        }) : <p>No plans in this range.</p>}</div>
        <h3>Weigh-ins</h3>{filtered.length ? <div className="weightEntries">{[...filtered].reverse().map(entry => <article key={entry.id} className="weightEntry"><div><strong>{pounds(entry.weight)}</strong><span>{formatDate(entry.date)} · {label(entry.planType)}</span><span>Expected {pounds(entry.expectedWeight)} · {entry.difference > 0 ? '+' : ''}{entry.difference.toFixed(1)} lb</span>{entry.notes && <p>{entry.notes}</p>}</div><div className="weightActions"><button onClick={() => openEntry(entry)}>Edit</button><button onClick={() => deleteEntry(entry)}>Delete</button></div></article>)}</div> : <p>No weigh-ins in this range.</p>}
      </>}
    </section>
  </div>;
});

function Metric({ name, value, detail }: { name: string; value: string; detail?: string }) {
  return <div className="weightMetric"><span>{name}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function Chart({ title, rows, plans }: { title: string; rows: Record<string, string | number | null>[]; plans: WeightPlan[] }) {
  return <div className="weightChart"><h3>{title}</h3>{rows.length ? <div className="weightChartCanvas"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 10, right: 12, bottom: 5, left: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: 'var(--muted)', fontSize: 11 }} minTickGap={35} tickFormatter={value => dateString(Math.round(Number(value))).slice(5)} /><YAxis domain={['auto', 'auto']} width={44} tick={{ fill: 'var(--muted)', fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} labelFormatter={value => formatDate(dateString(Number(value)))} /><Line name="Actual" type="linear" dataKey="actual" stroke="#f0ad79" strokeWidth={2} dot={{ r: 3 }} connectNulls />{plans.map(plan => <Line key={plan.id} name={`${label(plan.type)} target`} type="linear" dataKey={`target-${plan.id}`} stroke={plan.type === 'bulk' ? '#62d8c0' : '#8dbffc'} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls />)}</LineChart></ResponsiveContainer></div> : <p>No data in this range.</p>}<p className="weightHint">{plans.length ? 'Copper: actual · Teal: bulk target · Blue: cut target' : 'Copper: actual weigh-ins'}</p></div>;
}

export default WeightTracker;
