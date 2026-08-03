import { expect, test, type Page } from '@playwright/test';

/**
 * The feasibility gauge used to draw two modelled curves and never check them.
 * "Measure this column" runs the real attack instead — several complete
 * end-to-end recoveries per leak size — and reports the rate it observed. These
 * tests assert that the numbers on screen are that measurement: the table's
 * counts must be consistent with its own percentages, the measured boundary
 * must be a rung the table shows succeeding, and every refusal branch must
 * decline instead of drawing a boundary it did not measure.
 */

async function settle(page: Page): Promise<void> {
  await expect(page.locator('.summary-line')).not.toContainText('Running lattice analysis', {
    timeout: 90_000,
  });
}

async function openApp(page: Page): Promise<void> {
  await page.goto('.');
  await settle(page);
}

async function configure(page: Page, leakMode: string, sigs: number): Promise<void> {
  await page.locator('select[name="leakMode"]').selectOption(leakMode);
  await page.locator('input[name="signatureCount"]').fill(String(sigs));
  // The gauge re-renders on input; give it the event the form listens for.
  await page.locator('input[name="signatureCount"]').dispatchEvent('input');
}

async function measure(page: Page): Promise<void> {
  await page.locator('[data-measure-boundary]').click();
  await expect(page.locator('[data-measure-boundary]')).toBeEnabled({ timeout: 180_000 });
}

test('the measured sweep runs real attacks and its verdict follows its own table', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openApp(page);
  await configure(page, 'msb', 10);
  await measure(page);

  const table = page.locator('[data-sweep-table]');
  await expect(table).toBeVisible();
  await expect(table.locator('caption')).toContainText('10 signatures');

  // Every rung must have actually run: no "queued"/"not run" cells left behind.
  const rows = table.locator('tbody tr');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(1);
  await expect(table.locator('.sweep-row.pending')).toHaveCount(0);

  // Read the measurement off the page and re-derive the claims from it.
  const observed: Array<{
    bits: number;
    recovered: number;
    trials: number;
    rate: number;
    elapsedMs: number;
  }> = [];
  for (let i = 0; i < rowCount; i += 1) {
    const cells = await rows.nth(i).locator('td').allTextContents();
    const bits = Number(cells[0].trim().split(/\s+/)[0]);
    const [recovered, trials] = cells[1].split('/').map((v) => Number(v.trim()));
    const rate = Number(cells[2].replace('%', '').trim());
    const elapsedMs = Number((cells[3].match(/\((\d+) ms\)/) ?? ['', '0'])[1]);
    observed.push({ bits, recovered, trials, rate, elapsedMs });
    // Every rung really ran the attack: a hardcoded table would cost no time.
    expect(elapsedMs, `elapsed at ${bits} bits`).toBeGreaterThan(0);
    // The percentage column must be the counts it sits next to.
    expect(rate, `rate at ${bits} bits`).toBe(Math.round((recovered / trials) * 100));
    expect(recovered).toBeLessThanOrEqual(trials);
    // The outcome wording must match the counts, not a fixed string.
    const outcome = cells[3];
    if (recovered === 0) expect(outcome).toContain('never recovered');
    else if (recovered === trials) expect(outcome).toContain('recovered every time');
    else expect(outcome).toContain('recovered sometimes');
  }

  // Rungs are consecutive and straddle the information floor, so at least one
  // rung the theory calls impossible was really run.
  for (let i = 1; i < observed.length; i += 1) {
    expect(observed[i].bits).toBe(observed[i - 1].bits + 1);
  }
  await expect(table.locator('.sweep-flag', { hasText: 'below floor' }).first()).toBeVisible();

  // External truth, not internal consistency: the ladder's bottom rung is two bits
  // under the information floor (240 bits of leakage against a 256-bit secret) and
  // its top rung is comfortably over it. A sweep that measures anything real must
  // separate the two. This is the assertion that fails if the worker ever reports
  // a verdict it did not compute from a run.
  const lowest = observed[0];
  const highest = observed[observed.length - 1];
  expect(highest.recovered, 'the top rung must recover at least once').toBeGreaterThan(0);
  expect(
    lowest.recovered,
    `bottom rung (${lowest.bits} bits) must do strictly worse than the top rung (${highest.bits} bits)`,
  ).toBeLessThan(highest.recovered);

  const verdict = page.locator('[data-sweep-verdict]');
  await expect(verdict).toBeVisible();
  const verdictText = (await verdict.innerText()).trim();

  const firstMajority = observed.find((o) => o.recovered / o.trials >= 0.5);
  if (firstMajority) {
    // The headline number must be a rung the table shows reaching a majority.
    expect(verdictText).toContain(`Measured boundary: ${firstMajority.bits} bits`);
    expect(verdictText).toContain('10 signatures');
    // And it must be compared against the drawn curve, in the right direction.
    expect(verdictText).toMatch(/BELOW the drawn practical curve|ABOVE the drawn practical curve|lands on the drawn practical curve/);
    // A measured column is plotted over the modelled curves.
    await expect(page.locator('.feasibility-svg .measured-dot')).toHaveCount(1);
    await expect(page.locator('.feasibility-plot-wrap')).toHaveAttribute(
      'aria-label',
      new RegExp(`Measured boundary points from real attack runs: ${firstMajority.bits} bits at 10 signatures`),
    );
  } else {
    expect(verdictText).toContain('no leak size in this ladder recovered the key on at least half');
    await expect(page.locator('.feasibility-svg .measured-dot')).toHaveCount(0);
  }

  // The ramp claim is only made when the table actually shows a partial rung.
  const ramp = observed.filter((o) => o.recovered > 0 && o.recovered < o.trials).map((o) => o.bits);
  if (ramp.length > 0) {
    expect(verdictText).toContain('The boundary is a ramp, not a line');
    for (const bits of ramp) expect(verdictText).toContain(String(bits));
  } else {
    expect(verdictText).not.toContain('The boundary is a ramp, not a line');
  }

  // The soft-floor note is made when, and only when, a rung under the floor did
  // recover — the extractor's candidate list can close a deficit of a bit or two.
  const belowFloorHit = observed.some((o) => o.recovered > 0 && o.bits < 256 / 10);
  expect(verdictText.includes('below the information floor still recovered')).toBe(belowFloorHit);
});

test('the sweep refuses, with the reason, where it cannot honestly measure', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);

  // 1. No leaked-bits axis at all.
  await configure(page, 'rfc6979', 12);
  await page.locator('[data-measure-boundary]').click();
  await expect(page.locator('[data-sweep-refusal]')).toContainText(
    'This leak mode has no leaked-bits axis to sweep',
  );
  await expect(page.locator('[data-sweep-table]')).toHaveCount(0);
  await expect(page.locator('.feasibility-svg .measured-dot')).toHaveCount(0);

  // 2. The whole column is under-determined: the floor is past the 32-bit control.
  await configure(page, 'msb', 4);
  await page.locator('[data-measure-boundary]').click();
  await expect(page.locator('[data-sweep-refusal]')).toContainText(
    'information floor is 64.0 bits per signature',
  );
  await expect(page.locator('[data-sweep-refusal]')).toContainText('no boundary here to measure');
  await expect(page.locator('[data-sweep-table]')).toHaveCount(0);

  // 3. Too expensive to run in a browser tab — declined, and labelled as this
  //    page's budget rather than a limit of the attack.
  await configure(page, 'msb', 32);
  await page.locator('[data-measure-boundary]').click();
  await expect(page.locator('[data-sweep-refusal]')).toContainText(
    "That limit is this page's budget, not a property of the attack",
  );
  await expect(page.locator('[data-sweep-table]')).toHaveCount(0);

  // And the escape hatch works: back to a measurable column, the table returns.
  await configure(page, 'msb', 8);
  await page.locator('[data-measure-boundary]').click();
  await expect(page.locator('[data-sweep-table]')).toBeVisible();
  await expect(page.locator('[data-measure-boundary]')).toBeEnabled({ timeout: 180_000 });
  await expect(page.locator('.sweep-row.pending')).toHaveCount(0);
});
