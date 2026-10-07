// Write only to the two known synthetic fixtures in the isolated PMS rehearsal
// project. No live property, guest, or payment data is used.
import { signInDisposableUsers } from './run-pms-rehearsal-http-with-passwords.mjs';

const expectedFixtureIds = {
  PMS_REHEARSAL_PROPERTY_A_ID: '50000000-0000-4000-8000-000000000005',
  PMS_REHEARSAL_PROPERTY_B_ID: '60000000-0000-4000-8000-000000000006',
  PMS_REHEARSAL_ROOM_A_ID: '70000000-0000-4000-8000-000000000007',
  PMS_REHEARSAL_ROOM_B_ID: '80000000-0000-4000-8000-000000000008',
};

const cases = [
  ['owner A', 'PMS_REHEARSAL_OWNER_A_TOKEN', 'properties', 'A', true, 'HTTP Write Test A'],
  ['owner A', 'PMS_REHEARSAL_OWNER_A_TOKEN', 'properties', 'B', false, 'BLOCKED CROSS PROPERTY'],
  ['owner B', 'PMS_REHEARSAL_OWNER_B_TOKEN', 'properties', 'B', true, 'HTTP Write Test B'],
  ['owner B', 'PMS_REHEARSAL_OWNER_B_TOKEN', 'properties', 'A', false, 'BLOCKED CROSS PROPERTY'],
  ['manager A', 'PMS_REHEARSAL_MANAGER_A_TOKEN', 'properties', 'A', true, 'HTTP Write Test A'],
  ['manager A', 'PMS_REHEARSAL_MANAGER_A_TOKEN', 'properties', 'B', false, 'BLOCKED CROSS PROPERTY'],
  ['owner A', 'PMS_REHEARSAL_OWNER_A_TOKEN', 'rooms', 'A', true, 'HTTP Write Room A'],
  ['owner A', 'PMS_REHEARSAL_OWNER_A_TOKEN', 'rooms', 'B', false, 'BLOCKED CROSS ROOM'],
  ['owner B', 'PMS_REHEARSAL_OWNER_B_TOKEN', 'rooms', 'B', true, 'HTTP Write Room B'],
  ['owner B', 'PMS_REHEARSAL_OWNER_B_TOKEN', 'rooms', 'A', false, 'BLOCKED CROSS ROOM'],
  ['manager A', 'PMS_REHEARSAL_MANAGER_A_TOKEN', 'rooms', 'A', true, 'HTTP Write Room A'],
  ['manager A', 'PMS_REHEARSAL_MANAGER_A_TOKEN', 'rooms', 'B', false, 'BLOCKED CROSS ROOM'],
];

const reassignments = [
  ['owner A', 'PMS_REHEARSAL_OWNER_A_TOKEN', 'properties', 'PROPERTY_A', 'partner_id', '40000000-0000-4000-8000-000000000004'],
  ['manager A', 'PMS_REHEARSAL_MANAGER_A_TOKEN', 'properties', 'PROPERTY_A', 'partner_id', '40000000-0000-4000-8000-000000000004'],
  ['owner A', 'PMS_REHEARSAL_OWNER_A_TOKEN', 'rooms', 'ROOM_A', 'property_id', '60000000-0000-4000-8000-000000000006'],
];

export async function runWriteChecks(config, fetcher = fetch) {
  for (const [name, id] of Object.entries(expectedFixtureIds)) {
    if (config[name] !== id) throw new Error(`Refusing to PATCH unexpected fixture ${name}`);
  }
  const signedIn = await signInDisposableUsers(config, fetcher);
  const origin = new URL(config.PMS_REHEARSAL_SUPABASE_URL);
  const failures = [];
  for (const [actor, tokenName, table, side, allowed, name] of cases) {
    const id = config[`PMS_REHEARSAL_${table === 'properties' ? 'PROPERTY' : 'ROOM'}_${side}_ID`];
    const endpoint = new URL(`/rest/v1/${table}`, origin);
    endpoint.searchParams.set('select', 'id');
    endpoint.searchParams.set('id', `eq.${id}`);
    const response = await fetcher(endpoint, {
      method: 'PATCH',
      headers: {
        apikey: config.PMS_REHEARSAL_PUBLISHABLE_KEY,
        authorization: `Bearer ${signedIn[tokenName]}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200) {
      failures.push(`${actor}: ${table} ${side} PATCH HTTP ${response.status}`);
      continue;
    }
    let rows;
    try {
      rows = await response.json();
    } catch {
      failures.push(`${actor}: ${table} ${side} returned invalid JSON`);
      continue;
    }
    const correct = allowed
      ? Array.isArray(rows) && rows.length === 1 && rows[0]?.id === id
      : Array.isArray(rows) && rows.length === 0;
    if (!correct) failures.push(`${actor}: ${table} ${side} write policy mismatch`);
  }
  for (const [actor, tokenName, table, fixture, field, value] of reassignments) {
    const id = config[`PMS_REHEARSAL_${fixture}_ID`];
    const endpoint = new URL(`/rest/v1/${table}`, origin);
    endpoint.searchParams.set('select', 'id');
    endpoint.searchParams.set('id', `eq.${id}`);
    const response = await fetcher(endpoint, {
      method: 'PATCH',
      headers: {
        apikey: config.PMS_REHEARSAL_PUBLISHABLE_KEY,
        authorization: `Bearer ${signedIn[tokenName]}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({ [field]: value }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) continue;
    let rows;
    try {
      rows = await response.json();
    } catch {
      failures.push(`${actor}: ${table} reassignment returned invalid JSON`);
      continue;
    }
    if (!Array.isArray(rows) || rows.length !== 0) {
      failures.push(`${actor}: ${table} cross-property reassignment was accepted`);
    }
  }
  return { checked: cases.length + reassignments.length, failures };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  try {
    const result = await runWriteChecks(process.env);
    if (result.failures.length) {
      console.error(`FAIL: ${result.failures.length} of ${result.checked} isolated-project write checks failed`);
      for (const failure of result.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS: ${result.checked} isolated-project signed HTTP write checks`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Rehearsal write test failed');
    process.exitCode = 1;
  }
}
