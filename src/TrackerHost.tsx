import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { supabase } from './supabase';
import TrackerView, { type TrackerViewHandle } from './tracker/TrackerView';
import type { TrackerPage } from './tracker/TrackerView';
import type { BeltTheme } from './tracker/bjj.js';
import tracker from './tracker/tracker.js';
import WeightTracker from './tracker/WeightTracker';
import type { WeightActionState, WeightTrackerHandle } from './tracker/WeightTracker';
import type { TrackerState } from './tracker/tracker.js';

type Cache = { revision: string | null; data: string | null; dirty: boolean };
export type TrackerStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type TrackerSummary = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: TrackerState };

const LEGACY_KEY = 'mercy-ledger-v1';
export type TrackerBackupHandle = {
  snapshot: () => Promise<{ raw: string | null; data: TrackerState }>;
  current: () => Promise<string | null>;
  restore: (expected: string | null, data: TrackerState) => Promise<void>;
  openAdd: () => void;
  openWeightPlan: () => void;
  openWeightWeighIn: () => void;
};
function readCache(raw: string): Cache {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('The tracker recovery cache is invalid.');
  const value = parsed as Record<string, unknown>;
  if ((value.revision !== null && typeof value.revision !== 'string') ||
      (value.data !== null && typeof value.data !== 'string') || typeof value.dirty !== 'boolean') {
    throw new Error('The tracker recovery cache is invalid.');
  }
  return { revision: value.revision, data: value.data, dirty: value.dirty };
}

const TrackerHost = forwardRef<TrackerBackupHandle, { page: TrackerPage | null; userId?: string; showRecovery?: boolean; showSummary?: boolean; onSummary: (summary: TrackerSummary) => void; onActionReady: (ready: boolean) => void; onBeltChange: (belt: BeltTheme) => void; onWeightActionState: (state: WeightActionState) => void }>(function TrackerHost({ page, userId, showRecovery, showSummary, onSummary, onActionReady, onBeltChange, onWeightActionState }, ref) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [recovery, setRecovery] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const bridge = useRef<TrackerStorage>();
  const recoveryCache = useRef<string | null>(null);
  const canDiscardCache = useRef(false);
  const backupActions = useRef<Omit<TrackerBackupHandle, 'openAdd' | 'openWeightPlan' | 'openWeightWeighIn'>>();
  const viewRef = useRef<TrackerViewHandle>(null);
  const weightRef = useRef<WeightTrackerHandle>(null);
  const cacheKey = userId ? `budget-app-tracker-cache:${userId}` : '';

  useEffect(() => {
    let disposed = false;
    let cacheSnapshot: string | null = null;
    let blocked = false;
    let saving = false;
    let savePromise: Promise<void> | null = null;
    let record: Cache = { revision: null, data: null, dirty: false };

    const showError = (error: unknown) => {
      blocked = true;
      if (disposed) return;
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
      try {
        const raw = localStorage.getItem(cacheKey);
        recoveryCache.current = raw;
        canDiscardCache.current = raw === cacheSnapshot;
        if (record.dirty && record.data) {
          setRecovery(record.data);
        } else if (raw) {
          const cached = readCache(raw);
          if (cached.dirty && cached.data) setRecovery(cached.data);
        }
      } catch {
        setMessage('Tracker storage could not be read. Your existing data has not been replaced.');
      }
    };

    const persist = async () => {
      if (saving || blocked || !record.dirty || !userId || !supabase) return;
      saving = true;
      if (!disposed) setPhase('saving');
      const data = record.data;
      const revision = record.revision;
      const nextRevision = crypto.randomUUID();
      try {
        if (data === null) throw new Error('Tracker data is missing.');
        const payload: unknown = JSON.parse(data);
        const request = revision === null
          ? supabase.from('tracker_data').insert({ user_id: userId, revision: nextRevision, data: payload }).select('revision').maybeSingle()
          : supabase.from('tracker_data').update({ revision: nextRevision, data: payload }).eq('user_id', userId).eq('revision', revision).select('revision').maybeSingle();
        const { data: saved, error } = await request;
        if (error) throw new Error(`Tracker cloud save failed: ${error.message}`);
        if (!saved) throw new Error('Tracker data changed on another device. Export the recovery backup and reload before importing it.');
        if (localStorage.getItem(cacheKey) !== cacheSnapshot) throw new Error('Tracker data changed in another tab. Reload before editing.');
        record = { revision: nextRevision, data: record.data, dirty: record.data !== data };
        cacheSnapshot = JSON.stringify(record);
        localStorage.setItem(cacheKey, cacheSnapshot);
        saving = false;
        if (!disposed) setPhase(record.dirty ? 'saving' : 'ready');
        if (record.dirty) await persist();
      } catch (error) {
        saving = false;
        showError(error);
      }
    };

    const current = async () => {
      const activeBridge = bridge.current;
      if (disposed || blocked || saving || !activeBridge) throw new Error('Tracker data is not ready. Resolve tracker sync or loading errors before using backups.');
      const raw = activeBridge.getItem(LEGACY_KEY);
      if (userId && supabase) {
        if (localStorage.getItem(cacheKey) !== cacheSnapshot) throw new Error('Tracker data changed in another tab. Reload before using backups.');
        const { data: remote, error } = await supabase.from('tracker_data').select('revision').eq('user_id', userId).maybeSingle();
        if (error) throw new Error(`Could not check tracker sync: ${error.message}`);
        if ((remote?.revision ?? null) !== record.revision || localStorage.getItem(cacheKey) !== cacheSnapshot || saving || blocked) {
          throw new Error('Tracker data changed elsewhere. Reload before using backups.');
        }
      }
      if (disposed || bridge.current !== activeBridge) throw new Error('Tracker session changed. Try the backup again.');
      return raw;
    };
    backupActions.current = {
      current,
      snapshot: async () => {
        const raw = await current();
        return { raw, data: raw === null ? tracker.emptyState() : tracker.validateState(JSON.parse(raw)) };
      },
      restore: async (expected, data) => {
        const raw = await current();
        if (raw !== expected) throw new Error('Tracker data changed while importing. No budget data was replaced; try again.');
        if (disposed || !bridge.current) throw new Error('Tracker data is unavailable.');
        if (bridge.current.getItem(LEGACY_KEY) !== expected) throw new Error('Tracker data changed while importing. No budget data was replaced; try again.');
        bridge.current.setItem(LEGACY_KEY, JSON.stringify(tracker.validateState(data)));
        if (savePromise) await savePromise;
        if (disposed) throw new Error('Tracker session changed before restore was confirmed. Check the account tracker data before retrying.');
        if (blocked) throw new Error('Tracker restore could not be confirmed. Budget data was not replaced; account tracker data may have changed. Export the recovery backup and resolve the tracker error.');
      },
    };

    const load = async () => {
      try {
        if (!userId || !supabase) {
          const localBridge: TrackerStorage = {
            getItem: key => localStorage.getItem(key),
            setItem: (key, value) => localStorage.setItem(key, value),
          };
          if (disposed) return;
          bridge.current = localBridge;
          setPhase('ready');
          return;
        }
        cacheSnapshot = localStorage.getItem(cacheKey);
        const cached = cacheSnapshot !== null ? readCache(cacheSnapshot) : null;
        if (cached) {
          if (cached.dirty) {
            if (cached.data) setRecovery(cached.data);
            throw new Error('There are unsynced tracker changes on this browser. Export the recovery backup before reloading the account copy.');
          }
        }
        const { data: remote, error } = await supabase.from('tracker_data').select('revision,data').eq('user_id', userId).maybeSingle();
        if (error) throw new Error(`Could not load tracker data: ${error.message}`);
        if (disposed) return;
        if (localStorage.getItem(cacheKey) !== cacheSnapshot) throw new Error('Tracker data changed in another tab while loading. Reload before editing.');
        if (!remote && cached?.revision && cached.data) {
          setRecovery(cached.data);
          throw new Error('The account tracker is missing, but this browser has a saved copy. Export the recovery backup before proceeding.');
        }
        record = { revision: remote?.revision ?? null, data: remote ? JSON.stringify(remote.data) : null, dirty: false };
        cacheSnapshot = JSON.stringify(record);
        localStorage.setItem(cacheKey, cacheSnapshot);
        const cloudBridge: TrackerStorage = {
          getItem: key => {
            if (key !== LEGACY_KEY) throw new Error('Unexpected tracker storage key.');
            const raw = localStorage.getItem(cacheKey);
            if (raw === null) throw new Error('Tracker cache is missing. Reload before editing.');
            return readCache(raw).data;
          },
          setItem: (key, value) => {
            if (key !== LEGACY_KEY) throw new Error('Unexpected tracker storage key.');
            if (blocked) throw new Error('Tracker sync failed. Export the recovery backup and reload.');
            if (localStorage.getItem(cacheKey) !== cacheSnapshot) throw new Error('Tracker data changed in another tab. Reload before saving.');
            record = { ...record, data: value, dirty: true };
            const next = JSON.stringify(record);
            localStorage.setItem(cacheKey, next);
            cacheSnapshot = next;
            if (!saving) savePromise = persist();
          },
        };
        bridge.current = cloudBridge;
        setPhase('ready');
      } catch (error) {
        showError(error);
      }
    };

    setPhase('loading');
    setMessage('');
    setRecovery(null);
    recoveryCache.current = null;
    canDiscardCache.current = false;
    void load();
    return () => {
      disposed = true;
      bridge.current = undefined;
      backupActions.current = undefined;
    };
  }, [userId, cacheKey, attempt]);

  useEffect(() => {
    if (!showSummary) return;
    if (phase === 'error') {
      onSummary({ status: 'error', message });
      return;
    }
    if (phase === 'loading' || !bridge.current) {
      onSummary({ status: 'loading' });
      return;
    }
    try {
      const raw = bridge.current.getItem(LEGACY_KEY);
      onSummary({ status: 'ready', data: raw === null ? tracker.emptyState() : tracker.validateState(JSON.parse(raw)) });
    } catch (error) {
      onSummary({ status: 'error', message: `Could not read tracker data: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, [showSummary, phase, message, onSummary]);

  useImperativeHandle(ref, () => ({
    openAdd: () => viewRef.current?.openAdd(),
    openWeightPlan: () => weightRef.current?.openPlan(),
    openWeightWeighIn: () => weightRef.current?.openWeighIn(),
    snapshot: () => {
      if (!backupActions.current) throw new Error('Tracker data is still loading.');
      return backupActions.current.snapshot();
    },
    current: () => {
      if (!backupActions.current) throw new Error('Tracker data is still loading.');
      return backupActions.current.current();
    },
    restore: (expected, data) => {
      if (!backupActions.current) throw new Error('Tracker data is still loading.');
      return backupActions.current.restore(expected, data);
    },
  }), []);

  const exportRecovery = () => {
    if (!recovery) return;
    const url = URL.createObjectURL(new Blob([recovery], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mercy-ledger-recovery.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const reloadAccountCopy = () => {
    if (!window.confirm('Discard this browser’s unsynced tracker cache and reload the account copy? Export the recovery backup first.')) return;
    try {
      if (!canDiscardCache.current) throw new Error('Another tab changed the tracker cache. Close that tab and reload; its data has not been discarded.');
      if (localStorage.getItem(cacheKey) !== recoveryCache.current) {
        throw new Error('The tracker cache changed in another tab. Close that tab and reload before resolving the conflict.');
      }
      localStorage.removeItem(cacheKey);
      setAttempt(value => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section hidden={!page && !showRecovery} className="trackerHost" aria-label="Tracker">
      {phase === 'loading' && <p role="status">Loading tracker…</p>}
      {phase === 'error' && <div role="alert" className="trackerError">
        <p>{message}</p>
        {recovery && <button type="button" onClick={exportRecovery}>Export recovery backup</button>}
        {userId && <button type="button" onClick={reloadAccountCopy}>Reload account copy</button>}
      </div>}
      {(phase === 'ready' || phase === 'saving') && page && <>
        <p className="trackerSync" role="status">{userId ? (phase === 'saving' ? 'Tracker: saving to account…' : 'Tracker: account sync ready') : 'Tracker: local only'}</p>
        {bridge.current && (page === 'weight-tracker'
          ? <WeightTracker ref={weightRef} storage={bridge.current} onActionState={onWeightActionState} />
          : <TrackerView ref={viewRef} key={page} page={page} storage={bridge.current} onActionReady={onActionReady} onBeltChange={onBeltChange} />)}
      </>}
    </section>
  );
});

export default TrackerHost;
