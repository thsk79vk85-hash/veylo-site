const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateWaitlistSubmission(payload = {}) {
  const company = typeof payload.company === 'string' ? payload.company.trim() : '';

  if (company) {
    return {
      ok: false,
      status: 200,
      message: 'You’re on the list.',
      bot: true,
    };
  }

  const email = normalizeEmail(payload.email);

  if (!email || email.length > 254 || !SIMPLE_EMAIL_PATTERN.test(email)) {
    return {
      ok: false,
      status: 400,
      message: 'Enter a valid email address.',
    };
  }

  return { ok: true, email };
}
