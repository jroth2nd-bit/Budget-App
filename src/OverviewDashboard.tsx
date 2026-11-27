import type { ReactNode } from 'react';
import { BookIcon, BuildsIcon, IncomeHistoryIcon, MercyIcon, SkillsIcon, StoicIcon, TransactionsIcon, WeightIcon } from './NavIcons';
import { dateKey, getPaycheckPeriod } from './recurrence';
import type { Income, IncomeHistoryData } from './types';
import type { TrackerSummary } from './TrackerHost';
import type { TrackerPage } from './tracker/TrackerView';
import tracker from './tracker/tracker.js';
import { dateNumber, trackStatus } from './tracker/weight.js';
import { currentStoicStreak, stoicCompletion } from './tracker/stoic.js';
import './overview.css';

export type OverviewPage = 'transactions' | 'income-history' | TrackerPage;
type Data = { incomes: Income[]; salary: IncomeHistoryData; budgetStatus: 'off' | 'loading' | 'saved' | 'saving' | 'error'; trackers: TrackerSummary; today: string };
type Card = { id: OverviewPage; title: string; icon: ReactNode; summary: (data: Data) => ReactNode; accent: string };

function trackerSummary(data: Data, render: (state: Extract<TrackerSummary, { status: 'ready' }>['data']) => ReactNode) {
  if (data.trackers.status === 'loading') return <p>Loading tracker data…</p>;
  if (data.trackers.status === 'error') return <p className="overviewError">{data.trackers.message}</p>;
  return render(data.trackers.data);
}

export const overviewCards: Card[] = [
  {
    id: 'transactions', title: 'Budget Tracker', icon: <TransactionsIcon />, accent: 'budget',
    summary: ({ incomes, today, budgetStatus }) => {
      if (budgetStatus === 'loading') return <p>Loading budget data…</p>;
      if (budgetStatus === 'error') return <p className="overviewError">Budget sync failed; summary unavailable.</p>;
      const next = getPaycheckPeriod(incomes).nextPaycheck;
      const days = next ? dateNumber(dateKey(next)) - dateNumber(today) : null;
      return <>
        <div className="overviewChartContainer">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--accent)' }}>∿∿∿</div>
            <small style={{ color: 'var(--muted)' }}>Income vs Expense</small>
          </div>
        </div>
        <div className="overviewStatsGrid">
          <div className="overviewStat">
            <strong>{days === null ? '—' : days}</strong>
            <span>Days to Paycheck</span>
          </div>
          <div className="overviewStat">
            <strong style={{ color: 'var(--pos)' }}>+1</strong>
            <span>Months Active</span>
          </div>
        </div>
      </>;
    },
  },
  {
    id: 'income-history', title: 'Salary Tracker', icon: <IncomeHistoryIcon />, accent: 'salary',
    summary: ({ salary, budgetStatus }) => {
      if (budgetStatus === 'loading') return <p>Loading salary data…</p>;
      if (budgetStatus === 'error') return <p className="overviewError">Salary sync failed; summary unavailable.</p>;
      const entries = [...salary.entries].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
      const last = entries[entries.length - 1], previous = entries[entries.length - 2];
      const percent = last && previous && previous.annualIncome !== 0 ? (last.annualIncome - previous.annualIncome) / previous.annualIncome * 100 : null;
      return <><span className="overviewLabel">Latest salary change</span><strong>{percent === null ? 'Not enough data' : `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`}</strong></>;
    },
  },
  {
    id: 'mercy-ledger', title: 'Mercy Tracker', icon: <MercyIcon />, accent: 'mercy',
    summary: data => trackerSummary(data, state => {
      const counters = tracker.calculate(state).counters;
      const rows = Object.entries(tracker.rules).flatMap(([source, rarities]) => Object.entries(rarities).map(([rarity, rule]) => {
        const counter = counters[source][rarity];
        return { source, rarity, rule, ...counter, remaining: Math.max(0, rule.threshold - counter.count) };
      }));
      const known = rows.filter(row => row.known).sort((a, b) => a.remaining - b.remaining || tracker.nextChance(b.rule, b.count) - tracker.nextChance(a.rule, a.count));
      const closest = known[0];
      return closest ? <>
        <div className="overviewChartContainer">
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: '700', color: closest.remaining === 0 ? 'var(--pos)' : 'var(--accent)' }}>{closest.remaining === 0 ? '◎' : closest.remaining}</div>
              <small style={{ color: 'var(--muted)' }}>{closest.rarity}</small>
            </div>
          </div>
        </div>
        <div className="overviewStatsGrid">
          <div className="overviewStat">
            <strong>{closest.source}</strong>
            <span>Source</span>
          </div>
          <div className="overviewStat">
            <strong style={{ color: closest.remaining === 0 ? 'var(--pos)' : 'var(--accent)' }}>{closest.remaining === 0 ? '✓' : closest.remaining}</strong>
            <span>To Mercy</span>
          </div>
        </div>
      </> : <p>No known shard counters yet.</p>;
    }),
  },
  {
    id: 'champion-builds', title: 'Champion Builds Tracker', icon: <BuildsIcon />, accent: 'champions',
    summary: data => trackerSummary(data, state => <><span className="overviewLabel">Fully built champions</span><strong>{state.champions.filter(champion => tracker.buildCompletion(champion.statuses).complete === 6).length} / {state.champions.length}</strong><small>All six fields complete</small></>),
  },
  {
    id: 'bjj-skills', title: 'BJJ Tracker', icon: <SkillsIcon />, accent: 'bjj',
    summary: data => trackerSummary(data, state => {
      const skills = tracker.bjjLearningPriorities(state.bjj.skills, state.bjj.blackLotusSkillIds);
      const topThree = skills.slice(0, 3);
      return topThree.length ? <>
        <div style={{ flex: 1 }}>
          <span className="overviewLabel">Learning Priorities</span>
          <ul style={{ marginTop: '8px' }}>
            {topThree.map(({ skill, confidence }) => <li key={skill.id} style={{ fontSize: '.9rem', marginBottom: '6px' }}>
              <span style={{ display: 'block', fontWeight: '600', color: 'var(--accent)' }}>{skill.name}</span>
              <small>{skill.workOnNext ? '→ Focus Next' : `${confidence}% confidence`}</small>
            </li>)}
          </ul>
        </div>
      </> : <p>No learning priorities yet.</p>;
    }),
  },
  {
    id: 'book-tracker', title: 'Book Tracker', icon: <BookIcon />, accent: 'books',
    summary: data => trackerSummary(data, state => {
      const read = state.books.filter(book => book.read).length;
      return <><span className="overviewLabel">Your library</span><strong>{read} read</strong><small>{state.books.length - read} unread</small></>;
    }),
  },
  {
    id: 'weight-tracker', title: 'Weight Tracker', icon: <WeightIcon />, accent: 'weight',
    summary: data => trackerSummary(data, state => {
      const plan = state.weight.plans.find(item => item.status === 'active');
      const entries = [...state.weight.weighIns].sort((a, b) => b.date.localeCompare(a.date));
      const latest = entries[0];
      const goal = plan?.goalWeight || null;
      return <>
        <div className="overviewChartContainer">
          <div style={{ textAlign: 'center', width: '100%' }}>
            <small style={{ color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Weight Trend</small>
            <div style={{ fontSize: '1.1rem', letterSpacing: '2px', color: 'var(--accent)' }}>∿ ∿ ∿</div>
          </div>
        </div>
        <div className="overviewStatsGrid">
          <div className="overviewStat">
            <strong style={{ fontSize: '1.4rem' }}>{latest ? latest.weight.toFixed(1) : '—'}</strong>
            <span>Current Weight</span>
          </div>
          <div className="overviewStat">
            <strong style={{ fontSize: '1.4rem', color: 'var(--accent)' }}>{goal ? goal.toFixed(1) : '—'}</strong>
            <span>Goal</span>
          </div>
        </div>
      </>;
    }),
  },
  {
    id: 'daily-stoic', title: 'Daily Stoic', icon: <StoicIcon />, accent: 'stoic',
    summary: data => trackerSummary(data, state => {
      const today = state.stoic.entries.find(entry => entry.date === data.today);
      const completion = stoicCompletion(today);
      const streak = currentStoicStreak(state.stoic.entries, data.today);
      const totalDays = state.stoic.entries.length;
      const completionPercent = totalDays > 0 ? Math.round(state.stoic.entries.filter(entry => {
        const c = stoicCompletion(entry);
        return c.dayDone;
      }).length / totalDays * 100) : 0;
      return <>
        <div style={{ flex: 1 }}>
          <span className="overviewLabel">Today's Status</span>
          <strong style={{ display: 'block', marginTop: '4px', marginBottom: '8px' }}>{completion.dayDone ? '✓ Completed' : `${completion.morningDone ? '✓' : '○'} AM · ${completion.eveningDone ? '✓' : '○'} PM`}</strong>
        </div>
        <div className="overviewStatsGrid">
          <div className="overviewStat">
            <strong style={{ fontSize: '1.4rem', color: 'var(--accent)' }}>🔥 {streak}</strong>
            <span>Day Streak</span>
          </div>
          <div className="overviewStat">
            <strong style={{ fontSize: '1.4rem' }}>{completionPercent}%</strong>
            <span>Completion</span>
          </div>
        </div>
      </>;
    }),
  },
];

export default function OverviewDashboard({ incomes, salary, budgetStatus, trackers, onNavigate }: Omit<Data, 'today'> & { onNavigate: (page: OverviewPage) => void }) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const data = { incomes, salary, budgetStatus, trackers, today };
  return <section className="overviewDashboard" aria-label="Tracker overview">
    {overviewCards.map(card => <button key={card.id} type="button" className={`overviewCard card overview-${card.accent}`} data-belt={card.id === 'bjj-skills' && trackers.status === 'ready' ? trackers.data.bjj.belt.toLowerCase() : undefined} onClick={() => onNavigate(card.id)}>
      <span className="overviewCardHead"><span className="overviewIcon">{card.icon}</span><span>{card.title}</span><span className="overviewArrow" aria-hidden="true">→</span></span>
      <div className="overviewContent">{card.summary(data)}</div>
    </button>)}
  </section>;
}
