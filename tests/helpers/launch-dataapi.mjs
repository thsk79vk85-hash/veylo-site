// TEST ONLY: one newly owned local Postgres/PostgREST pair. No target, URL,
// credential, image or existing-resource selectors; no application HTTP server.
import { spawnSync,spawn } from 'node:child_process';
import { randomUUID,randomBytes,createHmac } from 'node:crypto';
import {createServer} from 'node:net';
const endpoint='unix:///Users/johntawadros/.docker/run/docker.sock';
const images={
  postgres:'public.ecr.aws/supabase/postgres@sha256:9faa7279bcf1fd6834e65dc876b11e39cb53030bcb3d653beb7e5668200acbb5',
  postgrest:'public.ecr.aws/supabase/postgrest@sha256:488093de819567422bc1d37cb79da6e84bca3726bac321daeed618f0ed957888',
};
const rpcKeys={inventory_launch_retention_v1:['p_limit'],sweep_launch_rate_events_v1:['p_limit'],
  dispose_launch_raw_v1:['p_item_id','p_generation','p_epoch','p_scope','p_approval_ref'],
  minimize_launch_receipt_v1:['p_item_id','p_generation','p_epoch','p_scope','p_approval_ref'],
  retire_launch_marker_v1:['p_item_id','p_generation','p_epoch','p_scope','p_approval_ref']};
export function launchDataApi(...selectors){
  if(selectors.length)throw Error('Owned local DataAPI only.');
  const context=spawnSync('docker',['context','inspect'],{encoding:'utf8',timeout:10000});
  if(context.status!==0||(process.env.DOCKER_HOST||JSON.parse(context.stdout)[0].Endpoints.docker.Host)!==endpoint)
    throw Error('Owned local Unix Docker required.');
  const id=randomUUID(),label=`veylo.task6.owner=${id}`;
  const names={network:`veylo-task6-net-${id}`,postgres:`veylo-task6-pg-${id}`,postgrest:`veylo-task6-api-${id}`};
  const password=randomBytes(24).toString('hex'),secret=randomBytes(48).toString('hex');
  const docker=(...args)=>{
    const r=spawnSync('docker',['--host',endpoint,...args],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
    if(r.status!==0)throw Error(r.stderr||'Owned Docker operation failed.');return r.stdout.trim();
  };
  const sqlArgs=['--host',endpoint,'exec','-i',names.postgres,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d','postgres'];
  const sql=query=>{
    const r=spawnSync('docker',sqlArgs,{input:query,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
    if(r.status!==0)throw Error(r.stderr||'Owned SQL failed.');return r.stdout.trim();
  };
  const jwt=role=>{
    const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const body=Buffer.from(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
    return `${head}.${body}.${createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')}`;
  };
  const headers=Object.freeze(Object.fromEntries(['anon','authenticated','service'].map(role=>[role,Object.freeze({
    'Content-Type':'application/json',Connection:'close',...(role==='anon'?{}:{Authorization:`Bearer ${jwt(role==='service'?'service_role':role)}`}),
  })])));
  let url,started=false,server;
  const sockets=new Set(),children=new Map(),relayDiagnostics=[];
  const relay=socket=>{
    sockets.add(socket);
    const child=spawn('docker',['--host',endpoint,'exec','-i',names.postgres,
      '/usr/bin/nc','-w','30',names.postgrest,'3000']);
    let settle;
    const closed=new Promise(resolve=>{settle=resolve;});children.set(child,closed);
    const fail=()=>{socket.destroy();child.stdin.destroy();child.stdout.destroy();child.kill('SIGTERM');};
    const timer=setTimeout(fail,30000);
    socket.on('error',fail);child.on('error',fail);child.stdin.on('error',fail);child.stdout.on('error',fail);
    let stderr='';child.stderr.on('data',b=>{if(stderr.length<4096)stderr+=b.toString().slice(0,4096-stderr.length);});
    // Pure byte pipes: Node provides backpressure and propagates half-close.
    // No HTTP parsing, rewriting, response synthesis or error normalization.
    socket.pipe(child.stdin);child.stdout.pipe(socket);
    child.on('close',code=>{clearTimeout(timer);children.delete(child);settle();if(relayDiagnostics.length<5)relayDiagnostics.push({code,stderr});if(code!==0)socket.destroy();});
    socket.on('close',()=>{sockets.delete(socket);if(child.exitCode===null)child.kill('SIGTERM');});
  };
  // Exact names plus UUID ownership label are checked even after partial start.
  const cleanup=async()=>{
    started=false;const failures=[];
    const closing=server?.listening?new Promise(resolve=>server.close(resolve)):Promise.resolve();
    for(const socket of sockets)socket.destroy();
    const pending=[...children];
    for(const [child] of pending){child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.kill('SIGTERM');}
    await Promise.all(pending.map(async([child,closed])=>{
      let timer;await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1000);})]);clearTimeout(timer);await closed;
    }));
    await closing;
    for(const name of [names.postgrest,names.postgres,names.network]){
      const network=name===names.network,type=network?'network':'container';
      const r=spawnSync('docker',['--host',endpoint,type,'inspect',name],{encoding:'utf8',timeout:10000});
      if(r.status!==0){if(!/No such (object|container|network)|network .* not found/i.test(r.stderr))failures.push(name);continue;}
      const row=JSON.parse(r.stdout)[0],labels=network?row.Labels:row.Config.Labels;
      if(labels?.['veylo.task6.owner']!==id){failures.push(name);continue;}
      try{
        if(network)docker('network','rm',name);else docker('rm','--force','--volumes',name);
        const gone=spawnSync('docker',['--host',endpoint,type,'inspect',name],{encoding:'utf8',timeout:10000});
        if(gone.status===0||!/No such (object|container|network)|network .* not found/i.test(gone.stderr))failures.push(name);
      }catch{failures.push(name);}
    }
    if(failures.length)throw Error(`Owned cleanup incomplete: ${failures.join(',')}`);
  };
  const transport=Object.freeze({async executeBounded({rpc,args}){
    try{
      const keys=Object.hasOwn(rpcKeys,rpc)?rpcKeys[rpc]:null;
      if(!started||!keys||!args||Object.keys(args).length!==keys.length||!keys.every(k=>Object.hasOwn(args,k)))throw Error();
      // Bound to THIS fixture's PostgREST and startup-configured executing pool.
      // HTTP exceptions/payloads never escape this private supplier. Raw HTTP
      // tests use fetch separately; the byte gateway does no sanitization.
      const r=await fetch(`${url}/rpc/${rpc}`,{method:'POST',headers:headers.service,body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
      if(!r.ok){await r.body?.cancel();throw Error();}return await r.json();
    }catch{throw Error('Launch retention unavailable.');}
  }});
  return {names,images,headers,sql,transport,get url(){return url;},
    fixtureCall:{p_item_id:'11111111-1111-4111-8111-111111111111',p_generation:'9007199254740992',p_epoch:'0',p_scope:'c'.repeat(64),p_approval_ref:'synthetic-http'},
    async start(){
      try{
        for(const image of Object.values(images))docker('image','inspect',image);
        docker('network','create','--internal','--label',label,names.network);
        docker('run','--pull=never','--detach','--name',names.postgres,'--label',label,'--network',names.network,
          '--network-alias','launch-db','--user','postgres','--entrypoint','/bin/sh',images.postgres,'-c',
          '(test -f /tmp/launch-dataapi-pg/PG_VERSION || initdb -D /tmp/launch-dataapi-pg -U postgres --auth-local=trust --auth-host=scram-sha-256 >/tmp/launch-dataapi-init.log) && exec postgres -D /tmp/launch-dataapi-pg -k /tmp -c listen_addresses=*');
        let ready=false;
        for(let n=0;n<100;n++){try{sql('select 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
        if(!ready)throw Error('Owned PostgreSQL did not start.');
        sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
          create role fixture_authenticator login noinherit password '${password}';
          grant anon,authenticated,service_role to fixture_authenticator;
          grant usage on schema public to anon,authenticated,service_role;
          revoke create on schema public from public;
          create schema synthetic_http;
          revoke all on schema synthetic_http from public;
          grant usage on schema synthetic_http to anon,authenticated,service_role;
          create table synthetic_http.fault(mode text);insert into synthetic_http.fault values('none');
          create function synthetic_http.before_request() returns void language plpgsql security definer set search_path=pg_catalog as $hook$
            begin
              if (select mode from synthetic_http.fault)='error' then
                raise exception using message='synthetic-private-backend-marker',detail='synthetic-private-detail';
              elsif (select mode from synthetic_http.fault)='sleep' then perform pg_sleep(6);end if;
            end $hook$;
          revoke all on function synthetic_http.before_request() from public;
          grant execute on function synthetic_http.before_request() to anon,authenticated,service_role;
          copy (select rule from (values ('local all postgres trust'),
            ('host postgres fixture_authenticator samenet scram-sha-256')) rules(rule)) to '/tmp/task6-pg-hba.conf';
          alter system set hba_file='/tmp/task6-pg-hba.conf';`);
        docker('restart',names.postgres);
        ready=false;
        for(let n=0;n<100;n++){try{sql('select 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
        if(!ready)throw Error('Owned PostgreSQL did not become ready after HBA restart.');
        // libpq arms this on each pooled EXECUTING connection at startup, before
        // PostgREST role selection or RPC dispatch. No role/database defaults.
        docker('run','--pull=never','--detach','--name',names.postgrest,'--label',label,'--network',names.network,
          '-e',`PGRST_DB_URI=postgresql://fixture_authenticator:${password}@launch-db:5432/postgres?options=-cstatement_timeout%3D5000&application_name=${names.postgrest}`,
          '-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_CONFIG=false',
          '-e','PGRST_DB_PRE_REQUEST=synthetic_http.before_request',
          '-e','PGRST_DB_POOL=2','-e','PGRST_DB_POOL_ACQUISITION_TIMEOUT=2','-e',`PGRST_JWT_SECRET=${secret}`,images.postgrest);
        if(!JSON.parse(docker('network','inspect',names.network))[0].Internal)throw Error('Owned internal network required.');
        for(const name of [names.postgres,names.postgrest]){
          const row=JSON.parse(docker('inspect',name))[0];
          if(row.Config.Labels?.['veylo.task6.owner']!==id||Object.keys(row.NetworkSettings.Networks).join()!==names.network)
            throw Error('Owned isolated container required.');
        }
        server=createServer({allowHalfOpen:true},relay);
        await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
        url=`http://127.0.0.1:${server.address().port}`;
        let last;
        for(let n=0;n<30;n++){
          try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});last={status:r.status,body:await r.text()};if(r.ok){started=true;return;}}
          catch(error){last={error:error.message};}await new Promise(r=>setTimeout(r,100));
        }
        const logs=spawnSync('docker',['--host',endpoint,'logs',names.postgrest],{encoding:'utf8',timeout:10000});
        console.error(JSON.stringify({owned:names,last,relayDiagnostics,
          postgrestLogs:(logs.stdout+logs.stderr).replaceAll(password,'[synthetic-password]').replaceAll(secret,'[synthetic-jwt-key]')}));
        throw Error('Owned PostgREST did not start.');
      }catch(error){await cleanup();throw error;}
    },cleanup,
    async reload(){
      sql("notify pgrst,'reload schema'");
      for(let n=0;n<100;n++){
        const r=await fetch(`${url}/rpc/inventory_launch_retention_v1`,{method:'POST',headers:headers.service,body:'{"p_limit":1}'});
        if(r.ok)return;await new Promise(r=>setTimeout(r,100));
      }throw Error('Owned schema reload failed.');
    },
  };
}
