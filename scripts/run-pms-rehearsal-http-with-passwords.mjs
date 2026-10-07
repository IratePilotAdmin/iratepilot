// Sign in disposable confirmed users, then run the isolated project's read-only
// HTTP visibility checks. Passwords and access tokens stay in process memory.
import { runChecks, validateConfiguration } from './verify-pms-rehearsal-http-isolation.mjs';

const projectRef = 'onbdizzwwubfdgkgaphx';
const actors = [
  ['OWNER_A', 'PMS_REHEARSAL_OWNER_A_TOKEN'],
  ['OWNER_B', 'PMS_REHEARSAL_OWNER_B_TOKEN'],
  ['MANAGER_A', 'PMS_REHEARSAL_MANAGER_A_TOKEN'],
];

export async function signInDisposableUsers(config, fetcher = fetch) {
  const probe = { ...config };
  for (const [, tokenName] of actors) probe[tokenName] = 'pending-sign-in';
  const origin = validateConfiguration(probe);
  if (origin.hostname !== `${projectRef}.supabase.co`) throw new Error('Wrong rehearsal project');

  const signedIn = { ...config };
  for (const [actor, tokenName] of actors) {
    const email = config[`PMS_REHEARSAL_${actor}_EMAIL`];
    const password = config[`PMS_REHEARSAL_${actor}_PASSWORD`];
    if (!email || !password) throw new Error(`Missing disposable ${actor} credentials`);
    const response = await fetcher(new URL('/auth/v1/token?grant_type=password', origin), {
      method: 'POST',
      headers: { apikey: config.PMS_REHEARSAL_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200) throw new Error(`${actor} sign-in returned HTTP ${response.status}`);
    const session = await response.json();
    if (typeof session.access_token !== 'string' || !session.access_token) {
      throw new Error(`${actor} sign-in returned no access token`);
    }
    signedIn[tokenName] = session.access_token;
  }
  return signedIn;
}

export async function runWithPasswords(config, fetcher = fetch) {
  return runChecks(await signInDisposableUsers(config, fetcher), fetcher);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  try {
    const result = await runWithPasswords(process.env);
    if (result.failures.length) {
      console.error(`FAIL: ${result.failures.length} of ${result.checked} isolated-project HTTP checks failed`);
      for (const failure of result.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS: ${result.checked} isolated-project signed HTTP visibility checks`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Rehearsal HTTP test failed');
    process.exitCode = 1;
  }
}
