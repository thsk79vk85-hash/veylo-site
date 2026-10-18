import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { processLaunchRetention,runReceipt } from '../lib/process-launch-retention.mjs';
import { createLaunchRetentionClient } from '../lib/launch-retention-client.mjs';
const item=(n,lane='raw')=>({itemId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,generation:'1',epoch:'0',
  scope:'c'.repeat(64),approvalRef:`synthetic-${n}`,lane,ageSeconds:null,reason:'eligible'});
const result=(i,outcome='disposed',writes=2,reason='eligible')=>({outcome,workId:i.itemId,generation:writes?'2':'1',reason,writes});
const client=(items=[],options={})=>({
  async inventory(){return {state:'ready',items,hasMore:false,reasons:[],...options.inventory};},
  async apply(i){return options.apply?options.apply(i):result(i,i.lane==='raw'?'disposed':'minimized');},
  async sweepRateEvents(){return options.sweep?options.sweep():{state:'idle',visited:0,completed:0,remaining:false};},
});
test('OFF, unbound, unknown empty coverage and invalid bounds produce truthful sanitized receipts',async()=>{
  assert.equal((await processLaunchRetention({client:client([],{inventory:{state:'disabled'}})})).state,'disabled');
  assert.equal((await processLaunchRetention({client:createLaunchRetentionClient({})})).state,'unavailable');
  assert.equal((await processLaunchRetention({client:client()})).state,'unavailable');
  for(const limit of [0,101,'1',1.1,NaN,null]) await assert.rejects(()=>processLaunchRetention({client:client(),limit}));
});
test('one ordinary completion plus unknown or unavailable copies is partial',async()=>{
  const items=[item(1),item(2)];
  const c=client(items,{apply:i=>i.itemId===items[0].itemId?result(i):result(i,'review',0,'unknown_delivery')});
  const r=await processLaunchRetention({client:c});
  assert.equal(r.state,'partial');assert.equal(r.counts.raw.completed,1);assert.equal(r.counts.raw.review,1);
  assert.equal(r.oldestEligibleAgeSeconds,null);assert.deepEqual(r.reasons,['copies_unavailable','coverage_unavailable','unknown_delivery']);
  assert.equal(Object.hasOwn(r,'allCopiesDeleted'),false);
  const copies=await processLaunchRetention({client:client([item(1)],{inventory:{reasons:['copies_unavailable']}})});
  assert.equal(copies.state,'partial');assert.equal(copies.counts.raw.completed,1);
});
test('positive-write R review stays review/partial; no stale recount on next invocation',async()=>{
  let consumed=false;
  const c=client([item(1,'receipt')],{apply:i=>{
    if(consumed)return result(i,'refused',0,'scope_mismatch');consumed=true;return result(i,'review',3,'unavailable');
  }});
  const first=await processLaunchRetention({client:c});
  assert.equal(first.state,'partial');assert.equal(first.counts.receipt.completed,0);assert.equal(first.counts.receipt.review,1);
  const restart=await processLaunchRetention({client:c});
  assert.equal(restart.state,'partial');assert.equal(restart.counts.receipt.completed,0);assert.equal(restart.counts.receipt.refused,1);
});
test('100 total across lanes, fresh runs, duplicate inventory and reordered correlation cannot double-apply',async()=>{
  const items=Array.from({length:100},(_,n)=>item(n,['raw','receipt','marker'][n%3]));let calls=0;
  const c=client(items,{apply:i=>{calls++;return result(i,i.lane==='raw'?'disposed':i.lane==='marker'?'retired':'minimized');}});
  const out=await processLaunchRetention({client:c,limit:100});
  assert.equal(out.state,'partial');assert.equal(calls,100);
  assert.equal(Object.values(out.counts).reduce((n,c)=>n+c.visited,0),100);
  const next=await processLaunchRetention({client:client()});assert.notEqual(next.runId,out.runId);assert.equal(next.state,'unavailable');
  for(const invalid of [[item(1),item(1)],items.concat(item(101))]) {
    const bad=client(invalid,{apply(){assert.fail('bad batch applied');}});
    assert.equal((await processLaunchRetention({client:bad})).state,'unavailable');
  }
  const reordered=client([item(1)],{apply:()=>result(item(2))});
  assert.equal((await processLaunchRetention({client:reordered})).state,'partial');
});
test('rate sweep runs even when launch inventory fails and blocked rate work is partial',async()=>{
  let swept=0;
  const c=client([], {sweep:()=>{swept++;return {state:'processed',visited:2,completed:2,remaining:false};}});
  c.inventory=async()=>{throw Error('private@test.invalid');};
  const r=await processLaunchRetention({client:c});
  assert.equal(swept,1);assert.equal(r.rateEvents.completed,2);assert.equal(r.state,'partial');
  assert.doesNotMatch(JSON.stringify(r),/@|token|private/);
  const more=await processLaunchRetention({client:client([],{sweep:()=>({state:'processed',visited:100,completed:100,remaining:true})})});
  assert.equal(more.state,'partial');assert.ok(more.reasons.includes('more_work'));
});
test('strict schema and receipt validator reject unknown fields and impossible counts',async()=>{
  const schema=JSON.parse(readFileSync(new URL('../docs/launch-retention-receipt.schema.json',import.meta.url)));
  assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.schemaVersion.const,1);
  const r=await processLaunchRetention({client:client([item(1)])});assert.deepEqual(runReceipt(r),r);
  for(const patch of [{email:'secret@test.invalid'},{allCopiesDeleted:true},{state:'erased'},{reasons:['private error']},
    {counts:{...r.counts,raw:{visited:1,completed:2,review:0,refused:0}}}])assert.throws(()=>runReceipt({...r,...patch}));
});
test('I1 decision ages across raw and receipt lanes cannot become an eligibility clock',async()=>{
  const r=await processLaunchRetention({client:client([item(1),item(2,'receipt')])});
  assert.equal(r.counts.raw.completed,1);assert.equal(r.counts.receipt.completed,1);
  assert.equal(r.oldestEligibleAgeSeconds,null);
});
test('I1 eligible-but-blocked work is not excluded to report a completed-only numeric age',async()=>{
  const items=[item(1),item(99)];
  const r=await processLaunchRetention({client:client(items,{apply:i=>i.itemId===items[0].itemId?result(i):result(i,'refused',0,'unavailable')})});
  assert.equal(r.counts.raw.completed,1);assert.equal(r.counts.raw.refused,1);
  assert.equal(r.oldestEligibleAgeSeconds,null);
});
test('I1 a bounded page cannot establish oldest eligibility across an unobserved population',async()=>{
  const r=await processLaunchRetention({client:client([item(1)],{inventory:{hasMore:true}}),limit:1});
  assert.equal(r.counts.raw.completed,1);assert.equal(r.oldestEligibleAgeSeconds,null);
});
test('I2 empty ledger and rate-only progress cannot settle unavailable coverage or copies',async()=>{
  const empty=await processLaunchRetention({client:client()});assert.equal(empty.state,'unavailable');
  assert.ok(empty.reasons.includes('coverage_unavailable'));assert.ok(empty.reasons.includes('copies_unavailable'));
  const rate=await processLaunchRetention({client:client([],{sweep:()=>({state:'processed',visited:1,completed:1,remaining:false})})});
  assert.equal(rate.state,'partial');assert.equal(rate.rateEvents.completed,1);
  assert.ok(rate.reasons.includes('coverage_unavailable'));assert.ok(rate.reasons.includes('copies_unavailable'));
});
test('I2 final local marker removal does not remove independent unresolved follow-up',async()=>{
  let items=[item(1,'marker')];const c=client();
  c.inventory=async()=>({state:'ready',items,hasMore:false,reasons:[]});
  c.apply=async i=>{items=[];return result(i,'retired');};
  const first=await processLaunchRetention({client:c});assert.equal(first.counts.marker.completed,1);assert.equal(first.state,'partial');
  const after=await processLaunchRetention({client:c});assert.equal(after.state,'unavailable');
  assert.ok(after.reasons.includes('copies_unavailable'));assert.ok(after.reasons.includes('coverage_unavailable'));
});
test('I1 schema and runtime receipt validator refuse a fabricated numeric eligibility age',async()=>{
  const r=await processLaunchRetention({client:client()});
  assert.throws(()=>runReceipt({...r,oldestEligibleAgeSeconds:42}));
  const schema=JSON.parse(readFileSync(new URL('../docs/launch-retention-receipt.schema.json',import.meta.url)));
  assert.equal(schema.properties.oldestEligibleAgeSeconds.type,'null');
});
