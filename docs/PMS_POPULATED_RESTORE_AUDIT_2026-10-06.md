# Populated PMS restore audit — October 6, 2026

This is a read-only comparison of existing Supabase projects and the published PMS Site source. It does not authorize a restore, migration, or customer launch.

## Live binding verified

The Sites project behind `https://pms.iratepilot.com` is `appgprj_6a9ef311e9f08191b44e8d5598802ccc`. Its published version 248 completed successfully on October 6 at source commit `fd2dd960319716a9f01494891a26af938db1d271`. That exact source's `lib/hotel-connection.ts` points staff Auth and hotel RPC calls at `https://eiqmdldjnedqgbtoozqa.supabase.co`; the hotel client and PMS API routes import the same connection module. Its Sites manifest also binds a separate Cloudflare D1 database as `DB`. The live D1 overview lists supplemental workflow tables, including guest prechecks, registration, payment reviews, and `workspace`. Therefore both the Supabase operational database and the Sites D1 database require recovery verification. This source review does not prove the health of every running request or identify Storage backup coverage.

| Project | Role indicated by project name | PMS schema tables | PMS properties | PMS rooms | PMS reservations | PMS folio entries |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `eiqmdldjnedqgbtoozqa` | Published PMS operational binding | 177 | 5 | 119 | 26 | 22 |
| `onwdgkwsyxkbodzouapi` | September 12 PMS restore drill | 220 | 6 | 54 | 29 | 26 |
| `ngdfmzedfphtqbveltxy` | October 5 isolated restore | 0 | — | — | — | — |

The October 5 project has 116 `public` tables and 148 migration receipts, but no `irp_pms` schema, Auth users, OTA properties, rooms, or bookings. It is an empty OTA-schema restore and cannot prove recovery of the populated PMS. The September 12 PMS drill is populated, but its table and room counts differ markedly from the PMS source candidate; it is historical evidence, not a verified recent recovery point. Counts may include test fixtures and changes made after a backup, so the projects cannot be assumed to correspond to the same snapshot.

**Gate remains open.** Restore a recent backup of `eiqmdldjnedqgbtoozqa` into an isolated project. Record backup timestamp, restore duration, schema/migration identity, aggregate counts for tenants, properties, room types, rooms, reservations, folios, and Auth users, and representative relationships and balances. Separately export and restore the live Site's D1 `DB` binding into an isolated target, including its registration and guest workflow tables. Keep live traffic pointed at its existing databases. Both restorations must pass the separate Storage-object and application smoke checks in `BACKUP_RESTORE_RUNBOOK.md` before recovery readiness can be claimed.

## October 6 provider preflight

The signed-in Supabase backup screen for `eiqmdldjnedqgbtoozqa` lists a **completed physical backup at 2026-10-06 08:35:09 UTC**, plus seven preceding daily backups. It lists completed restore-to-new-project jobs only on August 23, September 10, and September 12; none is a recent October restore of this operational project. At the 17:10 UTC check, the newest backup was about 8 hours 35 minutes old.

The restore-to-new-project dialog says the new project would stay in `iRatePilot Group, LLC` and `us-east-1`, transfer database schema/data/indexes and database roles/permissions/users, and cost **$9.68/month compute + $0.50/month disk = $10.18/month**. Storage objects/settings, Edge Functions, Auth settings/API keys, extensions/settings, and read replicas require manual reconfiguration. No restore was submitted in this preflight. The previous $10.18/month approval was used for `ngdfmzedfphtqbveltxy`; creating this live-source restore would add another recurring charge and awaits separate approval.

An earlier isolated D1 Time Travel exercise, recorded in the PMS source's `release/evidence/local-release-verification-2026-09-27.json`, passed on a recovery-named database but did not establish its identity as the live Site's `DB` binding. Live D1 recovery remains a separate gate.

The published version 248 source exposes an owner-only `POST /api/owner-data-export` route guarded by `D1_OWNER_EXPORT_ENABLED` and a signed-in owner check. The live Sites environment reports that flag as `true` and has owner identifiers configured. This is evidence that export is enabled; no export payload was requested or downloaded, and no current live-D1 restore was performed.
