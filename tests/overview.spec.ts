import { test, expect } from '@playwright/test';
import tracker from '../src/tracker/tracker.js';
import { expectedWeight, makePlan } from '../src/tracker/weight.js';

for (const viewport of [{ width: 320, height: 720 }, { width: 744, height: 1133 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`overview cards stay private, responsive and navigable at ${viewport.width}px`, async ({ page }) => {
    const data = tracker.emptyState();
    data.current.shards.Ancient = { Legendary: 205 };
    data.current.shards.Void = { Legendary: 190 };
    data.champions = [{ id: 'one', name: 'Finished', notes: '', statuses: { blessing: 6, books: 'complete', masteries: 'complete', gear: 'complete', glyphs: 'complete', relic: 'complete' } }, { id: 'two', name: 'Unfinished', notes: '', statuses: { blessing: 5, books: 'complete', masteries: 'complete', gear: 'complete', glyphs: 'complete', relic: 'complete' } }];
    data.bjj.skills = [
      { id: 'a', name: 'Marked technique', type: 'Guard', positions: [], description: '', link: '', practice: 'unset', live: 'unset', preference: 'unset', mastered: false, workOnNext: true },
      { id: 'b', name: 'High confidence', type: 'Guard', positions: [], description: '', link: '', practice: 'consistently', live: 'sometimes', preference: 'unset', mastered: false, workOnNext: false },
      { id: 'c', name: 'Lower confidence', type: 'Guard', positions: [], description: '', link: '', practice: 'learning', live: 'learning', preference: 'unset', mastered: false, workOnNext: false },
      { id: 'd', name: 'Complete technique', type: 'Guard', positions: [], description: '', link: '', practice: 'consistently', live: 'consistently', preference: 'unset', mastered: false, workOnNext: false },
    ];
    const plan = makePlan({ id: 'p', type: 'bulk', startDate: '2026-07-01', startWeight: 180, targetWeight: 184, targetDate: null });
    const expected = expectedWeight(plan, '2026-07-10');
    data.weight = { plans: [plan], weighIns: [{ id: 'w', date: '2026-07-10', weight: 181, notes: '', planId: 'p', planType: 'bulk', expectedWeight: expected, difference: 181 - expected }] };
    await page.clock.install({ time: new Date('2026-07-20T12:00:00') });
    await page.addInitScript(seed => {
      localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
      localStorage.setItem('incomes', JSON.stringify([{ id: 'pay', name: 'Paycheck', amount: 9876, startDate: '2026-07-25', frequency: 'monthly', isRecurring: true, isPaycheck: true }]));
      localStorage.setItem('startingBalance', '123456');
      localStorage.setItem('income_history', JSON.stringify({ entries: [{ id: '1', effectiveDate: '2025-01-01', annualIncome: 100000, employer: '', title: '', notes: '' }, { id: '2', effectiveDate: '2026-01-01', annualIncome: 110000, employer: '', title: '', notes: '' }], annualGoals: {} }));
    }, data);
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:5188');
    await expect(page).toHaveTitle('Milestone');
    const overview = page.locator('.overviewDashboard');
    await expect(overview.locator('.overviewCard')).toHaveCount(6);
    await expect(overview.locator('.overview-budget')).toContainText('5 days');
    await expect(overview.locator('.overview-salary')).toContainText('+10.0%');
    await expect(overview.locator('.overview-mercy')).toContainText('Ancient · Legendary');
    await expect(overview.locator('.overview-mercy')).toContainText('In mercy');
    await expect(overview.locator('.overview-mercy')).toContainText('unknown');
    await expect(overview.locator('.overview-champions')).toContainText('1 / 2');
    await expect(overview.locator('.overview-bjj li')).toHaveText(['Marked techniqueWork on next', 'High confidence85% confidence', 'Lower confidence40% confidence']);
    await expect(overview.locator('.overview-weight')).toContainText('43 days remaining');
    await expect(overview.locator('.overview-weight')).toContainText('181.0 lb');
    await expect(overview.locator('.overview-weight')).toContainText('On Track');
    await expect(overview).not.toContainText(/\$|123,?456|110,?000|9876/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await overview.getByRole('button', { name: /Budget Tracker/ }).click();
    await expect(page.getByRole('heading', { name: 'Budget Tracker', exact: true })).toBeVisible();
    for (const name of ['Current Balance', 'Upcoming Low Balance', 'Lowest Projected', 'Next Paycheck']) await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse chart' })).toBeVisible();
    await expect(page.locator('.upcomingCard')).toBeVisible();
    await expect(page.locator('.tx')).toBeVisible();
  });
}

test('overview cards update after editing tracker data and all navigate correctly', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188');
  const overview = page.locator('.overviewDashboard');
  await expect(overview.locator('.overview-champions')).toContainText('0 / 0');
  await overview.getByRole('button', { name: /Champion Builds Tracker/ }).click();
  await page.getByRole('button', { name: 'Add champion', exact: true }).click();
  const builds = page.locator('.trackerView');
  await builds.locator('#build-name').fill('New champion');
  await builds.locator('#build-form button[type=submit]').click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(overview.locator('.overview-champions')).toContainText('0 / 1');
  for (const [card, heading] of [['Salary Tracker', 'Salary Tracker'], ['Mercy Tracker', 'Mercy Tracker'], ['BJJ Tracker', 'BJJ Tracker'], ['Weight Tracker', 'Weight Tracker']]) {
    await overview.getByRole('button', { name: new RegExp(card) }).click();
    await expect(page.locator('.topBar').getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  }
});

for (const viewport of [{ width: 320, height: 720 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`waypoint card colors match their pages at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:5188');
    const overview = page.locator('.overviewDashboard');
    const nav = page.getByRole('navigation', { name: viewport.width < 640 ? 'Mobile navigation' : 'Main navigation' });
    for (const [accent, title, color] of [
      ['budget', 'Budget Tracker', 'rgb(250, 204, 21)'],
      ['salary', 'Salary Tracker', 'rgb(154, 188, 233)'],
      ['mercy', 'Mercy Tracker', 'rgb(243, 142, 155)'],
      ['champions', 'Champion Builds Tracker', 'rgb(138, 245, 160)'],
      ['weight', 'Weight Tracker', 'rgb(240, 173, 121)'],
    ]) {
      const card = overview.locator(`.overview-${accent}`);
      await expect(card).toHaveCSS('border-top-color', color);
      await expect(card.locator('.overviewIcon')).toHaveCSS('color', color);
      await card.click();
      await expect(page.locator('.topBar .pageEyebrow')).toHaveCSS('color', color);
      await expect(page.locator('.topBar').getByRole('heading', { name: title, exact: true })).toBeVisible();
      if (accent === 'mercy') await expect(page.locator('.trackerView .mercy-theme .eyebrow').first()).toHaveCSS('color', color);
      await nav.getByRole('button', { name: 'Dashboard', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test('BJJ card follows the saved belt before opening BJJ and after belt changes', async ({ page }) => {
  const state = tracker.emptyState();
  state.bjj.belt = 'Brown';
  await page.addInitScript(seed => localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed)), state);
  await page.goto('http://127.0.0.1:5188');
  const card = page.locator('.overview-bjj');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(card).toHaveAttribute('data-belt', 'brown');
  await expect(card).toHaveCSS('border-top-color', 'rgb(231, 180, 135)');
  for (const [belt, color] of [
    ['Blue', 'rgb(120, 197, 255)'],
    ['White', 'rgb(231, 238, 240)'],
    ['Purple', 'rgb(211, 166, 255)'],
    ['Brown', 'rgb(231, 180, 135)'],
    ['Black', 'rgb(214, 220, 229)'],
  ]) {
    await card.click();
    await page.locator('.trackerView #bjj-belt').selectOption(belt);
    await expect(page.locator('.topBar .pageEyebrow')).toHaveCSS('color', color);
    await nav.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(card).toHaveAttribute('data-belt', belt.toLowerCase());
    await expect(card).toHaveCSS('border-top-color', color);
    await expect(card.locator('.overviewIcon')).toHaveCSS('color', color);
  }
});

test('empty summaries do not invent values and the Upcoming drawer closes on return to dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5188');
  const overview = page.locator('.overviewDashboard');
  await expect(overview.locator('.overview-budget')).toContainText('Not scheduled');
  await expect(overview.locator('.overview-salary')).toContainText('Not enough data');
  await expect(overview.locator('.overview-bjj')).toContainText('No learning priorities yet');
  await expect(overview.locator('.overview-weight')).toContainText('No active plan');
  await overview.getByRole('button', { name: /Budget Tracker/ }).click();
  await page.locator('.topBar').getByRole('button', { name: 'Upcoming' }).click();
  await expect(page.locator('.upcoming')).toHaveClass(/open/);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Dashboard', exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator('.upcoming')).not.toHaveClass(/open/);
});

test('invalid tracker data shows an error instead of empty tracker summaries', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mercy-ledger-v1', '{invalid'));
  await page.goto('http://127.0.0.1:5188');
  await expect(page.locator('.overview-mercy')).toContainText('Could not read tracker data');
  await expect(page.locator('.overview-champions')).not.toContainText('0 / 0');
  expect(await page.evaluate(() => localStorage.getItem('mercy-ledger-v1'))).toBe('{invalid');
});
