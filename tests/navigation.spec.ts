import { test, expect } from '@playwright/test';

for (const width of [640, 744, 1024, 1440]) {
  test(`sidebar toggles and remembers its state at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const toggle = nav.getByRole('button', { name: 'Expand navigation' });
    const dashboard = nav.getByRole('button', { name: 'Dashboard', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toHaveCSS('width', '72px');
    await expect(dashboard.locator('.navLabel')).toBeHidden();
    await expect(nav.getByRole('button', { name: 'Admin' })).toHaveAttribute('title', 'Admin');
    const collapsedMainWidth = await page.locator('.mainArea').evaluate(element => element.getBoundingClientRect().width);

    await toggle.focus();
    await page.keyboard.press('Enter');
    const collapse = nav.getByRole('button', { name: 'Collapse navigation' });
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toHaveCSS('width', '232px');
    await expect(dashboard.locator('.navLabel')).toBeVisible();
    const expandedMainWidth = await page.locator('.mainArea').evaluate(element => element.getBoundingClientRect().width);
    expect(collapsedMainWidth - expandedMainWidth).toBe(160);
    await nav.getByRole('button', { name: 'Weight Tracker' }).click();
    await expect(page.locator('.topBar').getByRole('heading', { name: 'Weight Tracker' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Weight Tracker' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.appRoot')).toHaveAttribute('data-theme', 'weight');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await page.reload();
    await expect(nav.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('aria-expanded', 'true');
    await nav.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(nav).toHaveCSS('width', '72px');
    await page.reload();
    await expect(nav.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false');
  });
}

for (const width of [640, 1440]) {
  test(`all sidebar destinations work expanded and collapsed at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5188');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const expanded of [false, true]) {
      if (expanded) await nav.getByRole('button', { name: 'Expand navigation' }).click();
      for (const [label, heading] of [
        ['Dashboard', 'Dashboard'],
        ['Budget Tracker', 'Budget Tracker'],
        ['Salary Tracker', 'Salary Tracker'],
        ['Mercy Tracker', 'Mercy Tracker'],
        ['Champion Builds Tracker', 'Champion Builds Tracker'],
        ['BJJ Tracker', 'BJJ Tracker'],
        ['Weight Tracker', 'Weight Tracker'],
        ['Admin', 'Administration'],
      ]) {
        await nav.getByRole('button', { name: label, exact: true }).click();
        await expect(page.locator('.topBar').getByRole('heading', { name: heading, exact: true })).toBeVisible();
        await expect(nav.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
    }
  });
}

test('phone navigation remains unchanged and preserves the sidebar choice on resize', async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 900 });
  await page.goto('http://127.0.0.1:5188');
  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole('navigation', { name: 'Main navigation', includeHidden: true })).toBeHidden();
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobile).toBeVisible();
  await mobile.getByRole('button', { name: 'More' }).click();
  await mobile.getByRole('button', { name: 'Admin' }).click();
  await expect(page.locator('.topBar').getByRole('heading', { name: 'Administration' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 744, height: 900 });
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-current', 'page');
});
