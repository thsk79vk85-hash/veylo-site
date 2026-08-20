const DEFAULT_SITE_URL = 'https://veylo-site-preview.vercel.app';

export function buildWaitlistConfirmation({ to, from, siteUrl = DEFAULT_SITE_URL }) {
  const subject = 'You’re on the Veylo waitlist';
  const text = [
    'You’ve been successfully added to the Veylo waitlist.',
    '',
    'Veylo is a campus social app that helps university students see which friends are sharing that they are around, discover useful campus updates, and turn those updates into real plans.',
    '',
    'Veylo is in active development. Our team may contact you about early beta access, testing opportunities, and ways to help shape the app before launch.',
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
            <p style="margin:0 0 18px;line-height:1.65">You’ve been successfully added to the Veylo waitlist.</p>
            <p style="margin:0 0 18px;line-height:1.65">Veylo is a campus social app that helps university students see which friends are sharing that they are around, discover useful campus updates, and turn those updates into real plans.</p>
            <p style="margin:0 0 26px;line-height:1.65">Veylo is in active development. Our team may contact you about early beta access, testing opportunities, and ways to help shape the app before launch.</p>
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
}) {
  if (!apiKey || !from) {
    logger.error('[waitlist-email] Resend configuration is missing.');
    return { ok: false };
  }

  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildWaitlistConfirmation({ to, from, siteUrl })),
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
    logger.error('[waitlist-email] Resend request failed.', {
      category: 'transport_exception',
    });
    return { ok: false };
  }
}
