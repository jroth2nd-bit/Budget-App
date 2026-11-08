import { test, expect, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import tracker from '../src/tracker/tracker.js';
import { addMonths } from '../src/tracker/weight.js';
const localUrl = 'http://127.0.0.1:5188';
const cloudUrl = 'http://127.0.0.1:5189';
const userId = '00000000-0000-4000-8000-000000000001';

async function openTracker(page: Page, name: string, mobile = false) {
  const nav = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation' });
  if (mobile) await nav.getByRole('button', { name: 'More' }).click();
  await nav.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  return page.locator('.trackerView');
}

for (const viewport of [{ width: 320, height: 720 }, { width: 1440, height: 900 }]) {
  test(`independent soulstone conversions persist at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = tracker.emptyState();
    state.soulInventory.eternalStones = 4;
    state.soulInventory.mortalCoins = 2500;
    await page.addInitScript(seed => { if (!localStorage.getItem('mercy-ledger-v1')) localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed)); }, state);
    await page.goto(localUrl);
    let mercy = await openTracker(page, 'Mercy Tracker', viewport.width < 640);
    for (const [label, value] of [
      ['Current Mortal Soulstones', '50'],
      ['Current Immortal Soul Coins', '500'],
      ['Current Immortal Soulstones', '25'],
      ['Current Eternal Soul Coins', '400'],
    ]) {
      await mercy.getByLabel(label).fill(value);
      await mercy.getByLabel(label).dispatchEvent('change');
    }
    const immortal = mercy.getByRole('region', { name: 'Mortal to Immortal conversion' });
    const eternal = mercy.getByRole('region', { name: 'Immortal to Eternal conversion' });
    for (const [region, target, helper, expected] of [
      [immortal, '1 Immortal Soulstones purchasable', 'You need 25 more Mortal Soulstones', ['Current Immortal coins500', 'Mortal Soulstones owned50', 'Coins earned from pulling all Mortal Soulstones1,000', 'Total coins available1,500', 'Remaining coins500']],
      [eternal, '1 Eternal Soulstones purchasable', 'You need 29 more Immortal Soulstones', ['Current Eternal coins400', 'Immortal Soulstones owned25', 'Coins earned from pulling all Immortal Soulstones750', 'Total coins available1,150', 'Remaining coins150']],
    ] as const) {
      await expect(region.getByText(target, { exact: true })).toBeVisible();
      await expect(region.getByText(helper, { exact: false })).toBeVisible();
      await expect(region.locator('details')).not.toHaveAttribute('open');
      await expect(region.locator('dl')).toBeHidden();
      await region.getByText('Calculation details').focus();
      await page.keyboard.press('Enter');
      await expect(region.locator('dl')).toBeVisible();
      for (const text of expected) await expect(region).toContainText(text);
    }
    await mercy.getByLabel('Current Mortal Soulstones').fill('51');
    await mercy.getByLabel('Current Mortal Soulstones').dispatchEvent('change');
    await expect(immortal.locator('details')).toHaveAttribute('open');
    await expect(eternal.locator('details')).toHaveAttribute('open');
    await expect(immortal).toContainText('Total coins available1,520');
    await mercy.getByLabel('Current Mortal Soulstones').fill('50');
    await mercy.getByLabel('Current Mortal Soulstones').dispatchEvent('change');
    await immortal.getByText('Calculation details').click();
    await expect(immortal.locator('dl')).toBeHidden();
    await expect(mercy.getByLabel('Current Eternal Soulstones')).toHaveCount(0);
    await expect(mercy.getByLabel('Current Mortal Soul Coins')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.reload();
    mercy = await openTracker(page, 'Mercy Tracker', viewport.width < 640);
    await expect(mercy.getByRole('region', { name: 'Immortal to Eternal conversion' }).getByText('1 Eternal Soulstones purchasable')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
    expect(saved.soulInventory).toMatchObject({ eternalStones: 4, mortalCoins: 2500, eternalCoins: 400, immortalStones: 25, mortalStones: 50, immortalCoins: 500 });
    if (viewport.width === 1440) {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export Everything' }).click();
      const backup = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
      expect(backup.tracker.soulInventory).toMatchObject(saved.soulInventory);
      mercy = await openTracker(page, 'Mercy Tracker');
      await mercy.getByLabel('Current Eternal Soul Coins').fill('900');
      await mercy.getByLabel('Current Eternal Soul Coins').dispatchEvent('change');
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
      const confirmation = page.waitForEvent('dialog');
      await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
      await (await confirmation).accept();
      await expect(page.getByText('and tracker data', { exact: false })).toBeVisible();
      mercy = await openTracker(page, 'Mercy Tracker');
      await expect(mercy.getByLabel('Current Eternal Soul Coins')).toHaveValue('400');
      const restoredEternal = mercy.getByRole('region', { name: 'Immortal to Eternal conversion' });
      await restoredEternal.getByText('Calculation details').click();
      await expect(restoredEternal).toContainText('Remaining coins150');
      const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
      expect(restored.soulInventory).toMatchObject(saved.soulInventory);
    }
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`champion completion filters use counts at ${viewport.width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    const fields = ['books', 'masteries', 'gear', 'glyphs', 'relic'];
    state.champions = Array.from({ length: 7 }, (_, count) => ({
      id: `champ-${count}`, name: `Champion ${count}`, notes: '',
      statuses: { blessing: count === 6 ? 6 : count === 0 ? null : 5, ...Object.fromEntries(fields.map((field, index) => [field, index < count ? 'complete' : 'needed'])) },
    }));
    await page.addInitScript(data => localStorage.setItem('mercy-ledger-v1', JSON.stringify(data)), state);
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const builds = await openTracker(page, 'Champion Builds Tracker', mobile);
    if (mobile) {
      await expect(builds.locator('.build-mobile-card summary > span')).toHaveText(['Champion 6', 'Champion 5', 'Champion 4', 'Champion 3', 'Champion 2', 'Champion 1', 'Champion 0']);
    } else {
      await expect.poll(() => builds.locator('#build-list .build-name-cell input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(['Champion 6', 'Champion 5', 'Champion 4', 'Champion 3', 'Champion 2', 'Champion 1', 'Champion 0']);
      await expect(builds.locator('[data-sort-column="completion"]').locator('..')).toHaveAttribute('aria-sort', 'descending');
    }
    if (mobile) await builds.locator('.build-mobile-controls summary').click();
    if (mobile) {
      await expect(builds.locator('#mobile-sort')).toHaveValue('completion');
      await expect(builds.locator('#mobile-direction')).toHaveValue('descending');
    }
    const visibleFilter = builds.locator(mobile ? '#mobile-filters' : '.build-filter-row').getByLabel('Filter Complete');
    const otherFilter = builds.locator(mobile ? '.build-filter-row' : '#mobile-filters').getByLabel('Filter Complete');
    await expect(visibleFilter.locator('option')).toHaveText(['All', '0/6', '1/6', '2/6', '3/6', '4/6', '5/6', '6/6']);
    for (let count = 0; count <= 6; count++) {
      await visibleFilter.selectOption(String(count));
      await expect(otherFilter).toHaveValue(String(count));
      await expect(builds.locator('#build-count')).toHaveText('Showing 1 of 7 champions.');
      if (mobile) await expect(builds.locator('.build-mobile-card summary')).toContainText(`Champion ${count}`);
      else await expect(builds.getByLabel(`Name for Champion ${count}`).first()).toBeVisible();
    }
    await visibleFilter.selectOption('0');
    await builds.locator('#build-clear-filters').click();
    await expect(visibleFilter).toHaveValue('');
    await expect(otherFilter).toHaveValue('');
    await expect(builds.locator('#build-count')).toHaveText('Showing 7 of 7 champions.');
    await visibleFilter.selectOption('1');
    const row = builds.locator(mobile ? '.build-mobile-card' : '#build-list tr');
    if (mobile) await row.locator('summary').click();
    await row.getByLabel('Books for Champion 1').selectOption('needed');
    await expect(builds.locator('#build-count')).toHaveText('Showing 0 of 7 champions.');
    await visibleFilter.selectOption('0');
    await expect(builds.locator('#build-count')).toHaveText('Showing 2 of 7 champions.');
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`BJJ confidence and starting positions migrate and remain editable at ${viewport.width}px`, async ({ page }) => {
    const old = tracker.emptyState();
    old.version = 12;
    old.bjj.skills = [
      { id: 'legacy', name: 'Legacy skill', type: 'Sweep', description: 'Preserved', link: '', video: 'unset', practice: 'unset', live: 'sometimes', preference: 'low', mastered: false },
    ];
    old.current.shards.Void = { Legendary: 21 };
    await page.addInitScript(data => {
      if (!sessionStorage.getItem('bjj-migration-seeded')) {
        sessionStorage.setItem('bjj-migration-seeded', '1');
        localStorage.setItem('mercy-ledger-v1', JSON.stringify(data));
      }
    }, old);
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    const list = bjj.locator(mobile ? '#bjj-cards' : '#bjj-list');
    if (mobile) await list.locator('.bjj-card > summary').click();
    await expect(list.getByLabel('Confidence for Legacy skill: Not enough data')).toBeVisible();
    await list.getByLabel('Practice for Legacy skill').selectOption('consistently');
    await expect(list.getByLabel('Confidence for Legacy skill: 85%')).toBeVisible();
    await list.getByLabel('Edit starting positions for Legacy skill').click();
    const editor = bjj.locator('#bjj-positions-dialog');
    await editor.getByLabel('Closed guard', { exact: true }).check();
    await editor.getByLabel('Mount', { exact: true }).check();
    await editor.getByLabel('Custom positions (one per line)').fill('Custom <guard>\nButterfly guard');
    await editor.getByRole('button', { name: 'Save positions' }).click();
    await expect(editor).toBeHidden();
    await expect(list.getByLabel('Edit starting positions for Legacy skill')).toContainText('Custom <guard>');
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
    expect(saved.version).toBe(15);
    expect(saved.current.shards.Void.Legendary).toBe(21);
    expect(saved.bjj.skills[0].positions).toEqual(['Closed guard', 'Mount', 'Custom <guard>', 'Butterfly guard']);
    await bjj.locator('.bjj-filter-details summary').click();
    const positionFilter = bjj.getByLabel('Filter Starting position');
    await positionFilter.selectOption({ label: 'Custom <guard>' });
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 1 skills.');
    await positionFilter.selectOption({ label: 'No position' });
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 0 of 1 skills.');
    await bjj.locator('#bjj-clear').click();
    await bjj.getByLabel('Filter Confidence').fill('85');
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 1 skills.');
    await bjj.locator('#bjj-clear').click();
    await page.getByRole('button', { name: 'Add skill', exact: true }).click();
    const add = bjj.locator('#bjj-add-dialog');
    await add.locator('#bjj-name').fill('New submission');
    await add.locator('#bjj-type-container summary').click();
    await add.getByRole('button', { name: 'Submission', exact: true }).click();
    await add.getByLabel('Half guard', { exact: true }).check();
    await add.getByLabel('Custom positions (one per line)').fill('Half guard');
    await add.locator('button[type=submit]').click();
    await expect(add.locator('#bjj-add-error')).toContainText('duplicates');
    await add.getByLabel('Custom positions (one per line)').fill('De La Riva');
    await add.locator('#bjj-add-practice').selectOption('learning');
    await add.locator('#bjj-add-live').selectOption('consistently');
    await add.locator('button[type=submit]').click();
    await expect(add).toBeHidden();
    if (mobile) await list.locator('.bjj-card').filter({ hasText: 'New submission' }).locator('summary').first().click();
    await expect(list.getByLabel('Confidence for New submission: 76%')).toBeVisible();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
    expect(saved.bjj.skills.find((item: { name: string }) => item.name === 'New submission').positions).toEqual(['Half guard', 'De La Riva']);
    await page.reload();
    await openTracker(page, 'BJJ Tracker', mobile);
    await bjj.locator('.bjj-filter-details summary').click();
    await positionFilter.selectOption({ label: 'De La Riva' });
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 2 skills.');
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
  test(`BJJ work-on-next checkbox defaults, saves and reloads at ${viewport.width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    state.version = 13;
    state.bjj.skills = [{
      id: 'legacy', name: 'Guard pass', type: 'Pass', positions: [], description: '', link: '',
      video: 'liked', practice: 'learning', live: 'sometimes', preference: 'low', mastered: false,
    }];
    await page.addInitScript(data => {
      if (!sessionStorage.getItem('work-next-seeded')) {
        sessionStorage.setItem('work-next-seeded', '1');
        localStorage.setItem('mercy-ledger-v1', JSON.stringify(data));
      }
    }, state);
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    let bjj = await openTracker(page, 'BJJ Tracker', mobile);
    let list = bjj.locator(mobile ? '#bjj-cards' : '#bjj-list');
    if (mobile) await list.locator('.bjj-card > summary').click();
    const workNext = list.getByLabel('Work on next: Guard pass');
    await expect(workNext).not.toBeChecked();
    await workNext.check();
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
    expect(saved.bjj.skills[0]).toMatchObject({ workOnNext: true });
    expect(saved.bjj.skills[0]).not.toHaveProperty('video');

    await page.reload();
    bjj = await openTracker(page, 'BJJ Tracker', mobile);
    list = bjj.locator(mobile ? '#bjj-cards' : '#bjj-list');
    if (mobile) await list.locator('.bjj-card > summary').click();
    await expect(list.getByLabel('Work on next: Guard pass')).toBeChecked();
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
  test(`BJJ column sorting toggles in table and cards at ${viewport.width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    state.bjj.skills = [
      { id: '1', name: 'Zebra', type: 'Position', positions: ['Mount'], description: 'Third', link: 'https://youtu.be/z', practice: 'consistently', live: 'unset', preference: 'high', mastered: true, workOnNext: true },
      { id: '2', name: 'Alpha', type: 'Escape', positions: ['Closed guard'], description: 'First', link: 'https://youtu.be/a', practice: 'consistently', live: 'consistently', preference: 'low', mastered: false, workOnNext: false },
      { id: '3', name: 'Middle', type: 'Guard', positions: ['Half guard'], description: 'Second', link: 'https://youtu.be/m', practice: 'learning', live: 'learning', preference: 'medium', mastered: false, workOnNext: false },
    ];
    await page.addInitScript(data => localStorage.setItem('mercy-ledger-v1', JSON.stringify(data)), state);
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const bjj = await openTracker(page, 'BJJ Tracker', viewport.width < 640);
    await expect(bjj.locator('#bjj-sort, #bjj-direction')).toHaveCount(0);
    const cards = viewport.width <= 1350;
    const sorter = bjj.locator(cards ? '#bjj-card-sort' : '#bjj-head');
    const names = () => cards
      ? bjj.locator('#bjj-cards > .bjj-card > summary > strong').allTextContents()
      : bjj.locator('#bjj-list tr td:first-child input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
    const expectations: Array<[string, string[]]> = [
      ['type', ['Alpha', 'Middle', 'Zebra']],
      ['positions', ['Alpha', 'Middle', 'Zebra']],
      ['description', ['Alpha', 'Middle', 'Zebra']],
      ['link', ['Alpha', 'Middle', 'Zebra']],
      ['workOnNext', ['Alpha', 'Middle', 'Zebra']],
      ['practice', ['Middle', 'Alpha', 'Zebra']],
      ['live', ['Zebra', 'Middle', 'Alpha']],
      ['confidence', ['Middle', 'Alpha', 'Zebra']],
      ['mastered', ['Zebra', 'Alpha', 'Middle']],
    ];
    await expect.poll(names).toEqual(['Alpha', 'Middle', 'Zebra']);
    await expect(bjj.locator('[data-bjj-sort="preference"], [data-bjj-filter="preference"]')).toHaveCount(0);
    await expect(bjj.locator('#bjj-head')).not.toContainText('Preference');
    await expect(bjj.locator('#bjj-cards')).not.toContainText('PREFERENCE');
    await expect(bjj.locator('#bjj-head')).not.toContainText('Video quality');
    await expect(bjj.locator('#bjj-cards')).not.toContainText('VIDEO QUALITY');
    const confidenceSort = sorter.locator('[data-bjj-sort="confidence"]');
    if (cards) await expect(confidenceSort).toHaveAttribute('aria-label', /sorted descending/);
    else await expect(confidenceSort.locator('..')).toHaveAttribute('aria-sort', 'descending');
    const nameSort = sorter.locator('[data-bjj-sort="name"]');
    await nameSort.focus();
    await page.keyboard.press('Enter');
    await expect.poll(names).toEqual(['Alpha', 'Middle', 'Zebra']);
    await page.keyboard.press('Enter');
    await expect.poll(names).toEqual(['Zebra', 'Middle', 'Alpha']);
    for (const [key, ascending] of expectations) {
      const button = sorter.locator(`[data-bjj-sort="${key}"]`);
      await button.click();
      await expect.poll(names).toEqual(ascending);
      if (cards) {
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(button).toHaveAttribute('aria-label', /sorted ascending/);
      } else {
        await expect(button.locator('..')).toHaveAttribute('aria-sort', 'ascending');
      }
      await button.click();
      const reversed = key === 'practice' ? ['Alpha', 'Zebra', 'Middle'] : key === 'workOnNext' ? ['Zebra', 'Alpha', 'Middle'] : key === 'mastered' || key === 'confidence' ? ['Alpha', 'Middle', 'Zebra'] : [...ascending].reverse();
      await expect.poll(names).toEqual(reversed);
      if (cards) await expect(button).toHaveAttribute('aria-label', /sorted descending/);
      else await expect(button.locator('..')).toHaveAttribute('aria-sort', 'descending');
    }
    await bjj.locator('.bjj-filter-details summary').click();
    await bjj.getByLabel('Filter Type').selectOption({ label: 'Escape' });
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 3 skills.');
    await expect.poll(names).toEqual(['Alpha']);
    await bjj.locator('#bjj-clear').click();
    await expect.poll(names).toEqual(['Alpha', 'Middle', 'Zebra']);
    await bjj.getByLabel('Filter Work on next').selectOption('true');
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 3 skills.');
    await expect.poll(names).toEqual(['Zebra']);
    expect(await bjj.locator('.bjj-skills-panel').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.setViewportSize(cards ? { width: 1440, height: 900 } : { width: 390, height: 844 });
    const counterpart = bjj.locator(cards ? '#bjj-head' : '#bjj-card-sort').locator('[data-bjj-sort="mastered"]');
    await expect(counterpart).toBeVisible();
    await expect(counterpart).toContainText('↓');
    await page.setViewportSize(viewport);
    const list = bjj.locator(cards ? '#bjj-cards' : '#bjj-list');
    if (cards) await list.locator('.bjj-card').filter({ hasText: 'Zebra' }).locator('summary').first().click();
    await list.getByLabel('Live rolls for Zebra').selectOption('sometimes');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
    expect(saved.bjj.skills.find((item: { id: string }) => item.id === '1').preference).toBe('high');
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`tracker headers omit explanatory text without empty spacing at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    for (const [name, firstPanel] of [
      ['Champion Builds Tracker', '.compact-panel'],
      ['BJJ Tracker', '.bjj-belt-panel'],
      ['Mercy Tracker', '#dashboard'],
    ]) {
      const trackerView = await openTracker(page, name, mobile);
      await expect(page.locator('.trackerSync')).toHaveCSS('position', 'absolute');
      await expect(trackerView.locator(firstPanel)).toBeVisible();
      await expect(trackerView.locator('.build-heading')).toHaveCount(0);
      expect(await trackerView.locator(firstPanel).evaluate(element => {
        const surface = element.closest('.tracker-surface')!;
        return element.getBoundingClientRect().top - surface.getBoundingClientRect().top;
      })).toBeLessThan(8);
    }
    const mercy = page.locator('.trackerView');
    await expect(mercy.getByText('Enter your current inventory. Amounts start at zero.')).toHaveCount(0);
    const spacing = await mercy.locator('.dashboard-grid').evaluate(grid => {
      const panels = Array.from(grid.querySelectorAll<HTMLElement>(':scope > .compact-panel'));
      return panels.map(panel => ({
        padding: parseFloat(getComputedStyle(panel).paddingTop),
        inset: panel.querySelector('.section-heading')!.getBoundingClientRect().top - panel.getBoundingClientRect().top,
      }));
    });
    expect(spacing).toHaveLength(2);
    expect(spacing[0].padding).toBe(spacing[1].padding);
    expect(spacing[0].inset).toBeCloseTo(spacing[1].inset);
    expect(spacing[0].padding).toBeGreaterThanOrEqual(14);
    await expect(mercy.locator('#clan-new')).toBeVisible();
    const builds = await openTracker(page, 'Champion Builds Tracker', mobile);
    await expect(builds.getByRole('heading', { name: 'Build rankings' })).toBeVisible();
    await expect(builds.locator('#build-clear-filters')).toBeVisible();
    await expect(builds.getByText('Click or tap a value to edit it.')).toHaveCount(0);
    await expect(builds.locator('.build-desktop-hint')).toHaveCount(0);
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    await expect(bjj.getByRole('heading', { name: 'Skill library' })).toBeVisible();
    await expect(bjj.locator('#bjj-clear')).toBeVisible();
    await expect(bjj.getByText('Mastery is your choice.', { exact: false })).toHaveCount(0);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
  test(`add dialogs save all editable fields at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    await page.getByRole('button', { name: 'Add skill', exact: true }).click();
    const skill = bjj.locator('#bjj-add-dialog');
    await expect(skill).toBeVisible();
    expect(await skill.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(skill.locator('#bjj-add-practice')).toHaveValue('not_yet');
    await expect(skill.locator('#bjj-add-live')).toHaveValue('not_yet');
    await expect(skill.locator('#bjj-add-preference')).toHaveValue('low');
    await skill.locator('#bjj-name').fill('Full skill');
    await skill.locator('#bjj-type-container summary').click();
    await skill.getByRole('button', { name: 'Custom type…' }).click();
    await skill.locator('#bjj-custom-type').fill('Custom guard');
    await skill.locator('#bjj-add-description').fill('Detailed technique');
    await skill.locator('#bjj-add-link').fill('https://example.com/video');
    await skill.locator('#bjj-add-work-next').check();
    await skill.locator('#bjj-add-practice').selectOption('consistently');
    await skill.locator('#bjj-add-live').selectOption('learning');
    await skill.locator('#bjj-add-preference').selectOption('high');
    await skill.locator('#bjj-add-mastered').selectOption('true');
    await skill.locator('button[type=submit]').click();
    await expect(skill.locator('#bjj-add-error')).toContainText('YouTube or Instagram');
    await expect(skill).toBeVisible();
    await skill.locator('#bjj-add-link').fill('https://youtu.be/example');
    await skill.locator('button[type=submit]').click();
    await expect(skill).toBeHidden();
    await page.getByRole('button', { name: 'Add skill', exact: true }).click();
    await expect(skill.locator('#bjj-add-mastered')).toHaveValue('false');
    await expect(skill.locator('#bjj-add-work-next')).not.toBeChecked();
    await expect(skill.locator('#bjj-add-description')).toHaveValue('');
    await skill.locator('#bjj-add-close').click();

    const builds = await openTracker(page, 'Champion Builds Tracker', mobile);
    await page.getByRole('button', { name: 'Add champion', exact: true }).click();
    const champion = builds.locator('#build-dialog');
    expect(await champion.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(champion.locator('#build-blessing')).toHaveValue('0');
    await champion.locator('#build-name').fill('Full champion');
    await champion.locator('#build-blessing').selectOption('unknown');
    await champion.locator('#build-books').selectOption('complete');
    await champion.locator('#build-masteries').selectOption('progress');
    await champion.locator('#build-gear').selectOption('complete');
    await champion.locator('#build-glyphs').selectOption('progress');
    await champion.locator('#build-relic').selectOption('complete');
    await champion.locator('#build-notes').fill('Build notes');
    await champion.locator('button[type=submit]').click();
    await expect(champion).toBeHidden();

    const nav = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation' });
    await nav.getByRole('button', { name: 'Budget Tracker', exact: true }).click();
    await page.getByRole('button', { name: '+ Add' }).click();
    const transaction = page.getByRole('dialog', { name: 'Add transaction' });
    await expect(transaction).toBeVisible();
    expect(await transaction.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await transaction.getByRole('button', { name: 'Income', exact: true }).click();
    await transaction.getByLabel('Name', { exact: true }).fill('Posted income');
    await transaction.getByLabel('Amount', { exact: true }).fill('125');
    const date = new Date();
    const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    await transaction.getByLabel('Date', { exact: true }).fill(startDate);
    await transaction.getByLabel('Category').selectOption({ label: 'None' });
    await transaction.getByLabel('Frequency').selectOption('once');
    await transaction.getByLabel('Paycheck').check();
    await transaction.getByLabel('Posted on this date').check();
    await transaction.getByRole('button', { name: 'Add income' }).click();
    await expect(transaction).toHaveCount(0);
    await page.getByLabel('Status', { exact: true }).selectOption('posted');
    await expect(page.locator('.txRow .txName')).toContainText('Posted income');
    await expect(page.locator('.txRow:not(.txHead)').getByLabel('Posted')).toBeChecked();

    await nav.getByRole('button', { name: 'Salary Tracker', exact: true }).click();
    await page.getByRole('button', { name: 'Add salary change' }).click();
    const salary = page.getByRole('dialog', { name: 'Add salary change' });
    expect(await salary.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await salary.getByLabel('Effective date').fill('2025-01-01');
    await salary.getByLabel('Age', { exact: true }).fill('35');
    await salary.getByLabel('Employer').fill('Example employer');
    await salary.getByLabel('Title').fill('Engineer');
    await salary.getByLabel('Actual annual income').fill('85000');
    await salary.getByLabel('Annual income goal').fill('90000');
    await salary.getByLabel('Notes').fill('Salary note');
    await salary.getByRole('button', { name: 'Add entry' }).click();
    await expect(salary).toHaveCount(0);
    const row = page.locator('.incomeHistoryRow').filter({ hasText: 'Example employer' });
    await row.locator('summary').click();
    await expect(row).toContainText('Salary note');
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit salary change' });
    await expect(edit.getByLabel('Age', { exact: true })).toHaveValue('35');
    await expect(edit.getByLabel('Annual income goal')).toHaveValue('90000');
    await edit.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Add salary change' }).click();
    await salary.getByLabel('Employer').fill('Cancelled entry');
    await page.keyboard.press('Escape');
    await expect(salary).toHaveCount(0);
    await expect(page.locator('.incomeHistoryRow').filter({ hasText: 'Cancelled entry' })).toHaveCount(0);
    await page.getByText('Annual income goals', { exact: true }).click();
    await page.getByRole('button', { name: 'Add or update goal' }).click();
    const goal = page.getByRole('dialog', { name: 'Add or update goal' });
    await goal.getByLabel('Year').fill('2026');
    await goal.getByLabel('Annual goal').fill('95000');
    await goal.getByRole('button', { name: 'Save goal' }).click();
    await expect(goal).toHaveCount(0);
    await expect(page.locator('.incomeHistoryGoalItem').filter({ hasText: '2026' })).toContainText('95,000');
    await page.reload();
    await nav.getByRole('button', { name: 'Salary Tracker', exact: true }).click();
    await expect(page.locator('.incomeHistoryRow').filter({ hasText: 'Example employer' })).toBeVisible();
    await openTracker(page, 'BJJ Tracker', mobile);
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 1 skills.');
    if (mobile) await bjj.locator('.bjj-card > summary').click();
    const skillList = bjj.locator(mobile ? '#bjj-cards' : '#bjj-list');
    await expect(skillList.getByLabel('Practice for Full skill')).toHaveValue('consistently');
    await skillList.getByLabel('Practice for Full skill').selectOption('sometimes');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1') || '{}'));
    expect(saved.bjj.skills[0]).toMatchObject({ name: 'Full skill', type: 'Custom guard', description: 'Detailed technique', link: 'https://youtu.be/example', practice: 'sometimes', live: 'learning', preference: 'high', mastered: true, workOnNext: true });
    expect(saved.bjj.skills[0]).not.toHaveProperty('video');
    expect(saved.champions[0]).toMatchObject({ name: 'Full champion', notes: 'Build notes', statuses: { blessing: null, books: 'complete', masteries: 'progress', gear: 'complete', glyphs: 'progress', relic: 'complete' } });
  });
}

test('posting a new recurring transaction posts only its first occurrence', async ({ page }) => {
  await page.goto(localUrl);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Budget Tracker' }).click();
  await page.getByRole('button', { name: '+ Add' }).click();
  const form = page.getByRole('dialog', { name: 'Add transaction' });
  const date = new Date();
  const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  await form.getByRole('button', { name: 'Income', exact: true }).click();
  await form.getByLabel('Name', { exact: true }).fill('Recurring posted');
  await form.getByLabel('Amount', { exact: true }).fill('50');
  await form.getByLabel('Date', { exact: true }).fill(start);
  await form.getByLabel('Category').selectOption({ label: 'None' });
  await form.getByLabel('Frequency').selectOption('weekly');
  await form.getByLabel('Posted on this date').check();
  await form.getByRole('button', { name: 'Add income' }).click();
  await expect.poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('posted_map') || '{}')).filter(Boolean).length)).toBe(1);
  await expect(page.locator('.txRow .txName').filter({ hasText: 'Recurring posted' }).first()).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('posted');
  await expect(page.locator('.txRow .txName').filter({ hasText: 'Recurring posted' })).toHaveCount(1);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`dropdown filters match editable values at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    const addSkill = async (name: string, type: string, custom = false) => {
      await page.getByRole('button', { name: 'Add skill', exact: true }).click();
      await bjj.locator('#bjj-name').fill(name);
      await bjj.locator('#bjj-type-container summary').click();
      await bjj.locator('#bjj-type-container').getByRole('button', { name: custom ? 'Custom type…' : type, exact: true }).click();
      if (custom) await bjj.locator('#bjj-custom-type').fill(type);
      await bjj.locator('#bjj-add-form button[type=submit]').click();
    };
    await addSkill('Normal escape', 'Escape');
    await addSkill('Custom skill', 'Leg <entanglement>', true);
    await addSkill('Similar custom skill', 'Leg <entanglement> advanced', true);
    await bjj.locator('.bjj-filter-details summary').click();
    const typeFilter = bjj.getByLabel('Filter Type');
    await expect(typeFilter).toHaveJSProperty('tagName', 'SELECT');
    await expect(typeFilter.locator('option')).toHaveText(['All', ...tracker.bjjTypes, 'Leg <entanglement>', 'Leg <entanglement> advanced']);
    for (const field of ['Practice', 'Live rolls']) {
      const filterChoices = await bjj.getByLabel(`Filter ${field}`).locator('option').allTextContents();
      const cellChoices = await bjj.getByLabel(`${field} for Normal escape`).first().locator('option').allTextContents();
      expect(filterChoices).toEqual(['All', ...cellChoices]);
    }
    await typeFilter.selectOption({ label: 'Leg <entanglement>' });
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 3 skills.');
    if (mobile) await expect(bjj.locator('.bjj-card:visible')).toContainText('Custom skill');
    else await expect(bjj.getByLabel('Skill for Custom skill').first()).toHaveValue('Custom skill');
    await typeFilter.selectOption({ label: 'Escape' });
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 3 skills.');
    await bjj.getByLabel('Filter Practice').selectOption('not_yet');
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 3 skills.');
    await bjj.locator('#bjj-clear').click();
    await expect(typeFilter).toHaveValue('');
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 3 of 3 skills.');
    const skillView = bjj.locator(mobile ? '#bjj-cards' : '#bjj-list');
    if (mobile) {
      const card = skillView.locator('.bjj-card').filter({ has: page.getByText('Custom skill', { exact: true }) });
      if (!await card.evaluate(element => (element as HTMLDetailsElement).open)) await card.locator('summary').first().click();
    }
    const typePicker = skillView.locator('details.bjj-type-picker').filter({ has: page.getByLabel('Type for Custom skill: Leg <entanglement>') });
    await typePicker.locator('summary').click();
    await typePicker.getByRole('button', { name: 'Custom type…' }).click();
    await bjj.locator('#bjj-type-custom').fill('Revised & type');
    await bjj.locator('#bjj-type-form button[type=submit]').click();
    await expect(typeFilter.locator('option')).toHaveText(['All', ...tracker.bjjTypes, 'Revised & type', 'Leg <entanglement> advanced']);
    await typeFilter.selectOption({ label: 'Revised & type' });
    if (mobile) {
      const card = skillView.locator('.bjj-card').filter({ has: page.getByText('Custom skill', { exact: true }) });
      if (!await card.evaluate(element => (element as HTMLDetailsElement).open)) await card.locator('summary').first().click();
    }
    page.once('dialog', dialog => dialog.accept());
    await skillView.getByRole('button', { name: 'Delete Custom skill' }).click();
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 0 of 2 skills.');
    await expect(typeFilter).toHaveValue('Revised & type');
    await bjj.locator('#bjj-clear').click();
    await expect(typeFilter.locator('option')).toHaveText(['All', ...tracker.bjjTypes, 'Leg <entanglement> advanced']);
    await page.reload();
    await openTracker(page, 'BJJ Tracker', mobile);
    await bjj.locator('.bjj-filter-details summary').click();
    await expect(typeFilter.locator('option')).toHaveText(['All', ...tracker.bjjTypes, 'Leg <entanglement> advanced']);

    const builds = await openTracker(page, 'Champion Builds Tracker', mobile);
    await page.getByRole('button', { name: 'Add champion', exact: true }).click();
    await builds.locator('#build-name').fill('Filter champion');
    await builds.locator('#build-books').selectOption('complete');
    await builds.locator('#build-form button[type=submit]').click();
    if (mobile) await builds.locator('.build-mobile-controls summary').click();
    const visibleFilters = builds.locator(mobile ? '#mobile-filters' : '.build-filter-row');
    const books = visibleFilters.getByLabel('Filter Books');
    const blessing = visibleFilters.getByLabel('Filter Blessing');
    await expect(books.locator('option')).toHaveText(['All', 'Needed', 'In Progress', 'Complete']);
    await expect(blessing.locator('option')).toHaveText(['All', '0', '1', '2', '3', '4', '5', '6', 'Unknown']);
    for (const field of ['Books', 'Blessing']) {
      const filterChoices = await visibleFilters.getByLabel(`Filter ${field}`).locator('option').allTextContents();
      const cellChoices = await builds.getByLabel(`${field} for Filter champion`).first().locator('option').allTextContents();
      expect(filterChoices).toEqual(['All', ...cellChoices]);
    }
    await books.selectOption('complete');
    await expect(builds.locator('#build-count')).toHaveText('Showing 1 of 1 champions.');
    await books.selectOption('progress');
    await expect(builds.locator('#build-count')).toHaveText('Showing 0 of 1 champions.');
    await builds.locator('#build-clear-filters').click();
    await expect(books).toHaveValue('');
    await expect(builds.locator('#build-count')).toHaveText('Showing 1 of 1 champions.');
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
test(`transaction dropdown filters match editing at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    const date = new Date();
    const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('incomes', JSON.stringify([
      { id: 'a', name: 'Categorized', amount: 10, startDate, frequency: 'once', isRecurring: false, tags: ['Work'] },
      { id: 'b', name: 'Uncategorized', amount: 20, startDate, frequency: 'once', isRecurring: false, tags: [] },
    ]));
    localStorage.setItem('tags', JSON.stringify([{ name: 'Work', icon: '', color: '#ffffff' }, { name: 'all', icon: '', color: '#ffffff' }, { name: 'category:', icon: '', color: '#ffffff' }]));
  });
  await page.goto(localUrl);
  await page.getByRole('navigation', { name: viewport.width < 640 ? 'Mobile navigation' : 'Main navigation' }).getByRole('button', { name: 'Budget Tracker' }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filter = page.locator('.txFilters').getByLabel('Category');
  await page.getByRole('button', { name: 'Edit all' }).click();
  const editRow = page.locator('.txRow.isEditing').first();
  expect(await filter.locator('option').allTextContents()).toEqual(['All', ...await editRow.locator('.cCat select option').allTextContents()]);
  expect(await page.locator('.txFilters').getByLabel('Frequency').locator('option').allTextContents()).toEqual(['All', ...await editRow.locator('.cFreq select option').allTextContents()]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await filter.selectOption({ label: 'all' });
  await expect(page.locator('.txRow .txName')).toHaveCount(0);
  await filter.selectOption({ label: 'None' });
  await expect(page.locator('.txRow .txName')).toHaveText(['Uncategorized']);
  await filter.selectOption({ label: 'Work' });
  await expect(page.locator('.txRow .txName')).toHaveText(['Categorized']);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.txRow .txName')).toHaveCount(2);
});
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1351, height: 800 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
  test(`tracker tables and reward editor stay readable without horizontal scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const builds = await openTracker(page, 'Champion Builds Tracker', mobile);
    await page.getByRole('button', { name: 'Add champion', exact: true }).click();
    await builds.locator('#build-name').fill('Readability champion');
    await builds.locator('#build-form button[type=submit]').click();
    if (viewport.width > 1350) {
      await expect(builds.locator('.build-table')).toHaveCSS('font-size', '13px');
      await expect(builds.locator('#build-list .build-cell-control').first()).toHaveCSS('font-size', '13px');
      expect(await builds.locator('.build-table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    } else {
      await expect(builds.locator('.build-table-wrap')).toBeHidden();
      await expect(builds.locator('.build-mobile-card').first()).toBeVisible();
    }
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    await page.getByRole('button', { name: 'Add skill', exact: true }).click();
    await bjj.locator('#bjj-name').fill('Readability escape');
    await bjj.locator('#bjj-type-container summary').click();
    await bjj.getByRole('button', { name: 'Escape', exact: true }).click();
    await bjj.locator('#bjj-add-form button[type=submit]').click();
    if (viewport.width > 1350) {
      await expect(bjj.locator('.bjj-table')).toHaveCSS('font-size', '13px');
      await expect(bjj.locator('#bjj-list .bjj-inline-control').first()).toHaveCSS('font-size', '13px');
      expect(await bjj.locator('.bjj-table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    } else {
      await expect(bjj.locator('.bjj-table-wrap')).toBeHidden();
      await expect(bjj.locator('.bjj-card').first()).toBeVisible();
    }
    const mercy = await openTracker(page, 'Mercy Tracker', mobile);
    await mercy.locator('#clan-new').click();
    const dialog = mercy.locator('#clan-dialog');
    await expect(dialog.locator('.clan-table')).toHaveCSS('font-size', '13px');
    await dialog.getByLabel('Ultra-Nightmare Epic books').fill('3');
    expect(await dialog.locator('.clan-table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.locator('button[type=submit]').click();
    await expect(mercy.locator('#clan-summary .clan-metric').filter({ hasText: 'Epic books' }).locator('strong')).toHaveText('3');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`tracker shell colors follow page and belt at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const nav = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation' });
    const eyebrow = page.locator('.topBar .pageEyebrow');
    const activeNav = () => nav.locator('.navItem.active:visible');
    const action = page.locator(mobile ? '.mobilePageAction button' : '.desktopPageAction button');
    const assertTheme = async (accent: string, navBackground: string, navAccent = accent) => {
      await expect(eyebrow).toHaveCSS('color', accent);
      await expect(activeNav()).toHaveCSS('color', navAccent);
      await expect(nav).toHaveCSS('background-color', navBackground);
    };
    await openTracker(page, 'Champion Builds Tracker', mobile);
    await assertTheme('rgb(138, 245, 160)', mobile ? 'rgba(12, 23, 17, 0.97)' : 'rgb(12, 23, 17)');
    await expect(action).toHaveCSS('background-color', 'rgb(138, 245, 160)');
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    for (const [belt, color] of [
      ['Blue', 'rgb(120, 197, 255)'],
      ['White', 'rgb(231, 238, 240)'],
      ['Purple', 'rgb(211, 166, 255)'],
      ['Brown', 'rgb(231, 180, 135)'],
      ['Black', 'rgb(214, 220, 229)'],
    ]) {
      await bjj.locator('#bjj-belt').selectOption(belt);
      await expect(bjj.locator('.tracker-surface')).toHaveAttribute('data-belt', belt.toLowerCase());
      await expect(page.locator('.appRoot')).toHaveAttribute('data-theme', `bjj-${belt.toLowerCase()}`);
      await assertTheme(color, mobile ? 'rgba(16, 25, 30, 0.97)' : 'rgb(16, 25, 30)');
      await expect(action).toHaveCSS('background-color', color);
      await expect(bjj.locator('.bjj-belt-panel .eyebrow')).toHaveCSS('color', color);
    }
    await openTracker(page, 'Mercy Tracker', mobile);
    await assertTheme('rgb(243, 142, 155)', mobile ? 'rgba(17, 16, 12, 0.97)' : 'rgb(17, 16, 12)');
    for (const [name, color] of [
      ['Dashboard', 'rgb(237, 227, 203)'],
      ['Budget Tracker', 'rgb(250, 204, 21)'],
      ['Salary Tracker', 'rgb(154, 188, 233)'],
      ['Admin', 'rgb(182, 195, 210)'],
    ]) {
      if (mobile && name === 'Admin') await nav.getByRole('button', { name: 'More' }).click();
      await nav.getByRole('button', { name, exact: true }).click();
      await assertTheme(color, mobile ? 'rgba(17, 16, 12, 0.97)' : 'rgb(17, 16, 12)');
      if (name === 'Admin') await expect(page.locator('.admin-dangerZone')).toHaveCSS('border-top-color', 'rgb(248, 113, 113)');
    }
    await page.reload();
    const restored = await openTracker(page, 'BJJ Tracker', mobile);
    await expect(restored.locator('#bjj-belt')).toHaveValue('Black');
    await expect(page.locator('.appRoot')).toHaveAttribute('data-theme', 'bjj-black');
    await expect(eyebrow).toHaveCSS('color', 'rgb(214, 220, 229)');
  });

  test(`budget styling and navigation remain usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const nav = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation' });
    for (const [label, heading, eyebrow, color] of [
      ['Dashboard', 'Dashboard', 'YOUR OVERVIEW', 'rgb(237, 227, 203)'],
      ['Budget Tracker', 'Budget Tracker', 'YOUR FINANCES', 'rgb(250, 204, 21)'],
      ['Salary Tracker', 'Salary Tracker', 'YOUR CAREER', 'rgb(154, 188, 233)'],
      ['Admin', 'Administration', 'YOUR SETTINGS', 'rgb(182, 195, 210)'],
    ]) {
      if (mobile && label === 'Admin') await nav.getByRole('button', { name: 'More' }).click();
      await nav.getByRole('button', { name: label, exact: true }).click();
      const title = page.locator('.topBar').getByRole('heading', { name: heading, exact: true });
      await expect(title).toBeVisible();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toHaveCount(1);
      await expect(title).toHaveCSS('font-family', /Georgia/);
      await expect(page.locator('.topBar .pageEyebrow')).toHaveText(eyebrow);
      await expect(page.locator('.topBar .pageEyebrow')).toHaveCSS('color', color);
      if (label === 'Admin') {
        const columns = await page.locator('.adminPage').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
        expect(columns).toBe(mobile ? 1 : 2);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
    for (const [name, eyebrow] of [
      ['Mercy Tracker', 'RAID COMPANION'],
      ['Champion Builds Tracker', 'YOUR CHAMPIONS'],
      ['BJJ Tracker', 'BRAZILIAN JIU-JITSU'],
    ]) {
      await openTracker(page, name, mobile);
      await expect(page.locator('.topBar').getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(1);
      await expect(page.locator('.topBar .pageEyebrow')).toHaveText(eyebrow);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    await expect(bjj.locator('.tracker-surface')).toHaveAttribute('data-belt', 'blue');
    await bjj.locator('#bjj-belt').selectOption('Purple');
    await expect(bjj.locator('.tracker-surface')).toHaveAttribute('data-belt', 'purple');
    await expect(page.locator('.topBar').getByRole('heading', { name: 'BJJ Tracker' })).toBeVisible();
  });
}

test('admin CSV imports map columns and update only the selected destination', async ({ page }) => {
  const initial = tracker.emptyState();
  initial.champions = [{
    id: 'existing-champion',
    name: 'Keep existing build',
    statuses: { blessing: null, books: 'needed', masteries: 'needed', gear: 'needed', glyphs: 'needed', relic: 'needed' },
    notes: '',
  }];
  await page.addInitScript(data => localStorage.setItem('mercy-ledger-v1', JSON.stringify(data)), initial);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(localUrl);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin', exact: true }).click();

  await page.getByLabel('Import to').selectOption('bjj-skills');
  await page.locator('.adminImportControls input[type="file"]').setInputFiles({
    name: 'skills.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Skill Name,Type,Starting position,Practice,Live rolls,Mastered,Work on next\nArmbar,Submission,Closed guard,learning,sometimes,no,yes\n'),
  });
  const mapping = page.locator('.adminMappingGrid');
  await mapping.getByLabel('Skill name *').selectOption({ label: 'Skill Name' });
  await page.getByRole('button', { name: 'Import 1 row' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 1 row to BJJ Tracker');

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.champions.map((champion: { name: string }) => champion.name)).toEqual(['Keep existing build']);
  expect(saved.bjj.skills).toMatchObject([{ name: 'Armbar', type: 'Submission', positions: ['Closed guard'], practice: 'learning', live: 'sometimes', mastered: false, workOnNext: true }]);

  await page.getByLabel('Import to').selectOption('income');
  await page.locator('.adminImportControls input[type="file"]').setInputFiles({
    name: 'income.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Amount,Frequency,Date,Category\nPaycheck,2500,biweekly,2026-11-07,Work\n'),
  });
  await page.getByRole('button', { name: 'Import 1 row' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 1 income transactions');
  const incomes = await page.evaluate(() => JSON.parse(localStorage.getItem('incomes')!));
  expect(incomes).toMatchObject([{ name: 'Paycheck', amount: 2500, frequency: 'biweekly', startDate: '2026-11-07', tags: ['Work'] }]);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.bjj.skills).toHaveLength(1);

  await page.getByLabel('Import to').selectOption('salary');
  await page.locator('.adminImportControls input[type="file"]').setInputFiles({
    name: 'salary.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Effective Date,Annual Income,Employer,Title,Age,Notes,Goal\n2025-03-01,80000,Acme,Engineer,35,Promotion,90000\n'),
  });
  await page.getByRole('button', { name: 'Import 1 row' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 1 salary entry');
  const salary = await page.evaluate(() => JSON.parse(localStorage.getItem('income_history')!));
  expect(salary.entries).toMatchObject([{ effectiveDate: '2025-03-01', annualIncome: 80000, employer: 'Acme', title: 'Engineer', age: 35 }]);
  expect(salary.annualGoals['2025']).toBe(90000);

  await page.getByLabel('Import to').selectOption('mercy-pulls');
  await page.locator('.adminImportControls input[type="file"]').setInputFiles({
    name: 'pulls.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Pull Type,Source,Rarity,Quantity\n2026-11-06,shard,Ancient,Rare,1\n'),
  });
  await page.getByRole('button', { name: 'Import 1 row' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 1 row to Mercy Tracker pulls');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.entries).toMatchObject([{ kind: 'shard', source: 'Ancient', rarity: 'Rare', quantity: 1 }]);
  expect(saved.champions.map((champion: { name: string }) => champion.name)).toEqual(['Keep existing build']);

  await page.getByLabel('Import to').selectOption('demon-lord');
  await page.locator('.adminImportControls input[type="file"]').setInputFiles({
    name: 'rewards.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Difficulty,Chests,Legendary books,Epic books,Sacred shards,Void shards,Ancient shards\n2026-11-07,Ultra-Nightmare,2,1,,2,3,4\n'),
  });
  await page.getByRole('button', { name: 'Import 1 row' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 1 row to Mercy Tracker reward days');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.clanBoss[0].difficulties.ultra).toMatchObject({ chests: 2, books: 1, epicBooks: null, sacred: 2, void: 3, ancient: 4 });
  expect(saved.entries).toHaveLength(1);

  await page.getByLabel('Import to').selectOption('champions');
  await page.locator('.adminImportControls input[type="file"]').setInputFiles({
    name: 'champions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Champion,Blessing,Books,Gear,Notes\nNew champion,3,complete,progress,Imported build\n'),
  });
  await page.getByRole('button', { name: 'Import 1 row' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 1 row to Champion Builds Tracker');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.champions).toMatchObject([
    { name: 'Keep existing build' },
    { name: 'New champion', statuses: { blessing: 3, books: 'complete', gear: 'progress' }, notes: 'Imported build' },
  ]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`page actions open the correct forms at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(localUrl);
    const mobile = viewport.width < 640;
    const actionArea = page.locator(mobile ? '.mobilePageAction' : '.topBar');
    const nav = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation' });
    await nav.getByRole('button', { name: 'Budget Tracker', exact: true }).click();
    await actionArea.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('form.txAdd')).toBeVisible();
    await page.getByRole('dialog', { name: 'Add transaction' }).getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('form.txAdd')).toHaveCount(0);
    const builds = await openTracker(page, 'Champion Builds Tracker', mobile);
    await actionArea.getByRole('button', { name: 'Add champion' }).click();
    await expect(builds.locator('#build-dialog')).toBeVisible();
    await builds.locator('#build-close').click();
    const bjj = await openTracker(page, 'BJJ Tracker', mobile);
    await actionArea.getByRole('button', { name: 'Add skill' }).click();
    await expect(bjj.locator('#bjj-add-dialog')).toBeVisible();
    await bjj.locator('#bjj-add-close').click();
  });
}

test('desktop and mobile navigation, editing, reload and budget isolation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('startingBalance', '2468');
      localStorage.setItem('tags', JSON.stringify([{ name: 'Test category', icon: 'T', color: '#ffffff' }]));
      sessionStorage.setItem('seeded', 'yes');
    }
  });
  await page.goto(localUrl);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Budget Tracker' }).click();
  await expect(page.getByText('$2,468.00').first()).toBeVisible();
  const mercy = await openTracker(page, 'Mercy Tracker');
  await mercy.locator('#count-Ancient-Legendary').fill('201');
  await mercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  const builds = await openTracker(page, 'Champion Builds Tracker');
  await page.getByRole('button', { name: 'Add champion', exact: true }).click();
  await builds.locator('#build-name').fill('Integration champion');
  await builds.locator('#build-form button[type=submit]').click();
  const bjj = await openTracker(page, 'BJJ Tracker');
  await page.getByRole('button', { name: 'Add skill', exact: true }).click();
  await bjj.locator('#bjj-name').fill('Integration escape');
  await bjj.locator('#bjj-type-container summary').click();
  await bjj.getByRole('button', { name: 'Escape', exact: true }).click();
  await bjj.locator('#bjj-add-form button[type=submit]').click();
  await bjj.locator('#bjj-belt').selectOption('Purple');
  await bjj.locator('#bjj-list').getByRole('button', { name: 'Mastered: Integration escape' }).click();
  await expect(bjj.locator('#bjj-list').getByRole('button', { name: 'Mastered: Integration escape' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bjj.locator('#bjj-list > tr')).toHaveClass(/bjj-mastered/);
  await bjj.locator('.bjj-filter-details summary').click();
  await bjj.getByLabel('Filter Skill').fill('not a matching skill');
  await expect(bjj.locator('#bjj-count')).toContainText('Showing 0 of 1');
  await bjj.locator('#bjj-clear').click();
  await expect(bjj.locator('#bjj-count')).toContainText('Showing 1 of 1');
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBjj = await openTracker(page, 'BJJ Tracker', true);
  await expect(mobileBjj.getByText('Integration escape', { exact: true }).first()).toBeVisible();
  await expect(mobileBjj.locator('.tracker-surface')).toHaveAttribute('data-belt', 'purple');
  await mobileBjj.getByText('Integration escape', { exact: true }).first().click();
  await expect(mobileBjj.getByRole('button', { name: 'Mastered: Integration escape' }).last()).toHaveAttribute('aria-pressed', 'true');
  const mobileBuilds = await openTracker(page, 'Champion Builds Tracker', true);
  await expect(mobileBuilds.getByText('Integration champion', { exact: true }).last()).toBeVisible();
  const mobileMercy = await openTracker(page, 'Mercy Tracker', true);
  await expect(mobileMercy.locator('#count-Ancient-Legendary')).toHaveValue('201');
  await expect(mobileMercy.locator('#import-button')).toHaveCount(0);
  await expect(mobileMercy.locator('#export-button')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Budget Tracker' }).click();
  await expect(page.getByRole('heading', { name: 'Budget Tracker' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.locator('form.txAdd').getByRole('button', { name: 'Income', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Budget test income');
  await page.getByLabel('Amount', { exact: true }).fill('125');
  await page.getByLabel('Date', { exact: true }).fill('2026-01-01');
  await page.locator('form.txAdd label').filter({ hasText: 'Category' }).locator('select').selectOption('category:Test category');
  await page.getByRole('button', { name: 'Add income' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('incomes') || '[]').some((item: { name: string }) => item.name === 'Budget test income'))).toBe(true);
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByText('$2,468.00').first()).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('startingBalance'))).toBe('2468');
});

test('backup migration, invalid and cancelled imports preserve both datasets', async ({ page }) => {
  await page.goto(localUrl);
  const mercy = await openTracker(page, 'Mercy Tracker');
  await mercy.locator('#clan-new').click();
  await mercy.getByLabel('Ultra-Nightmare Epic books').fill('3');
  await mercy.locator('#clan-form button[type=submit]').click();
  await expect(mercy.locator('#clan-summary .clan-metric').filter({ hasText: 'Epic books' }).locator('strong')).toHaveText('3');
  await mercy.locator('#count-Ancient-Legendary').fill('55');
  await mercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  const before = await page.evaluate(() => localStorage.getItem('mercy-ledger-v1'));
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const input = page.getByLabel('Backup file');
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":12}') });
  await expect(page.getByRole('status').filter({ hasText: 'Not a valid Mercy Ledger backup' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mercy-ledger-v1'))).toBe(before);
  const legacy = tracker.emptyState();
  legacy.version = 1;
  delete legacy.current;
  delete legacy.soulInventory;
  delete legacy.battlePlans;
  delete legacy.summonPlans;
  delete legacy.clanBoss;
  delete legacy.champions;
  delete legacy.bjj;
  legacy.starting.Ancient.Legendary = 99;
  const file = { name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) };
  const cancelDialog = page.waitForEvent('dialog');
  await input.setInputFiles(file);
  await (await cancelDialog).dismiss();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('mercy-ledger-v1'))).toBe(before);
  const importDialog = page.waitForEvent('dialog');
  await input.setInputFiles(file);
  await (await importDialog).accept();
  await expect(page.getByText('Tracker backup imported.')).toBeVisible();
  const reloadedMercy = await openTracker(page, 'Mercy Tracker');
  await expect(reloadedMercy.locator('#count-Ancient-Legendary')).toHaveValue('99');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.version).toBe(15);
  expect(saved.starting.Ancient.Legendary).toBe(99);
  expect(saved.bjj.skills).toEqual([]);
});

test('full backup round trips budget and every tracker; older budget backups leave trackers intact', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('backup-seeded')) return;
    sessionStorage.setItem('backup-seeded', 'yes');
    localStorage.setItem('startingBalance', '2468');
    localStorage.setItem('incomes', JSON.stringify([{ id: 'pay', name: 'Paycheck', amount: 125, startDate: '2026-01-01', frequency: 'monthly', isRecurring: true, tags: ['Work'], overrides: { '2026-02-01': 150 } }]));
    localStorage.setItem('tags', JSON.stringify([{ name: 'Work', icon: '', color: '#ffffff' }]));
  });
  await page.goto(localUrl);
  const mercy = await openTracker(page, 'Mercy Tracker');
  await mercy.locator('#count-Ancient-Legendary').fill('55');
  await mercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  const builds = await openTracker(page, 'Champion Builds Tracker');
  await page.getByRole('button', { name: 'Add champion', exact: true }).click();
  await builds.locator('#build-name').fill('Backup champion');
  await builds.locator('#build-form button[type=submit]').click();
  const bjj = await openTracker(page, 'BJJ Tracker');
  await page.getByRole('button', { name: 'Add skill', exact: true }).click();
  await bjj.locator('#bjj-name').fill('Backup escape');
  await bjj.locator('#bjj-type-container summary').click();
  await bjj.getByRole('button', { name: 'Escape', exact: true }).click();
  await bjj.locator('#bjj-add-dialog').getByLabel('Mount', { exact: true }).check();
  await bjj.locator('#bjj-add-dialog').getByLabel('Custom positions (one per line)').fill('Custom guard');
  await bjj.locator('#bjj-add-form button[type=submit]').click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Everything' }).click();
  const download = await downloadPromise;
  const full = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(full.version).toBe(2);
  expect(full.startingBalance).toBe(2468);
  expect(full.incomes[0].overrides['2026-02-01']).toBe(150);
  expect(full.tracker.current.shards.Ancient.Legendary).toBe(55);
  expect(full.tracker.champions[0].name).toBe('Backup champion');
  expect(full.tracker.bjj.skills[0].name).toBe('Backup escape');
  expect(full.tracker.bjj.skills[0].positions).toEqual(['Mount', 'Custom guard']);
  const input = page.getByLabel('Backup file');
  const corrupt = { ...full, startingBalance: 9999, tracker: { version: 12 } };
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupt)) });
  await expect(page.getByText('Not a valid Mercy Ledger backup', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('startingBalance'))).toBe('2468');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('mercy-ledger-v1')))!).current.shards.Ancient.Legendary).toBe(55);
  const invalidBudget = { ...full, incomes: [null] };
  await input.setInputFiles({ name: 'invalid-budget.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalidBudget)) });
  await expect(page.getByText('full Milestone backup is incomplete or invalid', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('startingBalance'))).toBe('2468');
  const old = { ...full, version: 1, startingBalance: 1357 };
  delete old.tracker;
  const oldDialog = page.waitForEvent('dialog');
  await input.setInputFiles({ name: 'old-budget.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await (await oldDialog).accept();
  await expect(page.getByText('tracker data unchanged', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('startingBalance'))).toBe('1357');
  const changedMercy = await openTracker(page, 'Mercy Tracker');
  await changedMercy.locator('#count-Ancient-Legendary').fill('13');
  await changedMercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const cancelledDialog = page.waitForEvent('dialog');
  await input.setInputFiles({ name: 'full.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(full)) });
  await (await cancelledDialog).dismiss();
  expect(await page.evaluate(() => localStorage.getItem('startingBalance'))).toBe('1357');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('mercy-ledger-v1')))!).current.shards.Ancient.Legendary).toBe(13);
  const fullDialog = page.waitForEvent('dialog');
  await input.setInputFiles({ name: 'full.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(full)) });
  await (await fullDialog).accept();
  await expect(page.getByText('and tracker data', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('startingBalance'))).toBe('2468');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('mercy-ledger-v1')))!).current.shards.Ancient.Legendary).toBe(55);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('mercy-ledger-v1')))!).bjj.skills[0].positions).toEqual(['Mount', 'Custom guard']);
  const salaryDialog = page.waitForEvent('dialog');
  await page.locator('input[accept="application/json,.json"]').first().setInputFiles({ name: 'full.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(full)) });
  await (await salaryDialog).accept();
  await expect(page.getByText('Salary history imported.', { exact: false })).toBeVisible();
  await page.reload();
  const restored = await openTracker(page, 'BJJ Tracker');
  await expect(restored.getByRole('textbox', { name: 'Skill for Backup escape' })).toHaveValue('Backup escape');
  const restoredBuilds = await openTracker(page, 'Champion Builds Tracker');
  await expect(restoredBuilds.locator('#build-count')).toContainText('1');
});

test('a valid original tracker backup can repair corrupt local tracker data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mercy-ledger-v1', '{invalid'));
  await page.goto(localUrl);
  const mercy = await openTracker(page, 'Mercy Tracker');
  await expect(mercy.locator('#notice')).toContainText('Could not load saved data');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const valid = tracker.emptyState();
  valid.current.shards.Void = { Legendary: 21 };
  const dialog = page.waitForEvent('dialog');
  await page.getByLabel('Backup file').setInputFiles({ name: 'tracker.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(valid)) });
  await (await dialog).accept();
  await expect(page.getByText('Tracker backup imported.', { exact: false })).toBeVisible();
  const restored = await openTracker(page, 'Mercy Tracker');
  await expect(restored.locator('#count-Void-Legendary')).toHaveValue('21');
});

test('a stale tracker tab cannot overwrite a newer local edit', async ({ context }) => {
  const first = await context.newPage();
  await first.goto(localUrl);
  const firstTracker = await openTracker(first, 'Mercy Tracker');
  await firstTracker.locator('#count-Void-Legendary').fill('2');
  await firstTracker.locator('#count-Void-Legendary').dispatchEvent('change');
  const second = await context.newPage();
  await second.goto(localUrl);
  const secondTracker = await openTracker(second, 'Mercy Tracker');
  await expect(secondTracker.locator('#count-Void-Legendary')).toHaveValue('2');
  await firstTracker.locator('#count-Void-Legendary').fill('7');
  await firstTracker.locator('#count-Void-Legendary').dispatchEvent('change');
  await secondTracker.locator('#count-Void-Legendary').fill('3');
  await secondTracker.locator('#count-Void-Legendary').dispatchEvent('change');
  await expect(secondTracker.locator('#notice')).toContainText('Data changed in another page');
  const saved = await first.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.current.shards.Void.Legendary).toBe(7);
});

test('tracker import rejects data changed in another tab during confirmation', async ({ context }) => {
  const first = await context.newPage();
  await first.goto(localUrl);
  const firstTracker = await openTracker(first, 'Mercy Tracker');
  await firstTracker.locator('#count-Void-Legendary').fill('2');
  await firstTracker.locator('#count-Void-Legendary').dispatchEvent('change');
  const second = await context.newPage();
  await second.goto(localUrl);
  const secondTracker = await openTracker(second, 'Mercy Tracker');
  await first.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const imported = tracker.emptyState();
  imported.current.shards.Void = { Legendary: 99 };
  const dialog = first.waitForEvent('dialog');
  const upload = first.getByLabel('Backup file').setInputFiles({ name: 'tracker.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  const prompt = await dialog;
  await secondTracker.locator('#count-Void-Legendary').fill('7');
  await secondTracker.locator('#count-Void-Legendary').dispatchEvent('change');
  await expect.poll(() => second.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!).current.shards.Void.Legendary)).toBe(7);
  await prompt.accept();
  await upload;
  await expect(first.getByText('Tracker data changed while importing', { exact: false })).toBeVisible();
  expect(JSON.parse((await first.evaluate(() => localStorage.getItem('mercy-ledger-v1')))!).current.shards.Void.Legendary).toBe(7);
});

type CloudRow = { revision: string; data: ReturnType<typeof tracker.emptyState> };
type MockCloud = { row: CloudRow | null; budgetWrites: unknown[]; beforeWrite?: () => Promise<void> };

async function mockCloud(page: Page, cloud: MockCloud) {
  const session = {
    access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' },
  };
  await page.addInitScript(value => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
  await page.route('http://127.0.0.1:5190/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/budget_data')) {
      if (request.method() === 'GET') return route.fulfill({ json: [], headers });
      cloud.budgetWrites.push(request.postDataJSON());
      return route.fulfill({ json: [], headers });
    }
    if (url.pathname.endsWith('/tracker_data')) {
      if (request.method() === 'GET') return route.fulfill({ json: cloud.row ? [cloud.row] : [], headers });
      const body = request.postDataJSON();
      if (cloud.beforeWrite) await cloud.beforeWrite();
      if (request.method() === 'POST' && cloud.row) return route.fulfill({ status: 409, json: { message: 'duplicate key' }, headers });
      if (request.method() === 'PATCH' && url.searchParams.get('revision') !== `eq.${cloud.row?.revision}`) {
        return route.fulfill({ json: [], headers });
      }
      cloud.row = { revision: body.revision, data: body.data };
      return route.fulfill({ json: [{ revision: body.revision }], headers });
    }
    return route.fulfill({ status: 404, json: { message: `Unexpected endpoint ${url.pathname}` }, headers });
  });
}

test('overview loads account tracker summaries and reports tracker sync errors', async ({ page }) => {
  const state = tracker.emptyState();
  state.champions = [{ id: 'one', name: 'Cloud champion', notes: '', statuses: { blessing: 6, books: 'complete', masteries: 'complete', gear: 'complete', glyphs: 'complete', relic: 'complete' } }];
  state.bjj.belt = 'Purple';
  const cloud: MockCloud = { row: { revision: 'original', data: state }, budgetWrites: [] };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  await expect(page.locator('.overview-champions')).toContainText('1 / 1');
  await expect(page.locator('.overview-mercy')).toContainText('No known shard counters yet');
  await expect(page.locator('.overview-bjj')).toHaveCSS('border-top-color', 'rgb(211, 166, 255)');
  await page.route('**/tracker_data*', route => route.fulfill({
    status: 500,
    json: { message: 'Test tracker failure' },
    headers: { 'access-control-allow-origin': '*' },
  }));
  await page.reload();
  await expect(page.locator('.overview-champions')).toContainText('Could not load tracker data');
  await expect(page.locator('.trackerError')).toContainText('Test tracker failure');
  await expect(page.locator('.overview-champions')).not.toContainText('0 / 0');
});

test('weight plans sync to the existing tracker account without changing other tracker data', async ({ page }) => {
  const state = tracker.emptyState();
  state.current.shards.Ancient = { Legendary: 42 };
  const cloud: MockCloud = { row: { revision: 'original', data: state }, budgetWrites: [] };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  await openTracker(page, 'Weight Tracker');
  await page.getByRole('button', { name: 'Start a plan', exact: true }).click();
  await page.getByLabel('Starting weight (lb)').fill('180');
  await page.getByLabel('Planned end date').fill(addMonths(await page.getByLabel('Start date').inputValue(), 2));
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect.poll(() => cloud.row?.data.weight.plans.length).toBe(1);
  expect(cloud.row!.data.weight.plans[0].targetWeight).toBe(184);
  expect(cloud.row!.data.current.shards.Ancient.Legendary).toBe(42);
  await expect(page.locator('.trackerSync')).toHaveText('Tracker: account sync ready');
  await page.getByRole('button', { name: 'Add past plan' }).click();
  const past = page.getByRole('dialog', { name: 'Add past plan' });
  await past.getByLabel('Start date').fill('2020-01-01');
  await past.getByLabel('Starting weight (lb)').fill('170');
  await past.getByLabel('Planned end date').fill('2020-02-01');
  await past.getByLabel('Actual end date').fill('2020-02-01');
  await past.getByRole('button', { name: 'Save plan' }).click();
  await expect.poll(() => cloud.row?.data.weight.plans.length).toBe(2);
  await expect(page.locator('.trackerSync')).toHaveText('Tracker: account sync ready');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Everything' }).click();
  const backup = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  expect(backup.tracker.weight.plans).toHaveLength(2);
  expect(backup.tracker.weight.plans[0]).toMatchObject({ startDate: '2020-01-01', actualEndDate: '2020-02-01', status: 'completed' });
  expect(backup.tracker.current.shards.Ancient.Legendary).toBe(42);
  await page.reload();
  await openTracker(page, 'Weight Tracker');
  await expect(page.locator('.weightOverview')).toContainText('184.0 lb');
});

test('full backup restores weight plans and weigh-ins', async ({ page }) => {
  await page.goto(localUrl);
  await openTracker(page, 'Weight Tracker');
  await page.getByRole('button', { name: 'Start a plan', exact: true }).click();
  await page.getByLabel('Starting weight (lb)').fill('180');
  await page.getByLabel('Planned end date').fill(addMonths(await page.getByLabel('Start date').inputValue(), 2));
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.getByRole('button', { name: 'Add weigh-in' }).click();
  await page.getByLabel('Weight (lb)', { exact: true }).fill('181');
  await page.getByLabel('Notes').fill('Test note');
  await page.getByRole('button', { name: 'Save weigh-in' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Everything' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const backup = JSON.parse(await readFile(path!, 'utf8'));
  expect(backup.tracker.weight.plans).toHaveLength(1);
  expect(backup.tracker.weight.weighIns[0].notes).toBe('Test note');
  await openTracker(page, 'Weight Tracker');
  await page.locator('.weightWeighIns summary').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Notes').fill('Changed');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save weigh-in' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const confirmation = page.waitForEvent('dialog');
  await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await (await confirmation).accept();
  await expect(page.getByText('and tracker data', { exact: false })).toBeVisible();
  await openTracker(page, 'Weight Tracker');
  await page.locator('.weightWeighIns summary').click();
  await expect(page.locator('.weightEntry')).toContainText('Test note');
});

test('account sync migrates old BJJ skills and persists positions without changing budget data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = tracker.emptyState();
  state.version = 12;
  state.bjj.skills = [{ id: 'legacy', name: 'Cloud sweep', type: 'Sweep', description: '', link: '', video: 'unset', practice: 'learning', live: 'sometimes', preference: 'low', mastered: false }];
  const cloud: MockCloud = { row: { revision: 'original', data: state }, budgetWrites: [] };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  const bjj = await openTracker(page, 'BJJ Tracker');
  await bjj.getByLabel('Edit starting positions for Cloud sweep').first().click();
  const dialog = bjj.locator('#bjj-positions-dialog');
  await dialog.getByLabel('Mount', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save positions' }).click();
  await expect.poll(() => cloud.row?.data.version).toBe(15);
  expect(cloud.row!.data.bjj.skills[0].positions).toEqual(['Mount']);
  expect(cloud.budgetWrites.every(write => !!write && typeof write === 'object' && 'data' in write && !!write.data && typeof write.data === 'object' && !('tracker' in write.data))).toBe(true);
});

test('signed-in mobile header keeps all page titles and account controls visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockCloud(page, { row: { revision: 'original', data: tracker.emptyState() }, budgetWrites: [] });
  await page.goto(cloudUrl);
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  for (const [label, heading, trackerPage] of [
    ['Dashboard', 'Dashboard', false],
    ['Budget Tracker', 'Budget Tracker', false],
    ['Salary Tracker', 'Salary Tracker', false],
    ['Admin', 'Administration', false],
    ['Mercy Tracker', 'Mercy Tracker', true],
    ['Champion Builds Tracker', 'Champion Builds Tracker', true],
    ['BJJ Tracker', 'BJJ Tracker', true],
  ] as const) {
    if (trackerPage) await openTracker(page, label, true);
    else {
      if (label === 'Admin') await nav.getByRole('button', { name: 'More' }).click();
      await nav.getByRole('button', { name: label, exact: true }).click();
    }
    const header = page.locator('.topBar');
    await expect(header.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(header.locator('.syncBadge')).toBeVisible();
    await expect(header.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const layout = await header.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const title = el.querySelector('.topBarTitle')!.getBoundingClientRect();
      const heading = el.querySelector('h1')!;
      const eyebrow = el.querySelector('.pageEyebrow')!;
      const badge = el.querySelector('.syncBadge')!.getBoundingClientRect();
      const signOut = Array.from(el.querySelectorAll('button')).find(button => button.textContent === 'Sign out')!.getBoundingClientRect();
      return { headerHeight: bounds.height, titleRight: title.right, badgeLeft: badge.left, badgeRight: badge.right, signOutLeft: signOut.left, signOutRight: signOut.right, headingFits: heading.scrollWidth <= heading.clientWidth, eyebrowFits: eyebrow.scrollWidth <= eyebrow.clientWidth };
    });
    expect(layout.headerHeight).toBeLessThanOrEqual(72);
    expect(layout.titleRight).toBeLessThanOrEqual(layout.badgeLeft);
    expect(layout.badgeRight).toBeLessThanOrEqual(layout.signOutLeft);
    expect(layout.signOutRight).toBeLessThanOrEqual(320);
    expect(layout.headingFits).toBe(true);
    expect(layout.eyebrowFits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test('mobile header accommodates a budget sync error', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockCloud(page, { row: { revision: 'original', data: tracker.emptyState() }, budgetWrites: [] });
  await page.route('**/budget_data*', route => route.fulfill({
    status: 500,
    json: { message: 'Test sync failure' },
    headers: { 'access-control-allow-origin': '*' },
  }));
  await page.goto(cloudUrl);
  await expect(page.locator('.syncBadge')).toHaveText('Sync failed');
  await openTracker(page, 'Champion Builds Tracker', true);
  const layout = await page.locator('.topBar').evaluate(el => {
    const header = el.getBoundingClientRect();
    const title = el.querySelector('h1')!;
    const eyebrow = el.querySelector('.pageEyebrow')!;
    const badge = el.querySelector('.syncBadge')!.getBoundingClientRect();
    const titleContainer = el.querySelector('.topBarTitle')!.getBoundingClientRect();
    const signOut = Array.from(el.querySelectorAll('button')).find(button => button.textContent === 'Sign out')!.getBoundingClientRect();
    return { height: header.height, titleFits: title.scrollWidth <= title.clientWidth, eyebrowFits: eyebrow.scrollWidth <= eyebrow.clientWidth, titleRight: titleContainer.right, badgeLeft: badge.left, badgeRight: badge.right, signOutLeft: signOut.left, signOutRight: signOut.right };
  });
  expect(layout.height).toBeLessThanOrEqual(72);
  expect(layout.titleFits && layout.eyebrowFits).toBe(true);
  expect(layout.titleRight).toBeLessThanOrEqual(layout.badgeLeft);
  expect(layout.badgeRight).toBeLessThanOrEqual(layout.signOutLeft);
  expect(layout.signOutRight).toBeLessThanOrEqual(320);
});

test('signed-in tablet keeps page actions and controls visible without header overflow', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await mockCloud(page, { row: { revision: 'original', data: tracker.emptyState() }, budgetWrites: [] });
  await page.goto(cloudUrl);
  for (const [label, action] of [['Budget Tracker', '+ Add'], ['Champion Builds Tracker', 'Add champion'], ['BJJ Tracker', 'Add skill']]) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: label, exact: true }).click();
    const header = page.locator('.topBar');
    await expect(page.locator('.mobilePageAction').getByRole('button', { name: action, exact: true })).toBeVisible();
    const boxes = await header.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const children = [...el.children].filter(child => getComputedStyle(child).display !== 'none').map(child => child.getBoundingClientRect());
      return { height: bounds.height, overflow: children.some(child => child.left < bounds.left || child.right > bounds.right || child.bottom > bounds.bottom) };
    });
    expect(boxes.height).toBeLessThanOrEqual(72);
    expect(boxes.overflow).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  }
});

test('account sync saves separately and rejects a stale cloud write with recovery', async ({ page }) => {
  const state = tracker.emptyState();
  state.current.shards.Ancient = { Legendary: 8 };
  const cloud = { row: { revision: 'original', data: state } as CloudRow | null, budgetWrites: [] as unknown[] };
  await page.addInitScript(() => localStorage.setItem('mercy-ledger-v1', 'legacy data must not be changed'));
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  const mercy = await openTracker(page, 'Mercy Tracker');
  await expect(mercy.locator('#count-Ancient-Legendary')).toHaveValue('8');
  await mercy.locator('#count-Ancient-Legendary').fill('9');
  await mercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  await expect.poll(() => cloud.row?.data.current.shards.Ancient.Legendary).toBe(9);
  await expect(page.locator('.trackerSync')).toHaveText('Tracker: account sync ready');
  await expect.poll(() => cloud.budgetWrites.length).toBeGreaterThan(0);
  expect(cloud.budgetWrites.every(write => {
    if (!write || typeof write !== 'object' || !('data' in write)) return false;
    return !!write.data && typeof write.data === 'object' && !('tracker' in write.data);
  })).toBe(true);
  cloud.row = { revision: 'other-device', data: { ...cloud.row!.data, current: { ...cloud.row!.data.current, shards: { Ancient: { Legendary: 42 } } } } };
  await mercy.locator('#count-Ancient-Legendary').fill('10');
  await mercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  await expect(page.getByRole('alert')).toContainText('changed on another device');
  await expect(page.getByRole('button', { name: 'Export recovery backup' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export recovery backup' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('mercy-ledger-recovery.json');
  expect(cloud.row.data.current.shards.Ancient.Legendary).toBe(42);
  const cached = await page.evaluate(id => JSON.parse(localStorage.getItem(`budget-app-tracker-cache:${id}`)!), userId);
  expect(cached.dirty).toBe(true);
  expect(JSON.parse(cached.data).current.shards.Ancient.Legendary).toBe(10);
  expect(await page.evaluate(() => localStorage.getItem('mercy-ledger-v1'))).toBe('legacy data must not be changed');
  await page.reload();
  await openTracker(page, 'Mercy Tracker');
  await expect(page.getByRole('alert')).toContainText('unsynced tracker changes');
  await expect(page.getByRole('button', { name: 'Export recovery backup' })).toBeVisible();
  expect(cloud.row.data.current.shards.Ancient.Legendary).toBe(42);
});

test('rapid cloud edits are queued without losing the latest value', async ({ page }) => {
  const state = tracker.emptyState();
  state.current.shards.Ancient = { Legendary: 1 };
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const firstWrite = new Promise<void>(resolve => { started = resolve; });
  let writes = 0;
  const cloud: MockCloud = {
    row: { revision: 'original', data: state },
    budgetWrites: [],
    beforeWrite: async () => { if (++writes === 1) { started(); await gate; } },
  };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  const mercy = await openTracker(page, 'Mercy Tracker');
  await mercy.locator('#count-Ancient-Legendary').fill('2');
  await mercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  await firstWrite;
  await mercy.locator('#count-Ancient-Legendary').fill('3');
  await mercy.locator('#count-Ancient-Legendary').dispatchEvent('change');
  release();
  await expect.poll(() => cloud.row?.data.current.shards.Ancient.Legendary).toBe(3);
  await expect(page.locator('.trackerSync')).toHaveText('Tracker: account sync ready');
  expect(writes).toBe(2);
});

test('cloud backup import validates and confirms before replacing tracker data', async ({ page }) => {
  const state = tracker.emptyState();
  state.current.shards.Void = { Legendary: 15 };
  const cloud: MockCloud = { row: { revision: 'original', data: state }, budgetWrites: [] };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  const mercy = await openTracker(page, 'Mercy Tracker');
  await expect(mercy.locator('#count-Void-Legendary')).toHaveValue('15');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  const input = page.getByLabel('Backup file');
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByText('Not a valid Mercy Ledger backup', { exact: false })).toBeVisible();
  expect(cloud.row!.data.current.shards.Void.Legendary).toBe(15);
  const legacy = tracker.emptyState();
  legacy.version = 1;
  delete legacy.current;
  legacy.starting.Void.Legendary = 77;
  const file = { name: 'original.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) };
  const cancelDialog = page.waitForEvent('dialog');
  await input.setInputFiles(file);
  await (await cancelDialog).dismiss();
  await expect(input).toHaveValue('');
  expect(cloud.row!.data.current.shards.Void.Legendary).toBe(15);
  const importDialog = page.waitForEvent('dialog');
  await input.setInputFiles(file);
  await (await importDialog).accept();
  await expect.poll(() => cloud.row!.data.starting.Void.Legendary).toBe(77);
  await expect(page.getByText('Tracker backup imported.')).toBeVisible();
  expect(cloud.row!.data.version).toBe(15);
});

test('full restore keeps budget unchanged if tracker cloud write conflicts', async ({ page }) => {
  const state = tracker.emptyState();
  state.current.shards.Void = { Legendary: 15 };
  const cloud: MockCloud = { row: { revision: 'original', data: state }, budgetWrites: [] };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  await openTracker(page, 'Mercy Tracker');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  await expect(page.locator('.syncBadge')).toHaveText('Synced');
  const importedTracker = tracker.emptyState();
  importedTracker.current.shards.Void = { Legendary: 33 };
  const full = { app: 'budget-app-backup', version: 2, incomes: [], expenses: [], tags: [], startingBalance: 8888, lowBalanceThreshold: 0, postedMap: {}, background: 'forest', incomeHistory: { entries: [], annualGoals: {} }, tracker: importedTracker };
  cloud.beforeWrite = async () => {
    cloud.row = { revision: 'another-device', data: state };
  };
  const dialog = page.waitForEvent('dialog');
  await page.getByLabel('Backup file').setInputFiles({ name: 'full.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(full)) });
  await (await dialog).accept();
  await expect(page.getByText('Budget data was not replaced', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export recovery backup' })).toBeVisible();
  expect(cloud.row!.data.current.shards.Void.Legendary).toBe(15);
  expect(await page.evaluate(() => localStorage.getItem('startingBalance'))).not.toBe('8888');
});

test('signed-in full backup restores tracker and budget to their separate account stores', async ({ page }) => {
  const state = tracker.emptyState();
  state.current.shards.Void = { Legendary: 15 };
  const cloud: MockCloud = { row: { revision: 'original', data: state }, budgetWrites: [] };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  await openTracker(page, 'Mercy Tracker');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  await expect(page.locator('.syncBadge')).toHaveText('Synced');
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Everything' }).click();
  const full = JSON.parse(await readFile(await (await exported).path(), 'utf8'));
  expect(full.tracker.current.shards.Void.Legendary).toBe(15);
  full.startingBalance = 4321;
  full.tracker.current.shards.Void.Legendary = 44;
  const dialog = page.waitForEvent('dialog');
  await page.getByLabel('Backup file').setInputFiles({ name: 'full.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(full)) });
  await (await dialog).accept();
  await expect(page.getByText('and tracker data', { exact: false })).toBeVisible();
  expect(cloud.row!.data.current.shards.Void.Legendary).toBe(44);
  await expect.poll(() => cloud.budgetWrites.some(write => !!write && typeof write === 'object' && 'data' in write && typeof write.data === 'object' && write.data !== null && 'startingBalance' in write.data && write.data.startingBalance === 4321)).toBe(true);
});

test('a missing account row never silently replaces an existing cached tracker', async ({ page }) => {
  const cachedState = tracker.emptyState();
  cachedState.starting.Sacred.Legendary = 12;
  const cached = JSON.stringify({ revision: 'previous-revision', data: JSON.stringify(cachedState), dirty: false });
  await page.addInitScript(({ id, value }) => localStorage.setItem(`budget-app-tracker-cache:${id}`, value), { id: userId, value: cached });
  const cloud: MockCloud = { row: null, budgetWrites: [] };
  await mockCloud(page, cloud);
  await page.goto(cloudUrl);
  await openTracker(page, 'Mercy Tracker');
  await expect(page.getByRole('alert')).toContainText('account tracker is missing');
  await expect(page.getByRole('button', { name: 'Export recovery backup' })).toBeVisible();
  expect(await page.evaluate(id => localStorage.getItem(`budget-app-tracker-cache:${id}`), userId)).toBe(cached);
  expect(cloud.row).toBeNull();
});
