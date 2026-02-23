# Stockia / DiStock — Database Schema

Complete SQL schema dump of the public schema.

## Files

| File | Description |
|------|-------------|
| `01_enums.sql` | Custom enum types |
| `02_tables.sql` | All table definitions |
| `03_constraints.sql` | Primary keys, foreign keys, unique and check constraints |
| `04_indexes.sql` | Custom indexes (non-PK) |
| `05_rls.sql` | Row Level Security enablement |
| `06_policies.sql` | RLS policies |
| `07_triggers.sql` | Triggers |
| `08_functions.sql` | PL/pgSQL functions |

## Usage

To recreate the schema from scratch:

```bash
psql $DATABASE_URL -f docs/schema/01_enums.sql
psql $DATABASE_URL -f docs/schema/02_tables.sql
psql $DATABASE_URL -f docs/schema/03_constraints.sql
psql $DATABASE_URL -f docs/schema/04_indexes.sql
psql $DATABASE_URL -f docs/schema/05_rls.sql
psql $DATABASE_URL -f docs/schema/06_policies.sql
psql $DATABASE_URL -f docs/schema/07_triggers.sql
psql $DATABASE_URL -f docs/schema/08_functions.sql
```

Generated: 2026-02-23
