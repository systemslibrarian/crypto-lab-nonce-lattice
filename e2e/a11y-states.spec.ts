import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function reveal(page: Page): Promise<void> {
  await page.addStyleTag({ content: `*, *::before, *::after { animation:none!important; transition:none!important; opacity:1!important; }` });
  await page.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll('details'))) (d as HTMLDetailsElement).open = true;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[hidden]'))) el.removeAttribute('hidden');
  });
}
async function scan(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }))).toEqual([]);
}
async function runPreset(page: Page, preset: string): Promise<void> {
  await page.locator(`[data-preset="${preset}"]`).click();
  // The guided walkthrough gates panels behind step tabs; the recovery banner lives on
  // the final "Extract" step. Wait for the tabs to appear, open Extract, then let it settle.
  await page.locator('[data-step-tab="extract"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-step-tab="extract"]').click();
  await page.locator('.recovery-banner').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500);
}

for (const theme of ['dark', 'light'] as const) {
  test(`PS3 nonce-reuse state a11y (${theme})`, async ({ page }) => {
    await page.goto('.');
    if (theme === 'light') { await page.locator('#cl-theme-toggle').click(); }
    await runPreset(page, 'ps3');
    await reveal(page);
    await scan(page);
  });
  test(`defender/fail state a11y (${theme})`, async ({ page }) => {
    await page.goto('.');
    if (theme === 'light') { await page.locator('#cl-theme-toggle').click(); }
    await runPreset(page, 'defender');
    await reveal(page);
    await scan(page);
  });
}
