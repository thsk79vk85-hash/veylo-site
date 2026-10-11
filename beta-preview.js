// Review-only flow: no requests, persistent storage, mailing or tester enrolment.
const root = document;
const form = root.querySelector('#beta-form');
const emailInput = root.querySelector('#beta-email');
const result = root.querySelector('#beta-result');
const emailPreview = root.querySelector('#invitation-preview');
const sourceInput = root.querySelector('#preview-source');
const allowedSources = ['direct', 'instagram', 'qut-club', 'campus-poster', 'friend-invite'];
const suppliedSource = new URLSearchParams(location.search).get('source');
sourceInput.value = allowedSources.includes(suppliedSource) ? suppliedSource : 'direct';
let platform = 'android';
const proposedEvents = [];
const androidSteps = `<ol>
<li>Join <a data-access-link="group" href="https://groups.google.com/g/veylo-android-testers" target="_blank" rel="noopener noreferrer">Veylo Android Testers</a> with the <strong>same Google account you use in the Play Store</strong>. Approval may be required; wait until you have group access before continuing.</li>
<li>Open <a data-access-link="testing" href="https://play.google.com/apps/testing/app.veylo" target="_blank" rel="noopener noreferrer">Veylo’s Google Play testing page</a> with that account.</li>
<li>Choose <strong>Become a tester</strong>.</li>
<li>Follow the <a data-access-link="store" href="https://play.google.com/store/apps/details?id=app.veylo" target="_blank" rel="noopener noreferrer">Play Store link</a> and install Veylo.</li></ol>
<p class="beta-small">Testing is limited to an eligible country/region. If you can’t join, check your account, group access and Google Play eligibility.</p>`;
const iosSteps = `<div class="beta-pending"><strong>TestFlight invitation link still needed</strong><br />This is a preview of the iPhone invitation. The real public invitation URL hasn’t been connected.</div><ol><li>Install Apple TestFlight on your iPhone.</li><li>Open Veylo’s enabled public TestFlight invitation when it’s available.</li><li>Accept the invitation and install Veylo in TestFlight.</li></ol><span class="pending-link" aria-disabled="true">Open Veylo in TestFlight — link pending</span>`;
function showTracking() {
  root.querySelector('#proposed-link').textContent = `Proposed campaign link: joinveylo.com/beta?source=${sourceInput.value}`;
  root.querySelector('#tracking-preview').textContent = proposedEvents.length ? JSON.stringify(proposedEvents, null, 2) : 'Try a signup to inspect its proposed fields.';
}
function record(intent, selectedPlatform, event, details = {}) {
  proposedEvents.push({ source: sourceInput.value, platform: selectedPlatform, intent, event, preview_only: true, signup_saved: false, invitation_sent: false, installation: 'not measured', ...details });
  showTracking();
}
function selectPlatform(value) {
  platform = value;
  root.querySelectorAll('[data-platform]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.platform === value)));
  root.querySelector('#beta-email-label').textContent = value === 'android' ? 'Your Google Play email' : 'Email for your beta invitation';
  root.querySelector('#beta-platform-note').textContent = value === 'android' ? 'Join the tester group with the Google account you use in the Play Store. Approval may be required.' : 'iPhone testing uses TestFlight. The public invitation link still needs connecting before access can be offered.';
  root.querySelector('.beta-submit').textContent = `Preview ${value === 'android' ? 'Android' : 'iPhone'} signup →`;
  result.hidden = true;
  emailPreview.hidden = true;
}
root.querySelectorAll('[data-platform]').forEach(button => button.addEventListener('click', () => selectPlatform(button.dataset.platform)));
sourceInput.addEventListener('change', showTracking);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  record('beta', platform, 'signup_preview');
  form.hidden = true;
  result.hidden = false;
  root.querySelector('#beta-result-title').textContent = platform === 'android' ? 'You’re ready for the next step.' : 'Your iPhone invitation preview.';
  root.querySelector('.beta-result-message').textContent = 'Demo only: no signup saved and no invitation sent. Here’s what you would see next.';
  root.querySelector('#beta-next-steps').innerHTML = platform === 'android' ? androidSteps : iosSteps;
  root.querySelector('#show-beta-email').focus();
});
root.querySelector('#show-beta-email').addEventListener('click', () => {
  emailPreview.hidden = false;
  root.querySelector('#email-recipient').textContent = emailInput.value.trim();
  root.querySelector('#email-subject').textContent = platform === 'android' ? 'Here’s how to join Veylo on Android' : 'Your Veylo iPhone beta invitation — draft';
  root.querySelector('#email-heading').textContent = platform === 'android' ? 'Let’s get you set up.' : 'Your early look at Veylo.';
  root.querySelector('#email-steps').innerHTML = platform === 'android' ? androidSteps : iosSteps;
  emailPreview.scrollIntoView({ behavior: 'instant', block: 'start' });
});
root.querySelector('#reset-beta').addEventListener('click', () => {
  form.hidden = false; result.hidden = true; emailPreview.hidden = true;
  emailInput.focus();
});
const launchForm = root.querySelector('#launch-preview-form');
launchForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!launchForm.reportValidity()) return;
  record('launch', root.querySelector('#launch-platform').value, 'signup_preview');
  launchForm.hidden = true;
  root.querySelector('#launch-result').hidden = false;
  root.querySelector('#reset-launch').focus();
});
root.querySelector('#reset-launch').addEventListener('click', () => {
  launchForm.hidden = false; root.querySelector('#launch-result').hidden = true;
  root.querySelector('#launch-email').focus();
});
root.addEventListener('click', event => {
  const link = event.target.closest('[data-access-link]');
  if (link) record('beta', 'android', 'access_link_click', { destination: link.dataset.accessLink });
});
// Enable forms only after their local handlers are installed. No-JS stays inert.
root.querySelectorAll('.beta-fields').forEach(fieldset => { fieldset.disabled = false; });
selectPlatform(platform);
showTracking();
