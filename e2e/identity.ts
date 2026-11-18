/* Is this server serving THIS lab?
 *
 * Every suite in the fleet begins by navigating to a port and asserting on
 * whatever answers. Nothing checked whose server that was. Measured across the
 * fleet on 2026-11-17: seven pairs of labs were bound to one port, eight
 * browser suites were aimed at a port belonging to another lab or to nothing,
 * and one lab's accessibility audit had never run at all — it died on
 * connection-refused every time and reported no violations, which reads exactly
 * like a clean gate. When it was pointed at its own port it immediately found a
 * real WCAG 2.5.3 failure that had been shipping.
 *
 * The ports are fixed now (crypto-lab/tools/playwright-ports.json, enforced by
 * port-sync). This is the half that does not depend on getting a number right:
 * before the first assertion, confirm the document really is this lab's.
 *
 * HOW IDENTITY IS ESTABLISHED, with no per-lab configuration. A lab is served
 * under its own base path — `/crypto-lab-<slug>/` — so Vite stamps that slug
 * into every asset URL in the built page, and most labs also carry it in
 * og:url or a canonical link. The expected slug is therefore read from the
 * suite's OWN baseURL, and the served document must mention it. Nothing to
 * choose per lab, nothing to keep in step with index.html.
 *
 * A lab served from the root (no base path) has no slug to look for; pass
 * `marker` for those — a selector that exists in this lab and in no other.
 */
import { expect, type Page } from '@playwright/test';

export interface IdentityOptions {
  /** For a lab served at `/` rather than `/crypto-lab-<slug>/`. */
  marker?: string;
}

/** Navigate to `path` and refuse to continue unless this lab answered. */
export async function assertThisLab(page: Page, path = '.', opts: IdentityOptions = {}) {
  const response = await page.goto(path);
  const url = new URL(page.url());
  const status = response?.status() ?? 0;
  const slug = /^\/(crypto-lab-[a-z0-9-]+)\//.exec(url.pathname)?.[1] ?? null;

  const describe = async () => {
    const title = await page.title().catch(() => '');
    const asset = await page
      .locator('script[src], link[href]')
      .first()
      .evaluate((el) => el.getAttribute('src') ?? el.getAttribute('href'))
      .catch(() => null);
    return `HTTP ${status}; title ${JSON.stringify(title)}; first asset ${JSON.stringify(asset)}`;
  };

  if (status >= 400) {
    throw new Error(
      `Expected ${slug ?? 'this lab'} at ${url.href}, and the server refused: ${await describe()}.\n` +
        'Something else is listening on that port, or this lab is not built.',
    );
  }

  if (opts.marker) {
    if ((await page.locator(opts.marker).count()) === 0) {
      throw new Error(
        `Expected this lab at ${url.href}, identified by ${opts.marker}, which is absent: ${await describe()}.\n` +
          'Another app is almost certainly serving that port.',
      );
    }
    return;
  }

  if (!slug) {
    throw new Error(
      `Cannot identify this lab from baseURL ${url.href}: it names no /crypto-lab-<slug>/ path.\n` +
        'Pass a marker selector to assertThisLab for a lab served from the root.',
    );
  }

  const html = await page.content();
  if (!html.includes(slug)) {
    throw new Error(
      `Expected ${slug} at ${url.href}, and the page served is not it: ${await describe()}.\n` +
        `The document never mentions ${slug}, so another lab or project holds that port.`,
    );
  }

  expect(status, 'the lab answered').toBeLessThan(400);
}
