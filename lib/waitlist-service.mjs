import { registerLaunchSignup } from './launch-list.mjs';

export async function registerWaitlistEmail({ email, env, ip, fetchImpl = fetch }) {
  const result = await registerLaunchSignup({
    signup: { email, intent: 'launch', platform: 'unspecified', source: 'legacy-api' },
    env, ip, fetchImpl,
  });
  if (result.status !== 200) return { status: result.status, message: result.body.message };
  return {
    status: result.body.created ? 201 : 200,
    message: result.body.created ? 'You’re on the list! We’ll email you when Veylo launches.' : 'You’re already on the waitlist.',
  };
}
