import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
export const packageContractSha256='4018cfc8af0f8563e2cb810d40cd40bc1661266f15e415dc3682c38a4146b7b4';
const bytes=readFileSync(new URL('../fixtures/launch-retention-package-contract.json',import.meta.url));
assert.equal(sha(bytes),packageContractSha256,'independent package contract changed');
const contract=JSON.parse(bytes),baseline=Buffer.from(contract.baseline.base64,'base64');
assert.equal(baseline.length,211);assert.equal(sha(baseline),'e86d209e33fc7f6c4676f9dc566c529238c7f1393a808ed7b7d19559e443e9c6');
export function validateRetentionPackage(candidate,phase){
  assert.ok(Object.hasOwn(contract.allowedPhases,phase),'unlisted package phase');
  if(phase==='baseline')assert.deepEqual(candidate,baseline,'baseline package bytes changed');
  const expected=JSON.parse(baseline);
  for(const group of contract.allowedPhases[phase])Object.assign(expected.scripts,contract.additions[group]);
  assert.deepEqual(JSON.parse(candidate),expected,'package differs beyond exact frozen additive commands');
}
