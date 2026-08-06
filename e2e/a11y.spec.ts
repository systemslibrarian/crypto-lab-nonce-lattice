import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Deploys are already gated on the crypto vectors;
 * this gates them on accessibility the same way. Scans the full page with
 * every collapsible expanded and animations neutralized, in both themes.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function revealEverything(page: Page): Promise<void> {
  // Neutralize animations/transitions/opacity so mid-fade phantom contrast
  // failures don't appear, and expand every collapsible region.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    for (const details of Array.from(document.querySelectorAll('details'))) {
      (details as HTMLDetailsElement).open = true;
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[hidden]'))) {
      el.removeAttribute('hidden');
    }
  });
  await expect(page.locator('h1')).toBeVisible();
}

async function checkGradientContrast(page: Page, selector: string) {
  const ratio = await page.evaluate((sel) => {
    function getLuminance(r: number, g: number, b: number) {
      const a = [r, g, b].map(function (v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element ${sel} not found`);
    const style = window.getComputedStyle(el);
    const textMatch = style.color.match(/\d+/g);
    if (!textMatch) return 0;
    const [r1, g1, b1] = textMatch.map(Number);
    const l1 = getLuminance(r1, g1, b1);

    const bgStr = style.backgroundImage;
    const bgMatches = Array.from(bgStr.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g));
    if (bgMatches.length === 0) return 100;

    let minRatio = Infinity;
    for (const match of bgMatches) {
      const r2 = parseInt(match[1], 10);
      const g2 = parseInt(match[2], 10);
      const b2 = parseInt(match[3], 10);
      const l2 = getLuminance(r2, g2, b2);
      const lightest = Math.max(l1, l2);
      const darkest = Math.min(l1, l2);
      const cr = (lightest + 0.05) / (darkest + 0.05);
      if (cr < minRatio) minRatio = cr;
    }
    return minRatio;
  }, selector);
  
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await revealEverything(page);
  await checkGradientContrast(page, '.primary-button');
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await revealEverything(page);
  await checkGradientContrast(page, '.primary-button');
  await scan(page);
});
