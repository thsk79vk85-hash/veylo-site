import { validateWaitlistSubmission } from '../lib/waitlist.mjs';
import { registerWaitlistEmail } from '../lib/waitlist-service.mjs';
import { launchConfigured } from '../lib/launch-list.mjs';

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

    if (request.headers?.['content-type']?.split(';')[0] !== 'application/json') return sendJson(response, 415, { message: 'Use JSON for signup.' });
    if (Number(request.headers?.['content-length'] || 0) > 4096 || JSON.stringify(request.body ?? {}).length > 4096) return sendJson(response, 413, { message: 'Signup request is too large.' });
    const validation = validateWaitlistSubmission(request.body);
    if (!validation.ok) {
      return sendJson(response, validation.status, { message: validation.message });
    }

    if (!launchConfigured(env)) {
      logger.error('[waitlist] Guarded launch signup is disabled or not configured.');
      return sendJson(response, 503, {
        message: 'The waitlist is not ready yet. Try again soon.',
      });
    }

    try {
      const result = await register({
        email: validation.email,
        env,
        ip: String(request.headers?.['x-vercel-forwarded-for'] || request.headers?.['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim(),
      });
      return sendJson(response, result.status, { message: result.message });
    } catch { return sendJson(response, 503, { message: 'We couldn’t save your signup. Please try again.' }); }
  };
}

export default createWaitlistHandler();
