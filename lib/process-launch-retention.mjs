import { randomUUID } from 'node:crypto';
import { exactKeys, requireRetention, retentionLimit, retentionReasons, retentionInventory, retentionResult, retentionSweep } from './launch-retention-client.mjs';
const lanes=['raw','receipt','marker'],fields=['visited','completed','review','refused'];
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=100;

// Strict schema1 output. No facts, work IDs, errors, raw backend objects or
// implicit all-copy-erasure result are emitted/persisted by the processor.
export function runReceipt(v){
  exactKeys(v,['schemaVersion','runId','state','counts','rateEvents','oldestEligibleAgeSeconds','reasons']);
  requireRetention(v.schemaVersion===1&&typeof v.runId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.runId)
    &&['disabled','unavailable','partial','idle','processed'].includes(v.state));
  exactKeys(v.counts,lanes);let total=0;
  for(const lane of lanes){exactKeys(v.counts[lane],fields);const c=v.counts[lane];
    requireRetention(fields.every(k=>count(c[k]))&&c.completed+c.review+c.refused<=c.visited);total+=c.visited;}
  requireRetention(total<=100);exactKeys(v.rateEvents,['visited','completed','remaining']);
  requireRetention(count(v.rateEvents.visited)&&v.rateEvents.completed===v.rateEvents.visited&&typeof v.rateEvents.remaining==='boolean'
    &&(v.oldestEligibleAgeSeconds===null||(Number.isSafeInteger(v.oldestEligibleAgeSeconds)&&v.oldestEligibleAgeSeconds>=0))
    &&Array.isArray(v.reasons)&&new Set(v.reasons).size===v.reasons.length&&v.reasons.every(r=>retentionReasons.includes(r)));
  if(v.state==='idle'||v.state==='disabled'||v.state==='unavailable')requireRetention(total===0&&v.rateEvents.completed===0);
  if(v.state==='idle')requireRetention(v.reasons.length===0&&!v.rateEvents.remaining);
  if(v.state==='processed')requireRetention(total+v.rateEvents.completed>0&&v.reasons.every(r=>r==='eligible'||r==='already_done')
    &&!v.rateEvents.remaining&&lanes.every(l=>v.counts[l].review+v.counts[l].refused===0));
  return structuredClone(v);
}

export async function processLaunchRetention({client,limit=100}={}){
  retentionLimit(limit);
  const receipt={schemaVersion:1,runId:randomUUID(),state:'unavailable',
    counts:Object.fromEntries(lanes.map(l=>[l,{visited:0,completed:0,review:0,refused:0}])),
    rateEvents:{visited:0,completed:0,remaining:false},oldestEligibleAgeSeconds:null,reasons:[]};
  const reasons=new Set();let blocked=false,inventory,visited=0;
  // Independent transaction FIRST: exceptional launch facts/locks cannot prevent
  // attempting the existing one-day rate cleanup. It has its own 100-row bound.
  try{
    const sweep=retentionSweep(await client.sweepRateEvents({limit:100}),100);
    receipt.rateEvents={visited:sweep.visited,completed:sweep.completed,remaining:sweep.remaining};
    if(sweep.state==='unavailable'){blocked=true;reasons.add('unavailable');}
    if(sweep.remaining){blocked=true;reasons.add('more_work');}
  }catch{blocked=true;reasons.add('unavailable');}
  try{
    inventory=retentionInventory(await client.inventory({limit}),limit);
    for(const reason of inventory.reasons){reasons.add(reason);if(!['eligible','already_done'].includes(reason))blocked=true;}
    if(inventory.hasMore){blocked=true;reasons.add('more_work');}
    if(inventory.state==='unavailable'){blocked=true;reasons.add('unavailable');}
    for(const item of inventory.items){
      const counts=receipt.counts[item.lane];counts.visited++;visited++;
      if(item.reason!=='eligible'||item.approvalRef===null){counts.review++;blocked=true;reasons.add(item.reason);continue;}
      try{
        const {ageSeconds,reason,...tuple}=item;
        const out=retentionResult(await client.apply(tuple),item);
        if(['disposed','minimized','retired'].includes(out.outcome)){
          counts.completed++;receipt.oldestEligibleAgeSeconds=Math.max(receipt.oldestEligibleAgeSeconds??0,ageSeconds);
        }else if(out.outcome!=='already_disposed'){
          counts[out.outcome==='refused'?'refused':'review']++;blocked=true;reasons.add(out.reason);
        }
      }catch{counts.refused++;blocked=true;reasons.add('unavailable');}
    }
  }catch{blocked=true;reasons.add('unavailable');}
  const work=visited+receipt.rateEvents.completed;
  receipt.state=blocked?(work?'partial':'unavailable'):
    inventory?.state==='disabled'?(work?'partial':'disabled'):work?'processed':'idle';
  receipt.reasons=[...reasons].sort();return runReceipt(receipt);
}
