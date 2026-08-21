import { sendWaitlistConfirmation } from './waitlist-confirmation.mjs';

export async function registerWaitlistEmail({
  email,
  supabaseUrl,
  serviceRoleKey,
  resendApiKey,
  fromEmail,
  siteUrl,
  fetchImpl = fetch,
  sendConfirmation = sendWaitlistConfirmation,
  logger = console,
  resendRequestTimeoutMs,
}) {
  try {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ email }),
    });

    if (response.ok) {
      try {
        await sendConfirmation({
          apiKey: resendApiKey,
          to: email,
          from: fromEmail,
          siteUrl,
          fetchImpl,
          logger,
          resendRequestTimeoutMs,
        });
      } catch {
        logger.error('[waitlist] Confirmation delivery failed.', {
          category: 'delivery_exception',
        });
      }
      return {
        status: 201,
        message: 'You’re on the list. We’ll contact you when beta testing opens.',
      };
    }

    const body = await response.json().catch(() => ({}));
    if (response.status === 409 || body.code === '23505') {
      return { status: 200, message: 'You’re already on the waitlist.' };
    }

    logger.error('[waitlist] Supabase insert failed.', {
      status: response.status,
      code: body.code,
    });
    return { status: 500, message: 'Something went wrong. Try again.' };
  } catch {
    logger.error('[waitlist] Unexpected insert failure.', { category: 'insert_exception' });
    return { status: 500, message: 'Something went wrong. Try again.' };
  }
}
