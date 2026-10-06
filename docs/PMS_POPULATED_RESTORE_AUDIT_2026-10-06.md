# Populated PMS restore audit — October 6, 2026

This is a read-only comparison of existing Supabase projects. It does not establish the live application's database binding or authorize a restore, migration, or customer launch.

| Project | Role indicated by project name | PMS schema tables | PMS properties | PMS rooms | PMS reservations | PMS folio entries |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `eiqmdldjnedqgbtoozqa` | PMS preview/source candidate | 177 | 5 | 119 | 26 | 22 |
| `onwdgkwsyxkbodzouapi` | September 12 PMS restore drill | 220 | 6 | 54 | 29 | 26 |
| `ngdfmzedfphtqbveltxy` | October 5 isolated restore | 0 | — | — | — | — |

The October 5 project has 116 `public` tables and 148 migration receipts, but no `irp_pms` schema, Auth users, OTA properties, rooms, or bookings. It is an empty OTA-schema restore and cannot prove recovery of the populated PMS. The September 12 PMS drill is populated, but its table and room counts differ markedly from the PMS source candidate; it is historical evidence, not a verified recent recovery point. Counts may include test fixtures and changes made after a backup, so the projects cannot be assumed to correspond to the same snapshot.

**Gate remains open.** First verify the live PMS deployment's actual Supabase project reference, then restore a recent backup of that project into a new isolated project. Record backup timestamp, restore duration, schema/migration identity, aggregate counts for tenants, properties, room types, rooms, reservations, folios, and Auth users, and representative relationships and balances. Keep live traffic pointed at its existing database. The restore must pass the separate Storage-object and application smoke checks in `BACKUP_RESTORE_RUNBOOK.md` before recovery readiness can be claimed.
