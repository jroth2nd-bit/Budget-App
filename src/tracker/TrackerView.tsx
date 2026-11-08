import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { TrackerStorage } from '../TrackerHost';
import tracker from './tracker.js';
import { mount as mountMercy } from './app.js';
import { mount as mountChampions } from './champions.js';
import { mount as mountBjj } from './bjj.js';
import type { BeltTheme } from './bjj.js';
import mercyHtml from './index.html?raw';
import championsHtml from './champions.html?raw';
import bjjHtml from './bjj.html?raw';
import trackerCss from './styles.css?raw';
import bjjCss from './bjj.css?raw';
import integratedCss from './view.css?raw';

export type TrackerPage = 'mercy-ledger' | 'champion-builds' | 'bjj-skills' | 'weight-tracker';
type LegacyTrackerPage = Exclude<TrackerPage, 'weight-tracker'>;
export type TrackerViewHandle = { openAdd(): void };

const views = {
  'mercy-ledger': { html: mercyHtml, mount: mountMercy },
  'champion-builds': { html: championsHtml, mount: mountChampions },
  'bjj-skills': { html: bjjHtml, mount: mountBjj },
};

type Props = { page: LegacyTrackerPage; storage: TrackerStorage; onActionReady: (ready: boolean) => void; onBeltChange: (belt: BeltTheme) => void };

const TrackerView = forwardRef<TrackerViewHandle, Props>(function TrackerView({ page, storage, onActionReady, onBeltChange }, ref) {
  const host = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    openAdd() {
      const addButtonId = page === 'champion-builds' ? '#build-add' : page === 'bjj-skills' ? '#bjj-add' : null;
      const button = addButtonId
        ? host.current?.shadowRoot?.querySelector<HTMLButtonElement>(addButtonId)
        : null;
      if (button && !button.disabled) button.click();
    },
  }), [page]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const root = element.shadowRoot || element.attachShadow({ mode: 'open' });
    const parsed = new DOMParser().parseFromString(views[page].html, 'text/html');
    const surface = document.createElement('div');
    surface.className = `tracker-surface${page === 'bjj-skills' ? ' bjj-theme' : ''}`;
    if (page === 'bjj-skills') surface.dataset.belt = 'blue';
    surface.append(...Array.from(parsed.body.childNodes));
    const style = document.createElement('style');
    style.textContent = trackerCss.replace(':root', ':host').replace('body {', '.tracker-surface {') +
      (page === 'bjj-skills' ? bjjCss : '') + integratedCss;
    root.replaceChildren(style, surface);
    let active = true;
    const scopedStorage: TrackerStorage = {
      getItem: key => {
        if (!active) throw new Error('This tracker page was closed before the operation finished.');
        return storage.getItem(key);
      },
      setItem: (key, value) => {
        if (!active) throw new Error('This tracker page was closed before the operation finished.');
        storage.setItem(key, value);
      },
    };
    try {
      if (page === 'bjj-skills') mountBjj(root, scopedStorage, tracker, onBeltChange);
      else views[page].mount(root, scopedStorage, tracker);
      const addButton = root.querySelector<HTMLButtonElement>(page === 'champion-builds' ? '#build-add' : '#bjj-add');
      onActionReady(!!addButton && !addButton.disabled);
    } catch (error) {
      active = false;
      const notice = document.createElement('p');
      notice.setAttribute('role', 'alert');
      notice.className = 'notice error';
      notice.textContent = `Could not open this tracker: ${error instanceof Error ? error.message : String(error)}. Your data has not been replaced.`;
      root.replaceChildren(style, notice);
      onActionReady(false);
    }
    return () => { active = false; onActionReady(false); };
  }, [page, storage, onActionReady, onBeltChange]);

  return <div ref={host} className="trackerView" />;
});

export default TrackerView;
