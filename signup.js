// Live signup page. Server responses, never a click alone, determine success.
const sourceOptions=['direct','instagram','qut-club','campus-poster','friend-invite'];
const proposedSource=new URLSearchParams(location.search).get('source');
const source=sourceOptions.includes(proposedSource)?proposedSource:'direct';
let platform='android';
const betaForm=document.querySelector('#beta-form');
const launchForm=document.querySelector('#launch-preview-form');
const result=document.querySelector('#beta-result');
const email=document.querySelector('#beta-email');
function choose(value){platform=value;document.querySelectorAll('[data-platform]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.platform===value)));document.querySelector('#beta-email-label').textContent=value==='ios'?'Email for your beta invitation':'Your Google Play email';document.querySelector('#beta-platform-note').textContent=value==='ios'?'Sign up to get the invitation link to open in Apple TestFlight.':'Use your Play Store Google account. Join the tester group first; approval may be required.';document.querySelector('.beta-submit').textContent=`Get ${value==='ios'?'iPhone':'Android'} beta access →`;}
document.querySelectorAll('[data-platform]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.platform)));
function safeLink(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function addStep(list,text,url){const li=document.createElement('li');if(url){const a=safeLink(url);a.textContent=text;li.append(a);}else li.textContent=text;list.append(li);}
function displayAccess(data){const container=document.querySelector('#beta-next-steps');container.replaceChildren();const list=document.createElement('ol');container.append(list);if(data.platform==='ios'){addStep(list,'Install Apple TestFlight on your iPhone.');addStep(list,'Open Veylo in TestFlight',data.links.testflight);addStep(list,'Tap Accept, then Install.');}else{addStep(list,'Join Veylo Android Testers with your Play Store Google account.',data.links.group);addStep(list,'Approval may be required. Wait until you have group access.');addStep(list,'Open the testing page with that same Google account.',data.links.testing);addStep(list,'Choose Become a tester.');addStep(list,'Follow the Play Store link to install.',data.links.store);const note=document.createElement('p');note.className='beta-small';note.textContent='Access depends on your Google Play country/region. Please try the app, send us feedback, and stay opted in for at least 14 days.';container.append(note);}}
async function submit(form,intent,selectedPlatform,input){
 if(!form.reportValidity())return;
 const fields=form.querySelector('fieldset'),message=form.querySelector('[role="alert"]');
 if(fields.disabled)return;
 const body={email:input.value,intent,platform:selectedPlatform,source,consent:true,company:form.querySelector('[name="company"]').value};
 fields.disabled=true;message.textContent='';
 const controller=new AbortController();let timedOut=false;
 const timeout=setTimeout(()=>{timedOut=true;controller.abort();},22000);
 try{const response=await fetch('/api/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const data=await response.json();if(!response.ok||!data.saved)throw Error(data.message||'We couldn’t save your signup. Please try again.');
 form.hidden=true;
 const delivery=data.delivery==='disabled'?'Your signup is saved.':data.delivery==='sent'?'Your email has been accepted for sending. Check your inbox and spam folder.':data.delivery==='pending'?'Your signup is saved. Email delivery is still being checked.':'Your signup is saved, but we couldn’t send the email right now.';
 if(intent==='beta'){document.querySelector('#beta-result-title').textContent='You’re ready for the next step.';document.querySelector('.beta-result-message').textContent=delivery+' You can also use the steps below.';displayAccess(data);result.hidden=false;document.querySelector('#reset-beta').focus();}
 else{const output=document.querySelector('#launch-result');output.querySelector('[role="status"]').textContent='You’re on the launch list. We’ll email you when Veylo launches. No beta or marketing subscription. '+delivery;output.hidden=false;document.querySelector('#reset-launch').focus();}
 }catch(error){message.textContent=timedOut?'We couldn’t confirm your signup. Please try again; your signup won’t be duplicated.':error.message==='Failed to fetch'?'Check your connection and try again.':error.message;}finally{clearTimeout(timeout);fields.disabled=false;}
}
betaForm.addEventListener('submit',event=>{event.preventDefault();void submit(betaForm,'beta',platform,email);});
launchForm.addEventListener('submit',event=>{event.preventDefault();void submit(launchForm,'launch',document.querySelector('#launch-platform').value,document.querySelector('#launch-email'));});
document.querySelector('#reset-beta').addEventListener('click',()=>{result.hidden=true;betaForm.hidden=false;email.focus();});
document.querySelector('#reset-launch').addEventListener('click',()=>{document.querySelector('#launch-result').hidden=true;launchForm.hidden=false;document.querySelector('#launch-email').focus();});
document.querySelectorAll('.beta-fields').forEach(fieldset=>fieldset.disabled=false);choose(platform);
