// Private server-side consumer only. No production transport, credentials,
// issuer or connection framework. executeBounded is a TRUSTED CODE dependency:
// its reviewed implementation must arm 1..5000ms BEFORE dispatch on the actual
// connection, one autocommit item/RPC, and normalize connection/cancel errors.
// Object shape is not attestation; unit doubles are not timer conformance proof.
export const retentionReasons = Object.freeze(['active_purpose','unavailable','invalid_facts','held','live_reference',
  'unknown_delivery','link_required','restore_required','scope_mismatch','eligible','already_done','copies_unavailable','coverage_unavailable','more_work']);
const lanes=['raw','receipt','marker'];
const unavailable=()=>Error('Launch retention unavailable.');
export function requireRetention(value){if(!value)throw unavailable();}
export function exactKeys(value,keys){
  requireRetention(value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)));
}
export function retentionLimit(limit){requireRetention(Number.isInteger(limit)&&limit>=1&&limit<=100);return limit;}
const decimal=v=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<=9223372036854775807n;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const ref=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
const tupleKeys=['itemId','generation','epoch','scope','approvalRef','lane'];
function tuple(value,nullable=false){
  requireRetention(uuid(value.itemId)&&decimal(value.generation)&&decimal(value.epoch)
    &&typeof value.scope==='string'&&/^[0-9a-f]{64}$/.test(value.scope)
    &&(ref(value.approvalRef)||(nullable&&value.approvalRef===null))&&lanes.includes(value.lane));
  return Object.fromEntries(tupleKeys.map(k=>[k,value[k]]));
}
export function retentionInventory(value,limit){
  retentionLimit(limit);exactKeys(value,['state','items','hasMore','reasons']);
  requireRetention(['disabled','unavailable','ready'].includes(value.state)&&Array.isArray(value.items)
    &&value.items.length<=limit&&typeof value.hasMore==='boolean'&&Array.isArray(value.reasons)
    &&new Set(value.reasons).size===value.reasons.length&&value.reasons.every(r=>retentionReasons.includes(r)));
  requireRetention(value.state==='ready'||(value.items.length===0&&!value.hasMore));
  const ids=new Set();
  const items=value.items.map(i=>{
    exactKeys(i,[...tupleKeys,'ageSeconds','reason']);const t=tuple(i,true);
    // No supplied integration establishes an eligibility clock or full population
    // coverage. A decision/withdrawal/completion age is not a substitute.
    requireRetention(i.ageSeconds===null&&retentionReasons.includes(i.reason)&&!ids.has(i.itemId)
      &&(i.reason!=='eligible'||ref(i.approvalRef)));ids.add(i.itemId);
    return {...t,ageSeconds:i.ageSeconds,reason:i.reason};
  });
  return {state:value.state,items,hasMore:value.hasMore,reasons:[...value.reasons]};
}
export function retentionResult(value,item){
  exactKeys(value,['outcome','workId','generation','reason','writes']);
  requireRetention(value.workId===item.itemId&&decimal(value.generation)&&retentionReasons.includes(value.reason)
    &&count(value.writes)&&['disposed','already_disposed','minimized','retired','retained','review','refused'].includes(value.outcome));
  const advanced=BigInt(value.generation)===BigInt(item.generation)+1n;
  const unchanged=value.generation===item.generation;
  if(value.outcome==='already_disposed')requireRetention(item.lane==='raw'&&value.writes===0&&advanced&&value.reason==='already_done');
  else if(['disposed','minimized','retired'].includes(value.outcome))requireRetention(value.writes>0&&advanced&&value.reason==='eligible'
    &&(value.outcome==='disposed'?item.lane==='raw':value.outcome==='minimized'?item.lane==='receipt'||item.lane==='marker':item.lane==='marker'));
  else if(value.outcome==='review'&&value.writes>0)requireRetention(item.lane!=='raw'&&advanced&&value.reason!=='eligible');
  else requireRetention(value.writes===0&&unchanged);
  return {outcome:value.outcome,workId:value.workId,generation:value.generation,reason:value.reason,writes:value.writes};
}
export function retentionSweep(value,limit){
  retentionLimit(limit);exactKeys(value,['state','visited','completed','remaining']);
  requireRetention(['unavailable','idle','processed'].includes(value.state)&&count(value.visited)&&value.visited<=limit
    &&count(value.completed)&&value.completed===value.visited&&typeof value.remaining==='boolean');
  requireRetention(value.state==='processed'?value.completed>0:value.completed===0);
  requireRetention(value.state!=='idle'||!value.remaining);
  return {state:value.state,visited:value.visited,completed:value.completed,remaining:value.remaining};
}
export function createLaunchRetentionClient({transport}={}){
  const execute=async(rpc,args,validate)=>{
    try{
      requireRetention(transport!==null&&typeof transport==='object'&&typeof transport.executeBounded==='function');
      return validate(await transport.executeBounded({rpc,args}));
    }catch{throw unavailable();}
  };
  return Object.freeze({
    async inventory({limit=100}={}){retentionLimit(limit);
      return execute('inventory_launch_retention_v1',{p_limit:limit},v=>retentionInventory(v,limit));},
    async apply(item){exactKeys(item,tupleKeys);const t=tuple(item);
      const rpc={raw:'dispose_launch_raw_v1',receipt:'minimize_launch_receipt_v1',marker:'retire_launch_marker_v1'}[t.lane];
      return execute(rpc,{p_item_id:t.itemId,p_generation:t.generation,p_epoch:t.epoch,p_scope:t.scope,p_approval_ref:t.approvalRef},v=>retentionResult(v,t));},
    async sweepRateEvents({limit=100}={}){retentionLimit(limit);
      return execute('sweep_launch_rate_events_v1',{p_limit:limit},v=>retentionSweep(v,limit));},
  });
}
