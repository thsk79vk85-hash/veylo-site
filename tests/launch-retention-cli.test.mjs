import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runCli } from '../scripts/launch-retention.mjs';
test('default CLI is offline/unbound with zero work and no environment route',async()=>{
  const p=spawnSync(process.execPath,['scripts/launch-retention.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8',
    env:{...process.env,WAITLIST_SUPABASE_URL:'https://must-not-contact.invalid',WAITLIST_SUPABASE_SERVICE_ROLE_KEY:'never-output-secret'}});
  assert.equal(p.status,0);assert.equal(p.stderr,'');
  const r=JSON.parse(p.stdout);assert.equal(r.state,'unavailable');assert.equal(r.counts.raw.visited,0);
  assert.doesNotMatch(p.stdout,/secret|must-not-contact|@/);
});
test('CLI rejects live/URL/key/force/apply and invalid limits with only fixed output',async()=>{
  for(const argv of [['--live'],['--url','https://secret.invalid'],['--key','secret'],['--force'],['--apply'],['--limit','101'],['--limit','1','--limit','2']]){
    let output='';assert.equal(await runCli(argv,{stdout:s=>output+=s}),1);
    assert.deepEqual(JSON.parse(output),{schemaVersion:1,state:'unavailable',reason:'invalid_arguments'});
  }
});
test('CLI local dry-run bounds are accepted but cannot inject a client',async()=>{
  let output='';assert.equal(await runCli(['--limit','1'],{stdout:s=>output+=s,client:{inventory(){assert.fail('injected');}}}),0);
  assert.equal(JSON.parse(output).state,'unavailable');
});
