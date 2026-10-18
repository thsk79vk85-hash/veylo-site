import { isLaunchToken, withdrawLaunch } from '../lib/launch-list.mjs';

const unavailable = 'We couldn’t confirm removal. Please try again or contact support@joinveylo.com.';
const invalid = 'This link is invalid or expired. Please contact support@joinveylo.com.';

export function createLaunchUnsubscribeHandler({ env = process.env, withdraw = withdrawLaunch } = {}) {
  return async function handler(req, res) {
    const send = (status, body) => {
      res.status(status);
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('x-robots-tag', 'noindex, nofollow');
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return send(405, { message: 'Method not allowed.' });
    }
    // Activation requires Task3 guarded writers AND Task5 historical-writer
    // controls. Task2 must not promise suppression against old deployments.
    if (env.SIGNUP_LAUNCH_UNSUBSCRIBE_ENABLED !== 'true' || !env.WAITLIST_SUPABASE_URL || !env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY) {
      return send(503, { message: unavailable });
    }
    if (req.headers?.['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return send(415, { message: 'Use JSON for this request.' });
    }
    try {
      if (Number(req.headers?.['content-length'] || 0) > 4096 || Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8') > 4096) {
        return send(413, { message: 'Request is too large.' });
      }
    } catch { return send(400, { message: invalid }); }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !isLaunchToken(req.body.token)) {
      return send(400, { message: invalid });
    }
    try {
      const result = await withdraw({ token: req.body.token, env });
      if (result?.outcome === 'invalid') return send(400, { message: invalid });
      if (!['withdrawn', 'already_withdrawn'].includes(result?.outcome)) return send(503, { message: unavailable });
      return send(200, { outcome: result.outcome });
    } catch { return send(503, { message: unavailable }); }
  };
}

export default createLaunchUnsubscribeHandler();
