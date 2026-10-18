import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchRetentionClient } from '../lib/launch-retention-client.mjs';

const item = {itemId:'00000000-0000-4000-8000-000000000001',generation:'9007199254740993',epoch:'0',
  scope:'c'.repeat(64),approvalRef:'synthetic-approval',lane:'raw',ageSeconds:null,reason:'eligible'};
const inventory = {state:'ready',items:[item],hasMore:false,reasons:[]};
// Unit doubles exercise parsing/dispatch only. They are NOT deadline proof.
test('unbound and claim-only generic transports stay unavailable without dispatch',async()=>{
  let calls=0;
  for(const transport of [undefined,{}, {rpc(){calls++;},bound:true,timerArmed:true}, {executeBounded:true}]) {
    const client=createLaunchRetentionClient({transport});
    await assert.rejects(()=>client.inventory({limit:100}),/^Error: Launch retention unavailable\.$/);
  }
  assert.equal(calls,0);
});
test('fixed inventory and lane RPC mapping preserves exact bigint strings',async()=>{
  const calls=[];
  const client=createLaunchRetentionClient({transport:{async executeBounded(call){
    calls.push(call);
    return call.rpc==='inventory_launch_retention_v1'?inventory:
      {outcome:'disposed',workId:item.itemId,generation:'9007199254740994',reason:'eligible',writes:4};
  }}});
  assert.deepEqual(await client.inventory({limit:7}),inventory);
  assert.deepEqual(calls[0],{rpc:'inventory_launch_retention_v1',args:{p_limit:7}});
  for(const [lane,rpc] of [['raw','dispose_launch_raw_v1'],['receipt','minimize_launch_receipt_v1'],['marker','retire_launch_marker_v1']]) {
    const {ageSeconds,reason,...tuple}=item;
    // Outcome must also match the requested lane.
    const c=createLaunchRetentionClient({transport:{async executeBounded(call){calls.push(call);return {
      outcome:lane==='raw'?'disposed':lane==='receipt'?'minimized':'retired',workId:item.itemId,generation:'9007199254740994',reason:'eligible',writes:4};}}});
    const out=await c.apply({...tuple,lane});
    assert.equal(out.generation,'9007199254740994');
    assert.deepEqual(calls.at(-1),{rpc,args:{p_item_id:item.itemId,p_generation:item.generation,p_epoch:'0',p_scope:item.scope,p_approval_ref:item.approvalRef}});
  }
});
test('invalid limits and tuples refuse before trusted I/O',async()=>{
  let calls=0;
  const client=createLaunchRetentionClient({transport:{executeBounded(){calls++;return {};}}});
  for(const limit of [0,101,-1,1.5,'100',null,NaN]) await assert.rejects(()=>client.inventory({limit}));
  const {ageSeconds,reason,...tuple}=item;
  for(const patch of [{generation:9007199254740993},{generation:'01'},{generation:'9223372036854775808'},
    {epoch:'-1'},{scope:'C'.repeat(64)},{approvalRef:'a@test.invalid'},{lane:'beta'},{itemId:'bad'}, {force:true}])
    await assert.rejects(()=>client.apply({...tuple,...patch}));
  assert.equal(calls,0,'validation must precede dispatch even if malformed result would also refuse');
});
test('inventory duplicates, oversized lists, leaked fields and malformed responses refuse sanitized',async()=>{
  for(const value of [{...inventory,items:[item,item]}, {...inventory,items:Array(101).fill(item)},
    {...inventory,email:'secret@test.invalid'}, {...inventory,items:[{...item,generation:1}]},
    {...inventory,items:[{...item,ageSeconds:-1}]}, {...inventory,items:[{...item,scope:null}]}]) {
    const client=createLaunchRetentionClient({transport:{async executeBounded(){return value;}}});
    await assert.rejects(()=>client.inventory({limit:100}),/^Error: Launch retention unavailable\.$/);
  }
});
test('apply validates correlation, generation, outcome/write semantics and strips no raw exceptions',async()=>{
  const {ageSeconds,reason,...tuple}=item;
  const base={outcome:'disposed',workId:item.itemId,generation:'9007199254740994',reason:'eligible',writes:4};
  for(const value of [{...base,workId:'00000000-0000-4000-8000-000000000002'}, {...base,generation:'9007199254740993'},
    {...base,outcome:'review',reason:'unknown_delivery'}, {...base,outcome:'already_disposed',reason:'already_done'},
    {...base,providerRef:'private'}, {...base,writes:-1}]) {
    const c=createLaunchRetentionClient({transport:{async executeBounded(){return value;}}});
    await assert.rejects(()=>c.apply(tuple),/^Error: Launch retention unavailable\.$/);
  }
  const c=createLaunchRetentionClient({transport:{async executeBounded(){throw Error('private@test.invalid token=secret');}}});
  await assert.rejects(()=>c.apply(tuple),/^Error: Launch retention unavailable\.$/);
});
test('new receipt review with positive writes is accepted only at advanced generation',async()=>{
  const {ageSeconds,reason,...tuple}=item;
  const c=createLaunchRetentionClient({transport:{async executeBounded(){return {
    outcome:'review',workId:item.itemId,generation:'9007199254740994',reason:'unavailable',writes:2};}}});
  assert.equal((await c.apply({...tuple,lane:'receipt'})).writes,2);
});
test('independent rate sweep uses only bounded RPC and strict count result',async()=>{
  const c=createLaunchRetentionClient({transport:{async executeBounded(call){
    assert.deepEqual(call,{rpc:'sweep_launch_rate_events_v1',args:{p_limit:3}});
    return {state:'processed',visited:3,completed:3,remaining:true};
  }}});
  assert.deepEqual(await c.sweepRateEvents({limit:3}),{state:'processed',visited:3,completed:3,remaining:true});
});
test('I1 adapter refuses numeric decision age presented as authoritative eligibility age',async()=>{
  const c=createLaunchRetentionClient({transport:{async executeBounded(){return {...inventory,items:[{...item,ageSeconds:42}]};}}});
  await assert.rejects(()=>c.inventory({limit:1}),/^Error: Launch retention unavailable\.$/);
});
