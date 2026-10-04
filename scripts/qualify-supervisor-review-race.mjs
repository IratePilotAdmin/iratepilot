// Isolated, genuine Auth qualification only. Never targets the live PMS database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const project = 'ybehrayzwzyufxbxcysq';
const base = `https://${project}.supabase.co`;
const fixture = JSON.parse(await readFile(process.env.IRP_REVIEW_FIXTURE_PATH || '', 'utf8'));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
assert.equal(fixture.project_ref, project);
assert.equal(fixture.purpose, 'isolated-supervisor-review-race');
assert.equal(fixture.initial_revision, 1);
assert.equal(fixture.initial_status, 'open');
assert.equal(fixture.initial_assignee, null);
assert.ok(Date.parse(fixture.expires_at) > Date.now() + 120_000, 'Fixture requires at least two minutes remaining');
assert.ok(Date.parse(fixture.expires_at) <= Date.now() + 3_600_000, 'Fixture must expire within one hour');
for (const key of ['tenant_id', 'property_id', 'issue_id', 'owner_id', 'manager_id', 'staff_id']) assert.match(fixture[key], uuid);
assert.equal(new Set([fixture.owner_id, fixture.manager_id, fixture.staff_id]).size, 3);
const key = process.env.IRP_REVIEW_PUBLISHABLE_KEY;
assert.ok(key?.startsWith('sb_publishable_'), 'Use the isolated branch publishable key');
assert.equal(process.env.IRP_REVIEW_SUPERVISED_CLEANUP, '1', 'Operator must supervise database audit and cleanup');
if (process.argv.includes('--preflight')) {
  console.log(JSON.stringify({ status: 'preflight-passed', project_ref: project, cleanup_required: true }));
  process.exit(0);
}
const sessions = [];
const checks = [];
let phase = 'sign-in';
let claimSummaries = null;
let transportFailure = null;

async function request(path, token, body) {
  let response;
  try {
  response = await fetch(`${base}${path}`, {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  } catch (error) {
    transportFailure = { phase, operation: path.startsWith('/auth/') ? 'auth' : 'review',
      kind: ['TimeoutError', 'AbortError', 'TypeError'].includes(error?.name) ? error.name : 'request-error' };
    throw error;
  }
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}
async function signIn(role) {
  const email = process.env[`IRP_REVIEW_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`IRP_REVIEW_${role.toUpperCase()}_PASSWORD`];
  assert.ok(email && password, `Protected ${role} credentials required`);
  const reply = await request('/auth/v1/token?grant_type=password', null, { email, password });
  assert.ok(reply.ok && reply.data?.access_token, `${role} Auth sign-in failed`);
  sessions.push(reply.data.access_token);
  assert.equal(reply.data.user?.id, fixture[`${role}_id`], `${role} fixture identity mismatch`);
  return reply.data.access_token;
}
function command(revision, action, requestId = randomUUID()) {
  return { p_tenant: fixture.tenant_id, p_property: fixture.property_id, p_issue: fixture.issue_id,
    p_expected_revision: revision, p_action: action, p_request: requestId };
}
const review = (token, body) => request('/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_review', token, body);

try {
  // Sign in sequentially: membership is checked before any review mutations.
  const owner = await signIn('owner');
  const manager = await signIn('manager');
  const staff = await signIn('staff');
  phase = 'staff-denial';
  const denied = await review(staff, command(1, 'claim'));
  assert.equal(denied.ok, false);
  assert.equal(denied.data?.code, '42501');
  checks.push('staff review denied');

  const commands = [command(1, 'claim'), command(1, 'claim')];
  const actors = [owner, manager];
  phase = 'concurrent-claims';
  const claims = await Promise.all(actors.map((actor, index) => review(actor, commands[index])));
  claimSummaries = claims.map((r, i) => ({ actor: i === 0 ? 'owner' : 'manager', ok: r.ok,
    http_status: r.status, sqlstate: typeof r.data?.code === 'string' ? r.data.code : null,
    receipt_revision: r.ok ? r.data?.revision : null, receipt_status: r.ok ? r.data?.review_status : null }));
  const winners = claims.map((r, i) => r.ok ? i : -1).filter(i => i >= 0);
  assert.equal(winners.length, 1, 'Exactly one concurrent claim must succeed');
  const winner = winners[0];
  const loser = 1 - winner;
  assert.equal(claims[loser].status, 409);
  assert.equal(claims[loser].data?.code, 'PT409');
  assert.equal(claims[winner].data?.issue_id, fixture.issue_id);
  assert.equal(claims[winner].data?.request_id, commands[winner].p_request);
  assert.equal(claims[winner].data?.revision, 2);
  assert.equal(claims[winner].data?.review_status, 'in_review');
  assert.equal(claims[winner].data?.replayed, false);
  checks.push('two concurrent clients produce one claim and one revision conflict');

  phase = 'exact-retry';
  const replay = await review(actors[winner], commands[winner]);
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.data, { ...claims[winner].data, replayed: true });
  checks.push('winner exact retry returns original receipt');

  phase = 'assignee-protection';
  const displaced = await review(actors[loser], command(2, 'claim'));
  assert.equal(displaced.ok, false);
  assert.equal(displaced.data?.message, 'Another supervisor owns this review');
  phase = 'actor-bound-receipt';
  const stolen = await review(actors[loser], commands[winner]);
  assert.equal(stolen.ok, false);
  assert.equal(stolen.data?.message, 'Review request does not match the original');
  checks.push('second supervisor cannot displace the assignee or replay another actor receipt');

  phase = 'release';
  const released = await review(actors[winner], command(2, 'release'));
  assert.equal(released.ok, true);
  assert.equal(released.data?.revision, 3);
  assert.equal(released.data?.review_status, 'open');
  checks.push('winner releases at revision three without an extra replay mutation');
  console.log(JSON.stringify({ status: 'http-assertions-passed', project_ref: project, checks,
    cleanup_required: true, database_receipt_audit_required: true,
    limits: 'Concurrent HTTP requests only; no browser, queue refresh, membership revocation or 500-property qualification.' }));
} catch (error) {
  // Avoid serializing Auth responses, bearer tokens or credentials into runner logs.
  console.error(JSON.stringify({ status: 'failed', passed_checks: checks, phase, claim_summaries: claimSummaries, transport_failure: transportFailure,
    failure_kind: error?.code === 'ERR_ASSERTION' ? 'assertion' : 'request-or-runtime', cleanup_required: true }));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(sessions.map(token => request('/auth/v1/logout?scope=local', token, {})));
}
