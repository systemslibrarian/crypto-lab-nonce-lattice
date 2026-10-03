import { expect, test, type Page } from '@playwright/test';

/**
 * Wait until `selector` resolves to an element that SURVIVES from one poll to
 * the next, i.e. the app has stopped replacing it.
 *
 * This app re-renders its panel after first paint and the re-render replaces
 * the <details> nodes wholesale. Everything that followed from not knowing that
 * failed in a different way: clicking straight after load timed out at 30s on
 * CI (the node the click was aimed at no longer existed), scrolling it into
 * view raised "Element is not attached to the DOM", and retrying the click
 * inside a poll double-toggled the section shut, because a click slow enough to
 * hit its own timeout still lands.
 *
 * Marking the node and checking the mark is still there one poll later is a
 * direct test of "the DOM stopped moving", which is the actual precondition.
 */
async function waitUntilSettled(page: Page, selector: string, label: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sel) => {
          const el = document.querySelector(sel) as (HTMLElement & { __settleMark?: boolean }) | null;
          if (!el) return false;
          if (el.__settleMark) return true;
          el.__settleMark = true;
          return false;
        }, selector),
      { timeout: 20_000, message: `${label} kept being re-rendered` },
    )
    .toBe(true);
}

/** Open a <details> once the DOM has settled, then wait for it to report open. */
async function openDetails(page: Page, selector: string, label: string): Promise<void> {
  await waitUntilSettled(page, selector, label);
  const details = page.locator(selector);
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await details.locator('xpath=./summary').click({ timeout: 15_000 });
  }
  await expect(details, `${label} should be open`).toHaveJSProperty('open', true);
}

test('OpenSSL case preserves the attack conditions and simulation boundary', async ({ page }) => {
  await page.goto('.');

  // WAIT FOR THE ANALYSIS TO LAND FIRST. app.ts rerender() does
  // `root.innerHTML = renderApp(state)` -- it replaces the whole DOM -- and it
  // runs again when the sweep worker returns. Anything opened before that is
  // destroyed with the node it was on, which is the root cause of every way
  // this test has failed. While the sweep is running the summary carries a
  // .loading-label spinner, so its absence is the signal that the last
  // re-render has happened.
  await expect(page.locator('.loading-label')).toHaveCount(0, { timeout: 60_000 });

  // The case studies live inside the collapsed History & context section, so
  // that has to be open before anything inside it can be clicked.
  await openDetails(page, '.history-section', 'the History & context section');

  const item = page.locator('[data-openssl-case]');
  await openDetails(page, '[data-openssl-case]', 'the OpenSSL case');

  await expect(item).toBeVisible();
  await expect(item).toContainText('Many timing measurements may enable');
  await expect(item).toContainText('does not establish universal practical exploitation');
  await expect(item).toContainText('P-256, P-384 and P-521 implementations are unaffected by this CVE');
  await expect(item).toContainText('does not measure timing or reproduce the OpenSSL vulnerability');
  await expect(item.locator('a')).toHaveAttribute('href', 'https://openssl-library.org/news/secadv/20260929.txt');
});
