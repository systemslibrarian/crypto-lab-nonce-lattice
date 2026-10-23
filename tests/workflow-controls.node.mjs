import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(
  fileURLToPath(new URL('../.github/workflows/deploy-pages.yml', import.meta.url)),
  'utf8',
);

test('repository code runs without Pages or OIDC publishing authority', () => {
  assert.match(workflow, /permissions:\n  contents: read\n/);

  const testJobs = workflow.slice(
    workflow.indexOf('\n  test:'),
    workflow.indexOf('\n  pages-artifact:'),
  );
  assert.doesNotMatch(testJobs, /pages: write|id-token: write/);
});

test('publishing authority is isolated in no-checkout jobs', () => {
  const artifactJob = workflow.slice(
    workflow.indexOf('\n  pages-artifact:'),
    workflow.indexOf('\n  deploy:'),
  );
  const deployJob = workflow.slice(
    workflow.indexOf('\n  deploy:'),
    workflow.indexOf('\n  dependabot-auto-merge:'),
  );

  assert.match(
    artifactJob,
    /permissions:\n      actions: read\n      pages: write\n      id-token: write/,
  );
  assert.match(deployJob, /permissions:\n      pages: write\n      id-token: write/);
  assert.doesNotMatch(artifactJob, /actions\/checkout/);
  assert.doesNotMatch(deployJob, /actions\/checkout/);
});

test('pull requests neither retain nor publish a Pages artifact', () => {
  assert.match(
    workflow,
    /Retain the tested site for a main publish only\n        if: github\.event_name != 'pull_request'/,
  );
  assert.match(
    workflow,
    /pages-artifact:\n    name: Prepare Pages artifact\n    if: github\.event_name != 'pull_request'/,
  );
});

test('all supported Node release lines run unit and build controls', () => {
  assert.match(workflow, /node: \[22, 24, 26\]/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
});

test('the browser gate must pass before publishing or dependency auto-merge', () => {
  assert.match(workflow, /run: npm run test:a11y/);
  assert.match(workflow, /pages-artifact:[\s\S]*needs: \[test, browser\]/);
  assert.match(workflow, /dependabot-auto-merge:[\s\S]*needs: \[test, browser\]/);
});

test('main deployment cannot be cancelled by a newer workflow run', () => {
  assert.match(
    workflow,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
  );
});

test('only gated patch and minor Dependabot updates can auto-merge', () => {
  assert.match(workflow, /update-type == 'version-update:semver-major'/);
  assert.match(workflow, /update-type == 'version-update:semver-patch'/);
  assert.match(workflow, /update-type == 'version-update:semver-minor'/);
  assert.match(workflow, /gate passed but the dependency PR did not merge[\s\S]*exit 1/);
  assert.match(workflow, /gh workflow run deploy-pages\.yml/);
  assert.doesNotMatch(workflow, /\|\| echo "::warning::deploy dispatch failed/);
});
