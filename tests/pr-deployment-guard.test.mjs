import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('publishing the retention PR cannot opt main or its review branch into Git deployments', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  // Vercel enables unspecified branches, and any matching true rule wins.
  // Require only these two explicit blocks: no wildcard, opt-in or global stop
  // that could change the independent marketing branch's existing workflow.
  assert.deepEqual(config.git?.deploymentEnabled, {
    main: false,
    'codex/launch-list-retention': false,
  });
});
