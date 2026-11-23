import { test, expect } from '@playwright/test';
import tracker from '../src/tracker/tracker.js';
import type { StoicEntry } from '../src/tracker/stoic.js';

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('Daily Stoic saves all answers for the chosen module and updates its dashboard card', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-stoic').click();
  await expect(page.locator('.topBar').getByRole('heading', { name: 'Daily Stoic' })).toBeVisible();
  await expect(page.getByText('You are not tossed about by events, but by your view of them.')).toBeVisible();
  await page.getByLabel('Active module').selectOption('wisdom');
  await page.getByLabel('What assumption should I question today?').fill('I can check my first impression.');
  await page.getByLabel('What can I learn before deciding?').fill('I should listen before responding.');
  await page.getByRole('button', { name: 'Save Entry' }).click();
  await expect(page.locator('.stoicSaveRow [role="status"]')).toContainText('Saved');

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.overview-stoic')).toContainText('Morning: Done | Evening: Pending');
  await page.locator('.overview-stoic').click();
  await page.getByLabel('What did I understand more clearly today?').fill('I noticed a better option.');
  await page.getByLabel('What belief changed after I looked closer?').fill('I learned my first guess was wrong.');
  await page.getByLabel('What is one thing I am grateful for today?').fill('A friend helped me.');
  await page.getByRole('button', { name: 'Save Entry' }).click();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.version).toBe(19);
  expect(saved.stoic.entries).toHaveLength(1);
  expect(saved.stoic.entries[0]).toMatchObject({ date: localDate(), moduleId: 'wisdom' });

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.overview-stoic')).toContainText('Completed Today');
  await expect(page.locator('.overview-stoic')).toContainText('1-day streak');
});

test('Daily Stoic history opens and saves edits to a previous date', async ({ page }) => {
  const state = tracker.emptyState();
  const entry: StoicEntry = {
    date: localDate(-1),
    moduleId: 'courage',
    morning: ['I will have the hard conversation.', 'I will take it one step at a time.'],
    evening: ['I did what mattered.', 'I stayed present.', 'I am grateful for support.']
  };
  state.stoic.entries = [entry];
  await page.addInitScript(seed => {
    if (!sessionStorage.getItem('stoic-seeded')) {
      localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
      sessionStorage.setItem('stoic-seeded', '1');
    }
  }, state);
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-stoic').click();
  await page.getByRole('button', { name: 'View past entries' }).click();
  await page.getByRole('dialog', { name: 'Past entries' }).getByRole('button', { name: new RegExp(localDate(-1)) }).click();
  await expect(page.getByLabel('What am I avoiding that matters?')).toHaveValue(entry.morning[0]);
  await page.getByLabel('What am I avoiding that matters?').fill('I made the call I was avoiding.');
  await page.getByRole('button', { name: 'Save Entry' }).click();
  await expect(page.locator('.stoicSaveRow [role="status"]')).toContainText(`Saved ${localDate(-1)}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.stoic.entries[0].morning[0]).toBe('I made the call I was avoiding.');
});

test('the 30th complete entry advances the active module without changing saved prompts', async ({ page }) => {
  const state = tracker.emptyState();
  state.stoic.entries = Array.from({ length: 29 }, (_, index) => ({
    date: localDate(-index - 1), moduleId: 'temperance',
    morning: ['First', 'Second'], evening: ['Third', 'Fourth', 'Fifth'],
  }));
  await page.addInitScript(seed => {
    if (!sessionStorage.getItem('stoic-seeded')) {
      localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
      sessionStorage.setItem('stoic-seeded', '1');
    }
  }, state);
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-stoic').click();
  await expect(page.locator('.stoicProgress')).toContainText('29/30 completed');
  for (const question of [
    'What might throw me off today?', 'How will I stay steady when it happens?',
    'When did a wave of emotion hit me today?', 'Did I pause, or did it take over?',
    'What is one thing I am grateful for today?',
  ]) await page.getByLabel(question).fill('Answer');
  await page.getByRole('button', { name: 'Save Entry' }).click();
  await expect(page.locator('.stoicProgress')).toContainText('Active: Wisdom');
  await expect(page.getByLabel('What might throw me off today?')).toHaveValue('Answer');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.stoic.activeModuleId).toBe('wisdom');
  expect(saved.stoic.entries.find((entry: StoicEntry) => entry.date === localDate()).moduleId).toBe('temperance');
  await page.reload();
  await page.locator('.overview-stoic').click();
  await expect(page.locator('.stoicProgress')).toContainText('Active: Wisdom');
  await page.getByLabel('Date', { exact: true }).fill(localDate(-40));
  await expect(page.getByLabel('Active module')).toHaveValue('wisdom');
  await expect(page.getByLabel('What assumption should I question today?')).toBeVisible();
});

test('history opens in a dialog without resizing the top cards', async ({ page }) => {
  const state = tracker.emptyState();
  state.stoic.entries = Array.from({ length: 25 }, (_, index) => ({
    date: localDate(-index - 1), moduleId: 'temperance',
    morning: ['First', 'Second'], evening: ['Third', 'Fourth', 'Fifth'],
  }));
  await page.addInitScript(seed => localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed)), state);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-stoic').click();
  const before = await page.locator('.stoicHistory').boundingBox();
  await page.getByRole('button', { name: 'View past entries' }).click();
  await expect(page.getByRole('dialog', { name: 'Past entries' })).toBeVisible();
  const after = await page.locator('.stoicHistory').boundingBox();
  expect(after!.height).toBe(before!.height);
  await page.getByRole('dialog', { name: 'Past entries' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Past entries' })).toHaveCount(0);
});

test('when AI is unavailable the 30th entry remains saved and generation can be retried', async ({ page }) => {
  const state = tracker.emptyState();
  state.stoic.activeModuleId = 'justice';
  state.stoic.entries = Array.from({ length: 29 }, (_, index) => ({
    date: localDate(-index - 1), moduleId: 'justice',
    morning: ['First', 'Second'], evening: ['Third', 'Fourth', 'Fifth'],
  }));
  await page.addInitScript(seed => localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed)), state);
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-stoic').click();
  for (const question of [
    'Who might need my help today?', 'How can I be fair in my choices?',
    'Whose needs did I consider today?', 'Did I treat others with fairness?',
    'What is one thing I am grateful for today?',
  ]) await page.getByLabel(question).fill('Answer');
  await page.getByRole('button', { name: 'Save Entry' }).click();
  await expect(page.getByRole('alert')).toContainText('AI generation requires a configured Supabase account');
  await expect(page.getByRole('button', { name: 'Retry generation' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.stoic.entries).toHaveLength(30);
  expect(saved.stoic.activeModuleId).toBe('justice');
});

test('a configured AI function creates and persists the next module without journal data', async ({ page }) => {
  const state = tracker.emptyState();
  state.stoic.activeModuleId = 'justice';
  state.stoic.entries = Array.from({ length: 29 }, (_, index) => ({
    date: localDate(-index - 1), moduleId: 'justice',
    morning: ['Private first', 'Private second'], evening: ['Private third', 'Private fourth', 'Private fifth'],
  }));
  let cloud = { revision: 'original', data: state };
  const session = {
    access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' },
  };
  await page.addInitScript(value => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
  let generationBody: unknown;
  await page.route('http://127.0.0.1:5190/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/budget_data')) return route.fulfill({ json: [], headers });
    if (url.pathname.endsWith('/tracker_data')) {
      if (request.method() === 'GET') return route.fulfill({ json: [cloud], headers });
      const body = request.postDataJSON();
      cloud = { revision: body.revision, data: body.data };
      return route.fulfill({ json: [{ revision: body.revision }], headers });
    }
    if (url.pathname.endsWith('/generate-stoic-month')) {
      generationBody = request.postDataJSON();
      return route.fulfill({ headers, json: {
        virtue: 'Patience', focus: 'Steady effort',
        quote: { text: 'Meet the moment with patience.', attribution: 'AI-generated reflection' },
        morning: ['What deserves my patience today?', 'How can I act calmly?'],
        evening: ['When did I practice patience?', 'Where could I slow down?', 'What is one thing I am grateful for today?'],
      } });
    }
    return route.fulfill({ status: 404, json: { message: 'Unexpected endpoint' }, headers });
  });
  await page.goto('http://127.0.0.1:5189');
  await page.locator('.overview-stoic').click();
  for (const question of [
    'Who might need my help today?', 'How can I be fair in my choices?',
    'Whose needs did I consider today?', 'Did I treat others with fairness?',
    'What is one thing I am grateful for today?',
  ]) await page.getByLabel(question).fill('Private answer');
  await page.getByRole('button', { name: 'Save Entry' }).click();
  await expect(page.locator('.stoicSaveRow [role="status"]')).toContainText('Month 5 is ready');
  await expect.poll(() => cloud.data.stoic.generated.length).toBe(1);
  expect(generationBody).toEqual({});
  expect(cloud.data.stoic.activeModuleId).toBe(cloud.data.stoic.generated[0].id);
  expect(cloud.data.stoic.entries).toHaveLength(30);
});

test('Daily Stoic layout fits phone and desktop viewports', async ({ page }) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    if (width === 320) {
      const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
      await mobileNav.getByRole('button', { name: 'More' }).click();
      await mobileNav.getByRole('button', { name: 'Daily Stoic', exact: true }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Daily Stoic' }).click();
    }
    await expect(page.locator('.topBar').getByRole('heading', { name: 'Daily Stoic' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const moduleBox = await page.locator('.stoicHeader').boundingBox();
    const historyBox = await page.locator('.stoicHistory').boundingBox();
    const entryBox = await page.locator('.stoicEntry').boundingBox();
    const pageBox = await page.locator('.stoicPage').boundingBox();
    expect(moduleBox).not.toBeNull();
    expect(historyBox).not.toBeNull();
    expect(entryBox).not.toBeNull();
    expect(pageBox).not.toBeNull();
    if (width === 320) {
      expect(historyBox!.y).toBeGreaterThanOrEqual(moduleBox!.y + moduleBox!.height);
      expect(entryBox!.y).toBeGreaterThanOrEqual(historyBox!.y + historyBox!.height);
    } else {
      expect(Math.abs(moduleBox!.y - historyBox!.y)).toBeLessThan(2);
      expect(historyBox!.x).toBeGreaterThanOrEqual(moduleBox!.x + moduleBox!.width);
      expect(Math.abs(entryBox!.width - pageBox!.width)).toBeLessThan(2);
      expect(entryBox!.y).toBeGreaterThanOrEqual(moduleBox!.y + moduleBox!.height);
    }
  }
});
