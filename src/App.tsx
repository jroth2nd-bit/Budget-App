



import { useState, useEffect, useRef } from 'react';
import Administration from './Administration';
import Login from './Login';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import DotDayList from './DotDayList';
import { DashboardIcon, TransactionsIcon, AdminIcon, CalendarIcon } from './NavIcons';
import TransactionsPage from './Transactions';
import { Income, Expense, Tag } from './types';
import * as XLSX from 'xlsx';
import { AmountScope, DeleteScope, amountFor, applyAmountChange, applyDelete, dateKey, isSkipped, stepDate } from './recurrence';
import { AmountScopeDialog, DeleteScopeDialog, MakeRecurringDialog, MakeRecurringResult } from './RecurrenceDialogs';

type Page = 'dashboard' | 'transactions' | 'admin'

const ICON_OPTIONS = ['💼','💰','💸','🏠','🛒','🍔','🚗','🎓','🎁','🩺','📈','💡','🧾','📦','🪙']



type CloudData = {
  incomes: Income[];
  expenses: Expense[];
  tags: Tag[];
  startingBalance: number;
  lowBalanceThreshold: number;
  postedMap: Record<string, boolean>;
  background: string;
};

function BudgetApp({ userId, onSignOut }: { userId?: string; onSignOut?: () => void }) {
    // Centralized posted state
    const [postedMap, setPostedMap] = useState<Record<string, boolean>>(() => {
      try {
        return JSON.parse(localStorage.getItem('posted_map') || '{}');
      } catch {
        return {};
      }
    });
    useEffect(() => {
      localStorage.setItem('posted_map', JSON.stringify(postedMap));
    }, [postedMap]);

    const handlePostedChange = (id: string) => {
      setPostedMap(prev => ({ ...prev, [id]: !prev[id] }));
    };
  const [page, setPage] = useState<Page>('dashboard')
  const [incomes, setIncomes] = useState<Income[]>(() => {
    const saved = localStorage.getItem('incomes');
    if (saved) {
      try {
        return JSON.parse(saved).map((income: Income) => ({
          ...income,
          tags: income.tags || [],
          icon: income.icon || ''
        }));
      } catch {
        return [];
      }
    }
    return [];
  });
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('expenses');
    if (saved) {
      try {
        return JSON.parse(saved).map((expense: Expense) => ({
          ...expense,
          tags: expense.tags || [],
          icon: expense.icon || ''
        }));
      } catch {
        return [];
      }
    }
    return [];
  });
  const [tags, setTags] = useState<Tag[]>(() => {
    const saved = localStorage.getItem('tags');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [startingBalance, setStartingBalance] = useState(() => {
    const saved = localStorage.getItem('startingBalance');
    if (saved) {
      return Number(saved);
    }
    return 0;
  });

  // Low Projected Balance Threshold (persistent)
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(() => {
    const saved = localStorage.getItem('lowBalanceThreshold');
    if (saved) {
      return Number(saved);
    }
    return 0;
  });
    useEffect(() => {
      localStorage.setItem('lowBalanceThreshold', lowBalanceThreshold.toString());
    }, [lowBalanceThreshold]);
  const [background, setBackground] = useState('forest');

  // Cloud sync: load once after sign-in, then save changes (debounced).
  // Remote data wins; if no remote row exists yet, the local data is uploaded.
  const [syncState, setSyncState] = useState<'off' | 'loading' | 'saved' | 'saving' | 'error'>(userId ? 'loading' : 'off');
  const hydrated = useRef(false);
  useEffect(() => {
    if (!userId || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('budget_data').select('data').eq('user_id', userId).maybeSingle();
      if (cancelled) return;
      if (error) { setSyncState('error'); return; }
      const d = data?.data as Partial<CloudData> | undefined;
      if (d && Array.isArray(d.incomes)) {
        setIncomes(d.incomes.map(i => ({ ...i, tags: i.tags || [], icon: i.icon || '' })));
        setExpenses((d.expenses || []).map(e => ({ ...e, tags: e.tags || [], icon: e.icon || '' })));
        setTags(d.tags || []);
        setStartingBalance(Number(d.startingBalance) || 0);
        setLowBalanceThreshold(Number(d.lowBalanceThreshold) || 0);
        setPostedMap(d.postedMap || {});
        if (d.background) setBackground(d.background);
      }
      hydrated.current = true;
      setSyncState('saved');
      if (!d) setSyncTick(t => t + 1);
    })();
    return () => { cancelled = true; };
  }, [userId]);
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    if (!userId || !supabase || !hydrated.current) return;
    setSyncState('saving');
    const timer = setTimeout(async () => {
      const payload: CloudData = { incomes, expenses, tags, startingBalance, lowBalanceThreshold, postedMap, background };
      const { error } = await supabase!.from('budget_data').upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() });
      setSyncState(error ? 'error' : 'saved');
    }, 700);
    return () => clearTimeout(timer);
  }, [userId, incomes, expenses, tags, startingBalance, lowBalanceThreshold, postedMap, background, syncTick]);

  // Each label is mapped to a unique, accurate Unsplash image (no people)
  const BACKGROUNDS: Record<string,string> = {
      default: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2560&q=90', // fallback forest image
    forest: 'https://unsplash.com/photos/an-aerial-view-of-a-lush-green-forest-Zj8cfvy5ylk/download?force=true&w=2560',
    lake: 'https://unsplash.com/photos/a-body-of-water-surrounded-by-trees-and-rocks-pTdloyQMg_I/download?force=true&w=2560',
    city: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=2560&q=90',
    ocean: 'https://unsplash.com/photos/a-body-of-water-with-clouds-above-it-71TCeLOLd1o/download?force=true&w=2560',
    mountains: 'https://unsplash.com/photos/a-lake-surrounded-by-trees-with-mountains-in-the-background-7VotVatHM7Q/download?force=true&w=2560',
    beach: 'https://unsplash.com/photos/a-sandy-beach-with-palm-trees-and-blue-sky-xas1UaqjLOk/download?force=true&w=2560',
    sunset: 'https://unsplash.com/photos/brown-wooden-dock-between-lavender-flower-field-near-body-of-water-during-golden-hour-K2s_YE031CA/download?force=true&w=2560',
    aurora: 'https://unsplash.com/photos/a-green-and-purple-sky-with-a-stream-of-water-2H6S8o82_aw/download?force=true&w=2560',
    desert: 'https://unsplash.com/photos/a-large-group-of-sand-dunes-in-the-desert-hwkoXuNQhUI/download?force=true&w=2560',
    valley: 'https://unsplash.com/photos/a-view-of-a-mountain-range-with-a-house-in-the-foreground-f94m5ZDM8vw/download?force=true&w=2560',
    waterfall: 'https://unsplash.com/photos/exotic-waterfall-and-lake-landscape-of-plitvice-lakes-national-park-unesco-natural-world-heritage-and-famous-travel-destination-of-croatia-the-lakes-are-located-in-central-croatia-croatia-proper-AuY-dKKWjOg/download?force=true&w=2560',
    canyon: 'https://unsplash.com/photos/a-scenic-view-of-the-grand-canyons-in-the-desert-oUwgJYcdTUY/download?force=true&w=2560',
    night: 'https://unsplash.com/photos/snow-mountain-under-stars-phIFdC6lA4E/download?force=true&w=2560',
    meadow: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=2560&q=90',
    snow: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=2560&q=90',
    autumn: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2560&q=90',
    spring: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=2560&q=90',
    citynight: 'https://unsplash.com/photos/a-city-at-night-SMVPYfE-TcQ/download?force=true&w=2560',
    galaxy: 'https://unsplash.com/photos/a-galaxy-in-space-zIUT8p0T9-A/download?force=true&w=2560',
    river: 'https://unsplash.com/photos/a-river-running-through-a-forest-filled-with-trees-qmF3kZBhIK0/download?force=true&w=2560'
  };

  // User-friendly labels for dropdown
  const BACKGROUND_LABELS: Record<string, string> = {
    forest: 'Forest',
    lake: 'Lake',
    city: 'City',
    ocean: 'Ocean (Stormy)',
    mountains: 'Mountains',
    beach: 'Beach',
    sunset: 'Sunset',
    aurora: 'Aurora',
    desert: 'Desert',
    valley: 'Valley',
    waterfall: 'Waterfall',
    canyon: 'Canyon',
    night: 'Night Sky',
    meadow: 'Meadow',
    snow: 'Snow',
    autumn: 'Autumn',
    spring: 'Spring',
    citynight: 'City at Night',
    galaxy: 'Galaxy',
    river: 'River',
  };
  // No useEffect for initial load; all state is loaded synchronously above

  useEffect(() => {
    localStorage.setItem('incomes', JSON.stringify(incomes))
  }, [incomes])

  useEffect(() => {
    localStorage.setItem('expenses', JSON.stringify(expenses))
  }, [expenses])

  useEffect(() => {
    localStorage.setItem('tags', JSON.stringify(tags))
  }, [tags])

  useEffect(() => {
    localStorage.setItem('startingBalance', startingBalance.toString())
  }, [startingBalance])

  // Development check: log any missing images for background labels
  useEffect(() => {
    if (import.meta.env.DEV) {
      Object.keys(BACKGROUND_LABELS).forEach(key => {
        if (!BACKGROUNDS[key]) {
          // eslint-disable-next-line no-console
          console.warn(`No image found for background: ${key}`);
        }
      });
    }
  }, []);

  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const navItems: Array<{ id: Page; label: string; icon: JSX.Element }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { id: 'transactions', label: 'Transactions', icon: <TransactionsIcon /> },
    { id: 'admin', label: 'Admin', icon: <AdminIcon /> },
  ];
  const renderNavItems = () => navItems.map(item => (
    <button key={item.id} className={`navItem${page === item.id ? ' active' : ''}`} onClick={() => setPage(item.id)} title={item.label} aria-current={page === item.id ? 'page' : undefined}>
      {item.icon}<span className="navLabel">{item.label}</span>
    </button>
  ));
  const syncLabel = syncState === 'loading' ? 'Loading…' : syncState === 'saving' ? 'Saving…' : syncState === 'error' ? 'Sync failed' : 'Synced';

  return (
    <div className="appRoot">
      <nav className="sideNav">
        <div className="brand"><span className="brandMark">$</span><span className="brandName">Budget App</span></div>
        {renderNavItems()}
      </nav>

      <div className="mainArea">
        <header className="topBar">
          <div className="brand"><span className="brandMark">$</span><span>Budget App</span></div>
          <span className="spacer" />
          {userId && <span className={`syncBadge${syncState === 'error' ? ' err' : ''}`}>{syncLabel}</span>}
          <button className="upcomingToggle navItem" style={{ width: 'auto' }} onClick={() => setUpcomingOpen(true)}><CalendarIcon /><span>Upcoming</span></button>
          {userId && <button onClick={onSignOut}>Sign out</button>}
        </header>

      <main className="mainContent">

        {page === 'dashboard' && (
          <DashboardPage
            expenses={expenses}
            incomes={incomes}
            startingBalance={startingBalance}
            setStartingBalance={setStartingBalance}
            postedMap={postedMap}
            onPostedChange={handlePostedChange}
            lowBalanceThreshold={lowBalanceThreshold}
          />
        )}
        {page === 'transactions' && (
          <TransactionsPage
            incomes={incomes}
            expenses={expenses}
            tags={tags}
            postedMap={postedMap}
            onPostedChange={handlePostedChange}
            onAdd={(kind, item) => kind === 'income' ? setIncomes(prev => [...prev, item as Income]) : setExpenses(prev => [...prev, item as Expense])}
            onUpdate={(kind, item) => kind === 'income' ? setIncomes(prev => prev.map(i => i.id === item.id ? item as Income : i)) : setExpenses(prev => prev.map(e => e.id === item.id ? item as Expense : e))}
            onDelete={(kind, id) => kind === 'income' ? setIncomes(prev => prev.filter(i => i.id !== id)) : setExpenses(prev => prev.filter(e => e.id !== id))}
          />
        )}
        {page === 'admin' && (
          <Administration
            background={background}
            setBackground={setBackground}
            BACKGROUNDS={BACKGROUNDS}
            addIncomes={(newIncomes, replaceAll) => {
              const updated = replaceAll ? newIncomes : [...incomes, ...newIncomes];
              setIncomes(updated);
              window.localStorage.setItem('incomes', JSON.stringify(updated));
            }}
            addExpenses={(newExpenses, replaceAll) => {
              const updated = replaceAll ? newExpenses : [...expenses, ...newExpenses];
              setExpenses(updated);
              window.localStorage.setItem('expenses', JSON.stringify(updated));
            }}
            tags={tags}
            setTags={setTags}
            lowBalanceThreshold={lowBalanceThreshold}
            setLowBalanceThreshold={setLowBalanceThreshold}
            backup={{ incomes, expenses, tags, startingBalance, lowBalanceThreshold, postedMap, background }}
            onRestoreAll={data => {
              setIncomes(data.incomes);
              setExpenses(data.expenses);
              setTags(data.tags);
              setStartingBalance(data.startingBalance);
              setLowBalanceThreshold(data.lowBalanceThreshold);
              setPostedMap(data.postedMap);
              if (data.background && BACKGROUNDS[data.background]) setBackground(data.background);
            }}
            onWipeAll={() => {
              setIncomes([]);
              setExpenses([]);
              setTags([]);
              setStartingBalance(0);
              setLowBalanceThreshold(0);
              setPostedMap({});
            }}
          />
        )}
      </main>
      </div>

      <div className={`scrim${upcomingOpen ? ' open' : ''}`} onClick={() => setUpcomingOpen(false)} />
      <aside className={`upcoming${upcomingOpen ? ' open' : ''}`} aria-label="Upcoming transactions">
        <div className="upcomingHead">
          <h3>DotDay · Upcoming</h3>
          <button className="upcomingClose" onClick={() => setUpcomingOpen(false)} aria-label="Close upcoming">✕</button>
        </div>
        <DotDayList incomes={incomes} expenses={expenses} postedMap={postedMap} onPostedChange={handlePostedChange} />
      </aside>

      <nav className="bottomNav">{renderNavItems()}</nav>
    </div>
  )
}

function DashboardPage({ expenses, incomes, startingBalance, setStartingBalance, postedMap, onPostedChange, lowBalanceThreshold }: {
  expenses: Expense[];
  incomes: Income[];
  startingBalance: number;
  setStartingBalance: (b: number) => void;
  postedMap: Record<string, boolean>;
  onPostedChange: (id: string) => void;
  lowBalanceThreshold: number;
}) {
    // postedMap and onPostedChange are provided by props from App
    // Tab state for dashboard sections
    const [tab, setTab] = useState<'table' | 'charts'>('charts');
    const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
    const [medium, setMedium] = useState(() => window.matchMedia('(min-width: 700px)').matches);
    useEffect(() => {
      const mq = window.matchMedia('(min-width: 1100px)');
      const mq2 = window.matchMedia('(min-width: 700px)');
      const onChange = () => { setWide(mq.matches); setMedium(mq2.matches); };
      mq.addEventListener('change', onChange);
      mq2.addEventListener('change', onChange);
      return () => { mq.removeEventListener('change', onChange); mq2.removeEventListener('change', onChange); };
    }, []);
    // Date filter state for running balance table
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    // Category filter for running balance table
    const [categoryFilter, setCategoryFilter] = useState('');

    // Compute default projection range: first and last day of current year
    // Removed unused defaultFrom/defaultTo
    // Use selected range if set, otherwise default
    // Removed unused projFrom/projTo
    // Gather all transactions (all time)
    const gatherTransactions = (until: Date = new Date()) => {
      let txs: Array<{ id: string, date: Date, name: string, category: string, income: number, expense: number, type: 'income' | 'expense' }> = []
      incomes.forEach(item => {
        let current = new Date(item.startDate)
        if (item.isRecurring) {
          const today = until
          while (current <= today && (!item.endDate || dateKey(current) <= item.endDate)) {
            if (isSkipped(item, current)) { stepDate(current, item.frequency); continue }
            txs.push({
              id: item.id + current.toISOString(),
              date: new Date(current),
              name: item.name,
              category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
              income: amountFor(item, current),
              expense: 0,
              type: 'income'
            })
            if (item.frequency === 'weekly') current.setDate(current.getDate() + 7)
            else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14)
            else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2)
            else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1)
            else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3)
            else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6)
            else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1)
          }
        } else {
          txs.push({
            id: item.id + current.toISOString(),
            date: new Date(current),
            name: item.name,
            category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
            income: item.amount,
            expense: 0,
            type: 'income'
          })
        }
      })
      expenses.forEach(item => {
        let current = new Date(item.startDate)
        if (item.isRecurring) {
          const today = until
          while (current <= today && (!item.endDate || dateKey(current) <= item.endDate)) {
            if (isSkipped(item, current)) { stepDate(current, item.frequency); continue }
            txs.push({
              id: item.id + current.toISOString(),
              date: new Date(current),
              name: item.name,
              category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
              income: 0,
              expense: amountFor(item, current),
              type: 'expense'
            })
            if (item.frequency === 'weekly') current.setDate(current.getDate() + 7)
            else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14)
            else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2)
            else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1)
            else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3)
            else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6)
            else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1)
          }
        } else {
          txs.push({
            id: item.id + current.toISOString(),
            date: new Date(current),
            name: item.name,
            category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
            income: 0,
            expense: item.amount,
            type: 'expense'
          })
        }
      })
      // Sort by date ascending
      txs.sort((a, b) => a.date.getTime() - b.date.getTime())
      return txs
    }
    // Only include unposted transactions for the table
    const allTransactions = gatherTransactions();
    const transactions = allTransactions.filter(tx => !postedMap[tx.id]);
    // Calculate running balance for all transactions (unfiltered)
    let running = startingBalance;
    const transactionsWithBalance = allTransactions.map((tx) => {
      running += tx.income - tx.expense;
      return { ...tx, runningBalance: running };
    });

    // Date filter for running balance table (for display only)
    // Only show unposted transactions in the table
    const filteredRows = transactionsWithBalance.filter(row => {
      const dateVal = row.date.toISOString().slice(0,10);
      return (
        (!dateFrom || dateVal >= dateFrom) &&
        (!dateTo || dateVal <= dateTo) &&
        (!categoryFilter || row.category === categoryFilter) &&
        !postedMap[row.id]
      );
    });
    const rows = filteredRows;
    // Use onPostedChange from props
  const [timeline, setTimeline] = useState<'30d' | '3m' | '6m' | '12m'>('30d')



  // Calculate cumulative past income and expenses to add to starting balance
  const calculatePastBalance = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let pastBalance = 0

    incomes.forEach(item => {
      if (!item.isRecurring) {
        const date = new Date(item.startDate)
        date.setHours(0, 0, 0, 0)
        if (date <= today) {
          pastBalance += amountFor(item, date)
        }
      } else {
        let current = new Date(item.startDate)
        current.setHours(0, 0, 0, 0)
        while (current <= today && (!item.endDate || dateKey(current) <= item.endDate)) {
          if (isSkipped(item, current)) { stepDate(current, item.frequency); continue }
          pastBalance += amountFor(item, current)
          if (item.frequency === 'weekly') current.setDate(current.getDate() + 7)
          else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14)
          else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2)
          else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1)
          else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3)
          else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6)
          else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1)
        }
      }
    })

    expenses.forEach(item => {
      if (!item.isRecurring) {
        const date = new Date(item.startDate)
        date.setHours(0, 0, 0, 0)
        if (date <= today) {
          pastBalance -= amountFor(item, date)
        }
      } else {
        let current = new Date(item.startDate)
        current.setHours(0, 0, 0, 0)
        while (current <= today && (!item.endDate || dateKey(current) <= item.endDate)) {
          if (isSkipped(item, current)) { stepDate(current, item.frequency); continue }
          pastBalance -= amountFor(item, current)
          if (item.frequency === 'weekly') current.setDate(current.getDate() + 7)
          else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14)
          else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2)
          else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1)
          else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3)
          else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6)
          else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1)
        }
      }
    })

    return pastBalance
  }

  // Use all transactions for the projection graph (not just unposted)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const todayKey = `${todayStart.getFullYear()}-${pad2(todayStart.getMonth() + 1)}-${pad2(todayStart.getDate())}`

  // Most recent income occurrence on or before today; the timeline starts there
  let lastPaycheck: Date | null = null
  for (const item of incomes) {
    const current = new Date(item.startDate)
    while (dateKey(current) <= todayKey && (!item.endDate || dateKey(current) <= item.endDate)) {
      if (!isSkipped(item, current) && (!lastPaycheck || current > lastPaycheck)) lastPaycheck = new Date(current)
      if (!item.isRecurring) break
      stepDate(current, item.frequency)
    }
  }
  const projStart = lastPaycheck ?? todayStart
  const projEnd = new Date(todayStart)
  if (timeline === '30d') projEnd.setDate(projEnd.getDate() + 30)
  else projEnd.setMonth(projEnd.getMonth() + (timeline === '3m' ? 3 : timeline === '6m' ? 6 : 12))
  projEnd.setHours(23, 59, 59, 999)
  let projRunning = startingBalance
  const projectionRows = gatherTransactions(projEnd).map(tx => {
    projRunning += tx.income - tx.expense
    return { ...tx, runningBalance: projRunning }
  })
  const projection = projectionRows
        .filter(row => {
          const dateVal = row.date.toISOString().slice(0,10);
          return row.date >= projStart && row.date <= projEnd && (!dateFrom || dateVal >= dateFrom) && (!dateTo || dateVal <= dateTo);
        })
        .map(row => ({
          date: row.date,
          posted: !!postedMap[row.id],
          value: row.runningBalance,
          type: row.income > 0 ? 'income' : row.expense > 0 ? 'expense' : undefined,
          amount: row.income > 0 ? row.income : row.expense > 0 ? row.expense : undefined,
          name: row.name,
          category: row.category,
          icon: row.icon || '',
        }));

  // Rows backing the summary cards: selected timeline window only
  const timelineLabel = timeline === '30d' ? '30 Days' : timeline === '3m' ? '3 Months' : timeline === '6m' ? '6 Months' : '12 Months'
  const windowRows = projectionRows.filter(row => row.date >= projStart && row.date <= projEnd)
  const upcomingRows = windowRows.filter(row => dateKey(row.date) >= todayKey)

  const fmtMoney = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const currentBalance = startingBalance + calculatePastBalance()
  const lowRow = lowBalanceThreshold ? upcomingRows.find(row => row.runningBalance < lowBalanceThreshold) : undefined
  const minRow = upcomingRows.length ? upcomingRows.reduce((a, b) => (a.runningBalance < b.runningBalance ? a : b)) : undefined
  const { nextPayday, nextPayAmount } = (() => {
    const now = new Date()
    let best: Date | null = null
    let amount = 0
    incomes.forEach(item => {
      const d = new Date(item.startDate)
      while (item.isRecurring && (!item.endDate || dateKey(d) <= item.endDate) && (d <= now || isSkipped(item, d))) stepDate(d, item.frequency)
      if (d > now && (!item.endDate || dateKey(d) <= item.endDate) && !isSkipped(item, d)) {
        if (!best || dateKey(d) < dateKey(best)) { best = new Date(d); amount = amountFor(item, d) }
        else if (dateKey(d) === dateKey(best)) amount += amountFor(item, d)
      }
    })
    return { nextPayday: best as Date | null, nextPayAmount: amount }
  })()
  const daysToPayday = nextPayday ? Math.ceil((nextPayday.getTime() - Date.now()) / 86400000) : null

  return (
    <div className="dash">
      <div className="pageHead">
        <h2>Dashboard</h2>
        {!wide && <div className="seg" role="tablist">
          <button className={tab === 'charts' ? 'on' : ''} onClick={() => setTab('charts')}>Charts</button>
          <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>Table</button>
        </div>}
      </div>

      <div className="kpiGrid">
        <div className="kpi">
          <span className="kpiLabel">Current Balance</span>
          <span className={`kpiValue${currentBalance < 0 ? ' neg' : ''}`}>{fmtMoney(currentBalance)}</span>
          <span className="kpiSub">Today</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Upcoming Low Balance</span>
          <span className={`kpiValue${lowRow ? ' warn' : ''}`}>{lowRow ? fmtMoney(lowRow.runningBalance) : '—'}</span>
          <span className="kpiSub">{lowRow ? fmtDay(lowRow.date) : 'None ahead'}</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Lowest Projected</span>
          <span className={`kpiValue${minRow && minRow.runningBalance < 0 ? ' neg' : ''}`}>{minRow ? fmtMoney(minRow.runningBalance) : '—'}</span>
          <span className="kpiSub">{minRow ? `${fmtDay(minRow.date)} · ${timelineLabel}` : timelineLabel}</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Next Paycheck</span>
          <span className="kpiValue pos">{daysToPayday === null ? '—' : `${daysToPayday} day${daysToPayday !== 1 ? 's' : ''}`}</span>
          <span className="kpiSub">{nextPayday ? `${fmtDay(nextPayday)} · ${fmtMoney(nextPayAmount)}` : 'None scheduled'}</span>
        </div>
      </div>

      {(wide || tab === 'charts') && (
        <>
        <div className="dashCharts">
          <div className="chartCard balanceCard">
            <div className="cardHead">
              <h3>Balance Projection</h3>
              <div className="filterBar">
                <div className="seg">
                  {([['30d', '30D'], ['3m', '3M'], ['6m', '6M'], ['12m', '12M']] as const).map(([v, l]) => (
                    <button key={v} className={timeline === v ? 'on' : ''} onClick={() => setTimeline(v)}>{l}</button>
                  ))}
                </div>
                <input type="date" aria-label="From date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <input type="date" aria-label="To date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
            <BalanceChart data={projection} lowBalanceThreshold={lowBalanceThreshold} />
          </div>
        </div>
        {medium && !wide && (
          <div className="chartCard upcomingCard">
            <div className="cardHead"><h3>Upcoming</h3></div>
            <DotDayList incomes={incomes} expenses={expenses} postedMap={postedMap} onPostedChange={onPostedChange} />
          </div>
        )}
        </>
      )}

      {(wide || tab === 'table') && (
        <div className="chartCard">
          <div className="cardHead">
            <h3>Running Balance</h3>
            <div className="filterBar">
              <input type="date" aria-label="From date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <input type="date" aria-label="To date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              <select aria-label="Category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {[...new Set(transactionsWithBalance.map(row => row.category).filter(Boolean))].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {(dateFrom || dateTo || categoryFilter) && <button onClick={() => { setDateFrom(''); setDateTo(''); setCategoryFilter(''); }}>Clear</button>}
            </div>
          </div>
          <div className="tableScroll">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th className="num">Income</th>
                  <th className="num">Expense</th>
                  <th className="num">Balance</th>
                  <th className="ctr">Posted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="nowrap">{row.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="nameCell">{row.name}</td>
                    <td className="muted nowrap">{row.category}</td>
                    <td className="num pos">{row.income > 0 ? `+${fmtMoney(row.income)}` : ''}</td>
                    <td className="num neg">{row.expense > 0 ? `-${fmtMoney(row.expense)}` : ''}</td>
                    <td className={`num strong ${row.runningBalance < 0 ? 'neg' : row.runningBalance < lowBalanceThreshold ? 'warn' : ''}`}>{fmtMoney(row.runningBalance)}</td>
                    <td className="ctr"><input type="checkbox" checked={!!postedMap[row.id]} onChange={() => onPostedChange(row.id)} /></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="muted ctr">No transactions</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function IncomePage({ incomes, tags, addIncome, updateIncome, deleteIncome, postedMap, onPostedChange }: {
  incomes: Income[];
  tags: Tag[];
  addIncome: (income: Income) => void;
  updateIncome: (income: Income) => void;
  deleteIncome: (id: string) => void;
  postedMap: Record<string, boolean>;
  onPostedChange: (id: string) => void;
}) {
  // Build income transactions (non-recurring and recurring)
  const gatherIncomeTxs = () => {
    let txs: Array<{ id: string, date: Date, name: string, category: string, amount: number, frequency: string, orig: Income }> = []
    incomes.forEach(item => {
      let current = new Date(item.startDate)
      if (item.isRecurring) {
        const today = new Date()
        today.setFullYear(today.getFullYear() + 1)
        while (current <= today && (!item.endDate || dateKey(current) <= item.endDate)) {
          if (isSkipped(item, current)) { stepDate(current, item.frequency); continue }
          txs.push({
            id: item.id + current.toISOString(),
            date: new Date(current),
            name: item.name,
            category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
            amount: amountFor(item, current),
            frequency: item.frequency,
            orig: item
          })
          if (item.frequency === 'weekly') current.setDate(current.getDate() + 7)
          else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14)
          else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2)
          else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1)
          else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3)
          else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6)
          else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1)
        }
      } else {
        txs.push({
          id: item.id + current.toISOString(),
          date: new Date(current),
          name: item.name,
          category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
          amount: item.amount,
          frequency: item.frequency,
          orig: item
        })
      }
    })
    txs.sort((a, b) => a.date.getTime() - b.date.getTime())
    return txs
  }
  const txs = gatherIncomeTxs()
  // Running balance for income only
  let running = 0
  const rows = txs.map(tx => {
    running += tx.amount
    return { ...tx, runningBalance: running }
  })
  // Enhanced filter state
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  // Removed running balance state
  const [frequency, setFrequency] = useState('')
  const [posted, setPosted] = useState('')
  const filteredRows = rows.filter(row => {
    const dateVal = row.date.toISOString().slice(0,10)
    return (
      (!dateFrom || dateVal >= dateFrom) &&
      (!dateTo || dateVal <= dateTo) &&
      (!name || row.name.toLowerCase().includes(name.toLowerCase())) &&
      (!category || (row.category || '').toLowerCase().includes(category.toLowerCase())) &&
      (!amountMin || row.amount >= parseFloat(amountMin)) &&
      (!amountMax || row.amount <= parseFloat(amountMax)) &&
      (!frequency || row.frequency.includes(frequency)) &&
      // Running balance filters removed
      (!posted || (posted === 'checked' ? postedMap[row.id] : !postedMap[row.id]))
    )
  })
  const [editMode, setEditMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editRows, setEditRows] = useState<Record<string, any>>({});
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const handleSelectRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]);
  };
  const handleEditAll = () => {
    setEditMode(true);
    setEditingRowId(null);
    const edits: Record<string, any> = {};
    filteredRows.forEach(row => {
      edits[row.id] = { ...row };
    });
    setEditRows(edits);
  };
  const handleEditRow = (id: string) => {
    setEditingRowId(id);
    setEditMode(false);
    setEditRows({ [id]: { ...filteredRows.find(r => r.id === id) } });
  };
  const handleEditChange = (id: string, field: string, value: any) => {
    setEditRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };
  const [recurTarget, setRecurTarget] = useState<any | null>(null);
  const [amountQueue, setAmountQueue] = useState<Array<{ row: any; newAmount: number }>>([]);

  const buildUpdate = (row: any): Income => {
    const base = row.orig as Income;
    const updated: Income = { ...base, name: row.name, tags: [row.category], frequency: row.frequency };
    // Recurring rows keep their series start; amount changes go through the scope dialog
    if (!base.isRecurring) {
      updated.amount = parseFloat(row.amount);
      updated.startDate = dateKey(row.date);
    }
    return updated;
  };
  const saveRows = (editedRows: any[]) => {
    const queue: Array<{ row: any; newAmount: number }> = [];
    editedRows.forEach(row => {
      updateIncome(buildUpdate(row));
      const original = filteredRows.find(r => r.id === row.id);
      const newAmount = parseFloat(row.amount);
      if (row.orig.isRecurring && original && !isNaN(newAmount) && newAmount !== original.amount) {
        queue.push({ row: original, newAmount });
      }
    });
    setAmountQueue(queue);
  };
  const handleSaveAll = () => {
    saveRows(Object.values(editRows));
    setEditMode(false);
    setEditRows({});
  };
  const handleSaveRow = (id: string) => {
    const row = editRows[id];
    if (row) saveRows([row]);
    setEditingRowId(null);
    setEditRows({});
  };
  const confirmAmount = (scope: AmountScope) => {
    const [current, ...rest] = amountQueue;
    const item = incomes.find(i => i.id === current.row.orig.id);
    if (item) updateIncome(applyAmountChange(item, current.row.date, current.newAmount, scope));
    setAmountQueue(rest);
  };
  const confirmRecurring = (result: MakeRecurringResult) => {
    const item = recurTarget.orig as Income;
    if (result.startDate === item.startDate) {
      updateIncome({ ...item, isRecurring: true, frequency: result.frequency, endDate: result.endDate });
    } else {
      // Keep the uploaded item as a one-time record and start the series from the chosen date
      addIncome({ ...item, id: Math.random().toString(36).slice(2), isRecurring: true, frequency: result.frequency, startDate: result.startDate, endDate: result.endDate, overrides: undefined, amountSchedule: undefined });
    }
    setRecurTarget(null);
  };
  const handleCancelAll = () => {
    setEditMode(false);
    setEditRows({});
  };
  const handleCancelRow = () => {
    setEditingRowId(null);
    setEditRows({});
  };
  const [deleteQueue, setDeleteQueue] = useState<any[]>([]);
  const handleDeleteSelected = () => {
    const recurring: any[] = [];
    const removedOneTime = new Set<string>();
    selectedRows.forEach(id => {
      const row = filteredRows.find(r => r.id === id);
      if (!row) return;
      if (row.orig.isRecurring) recurring.push(row);
      else if (!removedOneTime.has(row.orig.id)) {
        removedOneTime.add(row.orig.id);
        deleteIncome(row.orig.id);
      }
    });
    setDeleteQueue(recurring);
    setSelectedRows([]);
  };
  const handleDeleteRow = (row: any) => {
    if (row.orig.isRecurring) setDeleteQueue(q => [...q, row]);
    else if (window.confirm(`Delete "${row.name}"?`)) deleteIncome(row.orig.id);
  };
  const confirmDelete = (scope: DeleteScope) => {
    const [current, ...rest] = deleteQueue;
    const item = incomes.find(i => i.id === current.orig.id);
    if (item) {
      const result = applyDelete(item, current.date, scope);
      if (result) updateIncome(result);
      else deleteIncome(item.id);
    }
    setDeleteQueue(rest);
  };
  const handlePostedChange = (id: string) => {
    setPostedMap(prev => ({ ...prev, [id]: !prev[id] }))
  }
  return (
    <div>
      <h2>Income</h2>
      <IncomeForm tags={tags} onAdd={addIncome} />
      {recurTarget && (
        <MakeRecurringDialog name={recurTarget.name} itemDate={recurTarget.orig.startDate} frequency={recurTarget.orig.frequency} onConfirm={confirmRecurring} onCancel={() => setRecurTarget(null)} />
      )}
      {deleteQueue[0] && (
        <DeleteScopeDialog name={deleteQueue[0].name} date={deleteQueue[0].date} onConfirm={confirmDelete} onCancel={() => setDeleteQueue(deleteQueue.slice(1))} />
      )}
      {amountQueue[0] && (
        <AmountScopeDialog name={amountQueue[0].row.name} date={amountQueue[0].row.date} oldAmount={amountQueue[0].row.amount} newAmount={amountQueue[0].newAmount} onConfirm={confirmAmount} onCancel={() => setAmountQueue(amountQueue.slice(1))} />
      )}
      <div className="chartCard" style={{ width: '100%', marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0, marginRight: 8 }}>Income Transactions</h3>
          <button onClick={editMode ? handleSaveAll : handleEditAll} style={{ marginRight: 4, fontSize: '0.95em', padding: '2px 8px' }}>{editMode ? 'Save All' : 'Edit All'}</button>
          {editMode && <button onClick={handleCancelAll} style={{ marginRight: 4, fontSize: '0.95em', padding: '2px 8px' }}>Cancel</button>}
          <button onClick={handleDeleteSelected} disabled={selectedRows.length === 0} style={{ fontSize: '0.95em', padding: '2px 8px' }}>Delete Selected</button>
        </div>
        <div className="table-container">
        <table>
          <thead>
            <tr style={{ color: '#facc15', background: 'rgba(50,60,70,0.3)' }}>
              <th></th>
              <th>Date<br />
                <span className="date-range-wrapper">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => {
                      const val = e.target.value;
                      setDateFrom(val);
                      if (dateTo && val > dateTo) setDateTo(val);
                    }}
                    title="Start date"
                  />
                  <span style={{ color: '#aaa', fontSize: 12, margin: '0 2px' }}>–</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => {
                      const val = e.target.value;
                      setDateTo(val);
                      if (dateFrom && val < dateFrom) setDateFrom(val);
                    }}
                    title="End date"
                  />
                </span>
              </th>
              <th>Name<br /><input style={{ width: '90%' }} value={name} onChange={e => setName(e.target.value)} placeholder="Filter" /></th>
              <th>Category<br /><input style={{ width: '90%' }} value={category} onChange={e => setCategory(e.target.value)} placeholder="Filter" /></th>
              <th>Amount<br />
                <span className="amount-range-wrapper">
                  <input type="number" value={amountMin} onChange={e => setAmountMin(e.target.value)} placeholder="Min" />
                  <span style={{ color: '#aaa', fontSize: 12, margin: '0 2px' }}>–</span>
                  <input type="number" value={amountMax} onChange={e => setAmountMax(e.target.value)} placeholder="Max" />
                </span>
              </th>
              <th>Frequency<br /><input style={{ width: '90%' }} value={frequency} onChange={e => setFrequency(e.target.value)} placeholder="Filter" /></th>
              {/* Running Balance column removed */}
              <th>Posted<br />
                <select className="admin-select" style={{ width: '90%' }} value={posted} onChange={e => setPosted(e.target.value)}>
                  <option value="">All</option>
                  <option value="checked">Checked</option>
                  <option value="unchecked">Unchecked</option>
                </select>
              </th>
              <th className="actionsCol"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => {
              const isEditing = (editMode && editRows[row.id]) || (editingRowId === row.id);
              return (
                <tr key={row.id} style={{ background: postedMap[row.id] ? '#444' : 'transparent', color: postedMap[row.id] ? '#aaa' : undefined, textDecoration: postedMap[row.id] ? 'line-through' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => handleSelectRow(row.id)} />
                  </td>
                  {isEditing ? (
                    <>
                      <td><input type="date" value={editRows[row.id]?.date.toISOString().slice(0,10)} onChange={e => handleEditChange(row.id, 'date', new Date(e.target.value))} disabled={row.orig.isRecurring} title={row.orig.isRecurring ? 'Recurring series start date cannot be changed here' : undefined} style={{ width: '100%' }} /></td>
                      <td><input value={editRows[row.id]?.name} onChange={e => handleEditChange(row.id, 'name', e.target.value)} style={{ width: '100%' }} /></td>
                      <td><input value={editRows[row.id]?.category} onChange={e => handleEditChange(row.id, 'category', e.target.value)} style={{ width: '100%' }} /></td>
                      <td><input type="number" value={editRows[row.id]?.amount} onChange={e => handleEditChange(row.id, 'amount', e.target.value)} style={{ width: '100%' }} /></td>
                      <td><input value={editRows[row.id]?.frequency} onChange={e => handleEditChange(row.id, 'frequency', e.target.value)} style={{ width: '100%' }} /></td>
                      {/* Running Balance cell removed */}
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={!!postedMap[row.id]} onChange={() => onPostedChange(row.id)} />
                      </td>
                      <td className="actionsCol">
                        {editingRowId === row.id ? (
                          <>
                            <button onClick={() => handleSaveRow(row.id)} style={{ marginRight: 4, fontSize: '0.95em', padding: '2px 8px' }}>Save</button>
                            <button onClick={handleCancelRow} style={{ fontSize: '0.95em', padding: '2px 8px' }}>Cancel</button>
                          </>
                        ) : null}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{row.date.toLocaleDateString()}</td>
                      <td>{row.name}</td>
                      <td>{row.category}</td>
                      <td style={{ color: '#10b981' }}>{`+$${row.amount.toFixed(2)}`}</td>
                      <td>{row.frequency}</td>
                      {/* Running Balance cell removed */}
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={!!postedMap[row.id]} onChange={() => onPostedChange(row.id)} />
                      </td>
                      <td className="actionsCol">
                        <button onClick={() => handleEditRow(row.id)} style={{ fontSize: '0.95em', padding: '2px 8px' }}>Edit</button>
                        {!row.orig.isRecurring && <button onClick={() => setRecurTarget(row)} style={{ marginLeft: 4, fontSize: '0.95em', padding: '2px 8px' }}>Make Recurring</button>}
                        <button onClick={() => handleDeleteRow(row)} style={{ marginLeft: 4, fontSize: '0.95em', padding: '2px 8px' }}>Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function ExpensePage({ expenses, tags, addExpense, updateExpense, deleteExpense, postedMap, onPostedChange }: {
  expenses: Expense[];
  tags: Tag[];
  addExpense: (expense: Expense) => void;
  updateExpense: (expense: Expense) => void;
  deleteExpense: (id: string) => void;
  postedMap: Record<string, boolean>;
  onPostedChange: (id: string) => void;
}) {
  // Build expense transactions (non-recurring and recurring)
  const gatherExpenseTxs = () => {
    let txs: Array<{ id: string, date: Date, name: string, category: string, amount: number, frequency: string, orig: Expense }> = []
    expenses.forEach(item => {
      let current = new Date(item.startDate)
      if (item.isRecurring) {
        const today = new Date()
        today.setFullYear(today.getFullYear() + 1)
        while (current <= today && (!item.endDate || dateKey(current) <= item.endDate)) {
          if (isSkipped(item, current)) { stepDate(current, item.frequency); continue }
          txs.push({
            id: item.id + current.toISOString(),
            date: new Date(current),
            name: item.name,
            category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
            amount: amountFor(item, current),
            frequency: item.frequency,
            orig: item
          })
          if (item.frequency === 'weekly') current.setDate(current.getDate() + 7)
          else if (item.frequency === 'biweekly') current.setDate(current.getDate() + 14)
          else if (item.frequency === 'bimonthly') current.setMonth(current.getMonth() + 2)
          else if (item.frequency === 'monthly') current.setMonth(current.getMonth() + 1)
          else if (item.frequency === 'quarterly') current.setMonth(current.getMonth() + 3)
          else if (item.frequency === 'semiannual') current.setMonth(current.getMonth() + 6)
          else if (item.frequency === 'annual') current.setFullYear(current.getFullYear() + 1)
        }
      } else {
        txs.push({
          id: item.id + current.toISOString(),
          date: new Date(current),
          name: item.name,
          category: (item.tags && item.tags.length > 0) ? item.tags[0] : '',
          amount: item.amount,
          frequency: item.frequency,
          orig: item
        })
      }
    })
    txs.sort((a, b) => a.date.getTime() - b.date.getTime())
    return txs
  }
  const txs = gatherExpenseTxs()
  // Running balance for expenses only
  let running = 0
  const rows = txs.map(tx => {
    running -= tx.amount
    return { ...tx, runningBalance: running }
  })
  // Enhanced filter state
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  // Removed running balance state
  const [frequency, setFrequency] = useState('')
  const [posted, setPosted] = useState('')
  const filteredRows = rows.filter(row => {
    const dateVal = row.date.toISOString().slice(0,10)
    return (
      (!dateFrom || dateVal >= dateFrom) &&
      (!dateTo || dateVal <= dateTo) &&
      (!name || row.name.toLowerCase().includes(name.toLowerCase())) &&
      (!category || (row.category || '').toLowerCase().includes(category.toLowerCase())) &&
      (!amountMin || row.amount >= parseFloat(amountMin)) &&
      (!amountMax || row.amount <= parseFloat(amountMax)) &&
      (!frequency || row.frequency.includes(frequency)) &&
      // Running balance filters removed
      (!posted || (posted === 'checked' ? postedMap[row.id] : !postedMap[row.id]))
    )
  })
  const [editMode, setEditMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editRows, setEditRows] = useState<Record<string, any>>({});
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const handleSelectRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]);
  };
  const handleEditAll = () => {
    setEditMode(true);
    setEditingRowId(null);
    const edits: Record<string, any> = {};
    filteredRows.forEach(row => {
      edits[row.id] = { ...row };
    });
    setEditRows(edits);
  };
  const handleEditRow = (id: string) => {
    setEditingRowId(id);
    setEditMode(false);
    setEditRows({ [id]: { ...filteredRows.find(r => r.id === id) } });
  };
  const handleEditChange = (id: string, field: string, value: any) => {
    setEditRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };
  const [recurTarget, setRecurTarget] = useState<any | null>(null);
  const [amountQueue, setAmountQueue] = useState<Array<{ row: any; newAmount: number }>>([]);

  const buildUpdate = (row: any): Expense => {
    const base = row.orig as Expense;
    const updated: Expense = { ...base, name: row.name, tags: [row.category], frequency: row.frequency };
    // Recurring rows keep their series start; amount changes go through the scope dialog
    if (!base.isRecurring) {
      updated.amount = parseFloat(row.amount);
      updated.startDate = dateKey(row.date);
    }
    return updated;
  };
  const saveRows = (editedRows: any[]) => {
    const queue: Array<{ row: any; newAmount: number }> = [];
    editedRows.forEach(row => {
      updateExpense(buildUpdate(row));
      const original = filteredRows.find(r => r.id === row.id);
      const newAmount = parseFloat(row.amount);
      if (row.orig.isRecurring && original && !isNaN(newAmount) && newAmount !== original.amount) {
        queue.push({ row: original, newAmount });
      }
    });
    setAmountQueue(queue);
  };
  const handleSaveAll = () => {
    saveRows(Object.values(editRows));
    setEditMode(false);
    setEditRows({});
  };
  const handleSaveRow = (id: string) => {
    const row = editRows[id];
    if (row) saveRows([row]);
    setEditingRowId(null);
    setEditRows({});
  };
  const confirmAmount = (scope: AmountScope) => {
    const [current, ...rest] = amountQueue;
    const item = expenses.find(i => i.id === current.row.orig.id);
    if (item) updateExpense(applyAmountChange(item, current.row.date, current.newAmount, scope));
    setAmountQueue(rest);
  };
  const confirmRecurring = (result: MakeRecurringResult) => {
    const item = recurTarget.orig as Expense;
    if (result.startDate === item.startDate) {
      updateExpense({ ...item, isRecurring: true, frequency: result.frequency, endDate: result.endDate });
    } else {
      // Keep the uploaded item as a one-time record and start the series from the chosen date
      addExpense({ ...item, id: Math.random().toString(36).slice(2), isRecurring: true, frequency: result.frequency, startDate: result.startDate, endDate: result.endDate, overrides: undefined, amountSchedule: undefined });
    }
    setRecurTarget(null);
  };
  const handleCancelAll = () => {
    setEditMode(false);
    setEditRows({});
  };
  const handleCancelRow = () => {
    setEditingRowId(null);
    setEditRows({});
  };
  const [deleteQueue, setDeleteQueue] = useState<any[]>([]);
  const handleDeleteSelected = () => {
    const recurring: any[] = [];
    const removedOneTime = new Set<string>();
    selectedRows.forEach(id => {
      const row = filteredRows.find(r => r.id === id);
      if (!row) return;
      if (row.orig.isRecurring) recurring.push(row);
      else if (!removedOneTime.has(row.orig.id)) {
        removedOneTime.add(row.orig.id);
        deleteExpense(row.orig.id);
      }
    });
    setDeleteQueue(recurring);
    setSelectedRows([]);
  };
  const handleDeleteRow = (row: any) => {
    if (row.orig.isRecurring) setDeleteQueue(q => [...q, row]);
    else if (window.confirm(`Delete "${row.name}"?`)) deleteExpense(row.orig.id);
  };
  const confirmDelete = (scope: DeleteScope) => {
    const [current, ...rest] = deleteQueue;
    const item = expenses.find(i => i.id === current.orig.id);
    if (item) {
      const result = applyDelete(item, current.date, scope);
      if (result) updateExpense(result);
      else deleteExpense(item.id);
    }
    setDeleteQueue(rest);
  };
  const handlePostedChange = (id: string) => {
    setPostedMap(prev => ({ ...prev, [id]: !prev[id] }))
  }
  return (
    <div>
      <h2>Expenses</h2>
      <ExpenseForm tags={tags} onAdd={addExpense} />
      {recurTarget && (
        <MakeRecurringDialog name={recurTarget.name} itemDate={recurTarget.orig.startDate} frequency={recurTarget.orig.frequency} onConfirm={confirmRecurring} onCancel={() => setRecurTarget(null)} />
      )}
      {deleteQueue[0] && (
        <DeleteScopeDialog name={deleteQueue[0].name} date={deleteQueue[0].date} onConfirm={confirmDelete} onCancel={() => setDeleteQueue(deleteQueue.slice(1))} />
      )}
      {amountQueue[0] && (
        <AmountScopeDialog name={amountQueue[0].row.name} date={amountQueue[0].row.date} oldAmount={amountQueue[0].row.amount} newAmount={amountQueue[0].newAmount} onConfirm={confirmAmount} onCancel={() => setAmountQueue(amountQueue.slice(1))} />
      )}
      <div className="chartCard" style={{ width: '100%', marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0, marginRight: 8 }}>Expense Transactions</h3>
          <button onClick={editMode ? handleSaveAll : handleEditAll} style={{ marginRight: 4, fontSize: '0.95em', padding: '2px 8px' }}>{editMode ? 'Save All' : 'Edit All'}</button>
          {editMode && <button onClick={handleCancelAll} style={{ marginRight: 4, fontSize: '0.95em', padding: '2px 8px' }}>Cancel</button>}
          <button onClick={handleDeleteSelected} disabled={selectedRows.length === 0} style={{ fontSize: '0.95em', padding: '2px 8px' }}>Delete Selected</button>
        </div>
        <div className="table-container">
        <table>
          <thead>
            <tr style={{ color: '#facc15', background: 'rgba(50,60,70,0.3)' }}>
              <th></th>
              <th>Date<br />
                <span className="date-range-wrapper">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => {
                      const val = e.target.value;
                      setDateFrom(val);
                      if (dateTo && val > dateTo) setDateTo(val);
                    }}
                    title="Start date"
                  />
                  <span style={{ color: '#aaa', fontSize: 12, margin: '0 2px' }}>–</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => {
                      const val = e.target.value;
                      setDateTo(val);
                      if (dateFrom && val < dateFrom) setDateFrom(val);
                    }}
                    title="End date"
                  />
                </span>
              </th>
              <th>Name<br /><input style={{ width: '90%' }} value={name} onChange={e => setName(e.target.value)} placeholder="Filter" /></th>
              <th>Category<br /><input style={{ width: '90%' }} value={category} onChange={e => setCategory(e.target.value)} placeholder="Filter" /></th>
              <th>Amount<br />
                <span className="amount-range-wrapper">
                  <input type="number" value={amountMin} onChange={e => setAmountMin(e.target.value)} placeholder="Min" />
                  <span style={{ color: '#aaa', fontSize: 12, margin: '0 2px' }}>–</span>
                  <input type="number" value={amountMax} onChange={e => setAmountMax(e.target.value)} placeholder="Max" />
                </span>
              </th>
              <th>Frequency<br /><input style={{ width: '90%' }} value={frequency} onChange={e => setFrequency(e.target.value)} placeholder="Filter" /></th>
              {/* Running Balance column removed */}
              <th>Posted<br />
                <select className="admin-select" style={{ width: '90%' }} value={posted} onChange={e => setPosted(e.target.value)}>
                  <option value="">All</option>
                  <option value="checked">Checked</option>
                  <option value="unchecked">Unchecked</option>
                </select>
              </th>
              <th className="actionsCol"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => {
              const isEditing = (editMode && editRows[row.id]) || (editingRowId === row.id);
              return (
                <tr key={row.id} style={{ background: postedMap[row.id] ? '#444' : 'transparent', color: postedMap[row.id] ? '#aaa' : undefined, textDecoration: postedMap[row.id] ? 'line-through' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => handleSelectRow(row.id)} />
                  </td>
                  {isEditing ? (
                    <>
                      <td><input type="date" value={editRows[row.id]?.date.toISOString().slice(0,10)} onChange={e => handleEditChange(row.id, 'date', new Date(e.target.value))} disabled={row.orig.isRecurring} title={row.orig.isRecurring ? 'Recurring series start date cannot be changed here' : undefined} style={{ width: '100%' }} /></td>
                      <td><input value={editRows[row.id]?.name} onChange={e => handleEditChange(row.id, 'name', e.target.value)} style={{ width: '100%' }} /></td>
                      <td><input value={editRows[row.id]?.category} onChange={e => handleEditChange(row.id, 'category', e.target.value)} style={{ width: '100%' }} /></td>
                      <td><input type="number" value={editRows[row.id]?.amount} onChange={e => handleEditChange(row.id, 'amount', e.target.value)} style={{ width: '100%' }} /></td>
                      <td><input value={editRows[row.id]?.frequency} onChange={e => handleEditChange(row.id, 'frequency', e.target.value)} style={{ width: '100%' }} /></td>
                      {/* Running Balance cell removed */}
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={!!postedMap[row.id]} onChange={() => onPostedChange(row.id)} />
                      </td>
                      <td className="actionsCol">
                        {editingRowId === row.id ? (
                          <>
                            <button onClick={() => handleSaveRow(row.id)} style={{ marginRight: 4, fontSize: '0.95em', padding: '2px 8px' }}>Save</button>
                            <button onClick={handleCancelRow} style={{ fontSize: '0.95em', padding: '2px 8px' }}>Cancel</button>
                          </>
                        ) : null}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{row.date.toLocaleDateString()}</td>
                      <td>{row.name}</td>
                      <td>{row.category}</td>
                      <td style={{ color: '#ef4444' }}>{`-$${row.amount.toFixed(2)}`}</td>
                      <td>{row.frequency}</td>
                      {/* Running Balance cell removed */}
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={!!postedMap[row.id]} onChange={() => onPostedChange(row.id)} />
                      </td>
                      <td className="actionsCol">
                        <button onClick={() => handleEditRow(row.id)} style={{ fontSize: '0.95em', padding: '2px 8px' }}>Edit</button>
                        {!row.orig.isRecurring && <button onClick={() => setRecurTarget(row)} style={{ marginLeft: 4, fontSize: '0.95em', padding: '2px 8px' }}>Make Recurring</button>}
                        <button onClick={() => handleDeleteRow(row)} style={{ marginLeft: 4, fontSize: '0.95em', padding: '2px 8px' }}>Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function IncomeForm({ tags, onAdd }: { tags: Tag[]; onAdd: (income: Income) => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Income['frequency']>('monthly');
  const [startDate, setStartDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [customIcon, setCustomIcon] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedIcon = customIcon.trim() || icon;
    onAdd({
      id: Math.random().toString(36).slice(2),
      name,
      amount: parseFloat(amount),
      frequency,
      startDate,
      isRecurring,
      icon: selectedIcon,
      tags: category ? [category] : [],
    });
    setName('');
    setAmount('');
    setFrequency('monthly');
    setStartDate('');
    setIsRecurring(true);
    setIcon(ICON_OPTIONS[0]);
    setCustomIcon('');
    setCategory('');
  };

  return (
    <div className="card" style={{ marginBottom: 18, marginTop: 8, padding: '18px 18px 10px 18px', boxShadow: '0 2px 8px #0002' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 0 }}>
        <input className="admin-input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        <input className="admin-input" type="number" placeholder="Amount" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
        <select className="admin-select" value={frequency} onChange={e => setFrequency(e.target.value as Income['frequency'])}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="bimonthly">Bimonthly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="semiannual">Semiannual</option>
          <option value="annual">Annual</option>
        </select>
        <input className="admin-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        <label style={{ color: '#facc15', fontWeight: 500, fontSize: '0.98em' }}><input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ marginRight: 4 }} /> Recurring</label>
        <select className="admin-select" value={icon} onChange={e => setIcon(e.target.value)}>
          {ICON_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="custom">Custom...</option>
        </select>
        {icon === 'custom' && (
          <input className="admin-input" type="text" placeholder="Custom icon" value={customIcon} onChange={e => setCustomIcon(e.target.value)} />
        )}
        <select className="admin-select" value={category} onChange={e => setCategory(e.target.value)} required>
          <option value="" disabled>Select Category</option>
          {tags.map(tag => <option key={tag.name} value={tag.name}>{tag.icon} {tag.name}</option>)}
        </select>
        <button className="admin-btn" type="submit">Add Income</button>
      </form>
    </div>
  );
}

// Minimal ExpenseForm to resolve errors and match IncomeForm
function ExpenseForm({ tags, onAdd }: { tags: Tag[]; onAdd: (expense: Expense) => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Expense['frequency']>('monthly');
  const [startDate, setStartDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [category, setCategory] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: Math.random().toString(36).slice(2),
      name,
      amount: parseFloat(amount),
      frequency,
      startDate,
      isRecurring,
      tags: category ? [category] : [],
    });
    setName('');
    setAmount('');
    setFrequency('monthly');
    setStartDate('');
    setIsRecurring(true);
    setCategory('');
  };

  return (
    <div className="card" style={{ marginBottom: 18, marginTop: 8, padding: '18px 18px 10px 18px', boxShadow: '0 2px 8px #0002' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 0 }}>
        <input className="admin-input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        <input className="admin-input" type="number" placeholder="Amount" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
        <select className="admin-select" value={frequency} onChange={e => setFrequency(e.target.value as Expense['frequency'])}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="bimonthly">Bimonthly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="semiannual">Semiannual</option>
          <option value="annual">Annual</option>
        </select>
        <input className="admin-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        <label style={{ color: '#facc15', fontWeight: 500, fontSize: '0.98em' }}><input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ marginRight: 4 }} /> Recurring</label>
        <select className="admin-select" value={category} onChange={e => setCategory(e.target.value)} required>
          <option value="" disabled>Select Category</option>
          {tags.map(tag => <option key={tag.name} value={tag.name}>{tag.icon} {tag.name}</option>)}
        </select>
        <button className="admin-btn" type="submit">Add Expense</button>
      </form>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function EditableIncomeList({ incomes, tags, onUpdate, onDelete }: { incomes: Income[]; tags: Tag[]; onUpdate: (income: Income) => void; onDelete: (id: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Income | null>(null)

  const startEdit = (income: Income) => { setEditingId(income.id); setDraft({ ...income }) }
  const cancelEdit = () => { setEditingId(null); setDraft(null) }
  const saveEdit = () => { if (draft) { onUpdate(draft); cancelEdit() } }

  return (
    <ul className="list">
      {incomes.map((item) => (
        <li key={item.id}>
          {editingId === item.id && draft ? (
            <div className="editRow">
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <select value={draft.icon || ICON_OPTIONS[0]} onChange={e => setDraft({ ...draft, icon: e.target.value })}>
                {ICON_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="">None</option>
              </select>
              <select multiple value={draft.tags || []} onChange={e => setDraft({ ...draft, tags: Array.from(e.target.selectedOptions, o => o.value) })}>
                {tags.map(tag => <option key={tag.name} value={tag.name}>{tag.icon} {tag.name}</option>)}
              </select>
              <input type="number" step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} />
              <select value={draft.frequency} onChange={e => setDraft({ ...draft, frequency: e.target.value as Income['frequency'] })}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="bimonthly">Bimonthly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semiannual">Semiannual</option>
                <option value="annual">Annual</option>
              </select>
              <input type="date" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} />
              <label><input type="checkbox" checked={draft.isRecurring} onChange={e => setDraft({ ...draft, isRecurring: e.target.checked })} /> Recurring</label>
              <button onClick={saveEdit}>Save</button>
              <button onClick={cancelEdit}>Cancel</button>
            </div>
          ) : (
            <>
              <span>
                <span className="itemIcon">{item.icon || '💰'}</span>
                <strong>{item.name}</strong>: ${item.amount.toFixed(2)} ({item.frequency}) {item.isRecurring ? '🔁' : '⚡'}
                {(item.tags || []).map((tag, idx) => {
                  const tagDef = tags.find(t => t.name === tag)
                  return (
                    <span key={idx} className="tagBadge" style={{ backgroundColor: tagDef?.color || '#3b4251', color: '#f8fafc' }}>
                      {tagDef ? `${tagDef.icon} ${tagDef.name}` : tag}
                    </span>
                  )
                })}
              </span>
              <span>
                <button onClick={() => startEdit(item)}>Edit</button>
                <button onClick={() => onDelete(item.id)}>Delete</button>
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ImportData({ addIncomes, addExpenses }: { incomes: Income[]; expenses: Expense[]; addIncomes: (newIncomes: Income[]) => void; addExpenses: (newExpenses: Expense[]) => void }) {
  const [data, setData] = useState<Record<string, any>[]>([])
  const [importType, setImportType] = useState<'income' | 'expense'>('expense')
  const [previewMode, setPreviewMode] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [mappedName, setMappedName] = useState('')
  const [mappedAmount, setMappedAmount] = useState('')
  const [mappedFrequency, setMappedFrequency] = useState('')
  const [mappedStartDate, setMappedStartDate] = useState('')

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return

    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const fileContent = event.target?.result
        let parsedData: Record<string, any>[] = []

        if (uploadedFile.name.endsWith('.csv')) {
          parsedData = parseCSV(fileContent as string)
        } else if (uploadedFile.name.endsWith('.xlsx') || uploadedFile.name.endsWith('.xls')) {
          parsedData = parseExcel(fileContent as ArrayBuffer)
        }

        setData(parsedData)
        if (parsedData.length > 0) {
          const fileHeaders = Object.keys(parsedData[0])
          setHeaders(fileHeaders)
          // Auto-detect mappings
          const lowerHeaders = fileHeaders.map(h => h.toLowerCase())
          setMappedName(fileHeaders[lowerHeaders.indexOf('name')] || '')
          setMappedAmount(fileHeaders[lowerHeaders.indexOf('amount')] || '')
          setMappedFrequency(fileHeaders[lowerHeaders.indexOf('frequency')] || '')
          setMappedStartDate(fileHeaders[lowerHeaders.indexOf('startdate')] || fileHeaders[lowerHeaders.indexOf('date')] || '')
          setPreviewMode(true)
        }
      } catch (err) {
        alert(`Error parsing file: ${err}`)
      }
    }

    // Read as text for CSV, as array buffer for Excel
    if (uploadedFile.name.endsWith('.csv')) {
      reader.readAsText(uploadedFile)
    } else {
      reader.readAsArrayBuffer(uploadedFile)
    }
  }

  const parseCSV = (content: string): Record<string, any>[] => {
    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length < 2) return []

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let insideQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]
        
        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            current += '"'
            i++
          } else {
            insideQuotes = !insideQuotes
          }
        } else if (char === ',' && !insideQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      
      result.push(current.trim())
      return result
    }

    const headers = parseCSVLine(lines[0])
    const result: Record<string, any>[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      const row: Record<string, any> = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx] || ''
      })
      result.push(row)
    }

    return result
  }

  const parseExcel = (arrayBuffer: ArrayBuffer): Record<string, any>[] => {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[]
    return data
  }

  const handleImport = () => {
    try {
      const parseAmount = (str: string): number => {
        if (!str || typeof str !== 'string') return 0
        // Remove all non-numeric characters except decimal point and minus
        const cleaned = str.replace(/[^\d.-]/g, '')
        const num = parseFloat(cleaned)
        return isNaN(num) || num === 0 && cleaned.length === 0 ? 0 : num
      }

      // Filter out blank rows and rows with $0.00, null, or blank amount
      const filteredData = data.filter(row => {
        // Check if all mapped fields are empty
        const name = row[mappedName]?.toString().trim() || ''
        const amountStr = row[mappedAmount]?.toString().trim() || ''
        const frequency = row[mappedFrequency]?.toString().trim() || ''
        const startDate = row[mappedStartDate]?.toString().trim() || ''
        // If all are blank, skip
        if (!name && !amountStr && !frequency && !startDate) return false
        // If amount is blank, null, or $0.00, skip
        const cleaned = amountStr.replace(/[\$,]/g, '')
        const num = parseFloat(cleaned)
        if (!cleaned || isNaN(num) || num === 0) return false
        return true
      })

      const newItems = filteredData
        .map((row, idx) => {
          const name = row[mappedName] || `Item ${idx}`
          const amountStr = row[mappedAmount] || ''
          const amount = parseAmount(amountStr)
          const frequency = (row[mappedFrequency] || 'monthly') as any
          const startDateStr = row[mappedStartDate] || new Date().toISOString().split('T')[0]
          const startDate = new Date(startDateStr).toISOString().split('T')[0] // Normalize to YYYY-MM-DD

          return {
            id: Date.now().toString() + idx,
            name,
            amount,
            frequency,
            startDate,
            isRecurring: false,
            tags: [],
            icon: ''
          }
        })

      if (importType === 'income') {
        addIncomes(newItems as Income[])
      } else {
        addExpenses(newItems as Expense[])
      }

      alert(`Successfully imported ${newItems.length} ${importType} items.`)
      setData([])
      setPreviewMode(false)
    } catch (err) {
      alert(`Error importing data: ${err}`)
    }
  }

  return (
    <div className="tagAdmin">
      <h3>Import Data</h3>
      {!previewMode ? (
        <form className="formSmall" onSubmit={e => e.preventDefault()}>
          <select value={importType} onChange={e => setImportType(e.target.value as any)}>
            <option value="income">Import Income</option>
            <option value="expense">Import Expense</option>
          </select>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
          <small style={{ opacity: 0.7 }}>Supported: CSV, XLSX, XLS. File should have columns: name, amount, frequency, startDate</small>
        </form>
      ) : (
        <div>
          <div className="importPreview">
            <h4>Column Mapping</h4>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <label>
                Name:
                <select value={mappedName} onChange={e => setMappedName(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label>
                Amount:
                <select value={mappedAmount} onChange={e => setMappedAmount(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label>
                Frequency:
                <select value={mappedFrequency} onChange={e => setMappedFrequency(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label>
                Start Date:
                <select value={mappedStartDate} onChange={e => setMappedStartDate(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            </div>
            <h4>Preview ({data.length} rows)</h4>
            <table className="importTable">
              <thead>
                <tr>
                  {headers.map(header => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {headers.map(header => (
                      <td key={header}>{String(row[header] || '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 5 && <p style={{ opacity: 0.7 }}>... and {data.length - 5} more rows</p>}
          </div>
          <div className="formSmall" style={{ marginTop: '12px' }}>
            <button onClick={handleImport} style={{ width: '100%' }}>Import {data.length} Items</button>
            <button onClick={() => { setPreviewMode(false); setData([]); setHeaders([]); setMappedName(''); setMappedAmount(''); setMappedFrequency(''); setMappedStartDate('') }} style={{ width: '100%', background: '#666' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function BalanceChart({ data, lowBalanceThreshold = 0 }: { data: (({ date: Date; value: number; type?: 'income' | 'expense'; amount?: number; posted?: boolean; name?: string; category?: string; icon?: string }))[]; lowBalanceThreshold?: number }) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  // No zoom window or drag state
    // Helper: find closest point, prioritizing negative balances if within threshold
    const getClosestPointIdx = (mx: number, my: number) => {
      let minDist = Infinity;
      let minIdx = -1;
      let negativeIdx = -1;
      let negativeDist = Infinity;
      coords.forEach((c, idx) => {
        const dx = c.x - mx;
        const dy = c.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          minIdx = idx;
        }
        if (c.value < 0 && dist < negativeDist) {
          negativeDist = dist;
          negativeIdx = idx;
        }
      });
      // If a negative point is within 32px, prioritize it
      if (negativeIdx !== -1 && negativeDist < 32) return negativeIdx;
      return minIdx;
    };
  const [containerWidth, setContainerWidth] = useState(900);
  const narrow = containerWidth < 520;
  const height = narrow ? 280 : containerWidth > 860 ? 420 : 340;
  const padding = { top: 30, right: 26, bottom: 34, left: narrow ? 50 : 58 };
  const chartWidth = containerWidth - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- NO ZOOM: always show all data ---
  const visibleData = data;
  const maxVal = Math.max(...visibleData.map(d => d.value), 0) || 1;
  const minVal = Math.min(...visibleData.map(d => d.value), 0);
  const range = maxVal - minVal || 1;
  const minDate = Math.min(...visibleData.map(d => d.date.getTime()));
  const maxDate = Math.max(...visibleData.map(d => d.date.getTime()));
  const dateRange = maxDate - minDate || 1;
  const coords = visibleData.map((point) => {
    const x = ((point.date.getTime() - minDate) / dateRange) * chartWidth + padding.left;
    const y = padding.top + chartHeight - ((point.value - minVal) / range) * chartHeight;
    return { x, y, ...point };
  });

  // Calculate y position for $0.00 line
  const zeroY = padding.top + chartHeight - ((0 - minVal) / range) * chartHeight
  // Calculate y position for threshold line
  const thresholdY = padding.top + chartHeight - ((lowBalanceThreshold - minVal) / range) * chartHeight
  // Find the first index where balance goes below zero
  const firstNegativeIdx = coords.findIndex(c => c.value < 0)
  // Lowest point, flagged only when it is below zero or the low-balance threshold
  const lowestIdx = coords.length ? coords.reduce((best, c, i) => (c.value < coords[best].value ? i : best), 0) : -1
  const lowFlagLevel = Math.max(0, lowBalanceThreshold)
  const showLowCallout = lowestIdx !== -1 && coords[lowestIdx].value < lowFlagLevel

  // Split path into segments for positive and negative
  let segments = []
  let currentSegment = []
  let lastSign = coords.length > 0 ? Math.sign(coords[0].value) : 1
  for (let i = 0; i < coords.length; i++) {
    const sign = Math.sign(coords[i].value)
    if (sign !== lastSign && currentSegment.length > 0) {
      segments.push({ points: [...currentSegment], sign: lastSign })
      currentSegment = []
    }
    currentSegment.push(coords[i])
    lastSign = sign
  }
  if (currentSegment.length > 0) segments.push({ points: currentSegment, sign: lastSign })

  // Helper to make SVG path from points
  const makePath = (pts: {x: number, y: number}[]) => pts.reduce((acc: string, c: {x: number, y: number}, idx: number) => (idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`), '')

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const yAxisLabels = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range / 4) * i
    return { label: `$${Math.round(val).toLocaleString()}`, y: padding.top + chartHeight - (i / 4) * chartHeight }
  })

  const xAxisLabels = [
    { date: new Date(minDate), x: padding.left },
    { date: new Date((minDate + maxDate) / 2), x: padding.left + chartWidth / 2 },
    { date: new Date(maxDate), x: padding.left + chartWidth }
  ]

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
      onMouseMove={e => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // Only show tooltip if mouse is within 12px of a data point
        let minDist = Infinity;
        let minIdx = -1;
        coords.forEach((c, idx) => {
          const dx = c.x - mx;
          const dy = c.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            minIdx = idx;
          }
        });
        if (minDist <= 12) {
          setHoveredPoint(minIdx);
        } else {
          setHoveredPoint(null);
        }
      }}
      onMouseLeave={() => setHoveredPoint(null)}
      // Remove drag/zoom handlers
    >
      <div className="chartMeta">
        {showLowCallout && (
          <span className="lowBadge">
            Lowest: {formatDate(coords[lowestIdx].date)} | {coords[lowestIdx].value < 0 ? '-' : ''}${Math.abs(coords[lowestIdx].value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
        <span className="chartLegend">
          {[
            { label: 'Income', color: '#34d399', posted: false },
            { label: 'Expense', color: '#f87171', posted: false },
            { label: 'Posted', color: '#f87171', posted: true }
          ].map(item => (
            <span key={item.label} className="legendItem">
              <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill={item.posted ? '#13151a' : item.color} stroke={item.color} strokeWidth={item.posted ? 2 : 1} /></svg>
              {item.label}
            </span>
          ))}
        </span>
      </div>
      <svg width={containerWidth} height={height} viewBox={`0 0 ${containerWidth} ${height}`} className="chartSvg balance-chart" preserveAspectRatio="xMinYMid meet">
        {/* Y Axis */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        {/* X Axis */}
        <line x1={padding.left} y1={height - padding.bottom} x2={containerWidth - padding.right} y2={height - padding.bottom} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

        {/* Y Axis Labels */}
        {yAxisLabels.map((label, i) => (
          <text key={`y-${i}`} x={padding.left - 8} y={label.y + 4} textAnchor="end" fontSize="11" fill="#facc15" opacity="0.8">
            {label.label}
          </text>
        ))}

        {/* X Axis Labels */}
        {xAxisLabels.map((label, i) => (
          <text key={`x-${i}`} x={label.x} y={height - padding.bottom + 16} textAnchor="middle" fontSize="11" fill="#facc15" opacity="0.8">
            {formatDate(label.date)}
          </text>
        ))}

        {/* Grid lines */}
        {yAxisLabels.map((label, i) => (
          <line key={`grid-${i}`} x1={padding.left} y1={label.y} x2={containerWidth - padding.right} y2={label.y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4" />
        ))}

        {/* Chart area background */}
        <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} fill="rgba(50,60,70,0.3)" opacity="0.5" />

        {/* Line: gold for positive, red for negative */}
        {segments.map((seg, i) => (
          <path
            key={i}
            d={makePath(seg.points)}
            fill="none"
            stroke={seg.sign < 0 ? '#ef4444' : '#fbbf24'}
            strokeWidth="2.5"
          />
        ))}
        {/* Horizontal $0.00 line */}
        {zeroY >= padding.top && zeroY <= height - padding.bottom && (
          <line
            x1={padding.left}
            y1={zeroY}
            x2={containerWidth - padding.right}
            y2={zeroY}
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="6,4"
            opacity="0.7"
          />
        )}
        {/* Low Balance Threshold line */}
        {lowBalanceThreshold !== 0 && thresholdY >= padding.top && thresholdY <= height - padding.bottom && (
          <line
            x1={padding.left}
            y1={thresholdY}
            x2={containerWidth - padding.right}
            y2={thresholdY}
            stroke="#facc15"
            strokeWidth="2"
            strokeDasharray="4,4"
            opacity="0.85"
          />
        )}
        {/* Area fill: gold for positive, deep red for negative */}
        {(() => {
          if (coords.length < 2) return null;
          // Split into positive and negative regions
          let posPath = '';
          let negPath = '';
          let lastSign = Math.sign(coords[0].value);
          let seg: {x:number,y:number}[] = [];
          for (let i = 0; i < coords.length; i++) {
            const sign = Math.sign(coords[i].value);
            if (sign !== lastSign && seg.length > 0) {
              // Close previous segment
              if (lastSign >= 0) {
                posPath += `${makePath(seg)} L ${seg[seg.length-1].x} ${height-padding.bottom} L ${seg[0].x} ${height-padding.bottom} Z`;
              } else {
                negPath += `${makePath(seg)} L ${seg[seg.length-1].x} ${height-padding.bottom} L ${seg[0].x} ${height-padding.bottom} Z`;
              }
              seg = [];
            }
            seg.push(coords[i]);
            lastSign = sign;
          }
          if (seg.length > 0) {
            if (lastSign >= 0) {
              posPath += `${makePath(seg)} L ${seg[seg.length-1].x} ${height-padding.bottom} L ${seg[0].x} ${height-padding.bottom} Z`;
            } else {
              negPath += `${makePath(seg)} L ${seg[seg.length-1].x} ${height-padding.bottom} L ${seg[0].x} ${height-padding.bottom} Z`;
            }
          }
          return <>
            {posPath && <path d={posPath} fill="#fbbf24" opacity="0.15" />}
            {negPath && <path d={negPath} fill="#ef4444" opacity="0.22" />}
          </>;
        })()}
        {/* Rings where the balance drops below the threshold; the lowest point also gets a guide and axis date */}
        {coords.map((c, i) => {
          const crosses = c.value < lowFlagLevel && (i === 0 || coords[i - 1].value >= lowFlagLevel);
          return crosses && i !== lowestIdx ? (
            <circle key={`cross-${i}`} cx={c.x} cy={c.y} r={8} fill="none" stroke="#ef4444" strokeWidth={2} style={{ pointerEvents: 'none' }} />
          ) : null;
        })}
        {showLowCallout && (() => {
          const p = coords[lowestIdx];
          const axisY = height - padding.bottom;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={p.x} y1={p.y} x2={p.x} y2={axisY} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" />
              <circle cx={p.x} cy={p.y} r={9} fill="none" stroke="#ef4444" strokeWidth={2.5} />
            </g>
          );
        })()}

        {/* Data points */}
        {/* Show all income/expense events as larger, colored circles. Offset if both on same day. */}
        {(() => {
          // Group coords by date string
          const byDate: Record<string, { idx: number, c: any }[]> = {};
          coords.forEach((c, idx) => {
            const key = c.date.toISOString().slice(0, 10);
            if (!byDate[key]) byDate[key] = [];
            byDate[key].push({ idx, c });
          });
          let markers: JSX.Element[] = [];
          Object.values(byDate).forEach(events => {
            // If both income and expense on same day, offset vertically (smaller offset)
            const income = events.find(e => e.c.type === 'income');
            const expense = events.find(e => e.c.type === 'expense');
            if (income && expense) {
              // Offset: income above, expense below (smaller, e.g. 4px)
              [
                { ...income, offset: -4 },
                { ...expense, offset: 4 }
              ].forEach(({ idx, c, offset }) => {
                let color = c.type === 'income' ? '#10b981' : '#ef4444';
                let r = 5;
                let border = 2;
                if (idx === firstNegativeIdx && firstNegativeIdx !== -1) {
                  color = '#ef4444';
                  r = 8;
                  border = 2.5;
                }
                markers.push(
                  <g key={idx}>
                    <circle
                      cx={c.x}
                      cy={c.y + offset}
                      r={r + 1.5}
                      fill="#fff"
                      stroke="#000"
                      strokeWidth={0.7}
                      opacity={0.7}
                    />
                    <circle
                      cx={c.x}
                      cy={c.y + offset}
                      r={r}
                      fill={c.posted ? '#1f2933' : color}
                      stroke={c.posted ? color : '#000'}
                      strokeWidth={c.posted ? 2.5 : 1.2}
                      opacity={hoveredPoint === idx ? 1 : c.posted ? 0.8 : 0.95}
                      style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={() => setHoveredPoint(idx)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  </g>
                );
              });
            } else {
              events.forEach(({ idx, c }) => {
                let color = c.type === 'income' ? '#10b981' : c.type === 'expense' ? '#ef4444' : '#888';
                let r = 5;
                let border = 2;
                if (idx === firstNegativeIdx && firstNegativeIdx !== -1) {
                  color = '#ef4444';
                  r = 8;
                  border = 2.5;
                }
                markers.push(
                  <g key={idx}>
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={r + 1.5}
                      fill="#fff"
                      stroke="#000"
                      strokeWidth={0.7}
                      opacity={0.7}
                    />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={r}
                      fill={c.posted ? '#1f2933' : color}
                      stroke={c.posted ? color : '#000'}
                      strokeWidth={c.posted ? 2.5 : 1.2}
                      opacity={hoveredPoint === idx ? 1 : c.posted ? 0.8 : 0.95}
                      style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={() => setHoveredPoint(idx)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  </g>
                );
              });
            }
          });
          return markers;
        })()}
      </svg>

      {/* Tooltip */}
      {hoveredPoint !== null && coords[hoveredPoint] && (
        <div
          style={{
            position: 'absolute',
            left: coords[hoveredPoint].x + 10,
            top: coords[hoveredPoint].y - 40,
            background: 'rgba(20,25,30,0.97)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#facc15',
            pointerEvents: 'none',
            zIndex: 100,
            backdropFilter: 'blur(4px)',
            whiteSpace: 'nowrap',
            minWidth: 180
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>
            <span style={{ fontSize: 20, marginRight: 6 }}>{coords[hoveredPoint].icon || ''}</span>
            {coords[hoveredPoint].name || '(No Name)'}
          </div>
          <div>Date: <span style={{ color: '#fff' }}>{formatDate(coords[hoveredPoint].date)}</span></div>
          <div>Type: <span style={{ color: coords[hoveredPoint].type === 'income' ? '#10b981' : '#ef4444' }}>{coords[hoveredPoint].type === 'income' ? 'Income' : coords[hoveredPoint].type === 'expense' ? 'Expense' : 'N/A'}</span> <span style={{ color: '#aaa' }}>({coords[hoveredPoint].posted ? 'Posted' : 'Not posted'})</span></div>
          <div>Amount: <span style={{ color: coords[hoveredPoint].type === 'income' ? '#10b981' : '#ef4444' }}>
            {coords[hoveredPoint].type === 'income' ? '+' : coords[hoveredPoint].type === 'expense' ? '-' : ''}${coords[hoveredPoint].amount?.toFixed(2) ?? '0.00'}
          </span></div>
          <div>Category: <span style={{ color: '#fff' }}>{coords[hoveredPoint].category || '(None)'}</span></div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: '4px', paddingTop: '4px', fontWeight: 'bold' }}>
            Balance: ${coords[hoveredPoint].value.toFixed(2)}
          </div>
        </div>
      )}
      {/* No visible slider; zoom is interactive by drag */}
    </div>
  )
}

function ExpensePieChart({ data, total, mode = 'percent' }: { data: Record<string, number>; total: number; mode?: 'percent' | 'dollar' }) {
  // Soft, cohesive, elegant palette (muted, less saturated)
  const palette = [
    '#b5b8c2', // soft gray
    '#a3b18a', // muted olive green
    '#f6c453', // soft gold
    '#6c7a89', // slate blue-gray
    '#b7b7a4', // warm gray
    '#b5ead7', // pale mint
    '#f7cac9', // blush pink
    '#c9cba3', // sage
    '#e2cfc3', // sand
    '#b0aac2', // lavender gray
  ];
  const [hovered, setHovered] = useState<number | null>(null);
  const radius = 105;
  // Start at -90deg (12:00 position)
  let startAngle = -Math.PI / 2;
  const centerX = 120;
  const centerY = 120;

  // Sort categories by value descending
  const sortedEntries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const segments = sortedEntries.map(([name, value], idx) => {
    const portion = value / (total || 1);
    const angle = portion * Math.PI * 2;
    const endAngle = startAngle + angle;
    // Pull-out effect on hover
    let pull = 0;
    if (hovered === idx) pull = 16;
    const midAngle = (startAngle + endAngle) / 2;
    const cx = centerX + pull * Math.cos(midAngle);
    const cy = centerY + pull * Math.sin(midAngle);
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const color = palette[idx % palette.length];
    startAngle = endAngle;
    return { name, portion, path, color };
  });

  return (
    <div className="pieChartWrapper">
      <svg width={270} height={270} style={{ flex: '0 0 270px', background: 'none', display: 'block', filter: 'drop-shadow(0 2px 10px #0004)' }}>
        {segments.map((s, idx) => (
          <path
            key={idx}
            d={s.path}
            fill={s.color}
            // No stroke for cleaner look
            style={{
              filter: hovered === idx ? 'drop-shadow(0 0 8px #fff8)' : undefined,
              cursor: 'pointer',
              opacity: hovered === null || hovered === idx ? 1 : 0.7,
              transition: 'opacity 0.2s, filter 0.2s',
            }}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      <div style={{ flex: '0 0 220px', marginLeft: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <ul className="pieLegend" style={{ width: '100%', margin: 0, padding: 0 }}>
          {segments.map((s, idx) => (
            <li key={idx} style={{ color: '#fff', fontWeight: 500, marginBottom: 10, display: 'flex', alignItems: 'center', fontSize: 15, background: hovered === idx ? '#facc1533' : 'none', borderRadius: 6, padding: hovered === idx ? '2px 6px' : 0, transition: 'background 0.2s' }}
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
            >
              <span className="legendDot" style={{ backgroundColor: s.color, border: '1px solid #fff', marginRight: 10 }}></span>
              <span style={{ color: '#facc15', minWidth: 70, display: 'inline-block', fontWeight: 600 }}>{s.name}</span>
              <span style={{ color: s.color, marginLeft: 12, fontWeight: 700 }}>{mode === 'percent' ? `${(s.portion * 100).toFixed(1)}%` : `$${(s.portion * total).toFixed(2)}`}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Without Supabase configured the app runs in local-only mode.
  if (!supabase) return <BudgetApp />;
  if (!ready) return null;
  if (!session) return <Login />;
  return (
    <BudgetApp
      key={session.user.id}
      userId={session.user.id}
      onSignOut={async () => {
        await supabase!.auth.signOut();
        ['incomes', 'expenses', 'tags', 'startingBalance', 'lowBalanceThreshold', 'posted_map'].forEach(k => localStorage.removeItem(k));
      }}
    />
  );
}

export default App