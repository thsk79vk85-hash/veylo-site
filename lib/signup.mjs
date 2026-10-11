import { createHmac } from 'node:crypto';
import { normalizeEmail, validateWaitlistSubmission } from './waitlist.mjs';
export const sources = ['direct','instagram','qut-club','campus-poster','friend-invite'];
export const links = Object.freeze({ ios: 'https://testflight.apple.com/join/pFa6262T', group: 'https://groups.google.com/g/veylo-android-testers', testing: 'https://play.google.com/apps/testing/app.veylo', store: 'https://play.google.com/store/apps/details?id=app.veylo' });
export function validateSignup(body) {
 if (!body || typeof body!=='object' || Array.isArray(body)) return {ok:false,status:400,message:'Check your signup details.'};
 const base=validateWaitlistSubmission(body); if(!base.ok) return base;
 if(!['beta','launch'].includes(body.intent) || !['ios','android','unspecified'].includes(body.platform) || (body.intent==='beta' && body.platform==='unspecified')) return {ok:false,status:400,message:'Choose your phone and signup option.'};
 if(body.consent!==true) return {ok:false,status:400,message:'Please confirm the signup option.'};
 return {ok:true,email:normalizeEmail(body.email),intent:body.intent,platform:body.platform,source:sources.includes(body.source)?body.source:'direct'};
}
export function hashAddress(ip,secret){return createHmac('sha256',secret).update(ip).digest('hex');}
export function buildSignupEmail({email,intent,platform,from}) {
 const launch=intent==='launch';
 const subject=launch?'You’re on the Veylo launch list':platform==='ios'?'Your Veylo iPhone beta invitation':'Here’s how to join Veylo on Android';
 const lines=launch?['Thanks for joining us! We’ll email you when Veylo launches.','Launch notification only. This does not sign you up for beta testing or general marketing.']:platform==='ios'?['Install Apple TestFlight on your iPhone.',`Open Veylo’s invitation: ${links.ios}`,'Tap Accept, then Install in TestFlight.']:['Use the same Google account for both steps and your Play Store.',`1. Join Veylo Android Testers: ${links.group}`,'Group approval may be required. Wait for access before continuing.',`2. Open ${links.testing} and choose Become a tester.`,`3. Follow the download link to install: ${links.store}`,'Access depends on your Google Play country/region.','Please try the app, send us your feedback, and stay opted in for at least 14 days.'];
 const text=['Hey!',...lines,'','See you between classes,','The Veylo team'].join('\n\n');
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const html=`<div style="background:#f8f7ef;color:#173f37;padding:32px;font:16px/1.7 Arial,sans-serif"><h1 style="font-size:30px">veylo.</h1><h2>${escape(subject)}</h2>${lines.map(line=>`<p>${escape(line).replace(/https:\/\/[^\s<]+/g,url=>`<a style="color:#173f37" href="${url}">${url}</a>`)}</p>`).join('')}<p>See you between classes,<br>The Veylo team</p></div>`;
 return {from,to:email,subject,text,html};
}
export async function registerSignup({signup,env,ip,fetchImpl=fetch}) {
 const headers={apikey:env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'};
 async function rpc(name,body){const r=await fetchImpl(`${env.WAITLIST_SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('storage');return r.json();}
 const claim=await rpc('claim_signup_v1',{p_email:signup.email,p_intent:signup.intent,p_platform:signup.platform,p_source:signup.source,p_ip_hash:hashAddress(ip,env.SIGNUP_RATE_SECRET)});
 if(claim.limited)return {status:429,body:{message:'A few too many attempts. Please try again in 10 minutes.'}};
 let delivery=claim.delivery;
 if(claim.send){
  delivery='disabled'; let providerId=null;
  if(env.SIGNUP_EMAIL_MODE==='send') {
   try {
    const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':`veylo-signup/${claim.id}`},body:JSON.stringify(buildSignupEmail({...signup,from:env.WAITLIST_FROM_EMAIL})),signal:AbortSignal.timeout(5000)});
    const data=await response.json().catch(()=>({}));
    delivery=response.ok && data.id?'sent':(response.ok || response.status>=500)?'pending':'failed'; providerId=delivery==='sent'?data.id:null;
   } catch { delivery='pending'; }
  }
  try { await rpc('finish_signup_delivery_v1',{p_id:claim.id,p_token:claim.token,p_state:delivery,p_provider_id:providerId}); } catch { if(delivery!=='sent')delivery='pending'; }
 }
 return {status:200,body:{saved:true,intent:signup.intent,platform:signup.platform,delivery,links:signup.intent==='beta'?(signup.platform==='ios'?{testflight:links.ios}:{group:links.group,testing:links.testing,store:links.store}):undefined}};
}
