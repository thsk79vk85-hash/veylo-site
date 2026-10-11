import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSignup,registerSignup,buildSignupEmail,hashAddress,links} from '../lib/signup.mjs';
import {createSignupHandler} from '../api/signup.js';
const signup={email:'person@example.com',intent:'beta',platform:'ios',source:'qut-club',consent:true};
const env={SIGNUPS_ENABLED:'true',SIGNUP_EMAIL_MODE:'send',WAITLIST_SUPABASE_URL:'https://database.example',WAITLIST_SUPABASE_SERVICE_ROLE_KEY:'fixture-key',SIGNUP_RATE_SECRET:'fixture-secret',RESEND_API_KEY:'fixture-resend',WAITLIST_FROM_EMAIL:'Veylo <test@example.com>'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('requires explicit independent intent, valid platform and consent',()=>{
 assert.equal(validateSignup({...signup,intent:undefined}).ok,false);
 assert.equal(validateSignup({...signup,platform:'unspecified'}).ok,false);
 assert.equal(validateSignup({...signup,intent:'launch',platform:'unspecified'}).ok,true);
 assert.equal(validateSignup({...signup,consent:false}).ok,false);
 assert.equal(validateSignup({...signup,source:'untrusted value'}).source,'direct');
 assert.equal(validateSignup({...signup,email:' PERSON@EXAMPLE.COM '}).email,'person@example.com');
 assert.equal(validateSignup(null).ok,false);
 assert.equal(validateSignup({...signup,company:'bot'}).bot,true);
});
test('email templates separate launch consent from beta and use verified links',()=>{
 const ios=buildSignupEmail({...signup,from:env.WAITLIST_FROM_EMAIL});assert.ok(ios.text.includes(links.ios));
 const android=buildSignupEmail({...signup,platform:'android',from:env.WAITLIST_FROM_EMAIL});assert.ok(android.text.includes(links.group));assert.ok(android.text.includes('14 days'));assert.ok(android.text.includes('same Google account'));
 const launch=buildSignupEmail({...signup,intent:'launch',from:env.WAITLIST_FROM_EMAIL});assert.ok(launch.text.includes('Launch notification only'));assert.ok(!launch.text.includes(links.ios));assert.ok(!launch.text.includes(links.group));
});
test('rate identifier is keyed and never the raw IP',()=>{assert.equal(hashAddress('1.2.3.4','a').length,64);assert.notEqual(hashAddress('1.2.3.4','a'),hashAddress('1.2.3.4','b'));});
test('successful send uses stable provider idempotency and records delivery',async()=>{
 const calls=[];const out=await registerSignup({signup,env,ip:'1.2.3.4',fetchImpl:async(url,opts)=>{calls.push({url,...opts});if(calls.length===1)return response({id:'fixture-id',token:'fixture-token',send:true});if(calls.length===2)return response({id:'provider-id'});return response(true);}});
 assert.equal(out.body.saved,true);assert.equal(out.body.delivery,'sent');assert.equal(out.body.links.testflight,links.ios);assert.equal(calls[1].headers['Idempotency-Key'],'veylo-signup/fixture-id');
 const claim=JSON.parse(calls[0].body);assert.equal(claim.p_source,'qut-club');assert.equal(claim.p_intent,'beta');assert.equal(claim.p_platform,'ios');assert.equal(claim.p_ip_hash.length,64);
 assert.equal(JSON.parse(calls[2].body).p_state,'sent');
});
test('duplicate sent registration does not send another email',async()=>{
 let calls=0;const out=await registerSignup({signup,env,ip:'1',fetchImpl:async()=>{calls++;return response({id:'fixture-id',send:false,delivery:'sent'});}});assert.equal(calls,1);assert.equal(out.body.saved,true);
});
test('disabled delivery saves but never calls email provider',async()=>{
 const calls=[];const out=await registerSignup({signup,env:{...env,SIGNUP_EMAIL_MODE:'disabled'},ip:'1',fetchImpl:async(url)=>{calls.push(url);return response(calls.length===1?{id:'fixture-id',token:'token',send:true}:true);}});assert.equal(out.body.delivery,'disabled');assert.equal(calls.some(url=>url.includes('resend')),false);
});
test('provider rejection leaves saved signup and honest failed delivery',async()=>{
 let n=0;const out=await registerSignup({signup,env,ip:'1',fetchImpl:async()=>{n++;return n===1?response({id:'id',token:'token',send:true}):n===2?response({error:'denied'},403):response(true);}});assert.equal(out.body.saved,true);assert.equal(out.body.delivery,'failed');
});
test('uncertain transport outcome is pending, not falsely sent or lost',async()=>{
 let n=0;const out=await registerSignup({signup,env,ip:'1',fetchImpl:async()=>{n++;if(n===2)throw Error('timeout');return response(n===1?{id:'id',token:'token',send:true}:true);}});assert.equal(out.body.saved,true);assert.equal(out.body.delivery,'pending');
});
test('database failure prevents email and successful signup response',async()=>{
 let n=0;await assert.rejects(registerSignup({signup,env,ip:'1',fetchImpl:async()=>{n++;return response({},500);}}));assert.equal(n,1);
});
test('rate-limited response cannot send email',async()=>{
 let n=0;const out=await registerSignup({signup,env,ip:'1',fetchImpl:async()=>{n++;return response({limited:true});}});assert.equal(out.status,429);assert.equal(n,1);assert.equal(out.body.saved,undefined);
});
async function runHandler(req,config=env,register=async()=>({status:200,body:{saved:true}})){
 const result={headers:{}};const res={status(s){result.status=s;return this;},setHeader(k,v){result.headers[k]=v;return this;},end(s){result.body=JSON.parse(s);}};
 await createSignupHandler({env:config,register})({method:'POST',headers:{'content-type':'application/json'},body:signup,...req},res);return result;
}
test('API fails closed without enable flag or delivery configuration',async()=>{assert.equal((await runHandler({}, {...env,SIGNUPS_ENABLED:'false'})).status,503);assert.equal((await runHandler({}, {...env,RESEND_API_KEY:''})).status,503);});
test('API rejects method, invalid JSON shape and oversized payload',async()=>{assert.equal((await runHandler({method:'GET'})).status,405);assert.equal((await runHandler({body:null})).status,400);assert.equal((await runHandler({body:{...signup,extra:'x'.repeat(5000)}})).status,413);});
test('API never exposes backend error details',async()=>{const out=await runHandler({},env,async()=>{throw Error('fixture-secret');});assert.equal(out.status,503);assert.ok(!JSON.stringify(out).includes('fixture-secret'));assert.equal(out.body.saved,undefined);});
