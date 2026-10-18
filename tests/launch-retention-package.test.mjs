import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateRetentionPackage} from './helpers/launch-retention-package.mjs';
const bytes=readFileSync(new URL('../package.json',import.meta.url));
test('independently pinned package exception fixture bytes are unchanged',()=>assert.equal(createHash('sha256')
  .update(readFileSync(new URL('fixtures/launch-retention-package-contract.json',import.meta.url))).digest('hex'),
  '4018cfc8af0f8563e2cb810d40cd40bc1661266f15e415dc3682c38a4146b7b4'));
test('candidate retains independent D2 package with only the frozen Task5 and Task6 commands',()=>validateRetentionPackage(bytes,'task6'));
test('frozen package validator rejects old script/dependency/unlisted field/command and premature Task6 changes',()=>{
  // Expectations and mutations are literal; none are regenerated from candidate.
  const allowed={name:'veylo-site',private:true,type:'module',scripts:{test:'node --test',
    'test:launch-db':'node --test tests/launch-list*-postgres.test.mjs',check:'npm test',
    'test:launch-retention':'node --test tests/launch-retention*.test.mjs tests/launch-list-retention*.test.mjs',
    'launch:retention:dry-run':'node scripts/launch-retention.mjs'}};
  validateRetentionPackage(Buffer.from(JSON.stringify(allowed)),'task5');
  const change=[v=>v.scripts.test='node --test --test-concurrency=1',v=>v.scripts.extra='node surprise.mjs',
    v=>v.dependencies={pg:'1'},v=>v.description='unlisted',v=>v.scripts['launch:retention:dry-run']='node scripts/launch-retention.mjs --live',
    v=>v.scripts['test:launch-retention-dataapi']='node --test tests/launch-list-retention-dataapi.test.mjs',v=>delete v.scripts['test:launch-retention']];
  for(const mutate of change){const v=structuredClone(allowed);mutate(v);assert.throws(()=>validateRetentionPackage(Buffer.from(JSON.stringify(v)),'task5'));}
});
