const form = document.querySelector('#waitlist-form');
const emailInput = document.querySelector('#waitlist-email');
const message = document.querySelector('#waitlist-message');

if (form && emailInput && message) {
  emailInput.addEventListener('input', () => emailInput.removeAttribute('aria-invalid'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    const email = emailInput.value.trim();
    const company = form.elements.company?.value ?? '';

    message.textContent = '';
    message.dataset.state = '';
    emailInput.removeAttribute('aria-invalid');

    if (!emailInput.validity.valid || !email) {
      emailInput.setAttribute('aria-invalid', 'true');
      message.textContent = 'Enter a valid email address.';
      message.dataset.state = 'error';
      emailInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Joining…';
    form.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, company }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.message || 'Something went wrong. Try again.');
      }

      message.textContent = body.message || 'You’re on the list. We’ll contact you when beta testing opens.';
      message.dataset.state = 'success';
      form.reset();
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Something went wrong. Try again.';
      message.dataset.state = 'error';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Join the waitlist';
      form.removeAttribute('aria-busy');
    }
  });
}
