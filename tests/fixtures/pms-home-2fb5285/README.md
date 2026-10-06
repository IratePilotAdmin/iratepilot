This public qualification capture is authorized by the project owner. It contains
the actual transitive Home sources from private PMS candidate
2fb5285ac74314e97a9161dd8872d7088ccb8a92, plus the disabled recommendation-save
safety source. It is not mounted as an application route in this public project.

The browser and server bundles were compiled locally with esbuild 0.28.2.
provenance.json pins every source and generated asset by SHA-256. The build recipe
records the original workspace compilation and requires that candidate's locked
PMS dependencies; the protected CI runner verifies the capture before execution.
CI does not claim to rebuild the full private application.

October 6 packaging repair preserves the upstream edc0680 accounting correction.
The capture is based on 2fb5285 with that recorded source patch; generated assets
were rebuilt using the same pinned runtime and hashes refreshed. Run
`node scripts/rebuild-home-qualification-snapshot.mjs` from the public checkout
with the existing sibling private PMS and ui-runtime dependencies. This is a
qualification asset rebuild, not a new private PMS deployment.

`--auth-rejection` uses only the owner credential and workspace reads, with queue
and all review/rate RPCs blocked. It holds a genuinely authorized preview reply,
locally revokes that newly issued test session, verifies actual refresh rejection,
and delivers the late reply to the actual Home access gate. Provider identity must
be rejected before Home returns; fresh AuthPanel sign-in and reload then recover.
This is session revocation/rejection, not natural JWT expiry or iPhone evidence.
Test-session tokens remain only in memory and are locally revoked on cleanup.

Adaptations are restricted to the isolated publishable connection, the actual
Vinext Link shim and mapping Cloudflare server bindings to process.env. The actual
server GET verifies the genuine owner through isolated Supabase Auth. There are
no successful preview, Auth, membership or workspace response stubs.

The browser suite uses the protected revenue-http-qualification
environment. Credentials never enter the source capture, static client fixture or
evidence. The runner enters the protected test credentials into actual AuthPanel
sign-in fields at runtime and confirms sign-out for each tested account.
The client allows only isolated Auth, workspace reads and supervisor queue reads;
unexpected operations abort and fail the suite. Rate writeback and OTA publication
are unavailable. Browser screenshots mask account email and password controls.
The actual queue read persists observation records. An operator must independently
audit and remove the exact unchanged test observations after each run, preserving
the baseline tenant, property, memberships and room type. No review command is
allowlisted. CI holds no database administrator credentials.

This is Chromium qualification of a synthetic empty isolated property over HTTP.
It cannot prove production deployment, populated hotel data, saved review replay,
an installed PWA, physical iPhone recovery or revenue outcomes.
