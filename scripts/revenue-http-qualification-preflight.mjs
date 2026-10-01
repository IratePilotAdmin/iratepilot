import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {revenueHttpQualificationConfigSchema} from '../lib/revenue-http-qualification-config.ts';

export function prepareManifest(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 16384) throw new Error();
    const input = JSON.parse(raw);
    const branchKeys = ['project_ref', 'parent_project_ref', 'is_default', 'with_data', 'name'];
    if (!input.branch || Object.keys(input.branch).some(key => !branchKeys.includes(key))) throw new Error();
    return revenueHttpQualificationConfigSchema.parse(input);
  } catch {
    throw new Error('Invalid isolated qualification manifest');
  }
}

export function requireCredentials(env) {
  for (const role of ['OWNER', 'MANAGER', 'STAFF']) {
    for (const field of ['EMAIL', 'PASSWORD']) {
      if (typeof env[`IRP_HTTP_TEST_${role}_${field}`] !== 'string' || !env[`IRP_HTTP_TEST_${role}_${field}`].trim()) {
        throw new Error('All three isolated test credentials are required');
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--credentials') {
      requireCredentials(process.env);
    } else {
      const manifest = prepareManifest(process.env.IRP_HTTP_QUALIFICATION_MANIFEST);
      const directory = process.env.RUNNER_TEMP;
      if (!directory || !process.env.GITHUB_ENV) throw new Error('GitHub runner paths are required');
      const path = join(directory, 'revenue-http-qualification.json');
      writeFileSync(path, JSON.stringify(manifest), {mode: 0o600, flag: 'wx'});
      writeFileSync(process.env.GITHUB_ENV, `IRP_HTTP_QUALIFICATION_CONFIG=${path}\n`, {flag: 'a'});
    }
    console.log('Isolated qualification preflight passed');
  } catch {
    console.error('Isolated qualification preflight failed; check protected environment setup');
    process.exitCode = 1;
  }
}
