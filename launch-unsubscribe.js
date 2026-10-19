(() => {
  let token = window.location.hash.slice(1);
  // Drop the fragment (and any untrusted query) before attaching interactions.
  // The capability remains only in this page closure, never browser storage.
  window.history.replaceState(null, '', window.location.pathname);
  const button = document.getElementById('unsubscribe-button');
  const status = document.getElementById('unsubscribe-status');
  const invalid = 'This link is invalid or expired. Please contact support@joinveylo.com.';
  let usable = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token);
  let busy = false;
  button.disabled = !usable;
  status.textContent = usable ? 'Choose Remove me to stop launch-list emails. No login is needed.' : invalid;
  if (!usable) token = '';

  button.addEventListener('click', async () => {
    if (!usable || busy) return;
    busy = true;
    button.disabled = true;
    status.textContent = 'Removing you from the launch list…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/launch-unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (response.status === 400) {
        usable = false;
        token = '';
        status.textContent = invalid;
        return;
      }
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      if (!['withdrawn', 'already_withdrawn'].includes(result?.outcome)) throw new Error('unavailable');
      usable = false;
      token = '';
      status.textContent = 'You’re removed from the launch list. Your beta registration and Veylo account are unchanged. An email already on its way may still arrive.';
    } catch {
      status.textContent = 'We couldn’t confirm removal. Please try again or contact support@joinveylo.com.';
    } finally {
      clearTimeout(timeout);
      busy = false;
      button.disabled = !usable;
    }
  });
})();
