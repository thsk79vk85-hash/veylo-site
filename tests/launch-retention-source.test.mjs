import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateRetentionPackage,packageContractSha256 } from './helpers/launch-retention-package.mjs';

const root = new URL('../', import.meta.url);
const pinsPath = new URL('fixtures/launch-retention-source-pins.json', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const frozenBytes = readFileSync(pinsPath);
const pins = JSON.parse(frozenBytes);
const read = file => readFileSync(new URL(file, root));
const json = bytes => JSON.parse(bytes.toString());

// These expectations came from the controller before integration. Updating the
// candidate/source map must never silently regenerate this independent input.
test('retains the independently frozen input pins', () => {
  assert.equal(sha256(frozenBytes), 'fe7e7d6603dd5791f578e67c71c9151991eaa1b091d3be957b9e84afedcd01ec');
});

function preservesProduction(readSource) {
  for (const { file, sha256: expected } of pins.preservedFiles) {
    assert.equal(sha256(readSource(file)), expected, `preserved production bytes: ${file}`);
  }
  assert.match(readSource('support.html').toString(), /support@joinveylo\.com/);
  assert.deepEqual(json(readSource('vercel.json')).redirects, pins.configuration.productionRedirects);
}

test('preserves cumulative signup and contact sources', () => {
  preservesProduction(read);
  validateRetentionPackage(read('package.json'),'task5');
  for (const { file } of pins.reviewedD2Files) {
    assert.ok(existsSync(new URL(file, root)), `reviewed cumulative D2 path is missing: ${file}`);
  }
  assert.deepEqual(json(read('vercel.json')).headers, pins.configuration.reviewedD2Headers);
});

test('legal-only main cannot replace signup source', () => {
  const mainIndex = execFileSync('git', ['show', `${pins.currentMain.commit}:index.html`], { cwd: root });
  const mainConfig = execFileSync('git', ['show', `${pins.currentMain.commit}:vercel.json`], { cwd: root });
  assert.throws(() => preservesProduction(file => file === 'index.html' ? mainIndex : read(file)),
    /preserved production bytes: index\.html/);
  assert.throws(() => preservesProduction(file => file === 'vercel.json' ? mainConfig : read(file)),
    { code: 'ERR_ASSERTION' });
});

test('rejects lost signup, obsolete support and changed redirect fixtures', () => {
  for (const [file, bytes] of [
    ['index.html', Buffer.from('<html>Legal documents only</html>')],
    ['api/signup.js', Buffer.from('')],
    ['support.html', Buffer.from('support@veylo.app')],
    ['vercel.json', Buffer.from('{"redirects":[]}')],
  ]) {
    assert.throws(() => preservesProduction(path => path === file ? bytes : read(path)),
      { code: 'ERR_ASSERTION' }, `must reject wrong-source fixture: ${file}`);
  }
});

function disabledMain(config) {
  assert.equal(config.git?.deploymentEnabled?.main, false, 'main automatic deployment must remain disabled');
}

test('keeps main auto-deployment disabled', () => {
  disabledMain(json(read('vercel.json')));
  for (const config of [{}, { git: { deploymentEnabled: { main: true } } }]) {
    assert.throws(() => disabledMain(config), /main automatic deployment must remain disabled/);
  }
});

test('binds the cumulative source map to independent inputs and an external acceptance receipt', () => {
  assert.ok(existsSync(new URL('docs/launch-retention-source-map.json', root)), 'cumulative source map is missing');
  const map = json(read('docs/launch-retention-source-map.json'));
  for (const [key, value] of Object.entries(pins)) {
    if (key !== 'purpose') assert.deepEqual(map[key], value, `frozen input differs: ${key}`);
  }
  assert.deepEqual(map.inputPins, {
    file: 'tests/fixtures/launch-retention-source-pins.json',
    sha256: 'fe7e7d6603dd5791f578e67c71c9151991eaa1b091d3be957b9e84afedcd01ec',
  });
  assert.equal(map.reviewedD2BaseCommit, '708b176e098f3d4873676aa8ae9b09b90d5e9000');
  assert.equal(Object.hasOwn(map, 'integrationCommit'), false, 'output commit must be bound outside its own tree');
  assert.equal(map.integrationParentCommit, 'ba7da79dba655ee09f9a87766ccb0cbeccc90d8e');
  assert.equal(map.integrationReceiptRef, 'app:tasks/2026-10-18-launch-list-retention-progress.md');
  assert.deepEqual(map.packageException,{file:'tests/fixtures/launch-retention-package-contract.json',sha256:packageContractSha256,phase:'task5'});
});
