import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { IncomeHistoryData, IncomeHistoryEntry } from './types';
import { benchmarkSources, fetchLatestBenchmarks, incomeTier, loadBenchmarks, saveBenchmarks } from './householdIncomeBenchmarks';

const money = (value: number) => value.toLocaleString(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TAKE_HOME_RATE = 0.666;
const PAYCHECKS_PER_YEAR = 26;
const estimatedPaycheck = (annualAmount: number) => annualAmount / PAYCHECKS_PER_YEAR * TAKE_HOME_RATE;
const averageMonthlyTakeHome = (annualAmount: number) => annualAmount * TAKE_HOME_RATE / 12;

const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface IncomeHistoryProps {
  data: IncomeHistoryData;
  onChange: (data: IncomeHistoryData) => void;
}

type ChartRow = Omit<IncomeHistoryEntry, 'annualIncome' | 'age'> & {
  annualIncome: number | null;
  year: string;
  age: number | null;
  goal: number | null;
  raise: number | null;
  raisePercent: number | null;
};

function asIncomeEntry(row: ChartRow & { annualIncome: number }): IncomeHistoryEntry {
  return {
    id: row.id,
    effectiveDate: row.effectiveDate,
    age: row.age ?? undefined,
    employer: row.employer,
    title: row.title,
    annualIncome: row.annualIncome,
    notes: row.notes,
  };
}

function SalaryWhatIf({ latest, annualGoals, onClose }: {
  latest: (ChartRow & { annualIncome: number }) | undefined;
  annualGoals: Record<string, number>;
  onClose: () => void;
}) {
  const [salaryInput, setSalaryInput] = useState('');
  const [selectedYear, setSelectedYear] = useState(
    latest && Object.prototype.hasOwnProperty.call(annualGoals, latest.year) ? latest.year : ''
  );
  const salary = salaryInput.trim() === '' ? null : Number(salaryInput);
  const validSalary = salary !== null && Number.isFinite(salary) && salary >= 0;
  const goalYear = Object.prototype.hasOwnProperty.call(annualGoals, selectedYear) ? selectedYear : '';
  const goal = goalYear ? annualGoals[goalYear] : null;
  const change = validSalary && latest ? salary - latest.annualIncome : null;
  const percent = change !== null && latest && latest.annualIncome !== 0
    ? change / latest.annualIncome * 100
    : null;

  return (
    <section className="chartCard salaryWhatIf" id="salary-what-if" aria-labelledby="salary-what-if-title">
      <div className="incomeHistoryFormHead">
        <div>
          <h3 id="salary-what-if-title">Salary What-If</h3>
          <p>Explore an annual salary without saving it or changing your budget.</p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <div className="salaryWhatIfInputs">
        <label>Hypothetical annual salary
          <input type="number" min="0" step="0.01" value={salaryInput} onChange={event => setSalaryInput(event.target.value)} placeholder="Enter an annual salary" />
        </label>
        <label>Compare with annual goal
          <select value={goalYear} onChange={event => setSelectedYear(event.target.value)}>
            <option value="">No goal selected</option>
            {Object.entries(annualGoals).sort(([a], [b]) => a.localeCompare(b)).map(([year, amount]) => (
              <option key={year} value={year}>{year} · {money(amount)}</option>
            ))}
          </select>
        </label>
      </div>
      {salaryInput.trim() !== '' && !validSalary && <p className="salaryWhatIfError" role="alert">Enter a non-negative annual salary.</p>}
      {validSalary ? (
        <div aria-live="polite">
          <dl className="salaryWhatIfResults">
            <div><dt>Average monthly take-home</dt><dd>{money(averageMonthlyTakeHome(salary))}</dd></div>
            <div><dt>Estimated biweekly paycheck</dt><dd>{money(estimatedPaycheck(salary))}</dd></div>
            <div><dt>Annual change (gross)</dt><dd>{change === null ? '—' : money(change)}</dd></div>
            <div><dt>Change %</dt><dd>{percent === null ? '—' : `${percent.toFixed(2)}%`}</dd></div>
            <div><dt>Monthly take-home change</dt><dd>{change === null ? '—' : money(averageMonthlyTakeHome(change))}</dd></div>
            <div><dt>Paycheck change</dt><dd>{change === null ? '—' : money(estimatedPaycheck(change))}</dd></div>
            <div><dt>Difference from goal (gross)</dt><dd>{goal === null ? '—' : money(salary - goal)}</dd></div>
          </dl>
          <p className="salaryWhatIfHint">
            {latest
              ? `Changes compare with ${money(latest.annualIncome)} effective ${formatDate(latest.effectiveDate)}.`
              : 'Add a salary history entry to see changes from your latest salary.'}
            {latest?.annualIncome === 0 && ' Percentage change is unavailable when the previous salary is zero.'}
            {' '}Take-home estimates use 66.6% of gross salary and 26 biweekly paychecks per year. Monthly amounts are annual take-home averaged over 12 months.
          </p>
        </div>
      ) : <p className="salaryWhatIfHint">Enter a salary to see the comparison.</p>}
    </section>
  );
}

export default function IncomeHistory({ data, onChange }: IncomeHistoryProps) {
  const [effectiveDate, setEffectiveDate] = useState(todayKey);
  const [age, setAge] = useState('');
  const [goalYear, setGoalYear] = useState(String(today.getFullYear()));
  const [goalAmount, setGoalAmount] = useState('');
  const [employer, setEmployer] = useState('');
  const [title, setTitle] = useState('');
  const [annualIncome, setAnnualIncome] = useState('');
  const [annualGoal, setAnnualGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const salaryFormSection = useRef<HTMLDetailsElement>(null);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [showCleveland, setShowCleveland] = useState(true);
  const [showOhio, setShowOhio] = useState(true);
  const [benchmarks, setBenchmarks] = useState(loadBenchmarks);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [refreshError, setRefreshError] = useState(false);

  const chartData = useMemo(() => {
    const salaryRows: ChartRow[] = [...data.entries]
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
      .map((entry, index, entries) => {
      const previous = entries[index - 1];
      const raise = previous ? entry.annualIncome - previous.annualIncome : null;
      const year = entry.effectiveDate.slice(0, 4);
      const goal = data.annualGoals[year];
      return {
        ...entry,
        year,
        age: entry.age ?? null,
        goal: typeof goal === 'number' ? goal : null,
        raise,
        raisePercent: previous && previous.annualIncome !== 0
          ? (raise! / previous.annualIncome) * 100
          : null,
      };
    });
    const salaryYears = new Set(salaryRows.map(entry => entry.year));
    const goalOnlyRows: ChartRow[] = Object.entries(data.annualGoals)
      .filter(([year]) => !salaryYears.has(year))
      .map(([year, goal]) => ({
        id: `goal-${year}`,
        effectiveDate: `${year}-01-01`,
        year,
        age: null,
        employer: '',
        title: '',
        annualIncome: null,
        notes: '',
        goal,
        raise: null,
        raisePercent: null,
      }));
    return [...salaryRows, ...goalOnlyRows].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }, [data]);

  const historyRows = chartData.filter((entry): entry is ChartRow & { annualIncome: number } => entry.annualIncome !== null);
  const latest = historyRows[historyRows.length - 1];
  const sources = benchmarkSources(benchmarks.year);
  const bracketTop = Math.max(
    benchmarks.cleveland.bracket.lower * 1.1,
    benchmarks.ohio.bracket.lower * 1.1,
    benchmarks.cleveland.mean,
    benchmarks.ohio.mean,
    ...historyRows.map(entry => entry.annualIncome),
    ...Object.values(data.annualGoals)
  );

  const refreshBenchmarks = async () => {
    setRefreshing(true);
    setRefreshMessage('');
    setRefreshError(false);
    try {
      const updated = await fetchLatestBenchmarks();
      if (updated.year < benchmarks.year) {
        setRefreshMessage(`Census Reporter currently provides ${updated.year} ACS 1-year data; keeping the newer ${benchmarks.year} Census estimates. Try again when the provider updates.`);
        return;
      }
      saveBenchmarks(updated);
      setBenchmarks(updated);
      setRefreshMessage(`Updated using Census Reporter’s latest available ACS 1-year data (${updated.year}).`);
    } catch (error) {
      setRefreshError(true);
      setRefreshMessage(`Could not refresh household benchmarks: ${error instanceof Error ? error.message : 'Unexpected error'}. Keeping the existing ${benchmarks.year} estimates.`);
    } finally {
      setRefreshing(false);
    }
  };

  const resetForm = () => {
    setEffectiveDate(todayKey);
    setAge('');
    setEmployer('');
    setTitle('');
    setAnnualIncome('');
    setAnnualGoal('');
    setNotes('');
    setEditingId(null);
  };

  const startEditing = (entry: IncomeHistoryEntry) => {
    setEditingId(entry.id);
    setEffectiveDate(entry.effectiveDate);
    setAge(entry.age?.toString() || '');
    setEmployer(entry.employer);
    setTitle(entry.title);
    setAnnualIncome(String(entry.annualIncome));
    setAnnualGoal(data.annualGoals[entry.effectiveDate.slice(0, 4)]?.toString() || '');
    setNotes(entry.notes);
    if (salaryFormSection.current) {
      salaryFormSection.current.open = true;
      salaryFormSection.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const saveEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const salary = Number(annualIncome);
    const goal = annualGoal.trim() === '' ? undefined : Number(annualGoal);
    if (!Number.isFinite(salary) || salary < 0 || (goal !== undefined && (!Number.isFinite(goal) || goal < 0))) return;

    const entry: IncomeHistoryEntry = {
      id: editingId || crypto.randomUUID(),
      effectiveDate,
      ...(age.trim() ? { age: Number(age) } : {}),
      employer: employer.trim(),
      title: title.trim(),
      annualIncome: salary,
      notes: notes.trim(),
    };
    const nextGoals = { ...data.annualGoals };
    if (goal !== undefined) nextGoals[effectiveDate.slice(0, 4)] = goal;
    onChange({
      entries: editingId
        ? data.entries.map(item => item.id === editingId ? entry : item)
        : [...data.entries, entry],
      annualGoals: nextGoals,
    });
    resetForm();
  };

  const saveGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(goalAmount);
    if (!/^\d{4}$/.test(goalYear) || !Number.isFinite(amount) || amount < 0) return;
    onChange({ ...data, annualGoals: { ...data.annualGoals, [goalYear]: amount } });
    setGoalAmount('');
  };

  const deleteGoal = (year: string) => {
    const annualGoals = { ...data.annualGoals };
    delete annualGoals[year];
    onChange({ ...data, annualGoals });
  };

  const deleteEntry = (entry: IncomeHistoryEntry) => {
    if (!window.confirm(`Delete the salary history entry for ${formatDate(entry.effectiveDate)}?`)) return;
    onChange({ ...data, entries: data.entries.filter(item => item.id !== entry.id) });
    if (editingId === entry.id) resetForm();
  };

  return (
    <section className="incomeHistory">
      <div className="pageHead incomeHistoryHead">
        <div>
          <h2>Salary History</h2>
          <p>Track salary changes over time, separate from your budget and transactions.</p>
        </div>
        <button type="button" className="primary" aria-expanded={whatIfOpen} aria-controls={whatIfOpen ? 'salary-what-if' : undefined} onClick={() => setWhatIfOpen(open => !open)}>
          Salary What-If
        </button>
      </div>

      {whatIfOpen && <SalaryWhatIf latest={latest} annualGoals={data.annualGoals} onClose={() => setWhatIfOpen(false)} />}

      <div className="kpiGrid incomeHistoryKpis">
        <div className="kpi">
          <span className="kpiLabel">Latest annual income (gross)</span>
          <span className="kpiValue">{latest ? money(latest.annualIncome) : '—'}</span>
          <span className="kpiSub">{latest ? `${latest.employer || latest.title || 'Latest entry'} · ${formatDate(latest.effectiveDate)}` : 'Add your first salary entry'}</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Average monthly take-home</span>
          <span className="kpiValue">{latest ? money(averageMonthlyTakeHome(latest.annualIncome)) : '—'}</span>
          <span className="kpiSub">Estimated at 66.6% of gross</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Latest annual raise (gross)</span>
          <span className={`kpiValue${latest?.raise != null ? (latest.raise >= 0 ? ' pos' : ' neg') : ''}`}>
            {latest?.raise != null ? money(latest.raise) : '—'}
          </span>
          <span className="kpiSub">
            {latest?.raise != null && latest.raisePercent != null ? `${latest.raisePercent.toFixed(1)}% · ${money(estimatedPaycheck(latest.raise))} estimated per paycheck` : 'Compared with the previous entry'}
          </span>
        </div>
      </div>

      <div className="chartCard incomeHistoryChart">
        <div className="cardHead">
          <h3>Income over time</h3>
          <div className="incomeHistoryLegend" aria-label="Chart legend">
            <span><i className="incomeLegendActual" />Annual income</span>
            <span><i className="incomeLegendGoal" />Annual goal</span>
            <span><i className="incomeLegendRaise" />Annual raise</span>
          </div>
        </div>
        <div className="incomeBenchmarksControls">
          <label className="incomeBenchmarksToggle"><input type="checkbox" checked={showCleveland} onChange={event => setShowCleveland(event.target.checked)} /> Cleveland data</label>
          <label className="incomeBenchmarksToggle"><input type="checkbox" checked={showOhio} onChange={event => setShowOhio(event.target.checked)} /> Ohio data</label>
          <button type="button" onClick={refreshBenchmarks} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh data'}</button>
        </div>
        {refreshMessage && <p className={refreshError ? 'incomeBenchmarksStatus error' : 'incomeBenchmarksStatus'} role={refreshError ? 'alert' : 'status'}>{refreshMessage}</p>}
        {chartData.length === 0 ? (
          <div className="incomeHistoryChartEmpty">Your salary history and goals will appear here as you add entries.</div>
        ) : (
          <ResponsiveContainer width="100%" height={310}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="effectiveDate"
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={value => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
              />
              <YAxis
                yAxisId="income"
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={value => `$${Math.round(value / 1000)}k`}
                width={48}
              />
              <YAxis yAxisId="raise" orientation="right" hide />
              {showCleveland && (
                <>
                  <ReferenceArea yAxisId="income" y1={benchmarks.cleveland.bracket.lower} y2={benchmarks.cleveland.bracket.upper ?? bracketTop} fill="#38bdf8" fillOpacity={0.08} stroke="#38bdf8" strokeDasharray="3 4" ifOverflow="extendDomain" />
                  <ReferenceLine yAxisId="income" y={benchmarks.cleveland.median} stroke="#38bdf8" strokeWidth={2} strokeDasharray="3 4" ifOverflow="extendDomain" />
                  <ReferenceLine yAxisId="income" y={benchmarks.cleveland.mean} stroke="#38bdf8" strokeWidth={2} strokeDasharray="10 4 2 4" ifOverflow="extendDomain" />
                </>
              )}
              {showOhio && (
                <>
                  <ReferenceArea yAxisId="income" y1={benchmarks.ohio.bracket.lower} y2={benchmarks.ohio.bracket.upper ?? bracketTop} fill="#fb923c" fillOpacity={0.08} stroke="#fb923c" strokeDasharray="10 4" ifOverflow="extendDomain" />
                  <ReferenceLine yAxisId="income" y={benchmarks.ohio.median} stroke="#fb923c" strokeWidth={2} strokeDasharray="3 4" ifOverflow="extendDomain" />
                  <ReferenceLine yAxisId="income" y={benchmarks.ohio.mean} stroke="#fb923c" strokeWidth={2} strokeDasharray="10 4 2 4" ifOverflow="extendDomain" />
                </>
              )}
              <Tooltip
                labelFormatter={value => formatDate(String(value))}
                formatter={(value, name) => [money(Number(value)), name === 'annualIncome' ? 'Annual income' : name === 'goal' ? 'Annual goal' : 'Annual raise']}
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8 }}
              />
              <Bar yAxisId="raise" dataKey="raise" fill="var(--pos)" fillOpacity={0.45} maxBarSize={24} />
              <Line yAxisId="income" type="monotone" dataKey="annualIncome" name="annualIncome" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line yAxisId="income" type="monotone" dataKey="goal" name="goal" stroke="#8d93a1" strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {(showCleveland || showOhio) && (
          <div className="incomeBenchmarks">
            <div className="incomeBenchmarksLegend" aria-label="Household income benchmark values">
              {showCleveland && <><span><i className="benchmarkLine cleveland median" />Cleveland median: {money(benchmarks.cleveland.median)}</span>
                <span><i className="benchmarkLine cleveland mean" />Cleveland mean: {money(benchmarks.cleveland.mean)}</span>
                <span><i className="benchmarkBand cleveland" />Cleveland largest bracket: {benchmarks.cleveland.bracket.label}</span></>}
              {showOhio && <><span><i className="benchmarkLine ohio median" />Ohio median: {money(benchmarks.ohio.median)}</span>
                <span><i className="benchmarkLine ohio mean" />Ohio mean: {money(benchmarks.ohio.mean)}</span>
                <span><i className="benchmarkBand ohio" />Ohio largest bracket: {benchmarks.ohio.bracket.label}</span></>}
            </div>
            <details className="incomeBenchmarkDetails">
              <summary>Income tier approximation and sources</summary>
            <div className="incomeTiers" aria-label="Estimated income tiers">
              <strong>Income tier approximation · household of 4</strong>
              {latest ? ([
                ...(showCleveland ? [{ name: 'Cleveland', area: benchmarks.cleveland }] : []),
                ...(showOhio ? [{ name: 'Ohio', area: benchmarks.ohio }] : []),
              ].map(({ name, area }) => {
                const tier = incomeTier(latest.annualIncome, area.median, 4);
                return <div key={name}>{name}: <strong>{tier.label}</strong> · middle range {money(tier.lower)}–{money(tier.upper)}</div>;
              })) : <div>Add a salary entry to estimate your income tier.</div>}
            </div>
            <p>
              These are {benchmarks.year} ACS 1-year household estimates in {benchmarks.year} dollars, shown as fixed references, not historical values.
              Household income may include multiple earners and is not directly equivalent to an individual salary.
              The shaded bracket has the most households in each area; unequal bracket widths mean it is not necessarily the statistical mode.
              {' '}Mean is aggregate household income divided by the number of households.
              {' '}Sources: U.S. Census Bureau tables <a href={sources.distribution} target="_blank" rel="noreferrer">B19001</a>, <a href={sources.median} target="_blank" rel="noreferrer">B19013</a>, and <a href={sources.aggregate} target="_blank" rel="noreferrer">B19025</a>.
              {' '}Refresh uses <a href="https://censusreporter.org/" target="_blank" rel="noreferrer">Census Reporter</a> and cannot check for releases not yet available there.
            </p>
            <p>
              Tier estimates use your latest gross salary as an approximation of household income. This is a simplified, Pew-inspired local comparison—not an official Pew classification.
              It assumes each area’s unadjusted household median represents a three-person household, then scales it by √(4/3); this assumption may not reflect the area’s actual household sizes.
              Middle income is two-thirds to twice that adjusted median; lower and upper fall outside that range. Pew’s method adjusts household incomes for size and local cost of living before calculating its medians.
              {' '}<a href="https://www.pewresearch.org/short-reads/2024/09/16/are-you-in-the-american-middle-class/" target="_blank" rel="noreferrer">About Pew income tiers</a>.
            </p>
            </details>
          </div>
        )}
      </div>

      <details className="chartCard incomeHistoryCollapsible" ref={salaryFormSection}>
        <summary>{editingId ? 'Edit salary change' : 'Add salary change'}</summary>
      <form className="incomeHistoryForm" onSubmit={saveEntry}>
        <div className="incomeHistoryFormHead">
          <div>
            <p>Record annualized salary and the goal for that calendar year.</p>
          </div>
          {editingId && <button type="button" onClick={resetForm}>Cancel edit</button>}
        </div>
        <div className="incomeHistoryFields">
          <label>Effective date<input type="date" required value={effectiveDate} onChange={event => {
            const date = event.target.value;
            setEffectiveDate(date);
            setAnnualGoal(data.annualGoals[date.slice(0, 4)]?.toString() || '');
          }} /></label>
          <label>Age<input type="number" min="0" max="130" step="1" value={age} onChange={event => setAge(event.target.value)} placeholder="Optional" /></label>
          <label>Employer<input value={employer} onChange={event => setEmployer(event.target.value)} placeholder="Company" /></label>
          <label>Title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Role" /></label>
          <label>Actual annual income<input type="number" min="0" step="0.01" required value={annualIncome} onChange={event => setAnnualIncome(event.target.value)} placeholder="85000" /></label>
          <label>Annual income goal<input type="number" min="0" step="0.01" value={annualGoal} onChange={event => setAnnualGoal(event.target.value)} placeholder="Optional" /></label>
          <label className="incomeHistoryNotes">Notes<input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Promotion, job change, contract..." /></label>
        </div>
        <div className="incomeHistoryFormFoot">
          <span>Raise, monthly increase, biweekly increase, and goal difference are calculated automatically.</span>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Add entry'}</button>
        </div>
      </form>
      </details>

      <details className="chartCard incomeHistoryCollapsible">
        <summary>Annual income goals</summary>
      <div className="incomeHistoryGoals">
        <div className="incomeHistoryFormHead">
          <div>
            <p>Goals can be recorded for future years before a salary entry exists.</p>
          </div>
        </div>
        <form className="incomeHistoryGoalForm" onSubmit={saveGoal}>
          <label>Year<input type="number" min="1900" max="9999" step="1" required value={goalYear} onChange={event => setGoalYear(event.target.value)} /></label>
          <label>Annual goal<input type="number" min="0" step="0.01" required value={goalAmount} onChange={event => setGoalAmount(event.target.value)} placeholder="150000" /></label>
          <button type="submit" className="primary">Save goal</button>
        </form>
        <div className="incomeHistoryGoalList">
          {Object.entries(data.annualGoals).sort(([a], [b]) => a.localeCompare(b)).map(([year, goal]) => (
            <div className="incomeHistoryGoalItem" key={year}>
              <span><strong>{year}</strong><span>{money(goal)}</span></span>
              <button type="button" className="danger" onClick={() => deleteGoal(year)} aria-label={`Delete ${year} goal`}>Delete</button>
            </div>
          ))}
          {Object.keys(data.annualGoals).length === 0 && <span className="muted">No annual goals yet.</span>}
        </div>
      </div>
      </details>

      <div className="chartCard incomeHistoryTableCard">
        <div className="cardHead">
          <h3>Salary changes</h3>
          <span className="muted">{data.entries.length} {data.entries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <p className="incomeHistoryEstimateNote">Paycheck and monthly take-home estimates use 66.6% of gross salary and 26 biweekly paychecks a year. Monthly amounts are averages; actual months may have two or three paychecks.</p>
        {data.entries.length === 0 ? (
          <div className="incomeHistoryTableEmpty">No entries yet. Add your first salary change above.</div>
        ) : (
          <div className="incomeHistoryList">
            {[...historyRows].reverse().map(entry => (
              <details className="incomeHistoryRow" key={entry.id}>
                <summary className="incomeHistorySummary">
                  <div className="incomeHistoryIdentity">
                    <span className="incomeHistoryDate">{formatDate(entry.effectiveDate)}</span>
                    <strong>{entry.employer || '—'}</strong>
                    {entry.title && <span className="muted">{entry.title}</span>}
                  </div>
                  <div className="incomeHistorySummaryValues">
                    <div><span>Annual income (gross)</span><strong>{money(entry.annualIncome)}</strong></div>
                    <div><span>Est. biweekly paycheck</span><strong>{money(estimatedPaycheck(entry.annualIncome))}</strong></div>
                    <div><span>Annual goal (gross)</span><strong>{entry.goal == null ? '—' : money(entry.goal)}</strong></div>
                    <div><span>Annual raise (gross)</span><strong>{entry.raise == null ? '—' : money(entry.raise)}</strong></div>
                  </div>
                  <span className="incomeHistoryChevron" aria-hidden="true">⌄</span>
                </summary>
                <div className="incomeHistoryDetails">
                  <dl className="incomeHistoryDetailGrid">
                    <div><dt>Age</dt><dd>{entry.age ?? '—'}</dd></div>
                    <div><dt>Average monthly take-home</dt><dd>{money(averageMonthlyTakeHome(entry.annualIncome))}</dd></div>
                    <div><dt>Raise %</dt><dd>{entry.raisePercent == null ? '—' : `${entry.raisePercent.toFixed(2)}%`}</dd></div>
                    <div><dt>Monthly take-home change</dt><dd>{entry.raise == null ? '—' : money(averageMonthlyTakeHome(entry.raise))}</dd></div>
                    <div><dt>Paycheck change</dt><dd>{entry.raise == null ? '—' : money(estimatedPaycheck(entry.raise))}</dd></div>
                    <div><dt>Goal difference (gross)</dt><dd>{entry.goal == null ? '—' : money(entry.annualIncome - entry.goal)}</dd></div>
                    <div className="incomeHistoryDetailNotes"><dt>Notes</dt><dd>{entry.notes || '—'}</dd></div>
                  </dl>
                  <div className="incomeHistoryActions">
                    <button type="button" onClick={() => startEditing(asIncomeEntry(entry))}>Edit</button>
                    <button type="button" className="danger" onClick={() => deleteEntry(asIncomeEntry(entry))}>Delete</button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
