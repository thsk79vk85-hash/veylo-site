import test from 'node:test';
import assert from 'node:assert/strict';
import {withOwnedCleanup} from './helpers/owned-cleanup.mjs';

for(const failureAt of [0,1])test(`N1 teardown ${failureAt} failure attempts every owned cleanup and preserves original errors`,async()=>{
  const original=Error('original assertion'),cleanup=Error(`owned teardown ${failureAt}`),attempted=[];
  await assert.rejects(withOwnedCleanup(async()=>{throw original;},[0,1,2].map(n=>async()=>{
    attempted.push(n);if(n===failureAt)throw cleanup;
  })),error=>{
    assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors,[original,cleanup]);return true;
  });
  assert.deepEqual(attempted,[0,1,2]);
});
test('N1 successful body with multiple failed teardowns retains all failures',async()=>{
  const one=Error('release'),two=Error('first fixture'),attempted=[];
  await assert.rejects(withOwnedCleanup(async()=>42,[
    async()=>{attempted.push(0);throw one;},async()=>{attempted.push(1);throw two;},async()=>{attempted.push(2);},
  ]),error=>{assert.deepEqual(error.errors,[one,two]);return true;});
  assert.deepEqual(attempted,[0,1,2]);
});
test('N1 successful cleanup preserves value or the original assertion identity',async()=>{
  assert.equal(await withOwnedCleanup(async()=>42,[async()=>{}]),42);
  const original=Error('assertion');await assert.rejects(withOwnedCleanup(async()=>{throw original;},[async()=>{}]),e=>e===original);
});
