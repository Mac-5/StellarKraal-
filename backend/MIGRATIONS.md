# Database Migration System

This project uses [db-migrate](https://db-migrate.readthedocs.io/) for database schema versioning and migrations.

## Overview

The migration system provides:
- ✅ Version-controlled schema changes
- ✅ Automatic migrations in development
- ✅ Manual control in production
- ✅ Rollback capability for every migration
- ✅ Migration status tracking
- ✅ Support for SQLite (dev) and PostgreSQL (production)

## Quick Start

### View Migration Status

```bash
npm run migrate:status
```

Shows which migrations have been applied and which are pending.

### Run Migrations

**Development (automatic on startup):**
```bash
npm run dev
```

**Development (manual):**
```bash
npm run migrate:dev
```

**Production (always manual):**
```bash
npm run migrate:prod
```

### Rollback Last Migration

```bash
npm run migrate:down
```

⚠️ **Warning:** Only use rollback in development or emergency situations. Each rollback is a destructive operation.

### Create New Migration

```bash
npm run migrate:create <migration-name>
```

Example:
```bash
npm run migrate:create add-user-table
```

This creates two files:
- `migrations/YYYYMMDDHHMMSS-add-user-table.js` - Migration controller
- `migrations/sqls/YYYYMMDDHHMMSS-add-user-table-up.sql` - Forward migration
- `migrations/sqls/YYYYMMDDHHMMSS-add-user-table-down.sql` - Rollback migration

### Reset Database (Development Only)

```bash
npm run migrate:reset
```

⚠️ **Warning:** This drops all tables and re-runs all migrations. Only use in development.

## Migration Files

### Existing Migrations

1. **20260425000000-initial-schema** - Creates base tables
   - `collaterals` table
   - `loans` table
   - `idempotency_keys` table
   - Indexes for performance

2. **20260426000000-add-soft-delete** - Adds soft delete support
   - Adds `deleted_at` column to `collaterals`
   - Adds `deleted_at` column to `loans`
   - Creates indexes for soft-delete queries

### Migration Structure

Each migration consists of:

**JavaScript Controller** (`migrations/YYYYMMDDHHMMSS-name.js`):
```javascript
exports.up = function(db) {
  // Load and execute up SQL
};

exports.down = function(db) {
  // Load and execute down SQL
};
```

**Up SQL** (`migrations/sqls/YYYYMMDDHHMMSS-name-up.sql`):
```sql
-- Forward migration
ALTER TABLE users ADD COLUMN email TEXT;
```

**Down SQL** (`migrations/sqls/YYYYMMDDHHMMSS-name-down.sql`):
```sql
-- Rollback migration
ALTER TABLE users DROP COLUMN email;
```

## Environment Configuration

Migrations use `database.json` for configuration:

```json
{
  "dev": {
    "driver": "sqlite3",
    "filename": "./dev.sqlite3"
  },
  "production": {
    "driver": "pg",
    "host": { "ENV": "DB_HOST" },
    "database": { "ENV": "DB_NAME" },
    "user": { "ENV": "DB_USER" },
    "password": { "ENV": "DB_PASSWORD" }
  }
}
```

## Automatic vs Manual Migrations

### Development Mode
- Migrations run **automatically** on `npm run dev`
- Ensures local database is always up-to-date
- Safe because development data is disposable

### Production Mode
- Migrations require **manual execution**
- Run `npm run migrate:prod` before deploying new code
- Provides control over when schema changes occur
- Prevents automatic changes to production data

## CI Integration

The backend CI workflow runs pending migrations before the test suite and verifies the resulting schema matches expectations:

1. **Apply pending migrations** — `npm run migrate:dev` runs against a fresh SQLite database before tests execute, so tests always run against the current schema.
2. **Verify schema** — after migrations, the CI step inspects the resulting tables/columns and fails the build if the schema diverges from what the migrations define.
3. **Rollback check** — migrations are exercised in both directions (`up` then `down`) to guarantee every migration has a working rollback.

This ensures schema drift is caught in CI rather than in production.

## Best Practices

### Writing Migrations

1. **Always provide a rollback**
   - Every `up` migration must have a corresponding `down`
   - Test rollbacks in development

2. **Make migrations idempotent**
   - Use `IF NOT EXISTS` for CREATE statements
   - Use `IF EXISTS` for DROP statements
   - Migrations should be safe to run multiple times

3. **Keep migrations small**
   - One logical change per migration
   - Easier to review and rollback

4. **Test before production**
   - Run migrations in development first
   - Test rollback scenarios
   - Verify data integrity

### SQLite vs PostgreSQL Differences

**SQLite limitations:**
- No `DROP COLUMN` support (requires table recreation)
- Limited `ALTER TABLE` capabilities
- Different data types

**PostgreSQL features:**
- Full `ALTER TABLE` support
- Transactional DDL
- Advanced data types

Write migrations that work for both, or use conditional logic:

```javascript
exports.up = function(db) {
  if (db.config.driver === 'sqlite3') {
    // SQLite-specific migration
  } else {
    // PostgreSQL migration
  }
};
```

## Troubleshooting

### Migration Failed

1. Check the error message in logs
2. Verify database connection settings
3. Check SQL syntax for your database driver
4. Ensure previous migrations completed successfully

### Migration Stuck

```bash
# Check status
npm run migrate:status

# Force reset (development only)
npm run migrate:reset
```

### Rollback Failed

1. Check the down SQL for errors
2. Manually inspect database state
3. Fix data issues before retrying
4. Consider writing a new migration to fix the issue

### Production Migration Checklist

- [ ] Test migration in development
- [ ] Test rollback in development
- [ ] Backup production database
- [ ] Schedule maintenance window if needed
- [ ] Run `npm run migrate:prod`
- [ ] Verify migration status
- [ ] Deploy new application code
- [ ] Monitor for errors

## CLI Reference

| Command | Description | Environment |
|---------|-------------|-------------|
| `npm run migrate:status` | Show migration status | Current |
| `npm run migrate:dev` | Run pending migrations | Development |
| `npm run migrate:prod` | Run pending migrations | Production |
| `npm run migrate:down` | Rollback last migration | Development |
| `npm run migrate:create <name>` | Create new migration | Any |
| `npm run migrate:reset` | Reset database | Development |

## Programmatic API

Migrations can also be controlled programmatically:

```typescript
import { runMigrations, getMigrationStatus, rollbackMigration } from './db/migrationRunner';

// Run migrations
await runMigrations();

// Get status
const status = await getMigrationStatus();
console.log(status);

// Rollback (development only)
await rollbackMigration();
```

## Additional Resources

- [db-migrate Documentation](https://db-migrate.readthedocs.io/)
- [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)
- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
