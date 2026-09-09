const DEFAULT_SITE_URL = 'https://joinveylo.com';

export function buildWaitlistConfirmation({ to, from, siteUrl = DEFAULT_SITE_URL }) {
  const subject = 'You’re on the Veylo waitlist';
  const text = [
    'You’re on the list! Thanks for joining us.',
    '',
    'See which friends are on campus, find out who’s free, and make plans between classes.',
    '',
    'We’ll email you when Veylo launches. We’re starting with QUT, UQ and Griffith, on iPhone and Android.',
    '',
    `Learn more: ${siteUrl}`,
    '',
    '— The Veylo team',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#F4F8F7;color:#17211F;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">You’re on the Veylo waitlist.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F8F7;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D9E4E1;border-top:4px solid #D8643C;border-radius:20px">
          <tr><td style="padding:36px">
            <p style="margin:0 0 24px;color:#146C63;font-size:24px;font-weight:700">Veylo</p>
            <h1 style="margin:0 0 18px;font-size:32px;line-height:1.15">You’re on the waitlist.</h1>
            <p style="margin:0 0 18px;line-height:1.65">You’re on the list! Thanks for joining us.</p>
            <p style="margin:0 0 18px;line-height:1.65">See which friends are on campus, find out who’s free, and make plans between classes.</p>
            <p style="margin:0 0 26px;line-height:1.65">We’ll email you when Veylo launches. We’re starting with QUT, UQ and Griffith, on iPhone and Android.</p>
            <a href="${siteUrl}" style="display:inline-block;padding:13px 18px;border-radius:12px;background:#146C63;color:#FFFFFF;text-decoration:none;font-weight:700">Visit Veylo</a>
            <p style="margin:30px 0 0;color:#65736F;font-size:14px">— The Veylo team</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { from, to, subject, html, text };
}

export async function sendWaitlistConfirmation({
  apiKey,
  to,
  from,
  siteUrl = DEFAULT_SITE_URL,
  fetchImpl = fetch,
  logger = console,
  resendRequestTimeoutMs = 3000,
}) {
  if (!apiKey || !from) {
    logger.error('[waitlist-email] Resend configuration is missing.');
    return { ok: false };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), resendRequestTimeoutMs);

  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildWaitlistConfirmation({ to, from, siteUrl })),
      signal: abortController.signal,
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      logger.error('[waitlist-email] Resend rejected the request.', {
        status: response.status,
        name: body.name,
      });
      return { ok: false };
    }

    return { ok: true, id: body.id };
  } catch {
    if (abortController.signal.aborted) {
      logger.error('[waitlist-email] Resend request timed out.', {
        category: 'request_timeout',
      });
      return { ok: false };
    }

    logger.error('[waitlist-email] Resend request failed.', {
      category: 'transport_exception',
    });
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
