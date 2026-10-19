export const launchEnv = {
  SIGNUPS_ENABLED: 'true', SIGNUP_LAUNCH_ENABLED: 'true', SIGNUP_EMAIL_MODE: 'send',
  WAITLIST_SUPABASE_URL: 'https://yohiumlrpfdhphsnnxxw.supabase.co',
  WAITLIST_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', SIGNUP_RATE_SECRET: 'synthetic-rate',
  SIGNUP_LAUNCH_MATCH_SECRET: 'synthetic-match', SIGNUP_LAUNCH_TOKEN_SECRET: 'synthetic-token',
  RESEND_API_KEY: 'synthetic-provider', WAITLIST_FROM_EMAIL: 'Veylo <sender@test.invalid>',
};
export const launchSignup = { email: 'person@test.invalid', intent: 'launch', platform: 'unspecified', source: 'direct', consent: true };
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
export const freshClaim = { id: '00000000-0000-4000-8000-000000000071', token: '00000000-0000-4000-8000-000000000072', nonce: '00000000-0000-4000-8000-000000000073', send: true, created: true, fenceEpoch: 0, templateVersion: 'launch-v1', delivery: 'pending' };
