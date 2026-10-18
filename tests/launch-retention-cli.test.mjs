import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runCli } from '../scripts/launch-retention.mjs';
import { runReceipt } from '../lib/process-launch-retention.mjs';
const schema=JSON.parse(readFileSync(new URL('../docs/launch-retention-receipt.schema.json',import.meta.url)));
// Check the published schema keywords used by this document, in addition to
// the actual runtime validator; every nonempty CLI stdout path must pass both.
function assertSchema(value,s= schema){
  if(s.$ref)return assertSchema(value,s.$ref.split('/').slice(1).reduce((node,key)=>node[key],schema));
  if(Object.hasOwn(s,'const'))assert.deepEqual(value,s.const);
  if(s.enum)assert.ok(s.enum.includes(value));
  if(s.type){const types=Array.isArray(s.type)?s.type:[s.type];
    assert.ok(types.some(type=>type==='null'?value===null:type==='integer'?Number.isInteger(value):
      type==='array'?Array.isArray(value):type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):typeof value===type));}
  if(s.pattern)assert.match(value,new RegExp(s.pattern));
  if(typeof value==='number'){if(s.minimum!==undefined)assert.ok(value>=s.minimum);if(s.maximum!==undefined)assert.ok(value<=s.maximum);}
  if(s.type==='object'){
    for(const key of s.required??[])assert.ok(Object.hasOwn(value,key));
    for(const [key,v] of Object.entries(value)){if(s.additionalProperties===false)assert.ok(Object.hasOwn(s.properties,key));if(s.properties[key])assertSchema(v,s.properties[key]);}
  }
  if(Array.isArray(value)){if(s.uniqueItems)assert.equal(new Set(value.map(v=>JSON.stringify(v))).size,value.length);for(const v of value)assertSchema(v,s.items);}
}
function stdoutReceipt(output){const r=JSON.parse(output);assert.deepEqual(runReceipt(r),r);assertSchema(r);return r;}
test('default CLI is offline/unbound with zero work and no environment route',async()=>{
  const p=spawnSync(process.execPath,['scripts/launch-retention.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8',
    env:{...process.env,WAITLIST_SUPABASE_URL:'https://must-not-contact.invalid',WAITLIST_SUPABASE_SERVICE_ROLE_KEY:'never-output-secret'}});
  assert.equal(p.status,0);assert.equal(p.stderr,'');
  const r=stdoutReceipt(p.stdout);assert.equal(r.state,'unavailable');assert.equal(r.counts.raw.visited,0);
  assert.doesNotMatch(p.stdout,/secret|must-not-contact|@/);
});
test('CLI rejects live/URL/key/force/apply and invalid limits with fixed stderr and empty stdout',async()=>{
  for(const argv of [['--live'],['--url','https://secret.invalid'],['--key','secret'],['--force'],['--apply'],['--limit','101'],['--limit','1','--limit','2']]){
    let output='',error='';assert.equal(await runCli(argv,{stdout:s=>output+=s,stderr:s=>error+=s}),1);
    assert.equal(output,'');assert.equal(error,'Invalid launch retention arguments.\n');
  }
});
test('CLI local dry-run bounds are accepted but cannot inject a client',async()=>{
  let output='';assert.equal(await runCli(['--limit','1'],{stdout:s=>output+=s,client:{inventory(){assert.fail('injected');}}}),0);
  assert.equal(stdoutReceipt(output).state,'unavailable');
});
test('I3 default and every accepted limit emit only published-schema/runtime-valid RunReceipts',async()=>{
  for(const argv of [[],...Array.from({length:100},(_,n)=>['--limit',String(n+1)])]){
    let output='',error='';assert.equal(await runCli(argv,{stdout:s=>output+=s,stderr:s=>error+=s}),0);
    assert.equal(error,'');stdoutReceipt(output);
  }
  const p=spawnSync(process.execPath,['scripts/launch-retention.mjs','--key','private-value'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  assert.equal(p.status,1);assert.equal(p.stdout,'');assert.equal(p.stderr,'Invalid launch retention arguments.\n');
});
test('I3 invalid arguments use fixed stderr, nonzero exit and empty stdout without dispatch',async()=>{
  for(const argv of [['--force'],['--limit','101'],['--url','https://private.invalid']]){
    let output='',error='',calls=0;
    const code=await runCli(argv,{stdout:s=>output+=s,stderr:s=>error+=s,client:{inventory(){calls++;},sweepRateEvents(){calls++;}}});
    assert.equal(code,1);assert.equal(output,'');assert.equal(error,'Invalid launch retention arguments.\n');assert.equal(calls,0);
  }
});
