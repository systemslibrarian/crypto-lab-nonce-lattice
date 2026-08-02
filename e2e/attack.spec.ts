import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Functional gate for the load-bearing claims on the page.
 *
 * The a11y specs prove the page renders and is reachable; these prove it is *right*.
 * Wherever possible the expected value is computed from the numbers the run itself
 * printed — the private key is checked against the lattice coordinates on screen,
 * the Basis View lengths are recomputed from the displayed matrices, and the
 * feasibility badge is checked against the boundary formula the panel documents —
 * rather than pinned to a hardcoded string that a broken build could still emit.
 */

const CURVE_ORDER_LABEL = /secp256k1|P-256/;

/** The app renders synchronously into a "Running lattice analysis…" state the moment a
 *  run is queued, so waiting for that phrase to disappear is a reliable settle point. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('.summary-line')).not.toContainText('Running lattice analysis', {
    timeout: 90_000,
  });
}

async function openApp(page: Page): Promise<void> {
  await page.goto('.');
  // The app auto-runs the saved/default config on mount; let that finish before driving it.
  await settle(page);
}

async function runPreset(page: Page, preset: string): Promise<void> {
  await page.locator(`[data-preset="${preset}"]`).click();
  await settle(page);
}

async function step(page: Page, key: string): Promise<Locator> {
  await page.locator(`[data-step-tab="${key}"]`).click();
  const panel = page.locator(`#step-panel-${key}`);
  await expect(panel).toBeVisible();
  return panel;
}

/** Reads one full-precision integer matrix out of the Lattice View. */
async function readMatrix(block: Locator): Promise<bigint[][]> {
  const rows = await block.locator('.matrix-row').all();
  const out: bigint[][] = [];
  for (const row of rows) {
    out.push((await row.locator('.matrix-cell').allTextContents()).map((v) => BigInt(v.trim())));
  }
  return out;
}

function squaredLength(row: bigint[]): bigint {
  return row.reduce((sum, value) => sum + value * value, 0n);
}

function mod(value: bigint, m: bigint): bigint {
  const r = value % m;
  return r < 0n ? r + m : r;
}

function toHex(value: bigint, bytes: number): string {
  return value.toString(16).padStart(bytes * 2, '0');
}

async function keyCard(panel: Locator, label: string): Promise<string> {
  return (await panel.locator('.key-card', { hasText: label }).locator('code').innerText()).trim();
}

// ---------------------------------------------------------------------------
// Successful recovery: the headline verdict
// ---------------------------------------------------------------------------

for (const preset of ['fast-msb', 'fast-lsb', 'p256-prefix'] as const) {
  test(`${preset}: the recovered key is the signing key, byte for byte`, async ({ page }) => {
    await openApp(page);
    await runPreset(page, preset);

    const extract = await step(page, 'extract');
    const banner = extract.locator('.recovery-banner');
    await expect(banner).toHaveClass(/success/);
    await expect(banner).toContainText('PRIVATE KEY RECOVERED');

    // The verdict is only meaningful if the two keys on screen actually agree, so
    // compare them rather than trusting the banner.
    const signingKey = await keyCard(extract, 'Signing Key');
    const recoveredKey = await keyCard(extract, 'Recovered Key');
    expect(signingKey).toMatch(/^[0-9a-f]{64}$/);
    expect(recoveredKey).toBe(signingKey);

    // The byte grid must agree with the two hex strings above: every byte green,
    // none red, and the caption's byte count equal to the real key length.
    const byteCount = signingKey.length / 2;
    await expect(extract.locator('.key-byte.mismatch')).toHaveCount(0);
    await expect(extract.locator('.key-byte.match')).toHaveCount(byteCount * 2);
    await expect(extract.locator('.key-compare-caption')).toHaveClass(/success/);
    await expect(extract.locator('.key-compare-caption')).toContainText(
      `every one of the ${byteCount} bytes`,
    );

    await expect(extract.locator('.key-card', { hasText: 'Validation' })).toContainText(
      'byte-for-byte match',
    );
    await expect(extract.locator('.key-card', { hasText: 'Validation' })).toContainText(
      'all signatures verify',
    );

    // The whole pipeline strip must read as done — no rung left active or failed.
    await expect(page.locator('.pipeline-step')).toHaveCount(5);
    await expect(page.locator('.pipeline-step.failed')).toHaveCount(0);
    await expect(page.locator('.pipeline-step.done')).toHaveCount(5);

    // The elapsed time is quoted twice; the two must be the same measurement.
    const summary = (await page.locator('.summary-line').innerText()).trim();
    const elapsed = summary.match(/recovered the exact signing key in (\d+) ms/);
    expect(elapsed, `summary line was: ${summary}`).not.toBeNull();
    await expect(page.locator('.meta-grid article', { hasText: 'Worker runtime' })).toContainText(
      `${elapsed![1]} ms`,
    );
  });
}

test('the outlined short vector really carries the key: secretCoordinate / B mod n = d', async ({
  page,
}) => {
  await openApp(page);
  await runPreset(page, 'fast-msb');

  const reduce = await step(page, 'reduce');
  const blocks = reduce.locator('.matrix-block');
  await expect(blocks).toHaveCount(2);

  const before = await readMatrix(blocks.nth(0));
  const after = await readMatrix(blocks.nth(1));
  expect(before.length).toBeGreaterThan(3);
  expect(after.length).toBe(before.length);

  // Shape of the Nguyen-Shparlinski embedding, read straight off the screen:
  //   rows 0..N-1  : n on the diagonal   (n = the curve order)
  //   row  N       : [t_0 … t_{N-1}, B, 0]
  //   row  N+1     : [u_0 … u_{N-1}, 0, n·B]
  const sampleCount = before.length - 2;
  const n = before[0][0];
  const bound = before[sampleCount][sampleCount];
  const embeddingFactor = before[sampleCount + 1][sampleCount + 1];
  for (let i = 0; i < sampleCount; i += 1) {
    expect(before[i][i], `modulus row ${i} diagonal`).toBe(n);
  }
  expect(embeddingFactor).toBe(n * bound);

  // The winning row is the one the UI outlines; its marked cell is the secret coordinate.
  await expect(reduce.locator('.winning-row')).toHaveCount(1);
  await expect(reduce.locator('.secret-cell')).toHaveCount(1);
  const secretCoordinate = BigInt((await reduce.locator('.secret-cell').innerText()).trim());
  expect(secretCoordinate % bound, 'secret coordinate must be an exact multiple of B').toBe(0n);

  // The demo's one conceptual claim, recomputed here from the rendered integers.
  const quotient = secretCoordinate / bound;
  const candidates = [mod(quotient, n), mod(-quotient, n)].map((d) => toHex(d, 32));

  const bridgeKey = (await reduce.locator('.bridge-key').innerText()).trim();
  expect(candidates).toContain(bridgeKey);

  const extract = await step(page, 'extract');
  expect(await keyCard(extract, 'Signing Key')).toBe(bridgeKey);
  expect(await keyCard(extract, 'Recovered Key')).toBe(bridgeKey);
});

test('Basis View lengths are the real squared norms of the matrices shown', async ({ page }) => {
  await openApp(page);
  await runPreset(page, 'fast-msb');

  const reduce = await step(page, 'reduce');
  const blocks = reduce.locator('.matrix-block');
  const before = await readMatrix(blocks.nth(0));
  const after = await readMatrix(blocks.nth(1));

  const rows = await reduce.locator('table tbody tr').all();
  expect(rows.length).toBe(after.length);

  for (let i = 0; i < rows.length; i += 1) {
    const cells = await rows[i].locator('td').allTextContents();
    expect(cells[0].trim(), 'row numbering').toBe(String(i + 1));
    expect(BigInt(cells[1].trim()), `before-length row ${i + 1}`).toBe(squaredLength(before[i]));
    expect(BigInt(cells[2].trim()), `after-length row ${i + 1}`).toBe(squaredLength(after[i]));
  }

  // LLL is supposed to produce a *shorter* basis. The metric it actually minimises is the
  // column-scaled one the HNP embedding declares — the bound column counts as value/n,
  // every other column as value — so compare under that. (Everything is multiplied
  // through by n^2 to stay in exact integers.)
  const sampleCount = before.length - 2;
  const n = before[0][0];
  const scaled = (row: bigint[]): bigint =>
    row.reduce((sum, value, column) => {
      const term = column === sampleCount ? value : value * n;
      return sum + term * term;
    }, 0n);
  const minOf = (xs: bigint[]): bigint => xs.reduce((a, b) => (b < a ? b : a));
  const maxOf = (xs: bigint[]): bigint => xs.reduce((a, b) => (b > a ? b : a));
  const beforeScaled = before.map(scaled);
  const afterScaled = after.map(scaled);
  expect(minOf(afterScaled)).toBeLessThan(minOf(beforeScaled));
  expect(maxOf(afterScaled)).toBeLessThanOrEqual(maxOf(beforeScaled));

  // Structure of the embedding survives reduction: exactly one reduced vector keeps the
  // embedding coordinate, it holds +/- n*B, and it is the row the UI outlines as the winner.
  const embeddingFactor = before[sampleCount + 1][sampleCount + 1];
  const carriers = after
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row[row.length - 1] !== 0n);
  expect(carriers.length).toBe(1);
  const carrier = carriers[0];
  const tail = carrier.row[carrier.row.length - 1];
  expect(tail === embeddingFactor || tail === -embeddingFactor).toBe(true);
  const winningCells = (
    await reduce.locator('.winning-row').first().locator('.matrix-cell').allTextContents()
  ).map((v) => BigInt(v.trim()));
  expect(winningCells).toEqual(carrier.row);
});

test('the signature log holds exactly the run that was configured', async ({ page }) => {
  await openApp(page);
  await runPreset(page, 'fast-msb');

  const sign = await step(page, 'sign');
  const rows = sign.locator('tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(page.locator('.meta-grid article', { hasText: 'Signatures' })).toContainText('12');
  await expect(page.locator('.meta-grid article', { hasText: 'Curve' })).toContainText(
    CURVE_ORDER_LABEL,
  );

  // Row indices must run 1..N in order.
  const indices = await rows.locator('td:nth-child(1)').allTextContents();
  expect(indices.map((v) => v.trim())).toEqual(
    Array.from({ length: 12 }, (_v, i) => String(i + 1)),
  );

  // A correctly randomised nonce gives a distinct r per signature. This is the exact
  // property the PS3 preset violates, so it must hold here.
  const rValues = (await rows.locator('td:nth-child(2)').allTextContents()).map((v) => v.trim());
  expect(new Set(rValues).size).toBe(12);

  // The meta panel abbreviates the same signing key the recovery panel prints in full.
  const extract = await step(page, 'extract');
  const signingKey = await keyCard(extract, 'Signing Key');
  const metaKey = (
    await page.locator('.meta-grid article', { hasText: 'Signing Key' }).locator('code').innerText()
  ).trim();
  expect(signingKey.startsWith(metaKey.replace(/…$/, ''))).toBe(true);
});

// ---------------------------------------------------------------------------
// Nonce reuse — the PS3 path
// ---------------------------------------------------------------------------

test('PS3 preset: both signatures share r, and the two-line algebra yields the key', async ({
  page,
}) => {
  await openApp(page);
  await runPreset(page, 'ps3');

  const sign = await step(page, 'sign');
  await expect(sign.locator('tbody tr')).toHaveCount(2);
  const rValues = (await sign.locator('tbody tr td:nth-child(2)').allTextContents()).map((v) =>
    v.trim(),
  );
  // Reuse is *defined* by the repeated r; if these ever differ the preset is not
  // demonstrating the bug it claims to.
  expect(rValues[0]).toBe(rValues[1]);
  expect(new Set(rValues).size).toBe(1);

  const extract = await step(page, 'extract');
  await expect(extract.locator('.recovery-banner')).toHaveClass(/success/);
  const signingKey = await keyCard(extract, 'Signing Key');
  expect(await keyCard(extract, 'Recovered Key')).toBe(signingKey);
  await expect(extract.locator('.key-byte.mismatch')).toHaveCount(0);

  // The worked derivation must be showing this run's numbers, not a canned example:
  // its r must be the r in the log, and its d must be the recovered key.
  const derivation = extract.locator('.reuse-derivation');
  await expect(derivation).toBeVisible();
  const steps = derivation.locator('.derivation-step');
  await expect(steps).toHaveCount(3);

  const rLine = (await steps.nth(0).innerText()).trim();
  expect(rLine).toContain('r₁ = r₂');
  const rShown = rLine.match(/r₁ = r₂ = ([0-9a-f]+)…?/);
  expect(rShown, `derivation step 1 was: ${rLine}`).not.toBeNull();
  expect(rValues[0].replace(/\.+$/, '')).toContain(rShown![1].slice(0, 12));

  const dLine = (await steps.nth(2).innerText()).trim();
  const dShown = dLine.match(/d = ([0-9a-f]+)…([0-9a-f]+)\s*$/);
  expect(dShown, `derivation step 3 was: ${dLine}`).not.toBeNull();
  expect(signingKey.startsWith(dShown![1])).toBe(true);
  expect(signingKey.endsWith(dShown![2])).toBe(true);

  // No lattice is involved on this path, so the reduce step has nothing to show.
  await expect(page.locator('.meta-grid article', { hasText: 'Signatures' })).toContainText('2');
  const reduce = await step(page, 'reduce');
  await expect(reduce.locator('.matrix-block')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Failure paths — every way the page can say "no"
// ---------------------------------------------------------------------------

test('RFC 6979 defender: the attack fails cleanly and says why', async ({ page }) => {
  await openApp(page);
  await runPreset(page, 'defender');

  await expect(page.locator('.scenario-line')).toContainText(
    'Deterministic nonces remove the leak',
  );
  await expect(page.locator('.summary-line')).toContainText('no matching key recovered');

  // Failure is shown as a failed *final* rung, not a failed pipeline.
  await expect(page.locator('.pipeline-step.done')).toHaveCount(4);
  await expect(page.locator('.pipeline-step.failed')).toHaveCount(1);
  await expect(page.locator('.pipeline-step').nth(4)).toHaveClass(/failed/);

  const extract = await step(page, 'extract');
  const banner = extract.locator('.recovery-banner');
  await expect(banner).toHaveClass(/failure/);
  await expect(banner).toContainText('KEY NOT RECOVERED');
  expect(await keyCard(extract, 'Recovered Key')).toBe('not recovered');
  await expect(extract.locator('.key-card', { hasText: 'Validation' })).toContainText('no match');
  // Nothing was recovered, so there is no byte grid to celebrate.
  await expect(extract.locator('.key-compare')).toHaveCount(0);
  await expect(extract.locator('.key-byte')).toHaveCount(0);

  const build = await step(page, 'build');
  await expect(build.locator('.workflow-diagnostic')).toContainText(
    'RFC6979 defender mode is working as intended',
  );
});

test('under-determined config: below the information floor the run fails and explains itself', async ({
  page,
}) => {
  await openApp(page);

  await page.locator('select[name="leakMode"]').selectOption('msb');
  await page.locator('input[name="leakedBits"]').fill('4');
  await page.locator('input[name="signatureCount"]').fill('4');
  // The gauge must call this out *before* the run is even submitted.
  await expect(page.locator('.feasibility-badge')).toHaveText('INFEASIBLE');
  await expect(page.locator('.feasibility-region')).toContainText(
    'Below the information floor',
  );

  await page.locator('.primary-button').click();
  await settle(page);

  await expect(page.locator('.summary-line')).toContainText('no matching key recovered');
  const extract = await step(page, 'extract');
  await expect(extract.locator('.recovery-banner')).toHaveClass(/failure/);
  // The diagnostics must name the parameters that were actually used, not a default.
  const diagnostics = extract.locator('.recovery-panel .info-stack .callout').first();
  await expect(diagnostics).toContainText('LLL did not reveal a valid key at leak mode msb');
  await expect(diagnostics).toContainText('N=4, leaked bits=4');

  const build = await step(page, 'build');
  await expect(build.locator('.workflow-diagnostic')).toContainText(
    'not enough signatures for this leakage level',
  );
});

// ---------------------------------------------------------------------------
// The feasibility gauge — the measured statistic the README leans on
// ---------------------------------------------------------------------------

test('the feasibility gauge classifies against the boundary it documents', async ({ page }) => {
  await openApp(page);
  await page.locator('select[name="leakMode"]').selectOption('msb');

  // Boundary as stated on the panel: the information floor is curveBits / signatures,
  // and the practical curve adds the float-LLL margin 1.5 + 6/signatures.
  const curveBits = 256;
  const cases: Array<[number, number]> = [
    [4, 4],
    [16, 12],
    [20, 12],
    [24, 12],
    [8, 32],
    [10, 32],
    [30, 2],
  ];

  for (const [bits, sigs] of cases) {
    await page.locator('input[name="leakedBits"]').fill(String(bits));
    await page.locator('input[name="signatureCount"]').fill(String(sigs));

    const floor = curveBits / sigs;
    const practical = floor + 1.5 + 6 / sigs;
    const expected = bits < floor ? 'INFEASIBLE' : bits < practical ? 'MARGINAL' : 'FEASIBLE';

    await expect(
      page.locator('.feasibility-badge'),
      `${bits} bits x ${sigs} sigs (floor ${floor.toFixed(2)}, practical ${practical.toFixed(2)})`,
    ).toHaveText(expected);
    await expect(page.locator('.feasibility-plot-wrap')).toHaveAttribute(
      'aria-label',
      new RegExp(`${bits} leaked bits across ${sigs} signatures\\. Region: ${expected.toLowerCase()}`),
    );
  }
});

test('the gauge marker tracks the controls monotonically', async ({ page }) => {
  await openApp(page);
  const marker = page.locator('.feasibility-svg .marker');

  const at = async (bits: number, sigs: number): Promise<{ cx: number; cy: number }> => {
    await page.locator('input[name="leakedBits"]').fill(String(bits));
    await page.locator('input[name="signatureCount"]').fill(String(sigs));
    return {
      cx: Number(await marker.getAttribute('cx')),
      cy: Number(await marker.getAttribute('cy')),
    };
  };

  const low = await at(4, 4);
  const moreBits = await at(24, 4);
  const moreSigs = await at(4, 24);

  // More leaked bits raises the marker (smaller y in SVG space) at fixed signature count.
  expect(moreBits.cy).toBeLessThan(low.cy);
  expect(moreBits.cx).toBeCloseTo(low.cx, 5);
  // More signatures moves it right at fixed bits.
  expect(moreSigs.cx).toBeGreaterThan(low.cx);
  expect(moreSigs.cy).toBeCloseTo(low.cy, 5);
});

// ---------------------------------------------------------------------------
// Promises a reader can check by eye
// ---------------------------------------------------------------------------

test('the honesty caption states this curve at full size and the real HNP bound', async ({
  page,
}) => {
  await openApp(page);
  const reality = page.locator('.feasibility-reality');

  await expect(reality).toContainText('this really is secp256k1, a full 256-bit order');
  // sqrt(256) = 16, the Boneh-Venkatesan / Nguyen-Shparlinski figure the README quotes.
  await expect(reality).toContainText('≈ 16 bits');
  // The 32-signature cap the README explains, matching the control that enforces it.
  await expect(reality).toContainText('only goes up to 32 signatures');
  await expect(page.locator('input[name="signatureCount"]')).toHaveAttribute('max', '32');
  await expect(page.locator('input[name="leakedBits"]')).toHaveAttribute('max', '32');

  await page.locator('select[name="curve"]').selectOption('p256');
  await expect(reality).toContainText('this really is P-256, a full 256-bit order');
});

test('the guided walkthrough shows exactly one step at a time', async ({ page }) => {
  await openApp(page);
  await runPreset(page, 'fast-msb');

  const keys = ['sign', 'build', 'reduce', 'extract'];
  await expect(page.locator('.step-tab')).toHaveCount(keys.length);

  for (const key of keys) {
    await page.locator(`[data-step-tab="${key}"]`).click();
    await expect(page.locator('.step-panel:not([hidden])')).toHaveCount(1);
    await expect(page.locator(`#step-panel-${key}`)).toBeVisible();
    await expect(page.locator(`[data-step-tab="${key}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    for (const other of keys.filter((k) => k !== key)) {
      await expect(page.locator(`[data-step-tab="${other}"]`)).toHaveAttribute(
        'aria-selected',
        'false',
      );
    }
  }
});
