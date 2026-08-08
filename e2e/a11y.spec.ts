import { test } from '@playwright/test';
import { boot, driveAllStates, NARROW } from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * Every attack preset is run and every step panel walked, in both themes at
 * desktop and phone width. See `gate.ts` for why nothing is injected into the
 * page, why each scan asserts its content first, and why `violations` is not
 * the whole oracle.
 */

for (const theme of ['dark', 'light'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page, theme);
    await driveAllStates(page, theme);
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
  });
}
