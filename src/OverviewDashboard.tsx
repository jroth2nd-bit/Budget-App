import type { ReactNode } from 'react';
import { BookIcon, BuildsIcon, IncomeHistoryIcon, MercyIcon, SkillsIcon, TransactionsIcon, WeightIcon } from './NavIcons';
import { dateKey, getPaycheckPeriod } from './recurrence';
import type { Income, IncomeHistoryData } from './types';
import type { TrackerSummary } from './TrackerHost';
import type { TrackerPage } from './tracker/TrackerView';
import tracker from './tracker/tracker.js';
import { dateNumber, trackStatus } from './tracker/weight.js';
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
      return <><span className="overviewLabel">Until next paycheck</span><strong>{days === null ? 'Not scheduled' : `${days} ${days === 1 ? 'day' : 'days'}`}</strong></>;
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
      return closest ? <><span className="overviewLabel">{closest.source} · {closest.rarity}</span><strong>{closest.remaining === 0 ? 'In mercy' : `${closest.remaining} pulls to mercy`}</strong><small>{rows.some(row => !row.known) ? 'Some counters are unknown' : 'Closest known counter'}</small></> : <p>No known shard counters yet.</p>;
    }),
  },
  {
    id: 'champion-builds', title: 'Champion Builds Tracker', icon: <BuildsIcon />, accent: 'champions',
    summary: data => trackerSummary(data, state => <><span className="overviewLabel">Fully built champions</span><strong>{state.champions.filter(champion => tracker.buildCompletion(champion.statuses).complete === 6).length} / {state.champions.length}</strong><small>All six fields complete</small></>),
  },
  {
    id: 'bjj-skills', title: 'BJJ Tracker', icon: <SkillsIcon />, accent: 'bjj',
    summary: data => trackerSummary(data, state => {
      const skills = tracker.bjjLearningPriorities(state.bjj.skills);
      return skills.length ? <><span className="overviewLabel">Learning priorities</span><ul>{skills.map(({ skill, confidence }) => <li key={skill.id}><span>{skill.name}</span><small>{skill.workOnNext ? 'Focus' : `${confidence}% confidence`}</small></li>)}</ul></> : <p>No learning priorities yet.</p>;
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
      const planEntry = entries.find(entry => entry.planId === plan?.id);
      return <><span className="overviewLabel">{plan ? `${plan.type === 'bulk' ? 'Bulk' : 'Cut'} · planned goal` : 'No active plan'}</span><strong>{plan ? `${Math.max(0, dateNumber(plan.plannedEndDate) - dateNumber(data.today))} days remaining` : 'Start a plan'}</strong><small>{latest ? `Latest weight: ${latest.weight.toFixed(1)} lb · ${latest.date}` : 'No weigh-ins yet'}</small><small>{planEntry ? trackStatus(planEntry.difference) : plan ? 'Awaiting plan weigh-in' : 'Track status unavailable'}</small></>;
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
