import { test, expect, type Page } from '@playwright/test';
import tracker from '../src/tracker/tracker.js';

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function openBjj(page: Page, width: number, prepare?: (state: ReturnType<typeof tracker.emptyState>) => void) {
  const state = tracker.emptyState();
  state.version = 18;
  const skill = { type: 'Submission', positions: ['Closed guard'], description: '', link: '', practice: 'learning' as const, live: 'not_yet' as const, preference: 'low' as const, mastered: false, workOnNext: false };
  state.bjj.skills = [
    { ...skill, id: 'armbar', name: 'Armbar' },
    { ...skill, id: 'triangle', name: 'Triangle' },
    { ...skill, id: 'guard', name: 'Guard', type: 'Position', positions: [] },
  ];
  prepare?.(state);
  await page.addInitScript(seed => {
    if (!sessionStorage.getItem('bjj-journal-seeded')) {
      localStorage.setItem('mercy-ledger-v1', JSON.stringify(seed));
      sessionStorage.setItem('bjj-journal-seeded', '1');
    }
  }, state);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('http://127.0.0.1:5188');
  await page.locator('.overview-bjj').click();
  return page.locator('.trackerView');
}

for (const width of [320, 1440]) {
  test(`BJJ class and roll notes track move history and partner strategies at ${width}px`, async ({ page }) => {
    const bjj = await openBjj(page, width);
    const mobile = width <= 1350;
    const list = bjj.locator(mobile ? '#bjj-cards' : '#bjj-list');
    if (mobile) {
      const card = list.locator('.bjj-card').filter({ has: page.getByText('Armbar', { exact: true }) });
      await card.locator(':scope > summary').click();
      await card.locator('.bjj-card-details > summary').click();
    } else await list.getByRole('button', { name: 'Details for Armbar' }).click();
    await list.getByLabel('Black Lotus lesson plan: Armbar').check();
    await expect(bjj.locator('#bjj-move-history')).toContainText('Practiced: Never · Tried: Never · Landed: Never');
    await expect(bjj.locator('#bjj-move-history')).toContainText('Triangle');
    await expect(bjj.locator('#bjj-move-history')).not.toContainText('Guard');
    await bjj.locator('#bjj-history-search').fill('triangle');
    await expect(bjj.locator('.bjj-history-item').filter({ hasText: 'Armbar' })).toBeHidden();
    await bjj.locator('#bjj-history-search').clear();

    await bjj.getByRole('button', { name: 'Add class note' }).click();
    const dialog = bjj.getByRole('dialog', { name: 'Add class note' });
    await dialog.getByLabel('DATE', { exact: true }).fill(localDate(-1));
    await dialog.getByLabel('NOTES', { exact: true }).fill('Worked on guard attacks.');
    await expect(dialog.getByLabel('Practiced Triangle')).toBeVisible();
    await expect(dialog.getByLabel('Practiced Guard')).toHaveCount(0);
    await dialog.locator('#bjj-journal-search').fill('triangle');
    await expect(dialog.getByLabel('Practiced Armbar')).toBeHidden();
    await dialog.locator('#bjj-journal-search').clear();
    await dialog.getByLabel('Practiced Armbar').check();
    await dialog.getByRole('button', { name: 'Save note' }).click();
    await expect(dialog).toBeHidden();
    await expect(bjj.locator('#bjj-move-history')).toContainText(`Practiced: ${localDate(-1)} · Tried: Never · Landed: Never`);

    await bjj.getByRole('button', { name: 'Add roll note', exact: true }).click();
    const roll = bjj.getByRole('dialog', { name: 'Add roll note' });
    await expect(roll.locator('.bjj-journal-move').filter({ hasText: 'Armbar' })).toContainText(`Practiced: ${localDate(-1)} · Tried: Never · Landed: Never`);
    await roll.getByLabel('PARTNER', { exact: true }).fill('Training partner');
    await roll.getByLabel('NOTES', { exact: true }).fill('Kept a strong frame.');
    await roll.getByLabel('STRATEGY FOR NEXT TIME').fill('Break grips first.');
    await roll.getByLabel('Armbar in this roll').selectOption('landed');
    await roll.getByRole('button', { name: 'Save note' }).click();
    await expect(bjj.locator('#bjj-move-history')).toContainText(`Practiced: ${localDate(-1)} · Tried: ${localDate()} · Landed: ${localDate()}`);
    await bjj.locator('#bjj-roll-list > .bjj-journal-list > details > summary').click();
    await bjj.getByRole('button', { name: 'Add roll note for Training partner' }).click();
    await expect(roll.getByLabel('PARTNER', { exact: true })).toHaveValue('Training partner');
    await roll.getByLabel('PARTNER', { exact: true }).fill('training partner');
    await expect(roll.locator('#bjj-previous-strategy')).toContainText('Break grips first.');
    await roll.getByLabel('Armbar in this roll').selectOption('attempted');
    await roll.getByLabel('STRATEGY FOR NEXT TIME').fill('Use a different grip.');
    await roll.getByRole('button', { name: 'Save note' }).click();
    await expect(bjj.locator('#bjj-roll-list .bjj-partner-group')).toHaveCount(1);
    await expect(bjj.locator('#bjj-move-history').locator('.bjj-history-item').filter({ hasText: 'Armbar' })).toContainText('Class sessions: 1 · Roll sessions: 2 · Landed: 1');
    await bjj.getByRole('button', { name: 'Add roll note', exact: true }).click();
    await roll.getByLabel('PARTNER', { exact: true }).fill('Training partner');
    await expect(roll.locator('#bjj-previous-strategy')).toContainText('Use a different grip.');
    await roll.getByRole('button', { name: 'Cancel' }).click();

    await page.reload();
    await page.locator('.overview-bjj').click();
    await expect(bjj.locator('#bjj-roll-list .bjj-journal-entry')).toHaveCount(2);
    await expect(bjj.locator('#bjj-class-list .bjj-journal-entry')).toHaveCount(1);
    await bjj.locator('#bjj-class-list summary').click();
    await bjj.getByRole('button', { name: `Edit class note ${localDate(-1)}` }).click();
    const edit = bjj.getByRole('dialog', { name: 'Edit class note' });
    await edit.getByLabel('NOTES', { exact: true }).fill('Updated class notes.');
    await edit.getByLabel('Practiced Armbar').uncheck();
    await edit.getByRole('button', { name: 'Save note' }).click();
    await expect(bjj.locator('#bjj-move-history')).toContainText(`Practiced: Never · Tried: ${localDate()} · Landed: ${localDate()}`);
    await bjj.locator('#bjj-class-list summary').click();
    await expect(bjj.locator('#bjj-class-list')).toContainText('Updated class notes.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('BJJ supplied move list requires review and excludes standalone positions', async ({ page }) => {
  const bjj = await openBjj(page, 1440);
  await bjj.getByRole('button', { name: 'Review move list' }).click();
  const review = bjj.getByRole('dialog', { name: 'Review move list' });
  await review.locator('#bjj-review-move').selectOption({ label: 'Armbar' });
  await expect(review.locator('#bjj-review-action option[value="skill:guard"]')).toHaveCount(0);
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(state.bjj.skills).toHaveLength(3);
  expect(state.bjj.blackLotusSkillIds).toEqual([]);
  await review.locator('#bjj-review-action').selectOption('new');
  await review.getByRole('button', { name: 'Apply choice' }).click();
  await expect(review.locator('#bjj-review-error')).toContainText('already exists');
  await review.locator('#bjj-review-action').selectOption('skill:armbar');
  await review.getByRole('button', { name: 'Apply choice' }).click();
  await expect(review).toContainText('Armbar is tagged Black Lotus.');
  await review.locator('#bjj-review-move').selectOption({ label: 'Scissor Sweep' });
  await review.locator('#bjj-review-action').selectOption('new');
  await review.getByRole('button', { name: 'Apply choice' }).click();
  await expect(review).toContainText('Scissor Sweep is tagged Black Lotus.');
  await review.getByRole('button', { name: 'Close' }).click();
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(state.bjj.skills).toHaveLength(4);
  expect(state.bjj.blackLotusSkillIds).toContain('armbar');
  expect(state.bjj.blackLotusSkillIds).toContain(state.bjj.skills.find((item: { name: string }) => item.name === 'Scissor Sweep').id);
  expect(state.bjj.blackLotusSkillIds).not.toContain('triangle');
  expect(state.bjj.skills.find((item: { name: string }) => item.name === 'Scissor Sweep').type).toBe('Other');
  expect(state.bjj.blackLotusSkillIds).not.toContain('guard');
});

test('deleting a tagged skill preserves historical moves when editing notes', async ({ page }) => {
  const bjj = await openBjj(page, 1440);
  const list = bjj.locator('#bjj-list');
  await list.getByRole('button', { name: 'Details for Armbar' }).click();
  await list.getByLabel('Black Lotus lesson plan: Armbar').check();
  await bjj.getByRole('button', { name: 'Add class note' }).click();
  const note = bjj.getByRole('dialog', { name: 'Add class note' });
  await note.getByLabel('NOTES', { exact: true }).fill('Review the setup.');
  await note.getByLabel('Practiced Armbar').check();
  await note.getByRole('button', { name: 'Save note' }).click();
  page.once('dialog', dialog => dialog.accept());
  await list.getByRole('button', { name: 'Delete Armbar' }).click();
  await bjj.locator('#bjj-class-list summary').click();
  await expect(bjj.locator('#bjj-class-list')).toContainText('Armbar');
  await bjj.getByRole('button', { name: `Edit class note ${localDate()}` }).click();
  const edit = bjj.getByRole('dialog', { name: 'Edit class note' });
  await expect(edit.getByLabel('Practiced Armbar')).toHaveCount(0);
  await expect(edit.locator('#bjj-journal-preserved')).toContainText('Armbar');
  await edit.getByRole('button', { name: 'Save note' }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(state.bjj.blackLotusSkillIds).not.toContain('armbar');
  expect(state.bjj.classNotes[0].moves[0]).toEqual({ skillId: 'armbar', name: 'Armbar' });
});

test('changing a recorded skill to Position preserves its roll history on edit', async ({ page }) => {
  const bjj = await openBjj(page, 1440);
  await bjj.getByRole('button', { name: 'Add roll note', exact: true }).click();
  const note = bjj.getByRole('dialog', { name: 'Add roll note' });
  await note.getByLabel('PARTNER', { exact: true }).fill('Jacob');
  await note.getByLabel('Triangle in this roll').selectOption('landed');
  await note.getByRole('button', { name: 'Save note' }).click();
  const picker = bjj.locator('#bjj-list details.bjj-type-picker').filter({ has: page.getByLabel('Type for Triangle: Submission') });
  await picker.locator('summary').click();
  await picker.getByRole('button', { name: 'Position', exact: true }).click();
  await expect(bjj.locator('#bjj-move-history')).not.toContainText('Triangle');
  await bjj.locator('#bjj-roll-list .bjj-partner-group > summary').click();
  await bjj.locator('#bjj-roll-list .bjj-journal-entry > summary').click();
  await bjj.getByRole('button', { name: `Edit roll note ${localDate()} for Jacob` }).click();
  const edit = bjj.getByRole('dialog', { name: 'Edit roll note' });
  await expect(edit.getByLabel('Triangle in this roll')).toHaveCount(0);
  await expect(edit.locator('#bjj-journal-preserved')).toContainText('Triangle');
  await edit.getByRole('button', { name: 'Save note' }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy-ledger-v1')!));
  expect(state.bjj.rollNotes[0].moves).toEqual([{ skillId: 'triangle', name: 'Triangle', result: 'landed' }]);
});

for (const width of [320, 1440]) {
  test(`delete buttons remove class and roll notes with confirmation at ${width}px`, async ({ page }) => {
    const bjj = await openBjj(page, width);
    await bjj.getByRole('button', { name: 'Add class note' }).click();
    const classNote = bjj.getByRole('dialog', { name: 'Add class note' });
    await classNote.getByLabel('Practiced Armbar').check();
    await classNote.getByRole('button', { name: 'Save note' }).click();
    const deleteClass = bjj.getByRole('button', { name: `Delete class note ${localDate()}` });
    await expect(deleteClass).toBeVisible();
    page.once('dialog', dialog => dialog.dismiss());
    await deleteClass.click();
    await expect(bjj.locator('#bjj-class-list .bjj-journal-entry')).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept());
    await deleteClass.click();
    await expect(bjj.locator('#bjj-class-list')).toContainText('No class notes yet.');
    await expect(bjj.locator('#bjj-move-history').locator('.bjj-history-item').filter({ hasText: 'Armbar' })).toContainText('Class sessions: 0');

    await bjj.getByRole('button', { name: 'Add roll note', exact: true }).click();
    const roll = bjj.getByRole('dialog', { name: 'Add roll note' });
    await roll.getByLabel('PARTNER', { exact: true }).fill('Jacob');
    await roll.getByLabel('Armbar in this roll').selectOption('landed');
    await roll.getByRole('button', { name: 'Save note' }).click();
    await bjj.locator('#bjj-roll-list .bjj-partner-group > summary').click();
    const deleteRoll = bjj.getByRole('button', { name: `Delete roll note ${localDate()} for Jacob` });
    await expect(deleteRoll).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await deleteRoll.click();
    await expect(bjj.locator('#bjj-roll-list')).toContainText('No roll notes yet.');
    await expect(bjj.locator('#bjj-move-history').locator('.bjj-history-item').filter({ hasText: 'Armbar' })).toContainText('Roll sessions: 0 · Landed: 0');
    await page.reload();
    await page.locator('.overview-bjj').click();
    await expect(bjj.locator('#bjj-class-list')).toContainText('No class notes yet.');
    await expect(bjj.locator('#bjj-roll-list')).toContainText('No roll notes yet.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('Black Lotus boost affects move history and learning priorities', async ({ page }) => {
  const bjj = await openBjj(page, 1440, state => {
    state.version = 20;
    state.bjj.blackLotusSkillIds = ['armbar'];
    state.bjj.skills[0].practice = 'sometimes';
    state.bjj.skills[0].live = 'sometimes';
    state.bjj.skills[1].practice = 'learning';
    state.bjj.skills[1].live = 'consistently';
    state.bjj.classNotes = [
      { id: 'one', date: localDate(-1), notes: '', moves: [{ skillId: 'armbar', name: 'Armbar' }] },
      { id: 'two', date: localDate(-7), notes: '', moves: [{ skillId: 'triangle', name: 'Triangle' }] },
    ];
  });
  await expect(bjj.locator('#bjj-priorities .bjj-priority-card strong')).toHaveText(['Armbar', 'Triangle', 'Guard']);
  await expect(bjj.locator('#bjj-priorities .bjj-priority-card').first()).toContainText('75%');
  await expect(bjj.locator('#bjj-move-history .bjj-history-item strong')).toHaveText(['Armbar', 'Triangle']);
  await bjj.getByRole('button', { name: 'Add class note' }).click();
  await expect(bjj.locator('#bjj-journal-moves .bjj-journal-move strong')).toHaveText(['Armbar', 'Triangle']);
  await bjj.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.locator('.overview-bjj li span')).toHaveText(['Armbar', 'Triangle', 'Guard']);
});
