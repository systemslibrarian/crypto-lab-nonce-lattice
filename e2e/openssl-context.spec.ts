import { expect, test } from '@playwright/test';

test('OpenSSL case preserves the attack conditions and simulation boundary', async ({ page }) => {
  await page.goto('.');
  await page.locator('.history-section > summary').click();
  const item = page.locator('[data-openssl-case]');
  await item.locator('summary').click();
  await expect(item).toBeVisible();
  await expect(item).toContainText('Many timing measurements may enable');
  await expect(item).toContainText('does not establish universal practical exploitation');
  await expect(item).toContainText('P-256, P-384 and P-521 implementations are unaffected by this CVE');
  await expect(item).toContainText('does not measure timing or reproduce the OpenSSL vulnerability');
  await expect(item.locator('a')).toHaveAttribute('href', 'https://openssl-library.org/news/secadv/20260929.txt');
});
