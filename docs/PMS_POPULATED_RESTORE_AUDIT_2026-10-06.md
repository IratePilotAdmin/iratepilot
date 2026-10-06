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
