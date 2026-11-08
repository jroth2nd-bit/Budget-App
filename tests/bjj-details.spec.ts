import { test, expect } from '@playwright/test';
import tracker from '../src/tracker/tracker.js';

for (const width of [320, 768, 1440]) {
  test(`BJJ focus and expandable details work at ${width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    const description = 'A detailed technique with a longer description. '.repeat(20);
    state.bjj.skills = [{
      id: 'one', name: 'Guard pass', type: 'Pass', positions: ['Half guard'], description,
      link: 'https://youtu.be/example', practice: 'learning', live: 'sometimes',
      preference: 'low', mastered: false, workOnNext: true,
    }];
    await page.addInitScript(seed => {
      if (!sessionStorage.getItem('bjj-details-seeded')) {
        sessionStorage.setItem('bjj-details-seeded', '1');
        localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
      }

    }, state);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    await page.locator('.overview-bjj').click();
    const bjj = page.locator('.trackerView');
    const cards = width <= 1350;
    const list = bjj.locator(cards ? '#bjj-cards' : '#bjj-list');
    if (cards) await list.locator('.bjj-card > summary').click();
    await expect(list.getByLabel('Focus: Guard pass')).toBeChecked();
    await expect(list.getByLabel('Edit description for Guard pass')).toBeHidden();
    await expect(list.getByLabel('Video link for Guard pass')).toBeHidden();
    await expect(list.getByLabel('Delete Guard pass')).toBeHidden();
    if (cards) await list.locator('.bjj-card-details > summary').click();
    else {
      await expect(bjj.locator('#bjj-head th')).toHaveCount(9);
      await expect(bjj.locator('#bjj-head')).not.toContainText('Description');
      await expect(bjj.locator('#bjj-head')).not.toContainText('Video link');
      await list.getByRole('button', { name: 'Details for Guard pass' }).click();
      await expect(list.getByRole('button', { name: 'Details for Guard pass' })).toHaveAttribute('aria-expanded', 'true');
    }

    const preview = list.getByLabel('Edit description for Guard pass');
    await expect(preview).toBeVisible();
    expect(await preview.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    expect((await preview.boundingBox())!.height).toBeLessThan(45);
    await preview.click();
    const editor = bjj.locator('#bjj-text-dialog');
    await expect(editor.locator('#bjj-text')).toHaveValue(description);
    await editor.locator('#bjj-text').fill('Updated description');
    await editor.getByRole('button', { name: 'Save description' }).click();
    await expect(list.getByLabel('Edit description for Guard pass')).toHaveText('Updated description');
    await list.getByLabel('Video link for Guard pass').fill('https://youtu.be/updated');
    await list.getByLabel('Video link for Guard pass').dispatchEvent('change');
    await expect(list.getByLabel('Video link for Guard pass')).toHaveValue('https://youtu.be/updated');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    const nav = page.getByRole('navigation', { name: width < 640 ? 'Mobile navigation' : 'Main navigation' });
    if (width < 640) await nav.getByRole('button', { name: 'More' }).click();
    await nav.getByRole('button', { name: 'BJJ Tracker' }).click();
    if (cards) {
      await list.locator('.bjj-card > summary').click();
      await list.locator('.bjj-card-details > summary').click();
    } else await list.getByRole('button', { name: 'Details for Guard pass' }).click();
    await expect(list.getByLabel('Edit description for Guard pass')).toHaveText('Updated description');
    await expect(list.getByLabel('Video link for Guard pass')).toHaveValue('https://youtu.be/updated');
    page.once('dialog', dialog => dialog.dismiss());
    await list.getByLabel('Delete Guard pass').click();
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 1 of 1 skills.');
    page.once('dialog', dialog => dialog.accept());
    await list.getByLabel('Delete Guard pass').click();
    await expect(bjj.locator('#bjj-count')).toHaveText('Showing 0 of 0 skills.');
  });
}

test('CSV import accepts both Focus and the previous Work on next header', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Admin' }).click();
  await page.getByLabel('Import to').selectOption('bjj-skills');
  for (const [header, name] of [['Focus', 'New label'], ['Work on next', 'Old label']]) {
    await page.locator('.adminImportControls input[type="file"]').setInputFiles({
      name: 'skills.csv', mimeType: 'text/csv', buffer: Buffer.from(`Skill Name,${header}\n${name},yes\n`),
    });
    await expect(page.locator('.adminMappingGrid').getByRole('combobox', { name: 'Focus (optional)' })).toHaveValue(header);
    await page.getByRole('button', { name: 'Import 1 row' }).click();
    await expect(page.getByRole('status')).toContainText('Imported 1 row to BJJ Tracker');
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(saved.bjj.skills).toMatchObject([{ name: 'New label', workOnNext: true }, { name: 'Old label', workOnNext: true }]);
});

for (const width of [320, 768, 1440]) {
  test(`BJJ add skill fields have clear spacing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    await page.locator('.overview-bjj').click();
    await page.getByRole('button', { name: 'Add skill', exact: true }).click();
    const dialog = page.locator('.trackerView #bjj-add-dialog');
    const spacing = await dialog.evaluate(element => {
      const root = element.getRootNode() as ShadowRoot;
      const rect = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
      const between = (before: string, after: string) => rect(after).top - rect(before).bottom;
      return {
        pairs: [
          between('label[for="bjj-name"]', '#bjj-name'),
          between('#bjj-name', '#bjj-type-label'),
          between('#bjj-type-label', '#bjj-type-container'),
          between('#bjj-add-positions fieldset', 'label[for="bjj-add-description"]'),
          between('label[for="bjj-add-description"]', '#bjj-add-description'),
          between('#bjj-add-description', 'label[for="bjj-add-link"]'),
          between('#bjj-add-link', 'label[for="bjj-add-practice"]'),
          between('label[for="bjj-add-practice"]', '#bjj-add-practice'),
          between('#bjj-add-practice', 'label[for="bjj-add-preference"]'),
        ],
        overflow: element.scrollWidth > element.clientWidth,
      };
    });
    for (const gap of spacing.pairs) expect(gap).toBeGreaterThanOrEqual(5);
    expect(spacing.overflow).toBe(false);
    await dialog.locator('#bjj-type-container summary').click();
    await dialog.getByRole('button', { name: 'Custom type…' }).click();
    await expect(dialog.locator('#bjj-custom-wrap')).toBeVisible();
    const customGap = await dialog.evaluate(element => {
      const root = element.getRootNode() as ShadowRoot;
      return root.querySelector('#bjj-custom-wrap')!.getBoundingClientRect().top - root.querySelector('#bjj-type-container')!.getBoundingClientRect().bottom;
    });
    expect(customGap).toBeGreaterThanOrEqual(12);
  });
}
