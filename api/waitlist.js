import { validateWaitlistSubmission } from '../lib/waitlist.mjs';

function sendJson(response, status, body) {
  response.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    return sendJson(response, 405, { message: 'Method not allowed.' });
  }

  const validation = validateWaitlistSubmission(request.body);

  if (!validation.ok) {
    return sendJson(response, validation.status, { message: validation.message });
  }

  const supabaseUrl = process.env.WAITLIST_SUPABASE_URL;
  const serviceRoleKey = process.env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[waitlist] Separate waitlist database environment variables are not configured.');
    return sendJson(response, 503, { message: 'The waitlist is not ready yet. Try again soon.' });
  }

  try {
    const insertResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ email: validation.email }),
    });

    if (insertResponse.ok) {
      return sendJson(response, 201, {
        message: 'You’re on the list. We’ll contact you when beta testing opens.',
      });
    }

    const errorBody = await insertResponse.json().catch(() => ({}));

    if (insertResponse.status === 409 || errorBody.code === '23505') {
      return sendJson(response, 200, { message: 'You’re already on the waitlist.' });
    }

    console.error('[waitlist] Supabase insert failed.', {
      status: insertResponse.status,
      code: errorBody.code,
    });
    return sendJson(response, 500, { message: 'Something went wrong. Try again.' });
  } catch (error) {
    console.error('[waitlist] Unexpected insert failure.', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return sendJson(response, 500, { message: 'Something went wrong. Try again.' });
  }
}
