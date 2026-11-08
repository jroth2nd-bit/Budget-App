import { test, expect } from '@playwright/test';
import tracker from '../src/tracker/tracker.js';
import type { Book } from '../src/tracker/books.js';

const makeBook = (id: string, patch: Partial<Book> = {}): Book => ({ id, title: id, author: 'Writer', series: '', genre: 'Fantasy', fictionType: 'Fiction', read: true, rating: '', summary: '', ...patch });

test('lookup preserves personal fields, editing persists, and filters and dashboard update', async ({ page }) => {
  await page.route('https://openlibrary.org/**', route => {
    const url = route.request().url();
    if (url.includes('/search.json')) return route.fulfill({ json: { docs: [{ key: '/works/OL1W', title: 'The Dragon', author_name: ['Writer'], subject: ['Fantasy'], series: ['Dragons #1'] }] } });
    return route.fulfill({ json: { description: 'Dragons cross distant kingdoms. A quest begins.' } });
  });
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-books').click();
  await page.getByRole('button', { name: 'Add Book', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Book' });
  await dialog.getByRole('combobox', { name: 'Read', exact: true }).selectOption('Yes');
  await dialog.getByRole('combobox', { name: 'Rating', exact: true }).selectOption('Really Liked');
  await dialog.getByLabel('Title').fill('Dragon');
  await dialog.getByRole('button', { name: 'The Dragon — Writer' }).click();
  await expect(dialog.getByLabel('Title')).toHaveValue('The Dragon');
  await expect(dialog.getByLabel('Series')).toHaveValue('Dragons #1');
  await expect(dialog.getByRole('combobox', { name: 'Read', exact: true })).toHaveValue('Yes');
  await expect(dialog.getByRole('combobox', { name: 'Rating', exact: true })).toHaveValue('Really Liked');
  await dialog.getByRole('button', { name: 'Add Book' }).click();
  await expect(page.locator('.bookStat').filter({ hasText: 'Favorite Genre' })).toContainText('Fantasy');
  await page.getByRole('button', { name: 'Edit series for The Dragon' }).click();
  await page.getByLabel('series for The Dragon').fill('Dragons #2');
  await page.getByLabel('series for The Dragon').blur();
  await page.getByLabel('Search', { exact: true }).fill('dragons #2');
  await expect(page.locator('.bookTable tbody tr')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Read Status', exact: true }).selectOption('Unread');
  await expect(page.getByText('No books match your filters.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Read Status', exact: true }).selectOption('All');
  await page.reload();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Book Tracker' }).click();
  await expect(page.getByRole('button', { name: 'Edit series for The Dragon' })).toHaveText('Dragons #2');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.overview-books')).toContainText('1 read');
});

test('recommendations use history, include unread DNF and add a new unread book', async ({ page }) => {
  const state = tracker.emptyState();
  state.books = [
    makeBook('Enjoyed', { author: 'Writer', rating: 'Really Liked', summary: 'Dragons cross distant kingdoms.' }),
    makeBook('Also Enjoyed', { author: 'Writer', rating: 'Liked', summary: 'Dragons cross distant kingdoms.' }),
    makeBook('Disliked', { author: 'Other', genre: 'History', rating: 'Did Not Like' }),
    makeBook('Unread DNF', { author: 'Writer', rating: 'Did Not Finish', read: false, summary: 'Dragons cross distant kingdoms.' }),
    makeBook('Unread Other', { author: 'Other', genre: 'History', read: false }),
  ];
  await page.addInitScript(seed => localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed)), state);
  await page.route('https://openlibrary.org/**', route => {
    if (route.request().url().includes('/search.json')) return route.fulfill({ json: { docs: [{ key: '/works/OL2W', title: 'New Dragon', author_name: ['Writer'], subject: ['Fantasy'] }] } });
    return route.fulfill({ json: { description: 'Dragons cross distant kingdoms.' } });
  });
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-books').click();
  await page.getByRole('button', { name: 'Recommend From My Library' }).click();
  await expect(page.locator('.bookResult')).toContainText('Unread DNF');
  await page.getByRole('button', { name: 'Recommend Something New' }).click();
  await expect(page.locator('.bookResult')).toContainText('New Dragon');
  await page.getByRole('button', { name: 'Add To Library' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.books.find((book: Book) => book.title === 'New Dragon')).toMatchObject({ author: 'Writer', genre: 'Fantasy', read: false, rating: '', summary: 'Dragons cross distant kingdoms.' });
});

test('phone layout and insufficient history remain clear', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-books').click();
  await page.getByRole('button', { name: 'Recommend Something New' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rate a book' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('catalog failures are visible and manual entry remains available', async ({ page }) => {
  await page.route('https://openlibrary.org/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-books').click();
  await page.getByRole('button', { name: 'Add Book', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Book' });
  await dialog.getByLabel('Title').fill('Manual book');
  await expect(dialog.getByRole('status')).toContainText('Lookup failed');
  await dialog.getByLabel('Author').fill('Manual author');
  await dialog.getByRole('button', { name: 'Add Book' }).click();
  await expect(page.getByRole('button', { name: 'Edit title for Manual book' })).toHaveText('Manual book');
});

for (const width of [320, 768, 1440]) {
  test(`book cells display values and edit in place at ${width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    state.books = [makeBook('Original', { series: '', summary: 'A readable summary.', rating: '' })];
    await page.addInitScript(seed => {
      if (!localStorage.getItem('mercy-ledger-v1')) localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
    }, state);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    await page.locator('.overview-books').click();
    const table = page.locator('.bookTable');
    await expect(table.locator('tbody input, tbody select, tbody textarea')).toHaveCount(0);
    await expect(table.getByRole('button', { name: 'Edit Summary for Original' })).toBeHidden();
    await table.getByLabel('Expand summary for Original').click();
    await expect(table.getByRole('button', { name: 'Edit Summary for Original' })).toHaveText('A readable summary.');
    await table.getByRole('button', { name: 'Edit title for Original' }).click();
    await page.getByLabel('title for Original').fill('Updated');
    await page.getByLabel('title for Original').press('Enter');
    await expect(table.getByRole('button', { name: 'Edit title for Updated' })).toHaveText('Updated');
    await expect(table.getByRole('button', { name: 'Edit title for Updated' })).toBeFocused();
    await table.getByRole('button', { name: 'Edit author for Updated' }).click();
    await page.getByLabel('author for Updated').fill('Cancelled author');
    await page.getByLabel('author for Updated').press('Escape');
    await expect(table.getByRole('button', { name: 'Edit author for Updated' })).toHaveText('Writer');
    await expect(table.getByRole('button', { name: 'Edit author for Updated' })).toBeFocused();
    await table.getByRole('button', { name: 'Edit series for Updated' }).click();
    await page.getByLabel('series for Updated').fill('A series');
    await page.getByLabel('series for Updated').blur();
    for (const [label, value] of [['Genre', 'History'], ['Fiction type', 'Non-Fiction'], ['Read status', 'No'], ['Rating', 'Liked']]) {
      await table.getByRole('button', { name: `Edit ${label} for Updated` }).click();
      await table.getByLabel(`${label} for Updated`).selectOption(value);
      await expect(table.getByRole('button', { name: `Edit ${label} for Updated` })).toHaveText(value);
    }
    await table.getByRole('button', { name: 'Edit Summary for Updated' }).click();
    await table.getByRole('textbox', { name: 'Summary for Updated' }).fill('A new summary.');
    await table.getByRole('textbox', { name: 'Summary for Updated' }).blur();
    await expect(table.locator('tbody input, tbody select, tbody textarea')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    const nav = page.getByRole('navigation', { name: width < 640 ? 'Mobile navigation' : 'Main navigation' });
    if (width < 640) await nav.getByRole('button', { name: 'More' }).click();
    await nav.getByRole('button', { name: 'Book Tracker' }).click();
    await expect(page.getByRole('button', { name: 'Edit series for Updated' })).toHaveText('A series');
    await page.getByLabel('Expand summary for Updated').click();
    await expect(page.getByRole('button', { name: 'Edit Summary for Updated' })).toHaveText('A new summary.');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
    expect(saved.books[0]).toMatchObject({ title: 'Updated', author: 'Writer', series: 'A series', genre: 'History', fictionType: 'Non-Fiction', read: false, rating: 'Liked', summary: 'A new summary.' });
  });
}

test('invalid edits stay available for correction', async ({ page }) => {
  const state = tracker.emptyState();
  state.books = [makeBook('Original')];
  await page.addInitScript(seed => localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed)), state);
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-books').click();
  await page.getByRole('button', { name: 'Edit title for Original' }).click();
  await page.getByLabel('title for Original').fill('');
  await page.getByLabel('title for Original').blur();
  await expect(page.getByRole('alert')).toContainText('title is required');
  await expect(page.getByLabel('title for Original')).toHaveValue('');
  await page.getByLabel('title for Original').fill('Corrected');
  await page.getByLabel('title for Original').blur();
  await expect(page.getByRole('button', { name: 'Edit title for Corrected' })).toHaveText('Corrected');
});

for (const width of [320, 768, 1440]) {
  test(`summaries stay collapsed and rows compact at ${width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    const longSummary = 'A long description of an adventurous journey. '.repeat(60);
    state.books = [makeBook('Long book', { summary: longSummary }), makeBook('Empty book')];
    await page.addInitScript(seed => {
      if (!localStorage.getItem('mercy-ledger-v1')) localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
    }, state);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    await page.locator('.overview-books').click();
    const rows = page.locator('.bookTable tbody tr');
    const longRow = rows.nth(0);
    const emptyRow = rows.nth(1);
    const height = async () => (await longRow.boundingBox())!.height;
    const collapsedHeight = await height();
    const emptyHeight = (await emptyRow.boundingBox())!.height;
    expect(Math.abs(collapsedHeight - emptyHeight)).toBeLessThan(3);
    await expect(longRow.getByRole('button', { name: 'Edit Summary for Long book' })).toBeHidden();
    await longRow.getByLabel('Expand summary for Long book').press('Enter');
    await expect(longRow.getByRole('button', { name: 'Edit Summary for Long book' })).toHaveText(longSummary);
    expect(await height()).toBeGreaterThan(collapsedHeight);
    await longRow.getByLabel('Expand summary for Long book').click();
    expect(Math.abs(await height() - collapsedHeight)).toBeLessThan(3);
    await emptyRow.getByLabel('Expand summary for Empty book').click();
    await emptyRow.getByRole('button', { name: 'Edit Summary for Empty book' }).click();
    await emptyRow.getByRole('textbox', { name: 'Summary for Empty book' }).fill('A new description.');
    await emptyRow.getByRole('textbox', { name: 'Summary for Empty book' }).blur();
    await expect(emptyRow.getByRole('button', { name: 'Edit Summary for Empty book' })).toHaveText('A new description.');
    await page.reload();
    const nav = page.getByRole('navigation', { name: width < 640 ? 'Mobile navigation' : 'Main navigation' });
    if (width < 640) await nav.getByRole('button', { name: 'More' }).click();
    await nav.getByRole('button', { name: 'Book Tracker' }).click();
    await page.getByLabel('Expand summary for Empty book').click();
    await expect(page.getByRole('button', { name: 'Edit Summary for Empty book' })).toHaveText('A new description.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
