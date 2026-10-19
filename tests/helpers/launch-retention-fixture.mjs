// TEST ONLY. Owns a freshly created network-none fixture; accepts no target,
// credentials, connection object, SQL selector or pre-existing container.
import { spawnSync,spawn } from 'node:child_process';
import { launchPostgres } from './launch-postgres.mjs';
const endpoint='unix:///Users/johntawadros/.docker/run/docker.sock';
const names={inventory_launch_retention_v1:['p_limit'],sweep_launch_rate_events_v1:['p_limit'],
  dispose_launch_raw_v1:['p_item_id','p_generation','p_epoch','p_scope','p_approval_ref'],
  minimize_launch_receipt_v1:['p_item_id','p_generation','p_epoch','p_scope','p_approval_ref'],
  retire_launch_marker_v1:['p_item_id','p_generation','p_epoch','p_scope','p_approval_ref']};
const failure=()=>Error('Launch retention unavailable.');
export function createOwnedLaunchRetentionFixture(...selectors){
  if(selectors.length)throw failure();
  const context=spawnSync('docker',['context','inspect'],{encoding:'utf8'});
  if(context.status!==0||(process.env.DOCKER_HOST||JSON.parse(context.stdout)[0].Endpoints.docker.Host)!==endpoint)throw failure();
  const db=launchPostgres();let started=false;
  const transport=Object.freeze({async executeBounded({rpc,args}){
    const keys=Object.hasOwn(names,rpc)?names[rpc]:null;
    if(!started||!keys||!args||Object.keys(args).length!==keys.length||!keys.every(k=>Object.hasOwn(args,k)))throw failure();
    // Named parameters are fixed. SQL string literals are encoded, not shell
    // interpolated. libpq applies PGOPTIONS on THIS connection before role SET
    // or any SELECT. Each SELECT is one server autocommit transaction.
    const literal=v=>v===null?'null':`'${String(v).replaceAll("'","''")}'`;
    const query=`set role service_role;\nselect public.${rpc}(${keys.map(k=>`${k} => ${literal(args[k])}`).join(',')});\n`;
    const out=await new Promise((resolve,reject)=>{
      const child=spawn('docker',['--host',endpoint,'exec','-i','-e','PGOPTIONS=-c statement_timeout=5000',db.name,
        'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-h','/tmp']);
      let output='';const timer=setTimeout(()=>{child.kill('SIGKILL');},15000);
      child.stdout.on('data',b=>output+=b);child.stderr.resume(); // no raw private errors escape
      child.on('error',()=>{clearTimeout(timer);reject(failure());});
      child.stdin.on('error',()=>{});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(failure());});
      child.stdin.end(query);
    });
    try{return JSON.parse(out);}catch{throw failure();}
  }});
  return {db,transport,
    async start(){
      await db.start();
      const inspected=spawnSync('docker',['--host',endpoint,'inspect',db.name],{encoding:'utf8'});
      const row=inspected.status===0?JSON.parse(inspected.stdout)[0]:null;
      if(!row||row.Name!==`/${db.name}`||row.HostConfig.NetworkMode!=='none'||row.Config.Labels?.['veylo.launch-test']!=='true')throw failure();
      started=true;
    },
    cleanup(){started=false;db.cleanup();},
  };
}
