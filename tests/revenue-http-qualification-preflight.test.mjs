import assert from 'node:assert/strict';
import {test} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, statSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareManifest, requireCredentials} from '../scripts/revenue-http-qualification-preflight.mjs';

const fixture = {
  branch: {project_ref: 'abcdefghijklmnopqrst', parent_project_ref: 'eiqmdldjnedqgbtoozqa', is_default: false, with_data: false, name: 'revenue-auth-fixture'},
  publishableKey: 'sb_publishable_synthetic',
  tenantId: '00000000-0000-4000-8000-000000000001', propertyId: '00000000-0000-4000-8000-000000000002',
  requestId: '00000000-0000-4000-8000-000000000006', planId: '00000000-0000-4000-8000-000000000004',
  actors: {owner: {id: '00000000-0000-4000-8000-000000000005'}, manager: {id: '00000000-0000-4000-8000-000000000008'}, staff: {id: '00000000-0000-4000-8000-000000000009'}},
};

test('accepts synthetic isolated scope without changing identities', () => {
  assert.deepEqual(prepareManifest(JSON.stringify(fixture)), fixture);
});
test('refuses production, copied data, shared actors and privileged keys', () => {
  const unsafe = [
    {...fixture, branch: {...fixture.branch, project_ref: 'eiqmdldjnedqgbtoozqa'}},
    {...fixture, branch: {...fixture.branch, project_ref: 'allliumarkejinplrggl'}},
    {...fixture, branch: {...fixture.branch, with_data: true}},
    {...fixture, branch: {...fixture.branch, is_default: true}},
    {...fixture, actors: {...fixture.actors, manager: fixture.actors.owner}},
    {...fixture, publishableKey: 'sb_secret_sensitive'},
  ];
  for (const input of unsafe) assert.throws(() => prepareManifest(JSON.stringify(input)), /^Error: Invalid isolated qualification manifest$/);
});
test('refuses unexpected metadata and suppresses malformed input in errors', () => {
  for (const raw of ['sensitive-password', 'x'.repeat(16385), JSON.stringify({...fixture, branch: {...fixture.branch, password: 'sensitive-password'}})]) {
    assert.throws(() => prepareManifest(raw), /^Error: Invalid isolated qualification manifest$/);
  }
});
test('checks every role credential before network qualification', () => {
  const env = {};
  for (const role of ['OWNER', 'MANAGER', 'STAFF']) for (const field of ['EMAIL', 'PASSWORD']) env[`IRP_HTTP_TEST_${role}_${field}`] = 'synthetic';
  assert.doesNotThrow(() => requireCredentials(env));
  for (const key of Object.keys(env)) {
    assert.throws(() => requireCredentials({...env, [key]: ''}), /^Error: All three isolated test credentials are required$/);
    assert.throws(() => requireCredentials({...env, [key]: '   '}), /^Error: All three isolated test credentials are required$/);
  }
});

test('CLI writes a private manifest and path without printing contents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'revenue-preflight-'));
  try {
    const envPath = join(directory, 'github-env');
    const result = spawnSync(process.execPath, ['scripts/revenue-http-qualification-preflight.mjs'], {
      encoding: 'utf8', env: {...process.env, RUNNER_TEMP: directory, GITHUB_ENV: envPath, IRP_HTTP_QUALIFICATION_MANIFEST: JSON.stringify(fixture)},
    });
    assert.equal(result.status, 0);
    const path = join(directory, 'revenue-http-qualification.json');
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), fixture);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(readFileSync(envPath, 'utf8'), `IRP_HTTP_QUALIFICATION_CONFIG=${path}\n`);
    assert.equal(result.stdout.includes(fixture.publishableKey), false);
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
test('CLI fails without disclosing malformed input', () => {
  const result = spawnSync(process.execPath, ['scripts/revenue-http-qualification-preflight.mjs'], {
    encoding: 'utf8', env: {...process.env, IRP_HTTP_QUALIFICATION_MANIFEST: 'sensitive-invalid-input'},
  });
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes('sensitive-invalid-input'), false);
});
