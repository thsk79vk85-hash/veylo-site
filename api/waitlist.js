import { validateWaitlistSubmission } from '../lib/waitlist.mjs';
import { registerWaitlistEmail } from '../lib/waitlist-service.mjs';

function sendJson(response, status, body) {
  response.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(body));
}

export function createWaitlistHandler({
  register = registerWaitlistEmail,
  env = process.env,
  logger = console,
} = {}) {
  return async function handler(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST');
      return sendJson(response, 405, { message: 'Method not allowed.' });
    }

    const validation = validateWaitlistSubmission(request.body);
    if (!validation.ok) {
      return sendJson(response, validation.status, { message: validation.message });
    }

    if (!env.WAITLIST_SUPABASE_URL || !env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY) {
      logger.error('[waitlist] Separate waitlist database environment variables are not configured.');
      return sendJson(response, 503, {
        message: 'The waitlist is not ready yet. Try again soon.',
      });
    }

    const result = await register({
      email: validation.email,
      supabaseUrl: env.WAITLIST_SUPABASE_URL,
      serviceRoleKey: env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY,
      resendApiKey: env.RESEND_API_KEY,
      fromEmail: env.WAITLIST_FROM_EMAIL,
      siteUrl: 'https://joinveylo.com',
      logger,
    });
    return sendJson(response, result.status, { message: result.message });
  };
}

export default createWaitlistHandler();
