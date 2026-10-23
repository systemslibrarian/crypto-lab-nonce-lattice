import { expect, test } from '@playwright/test';

test('saved fixed-prefix text is escaped and rejected without creating markup', async ({ page }) => {
  const payload = '"><img data-xss src=x onerror="document.body.dataset.pwned=1">';
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify({
      curve: 'secp256k1',
      leakMode: 'fixed-prefix',
      leakedBits: 24,
      signatureCount: 12,
      fixedPrefixVariant: 'random-tail',
      fixedPrefixValue: value,
    }));
  }, { key: 'nonce-lattice-config', value: payload });

  await page.goto('.');
  await expect(page.locator('.summary-line')).toContainText('Fixed prefix must contain hexadecimal digits only');
  await expect(page.locator('[data-xss]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-pwned');
  await expect(page.locator('input[name="fixedPrefixValue"]')).toHaveValue(payload);
});

test('an impossible constant prefix fails promptly instead of hanging the worker', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('.loading-label')).toHaveCount(0, { timeout: 60_000 });
  await page.locator('select[name="leakMode"]').selectOption('fixed-prefix');
  await page.locator('select[name="fixedPrefixVariant"]').selectOption('constant-nonce');
  await page.locator('input[name="leakedBits"]').fill('24');
  await page.locator('input[name="fixedPrefixValue"]').fill('0');
  await page.locator('.primary-button').click();
  await expect(page.locator('.summary-line')).toContainText(
    'selected prefix would produce an invalid constant nonce',
    { timeout: 10_000 },
  );
});
