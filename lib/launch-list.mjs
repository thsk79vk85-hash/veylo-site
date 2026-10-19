import { createHash, createHmac } from 'node:crypto';
import { normalizeEmail } from './waitlist.mjs';

// Matches the launch-only wording shipped in beta.html on 11 October.
export const launchConsentVersion = '2026-10-11-v1';
export const launchTemplateVersion = 'launch-v1';

export function launchConfigured(env) {
  try {
    validateLaunchSecrets(env);
    return env.SIGNUPS_ENABLED === 'true' && env.SIGNUP_LAUNCH_ENABLED === 'true'
      && env.WAITLIST_SUPABASE_URL === 'https://yohiumlrpfdhphsnnxxw.supabase.co'
      && Boolean(env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY)
      && ['send', 'disabled'].includes(env.SIGNUP_EMAIL_MODE)
      && (env.SIGNUP_EMAIL_MODE !== 'send' || Boolean(env.RESEND_API_KEY && env.WAITLIST_FROM_EMAIL));
  } catch { return false; }
}

export async function registerLaunchSignup({ signup, env, ip, fetchImpl = fetch }) {
  const unavailable = { status: 503, body: { message: 'Launch signup is temporarily unavailable. Please try again later.' } };
  if (!launchConfigured(env)) return unavailable;
  const headers = { apikey: env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
  async function rpc(name, body) {
    const response = await fetchImpl(`${env.WAITLIST_SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Launch storage unavailable.');
    return response.json();
  }
  try {
    const legacy = signup.source === 'legacy-api';
    const claim = await rpc('claim_launch_signup_v2', {
      p_email: signup.email, p_source: signup.source,
      p_ip_hash: createHmac('sha256', env.SIGNUP_RATE_SECRET).update(ip).digest('hex'),
      p_consent_version: legacy ? null : launchConsentVersion,
      p_consent_status: legacy ? 'unknown' : 'recorded',
      p_launch_match: launchMatch(signup.email, env.SIGNUP_LAUNCH_MATCH_SECRET),
    });
    if (claim.maintenance) return unavailable;
    if (claim.suppressed) return { status: 409, body: { message: 'This address has left the launch list. Contact support@joinveylo.com for help.', contact: 'mailto:support@joinveylo.com' } };
    if (claim.limited) return { status: 429, body: { message: 'A few too many attempts. Please try again in 10 minutes.' } };
    if (typeof claim.send !== 'boolean' || !['pending', 'sent', 'failed', 'disabled', 'review'].includes(claim.delivery)) return unavailable;
    let delivery = claim.delivery;
    if (claim.send) {
      if (!claim.id || !claim.token || !claim.nonce || claim.templateVersion !== launchTemplateVersion || !Number.isSafeInteger(claim.fenceEpoch)) return unavailable;
      let providerId = null;
      if (env.SIGNUP_EMAIL_MODE === 'disabled') delivery = 'disabled';
      else {
        // Pin exact bytes including sender; the database stores no raw link.
        const body = JSON.stringify(buildLaunchEmail({ email: signup.email, id: claim.id, nonce: claim.nonce, env }));
        const pinned = await rpc('pin_launch_payload_v1', { p_id: claim.id, p_token: claim.token, p_payload_hash: createHash('sha256').update(body).digest('hex') });
        if (pinned !== true) return unavailable;
        const authorized = await rpc('authorize_launch_delivery_v1', {
          p_id: claim.id, p_token: claim.token, p_fence_epoch: claim.fenceEpoch,
          p_unsubscribe_hash: hashLaunchToken(deriveLaunchToken(claim.id, claim.nonce, env.SIGNUP_LAUNCH_TOKEN_SECRET)),
        });
        if (authorized !== true) return unavailable;
        // Durable handoff committed: withdrawal cannot recall this call.
        try {
          const response = await fetchImpl('https://api.resend.com/emails', {
            method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'Idempotency-Key': `veylo-signup/${claim.id}` },
            body, signal: AbortSignal.timeout(5000), redirect: 'error',
          });
          const result = await response.json().catch(() => ({}));
          delivery = response.ok && typeof result.id === 'string' && result.id ? 'sent' : (response.ok || response.status >= 500) ? 'pending' : 'failed';
          providerId = delivery === 'sent' ? result.id : null;
        } catch { delivery = 'pending'; }
      }
      try {
        const finished = await rpc('finish_launch_delivery_v1', { p_id: claim.id, p_token: claim.token, p_state: delivery, p_provider_id: providerId });
        if (finished !== true && delivery !== 'sent') delivery = 'pending';
      } catch { if (delivery !== 'sent') delivery = 'pending'; }
    }
    return { status: 200, body: { saved: true, intent: 'launch', platform: signup.platform, delivery, created: claim.created === true } };
  } catch { return unavailable; }
}

export function validateLaunchSecrets(env) {
  const keys = [env.SIGNUP_RATE_SECRET, env.SIGNUP_LAUNCH_MATCH_SECRET, env.SIGNUP_LAUNCH_TOKEN_SECRET];
  if (keys.some(key => typeof key !== 'string' || !key.trim()) || new Set(keys).size !== keys.length) {
    throw new Error('Launch keys must be configured separately.');
  }
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || !secret.trim()) throw new Error('Launch key unavailable.');
}

export function launchMatch(email, secret) {
  requireSecret(secret);
  return createHmac('sha256', secret).update(normalizeEmail(email)).digest('hex');
}

// v1 is a pinned cryptographic domain, not a runtime rotation switch. Retain
// existing keys/nonces until suppression and usable-link obligations are resolved.
export function deriveLaunchToken(id, nonce, secret) {
  requireSecret(secret);
  if (typeof id !== 'string' || !id || typeof nonce !== 'string' || !nonce) throw new Error('Launch identity unavailable.');
  return createHmac('sha256', secret)
    .update(JSON.stringify(['veylo:launch-unsubscribe:v1', id, nonce]))
    .digest('base64url');
}

export function isLaunchToken(token) {
  // Canonical unpadded base64url encoding of exactly 32 bytes.
  return typeof token === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token);
}

export function hashLaunchToken(token) {
  if (!isLaunchToken(token)) throw new Error('Invalid launch link.');
  return createHash('sha256').update(token).digest('hex');
}

export function buildLaunchUnsubscribeUrl(token) {
  if (!isLaunchToken(token)) throw new Error('Invalid launch link.');
  return `https://joinveylo.com/launch-unsubscribe.html#${token}`;
}

// Shared guarded launch sender template.
// Pin this body and its keys for retries; changes require a new template version.
export function buildLaunchEmail({ email, id, nonce, env }) {
  validateLaunchSecrets(env);
  const url = buildLaunchUnsubscribeUrl(deriveLaunchToken(id, nonce, env.SIGNUP_LAUNCH_TOKEN_SECRET));
  const subject = 'You’re on the Veylo launch list';
  const introduction = 'Thanks for joining us! We’ll email you when Veylo launches.';
  const scope = 'Launch notification only. This does not sign you up for beta testing or general marketing.';
  return {
    from: env.WAITLIST_FROM_EMAIL,
    to: email,
    subject,
    text: ['Hey!', introduction, scope, `Leave the launch list: ${url}`, 'Need help? support@joinveylo.com', 'See you between classes,\nThe Veylo team'].join('\n\n'),
    html: `<div><h1>veylo.</h1><h2>${subject}</h2><p>${introduction}</p><p>${scope}</p><p><a href="${url}">Leave the launch list</a></p><p>Need help? <a href="mailto:support@joinveylo.com">support@joinveylo.com</a></p><p>See you between classes,<br>The Veylo team</p></div>`,
  };
}

export async function withdrawLaunch({ token, env, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(`${env.WAITLIST_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/withdraw_launch_v1`, {
      method: 'POST',
      headers: {
        apikey: env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_token_hash: hashLaunchToken(token) }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('storage');
    const result = await response.json();
    if (!['withdrawn', 'already_withdrawn', 'invalid'].includes(result?.outcome)) throw new Error('storage');
    return { outcome: result.outcome };
  } catch {
    // Do not propagate provider bodies, URLs, request input or error causes.
    throw new Error('Launch withdrawal unavailable.');
  }
}
