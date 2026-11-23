import { useEffect, useRef, useState } from 'react';
import FormDialog from '../FormDialog';
import type { TrackerStorage } from '../TrackerHost';
import tracker from './tracker.js';
import { completedStoicEntries, currentStoicStreak, stoicCompletion, stoicCurriculum, type StoicEntry, type StoicModuleId } from './stoic.js';
import { generateStoicMonth } from './stoicGeneration';
import { validDate } from './weight.js';
import type { TrackerState } from './tracker.js';
import './stoic.css';

const KEY = 'mercy-ledger-v1';
type StoicAnswers = { morning: [string, string]; evening: [string, string, string] };
type Snapshot = { raw: string | null; state: TrackerState | null; error: string };

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function blankAnswers(): StoicAnswers {
  return { morning: ['', ''], evening: ['', '', ''] };
}

function answersFor(entry?: StoicEntry): StoicAnswers {
  return entry ? { morning: [...entry.morning], evening: [...entry.evening] } : blankAnswers();
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sectionStatus(entry: Pick<StoicEntry, 'morning' | 'evening'> | undefined) {
  const status = entry ? stoicCompletion(entry) : { morningDone: false, eveningDone: false, dayDone: false };
  return `Morning: ${status.morningDone ? 'Done' : 'Pending'} · Evening: ${status.eveningDone ? 'Done' : 'Pending'}`;
}

export default function StoicTracker({ storage }: { storage: TrackerStorage }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    try {
      const raw = storage.getItem(KEY);
      return { raw, state: raw === null ? tracker.emptyState() : tracker.validateState(JSON.parse(raw)), error: '' };
    } catch (error) {
      return { raw: null, state: null, error: `Could not load Daily Stoic: ${errorText(error)}` };
    }
  });
  const today = localDateKey();
  const todayEntry = snapshot.state?.stoic.entries.find(entry => entry.date === today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedModule, setSelectedModule] = useState<StoicModuleId>(todayEntry?.moduleId ?? snapshot.state?.stoic.activeModuleId ?? stoicCurriculum[0].id);
  const [answers, setAnswers] = useState<StoicAnswers>(() => answersFor(todayEntry));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const entries = snapshot.state?.stoic.entries ?? [];
  const modules = [...stoicCurriculum, ...(snapshot.state?.stoic.generated ?? [])];
  const selectedEntry = entries.find(entry => entry.date === selectedDate);
  const module = modules.find(item => item.id === selectedModule) ?? stoicCurriculum[0];
  const activeModule = modules.find(item => item.id === snapshot.state?.stoic.activeModuleId) ?? stoicCurriculum[0];
  const selectedCompletion = stoicCompletion(answers);
  const savedAnswers = answersFor(selectedEntry);
  const isDirty = selectedModule !== (selectedEntry?.moduleId ?? snapshot.state?.stoic.activeModuleId)
    || JSON.stringify(answers) !== JSON.stringify(savedAnswers);
  const history = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const streak = snapshot.state ? currentStoicStreak(entries, today) : 0;
  const activeCount = completedStoicEntries(entries, activeModule.id);
  const needsGeneration = activeCount >= 30 && activeModule.id === modules[modules.length - 1].id;

  const chooseDate = (date: string) => {
    if (!validDate(date) || date > today) {
      setError('Choose today or an earlier date.');
      return;
    }
    if (isDirty && !window.confirm('Discard unsaved Daily Stoic answers?')) return;
    const entry = entries.find(item => item.date === date);
    setSelectedDate(date);
    setSelectedModule(entry?.moduleId ?? snapshot.state?.stoic.activeModuleId ?? stoicCurriculum[0].id);
    setAnswers(answersFor(entry));
    setError('');
    setMessage('');
    setHistoryOpen(false);
  };

  const generateNext = async (base: Snapshot) => {
    if (!base.state || generating) return;
    setGenerating(true);
    setError('');
    try {
      const current = base.state;
      const next = await generateStoicMonth(5 + current.stoic.generated.length);
      if (!mounted.current) return;
      if (storage.getItem(KEY) !== base.raw) throw new Error('Tracker data changed while generating. Reload before retrying.');
      const state = tracker.validateState({
        ...current,
        stoic: { ...current.stoic, generated: [...current.stoic.generated, next], activeModuleId: next.id },
      });
      const raw = JSON.stringify(state);
      storage.setItem(KEY, raw);
      setSnapshot({ raw, state, error: '' });
      setMessage(`Month ${next.month} is ready for your next entry.`);
    } catch (failure) {
      if (mounted.current) setError(`Could not generate the next module: ${errorText(failure)} Your saved entry is unchanged. Use Retry generation to try again.`);
    } finally {
      if (mounted.current) setGenerating(false);
    }
  };

  const selectModule = (id: string) => {
    if (!snapshot.state || generating) return;
    const next = modules.find(item => item.id === id);
    if (!next || next.id === selectedModule) return;
    if ([...answers.morning, ...answers.evening].some(answer => answer.trim()) &&
        !window.confirm('Changing the module changes the questions for this entry. Keep your answers and continue?')) return;
    try {
      if (storage.getItem(KEY) !== snapshot.raw) throw new Error('Tracker data changed in another tab. Reload before editing.');
      const state = tracker.validateState({ ...snapshot.state, stoic: { ...snapshot.state.stoic, activeModuleId: next.id } });
      const raw = JSON.stringify(state);
      storage.setItem(KEY, raw);
      setSnapshot({ raw, state, error: '' });
      setSelectedModule(next.id);
      setError('');
      setMessage(`Active module set to ${next.virtue}.`);
    } catch (failure) {
      setError(`Could not change the active module: ${errorText(failure)}`);
    }
  };

  const setAnswer = (section: 'morning' | 'evening', index: number, value: string) => {
    setAnswers(previous => section === 'morning'
      ? { ...previous, morning: index === 0 ? [value, previous.morning[1]] : [previous.morning[0], value] }
      : { ...previous, evening: index === 0
        ? [value, previous.evening[1], previous.evening[2]]
        : index === 1
          ? [previous.evening[0], value, previous.evening[2]]
          : [previous.evening[0], previous.evening[1], value] });
    setError('');
    setMessage('');
  };

  const save = () => {
    if (!snapshot.state) return;
    if (!validDate(selectedDate) || selectedDate > today) {
      setError('Choose today or an earlier date.');
      return;
    }
    if (![...answers.morning, ...answers.evening].some(answer => answer.trim())) {
      setError('Enter at least one answer before saving.');
      return;
    }
    try {
      if (storage.getItem(KEY) !== snapshot.raw) throw new Error('Tracker data changed in another tab. Reload before editing.');
      const nextEntries = [
        ...entries.filter(entry => entry.date !== selectedDate),
        { date: selectedDate, moduleId: selectedModule, morning: answers.morning, evening: answers.evening },
      ].sort((a, b) => a.date.localeCompare(b.date));
      const previousCount = completedStoicEntries(entries, selectedModule);
      const nextCount = completedStoicEntries(nextEntries, selectedModule);
      const completedActive = selectedModule === snapshot.state.stoic.activeModuleId && previousCount < 30 && nextCount >= 30;
      const currentIndex = modules.findIndex(item => item.id === selectedModule);
      const nextModule = completedActive ? modules[currentIndex + 1] : undefined;
      const state = tracker.validateState({ ...snapshot.state, stoic: {
        ...snapshot.state.stoic,
        entries: nextEntries,
        activeModuleId: nextModule?.id ?? snapshot.state.stoic.activeModuleId,
      } });
      const raw = JSON.stringify(state);
      storage.setItem(KEY, raw);
      const nextSnapshot = { raw, state, error: '' };
      setSnapshot(nextSnapshot);
      setError('');
      setMessage(nextModule ? `Saved ${selectedDate}. ${nextModule.virtue} is active for your next entry.` : `Saved ${selectedDate}.`);
      if (completedActive && !nextModule) void generateNext(nextSnapshot);
    } catch (failure) {
      setError(`Could not save your Daily Stoic entry: ${errorText(failure)}`);
    }
  };

  if (!snapshot.state) return <div className="stoicPage"><p role="alert" className="stoicError">{snapshot.error}</p></div>;

  return <div className="stoicPage">
    {snapshot.error && <p role="alert" className="stoicError">{snapshot.error}</p>}
    {error && <p role="alert" className="stoicError">{error}</p>}
    <div className="stoicTopRow">
      <section className="card stoicHeader">
        <div>
          <p className="stoicEyebrow">Month {module.month} · 30-day practice · {module.focus}</p>
          <h2>{module.virtue}</h2>
          <blockquote>
            <p>“{module.quote.text}”</p>
            <cite>&mdash; {module.quote.attribution}</cite>
          </blockquote>
        </div>
        <label className="stoicModuleSelect">{module.id === activeModule.id ? 'Active module' : 'Entry module'}
          <select value={selectedModule} disabled={generating} onChange={event => selectModule(event.target.value)}>
            {modules.map(item => <option key={item.id} value={item.id}>Month {item.month} · {item.virtue}</option>)}
          </select>
        </label>
        <p className="stoicProgress">Active: {activeModule.virtue} · {Math.min(activeCount, 30)}/30 completed{module.id !== activeModule.id ? ' · Viewing a different entry module' : ''}</p>
        {needsGeneration && <button type="button" disabled={generating} onClick={() => void generateNext(snapshot)}>{generating ? 'Generating next module…' : 'Retry generation'}</button>}
      </section>

      <aside className="card stoicHistory" aria-label="Entry history and streak">
        <div className="stoicHistoryHeading">
          <h2>History &amp; streak</h2>
          <p className="stoicStreak">🔥 {streak}-day streak</p>
        </div>
        <p className="stoicHistoryHint">A streak day requires all five answers. Today can remain in progress.</p>
        <button type="button" onClick={() => setHistoryOpen(true)}>View past entries</button>
      </aside>
    </div>

    {historyOpen && <FormDialog title="Past entries" onClose={() => setHistoryOpen(false)}>
      {!history.length ? <p>No saved entries yet.</p> : <ul className="stoicHistoryList">
        {history.map(entry => {
          const entryModule = modules.find(item => item.id === entry.moduleId)!;
          const completion = stoicCompletion(entry);
          return <li key={entry.date}>
            <button type="button" className="stoicHistoryItem" aria-pressed={selectedDate === entry.date} onClick={() => chooseDate(entry.date)}>
              <strong>{entry.date}</strong>
              <span>Month {entryModule.month} · {entryModule.virtue}</span>
              <small>{completion.dayDone ? 'Completed' : sectionStatus(entry)}</small>
            </button>
          </li>;
        })}
      </ul>}
    </FormDialog>}

    <section className="card stoicEntry" aria-labelledby="stoic-entry-title">
      <div className="stoicEntryHeading">
        <div>
          <h2 id="stoic-entry-title">Daily entry</h2>
          <p>{sectionStatus(answers)}</p>
        </div>
        <label>Date
          <input type="date" value={selectedDate} max={today} onChange={event => chooseDate(event.target.value)} />
        </label>
      </div>
      <section className="stoicAnswerSection" aria-labelledby="stoic-morning-title">
        <h3 id="stoic-morning-title">Morning</h3>
        <p>{selectedCompletion.morningDone ? 'Complete' : 'Answer both prompts to complete Morning.'}</p>
        {module.morning.map((question, index) => <label className="stoicQuestion" key={question}>
          <span>{question}</span>
          <textarea maxLength={4000} rows={3} value={answers.morning[index]} onChange={event => setAnswer('morning', index, event.target.value)} />
        </label>)}
      </section>
      <section className="stoicAnswerSection" aria-labelledby="stoic-evening-title">
        <h3 id="stoic-evening-title">Evening</h3>
        <p>{selectedCompletion.eveningDone ? 'Complete' : 'Answer all three prompts to complete Evening.'}</p>
        {module.evening.map((question, index) => <label className="stoicQuestion" key={question}>
          <span>{question}</span>
          <textarea maxLength={4000} rows={3} value={answers.evening[index]} onChange={event => setAnswer('evening', index, event.target.value)} />
        </label>)}
      </section>
      <div className="stoicSaveRow">
        <button className="primary" type="button" disabled={generating} onClick={save}>Save Entry</button>
        {message && <span role="status">{message}</span>}
      </div>
    </section>
  </div>;
}
