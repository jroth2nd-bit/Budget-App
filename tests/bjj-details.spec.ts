import { test, expect } from '@playwright/test';
import tracker from '../src/tracker/tracker.js';

for (const width of [320, 768, 1440, 1850]) {
  test(`BJJ learning priorities match the dashboard and update at ${width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    const skill = {
      type: 'Pass', positions: ['Half guard'], description: '', link: '',
      practice: 'consistently' as const, live: 'sometimes' as const,
      preference: 'unset' as const, mastered: false, workOnNext: false,
    };
    state.bjj.skills = [
      { ...skill, id: 'one', name: 'Focus with confidence', workOnNext: true },
      { ...skill, id: 'two', name: 'Focus without confidence', positions: [], practice: 'unset', workOnNext: true },
      { ...skill, id: 'three', name: 'Fallback priority' },
      { ...skill, id: 'four', name: 'Another fallback', live: 'learning' },
      { ...skill, id: 'five', name: 'Complete skill', live: 'consistently' },
    ];
    await page.addInitScript(seed => {
      if (!sessionStorage.getItem('priorities-seeded')) {
        sessionStorage.setItem('priorities-seeded', '1');
        localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
      }
    }, state);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    const dashboard = page.locator('.overview-bjj');
    const dashboardNames = await dashboard.locator('li > span').allTextContents();
    expect(dashboardNames).toEqual(['Focus with confidence', 'Focus without confidence', 'Fallback priority']);
    await dashboard.click();
    const bjj = page.locator('.trackerView');
    const priorities = bjj.locator('#bjj-priorities');
    await expect(priorities.locator('li strong')).toHaveText(dashboardNames);
    await expect(priorities.locator('li.compact-panel')).toHaveCount(3);
    const first = priorities.locator('li').first();
    await expect(first.locator('.bjj-priority-focus')).toHaveText('Focus');
    for (const [label, value] of [['Type', 'Pass'], ['Starting position', 'Half guard'], ['Confidence', '85%'], ['Practice', 'Consistently'], ['Live rolls', 'Sometimes']]) {
      await expect(first.locator('.bjj-priority-info div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')).toHaveText(value);
    }
    await expect(priorities.locator('li').nth(1)).toContainText('Not set');
    await expect(priorities.locator('li').nth(1)).toContainText('Not enough data');
    await expect(priorities.locator('li').nth(1)).toContainText('Unset');
    await expect(bjj.locator('#bjj-belt')).toHaveValue('Blue');
    const beltGeometry = await bjj.locator('.bjj-belt-panel').evaluate(panel => {
      const style = getComputedStyle(panel);
      const panelRect = panel.getBoundingClientRect();
      const belt = panel.querySelector('#bjj-belt-display')!.getBoundingClientRect();
      const bar = panel.querySelector('.bjj-rank-bar')!.getBoundingClientRect();
      return {
        leftGap: belt.left - panelRect.left - parseFloat(style.borderLeftWidth) - parseFloat(style.paddingLeft),
        rightGap: panelRect.right - belt.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
        barRightGap: belt.right - bar.right,
      };
    });
    expect(Math.abs(beltGeometry.leftGap)).toBeLessThan(1);
    expect(Math.abs(beltGeometry.rightGap)).toBeLessThan(1);
    expect(beltGeometry.barRightGap).toBeLessThan(12);
    const cards = width <= 1350;
    const list = bjj.locator(cards ? '#bjj-cards' : '#bjj-list');
    if (cards) await list.locator('.bjj-card').filter({ has: page.getByText('Focus without confidence', { exact: true }) }).locator(':scope > summary').click();
    await list.getByLabel('Focus: Focus without confidence').uncheck();
    await expect(priorities.locator('li strong')).toHaveText(['Focus with confidence', 'Fallback priority', 'Another fallback']);
    await list.getByLabel('Practice for Focus without confidence').selectOption('learning');
    await expect(priorities.locator('li strong')).toHaveText(['Focus with confidence', 'Fallback priority', 'Another fallback']);
    await list.getByLabel('Focus: Focus without confidence').check();
    await expect(priorities.locator('li').nth(1)).toContainText('Learning');
    await expect(priorities.locator('li').nth(1)).toContainText('61%');
    await bjj.locator('.bjj-filter-details > summary').click();
    await bjj.locator('[data-bjj-filter="name"]').fill('Complete skill');
    await expect(priorities.locator('li strong')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const panelLayout = await bjj.locator('.bjj-progress-panels').evaluate(element => {
      const [belt, priorities] = Array.from(element.children, child => child.getBoundingClientRect());
      const cards = Array.from(element.querySelectorAll('.bjj-priority-card'), card => {
        const rect = card.getBoundingClientRect();
        return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, height: rect.height };
      });
      return { beltRight: belt.right, beltBottom: belt.bottom, beltTop: belt.top, beltHeight: belt.height, prioritiesLeft: priorities.left, prioritiesTop: priorities.top, height: element.getBoundingClientRect().height, cards };
    });
    if (width < 1200) expect(panelLayout.prioritiesTop).toBeGreaterThanOrEqual(panelLayout.beltBottom);
    else {
      expect(panelLayout.prioritiesLeft).toBeGreaterThanOrEqual(panelLayout.beltRight);
      expect(panelLayout.height).toBeLessThan(260);
      for (const card of panelLayout.cards) {
        expect(Math.abs(card.top - panelLayout.beltTop)).toBeLessThan(1);
        expect(Math.abs(card.height - panelLayout.beltHeight)).toBeLessThan(1);
      }
    }
    if (width >= 768) {
      for (let i = 1; i < panelLayout.cards.length; i++) {
        expect(panelLayout.cards[i].top).toBe(panelLayout.cards[0].top);
        expect(panelLayout.cards[i].left).toBeGreaterThanOrEqual(panelLayout.cards[i - 1].right);
        expect(Math.abs(panelLayout.cards[i].height - panelLayout.cards[0].height)).toBeLessThan(1);
      }
    } else {
      expect(panelLayout.cards[1].top).toBeGreaterThanOrEqual(panelLayout.cards[0].bottom);
    }
  });
}

test('BJJ learning priorities show an empty state without changing the belt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-bjj').click();
  const bjj = page.locator('.trackerView');
  await expect(bjj.locator('#bjj-priorities')).toContainText('No learning priorities yet.');
  await expect(bjj.locator('#bjj-belt')).toHaveValue('Blue');
  await bjj.locator('#bjj-belt').selectOption('Purple');
  await expect(bjj.locator('#bjj-belt-display')).toHaveAttribute('aria-label', /Purple belt/);
  await bjj.locator('#bjj-stripes').selectOption('4');
  await expect(bjj.locator('#bjj-belt-display')).toHaveAttribute('aria-label', 'Purple belt, 4 white stripes');
  const beltHeight = (await bjj.locator('.bjj-belt-panel').boundingBox())!.height;
  const emptyHeight = (await bjj.locator('.bjj-priorities-empty').boundingBox())!.height;
  expect(Math.abs(beltHeight - emptyHeight)).toBeLessThan(1);
  expect(beltHeight).toBeLessThan(220);
});

test('belt rank bar shows the selected number of stripes for every belt color', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-bjj').click();
  const bjj = page.locator('.trackerView');
  const belt = bjj.locator('#bjj-belt-display');
  const bar = belt.locator('.bjj-rank-bar');
  for (const [color, background] of [
    ['White', 'rgb(231, 238, 240)'], ['Blue', 'rgb(120, 197, 255)'],
    ['Purple', 'rgb(211, 166, 255)'], ['Brown', 'rgb(231, 180, 135)'],
    ['Black', 'rgb(23, 25, 29)'],
  ]) {
    await bjj.locator('#bjj-belt').selectOption(color);
    await expect(belt).toHaveCSS('background-color', background);
    await expect(bar).toHaveCSS('background-color', 'rgb(16, 17, 19)');
    await expect(bar).toHaveCSS('width', '72px');
    for (let count = 0; count <= 4; count++) {
      await bjj.locator('#bjj-stripes').selectOption(String(count));
      await expect(belt).toHaveAttribute('aria-label', `${color} belt, ${count} white ${count === 1 ? 'stripe' : 'stripes'}`);
      await expect(bar.locator('.bjj-stripe')).toHaveCount(count);
      if (count) {
        await expect(bar.locator('.bjj-stripe').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        const contained = await bar.evaluate(element => {
          const barRect = element.getBoundingClientRect();
          return Array.from(element.children).every(stripe => {
            const rect = stripe.getBoundingClientRect();
            return rect.left >= barRect.left && rect.right <= barRect.right && rect.top >= barRect.top && rect.bottom <= barRect.bottom;
          });
        });
        expect(contained).toBe(true);
        if (count === 4) {
          const spacing = await bar.evaluate(element => {
            const stripes = Array.from(element.children, stripe => stripe.getBoundingClientRect());
            return stripes.slice(1).map((stripe, index) => stripe.left - stripes[index].right);
          });
          for (const gap of spacing) expect(gap).toBeGreaterThanOrEqual(6);
        }
      }
    }
  }
});

for (const width of [320, 1440]) {
  test(`BJJ details indicator reflects saved description or video at ${width}px`, async ({ page }) => {
    const state = tracker.emptyState();
    state.bjj.belt = 'Blue';
    const skill = {
      type: 'Pass', positions: [], practice: 'unset', live: 'unset',
      preference: 'unset', mastered: false, workOnNext: false,
    };
    state.bjj.skills = [
      { ...skill, id: 'empty', name: 'Empty', description: '  ', link: '' },
      { ...skill, id: 'description', name: 'Description only', description: 'Technique notes', link: '' },
      { ...skill, id: 'video', name: 'Video only', description: '', link: 'https://youtu.be/example' },
      { ...skill, id: 'both', name: 'Both', description: 'Notes', link: 'https://youtu.be/example' },
    ];
    await page.addInitScript(seed => localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed)), state);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    await page.locator('.overview-bjj').click();
    const bjj = page.locator('.trackerView');
    const cards = width <= 1350;
    const list = bjj.locator(cards ? '#bjj-cards' : '#bjj-list');
    const indicator = (name: string) => cards
      ? bjj.locator('.bjj-card').filter({ has: page.getByText(name, { exact: true }) }).locator('.bjj-card-details > summary')
      : bjj.getByRole('button', { name: `Details for ${name}` });
    if (cards) {
      for (const name of ['Empty', 'Description only', 'Video only', 'Both']) {
        await bjj.locator('.bjj-card').filter({ has: page.getByText(name, { exact: true }) }).locator(':scope > summary').click();
      }
    }
    await expect(indicator('Empty')).toHaveCSS('color', 'rgb(169, 189, 195)');
    for (const name of ['Description only', 'Video only', 'Both']) {
      await expect(indicator(name)).toHaveCSS('color', 'rgb(120, 197, 255)');
    }
    await indicator('Empty').click();
    await list.getByLabel('Edit description for Empty').click();
    await bjj.locator('#bjj-text').fill('New notes');
    await bjj.getByRole('button', { name: 'Save description' }).click();
    await expect(indicator('Empty')).toHaveCSS('color', 'rgb(120, 197, 255)');
    await list.getByLabel('Edit description for Empty').click();
    await bjj.locator('#bjj-text').fill('');
    await bjj.getByRole('button', { name: 'Save description' }).click();
    await expect(indicator('Empty')).toHaveCSS('color', 'rgb(169, 189, 195)');
    const video = list.getByLabel('Video link for Empty');
    await video.fill('https://youtu.be/new');
    await video.dispatchEvent('change');
    await expect(indicator('Empty')).toHaveCSS('color', 'rgb(120, 197, 255)');
    await list.getByLabel('Video link for Empty').fill('');
    await list.getByLabel('Video link for Empty').dispatchEvent('change');
    await expect(indicator('Empty')).toHaveCSS('color', 'rgb(169, 189, 195)');
  });
}

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
