// Shared by export.js and merge.js (workspace spec 103, D10). The shell scripts define COLLECTIONS (collections.json).

const EXPORT_DB = 'rmu-catalog-export';
const STAGING_DB = 'rmu-catalog-staging';
const SEPARATOR = '__';

/** {db, collection, mode, filter} for every collection the file classifies as system or whole. */
function catalogEntries() {
  const entries = [];
  for (const [database, value] of Object.entries(COLLECTIONS)) {
    if (database.startsWith('_') || typeof value === 'string') continue;
    for (const [collection, entry] of Object.entries(value)) {
      const { mode, filter } = typeof entry === 'string' ? { mode: entry } : entry;
      if (!['system', 'whole', 'never'].includes(mode)) throw new Error(`Unknown mode ${mode} of ${database}.${collection}`);
      if (mode === 'never') continue;
      entries.push({ db: database, collection, mode, filter: mode === 'whole' ? {} : (filter ?? { entitySource: 'system' }) });
    }
  }
  return entries;
}

/** Fails when a collection of an rmu-* database has no mode: a new collection has to be classified first. */
function checkClassified() {
  const missing = [];
  for (const { name } of db.adminCommand({ listDatabases: 1 }).databases) {
    if (!name.startsWith('rmu-') || name === EXPORT_DB || name === STAGING_DB) continue;
    const value = COLLECTIONS[name];
    if (typeof value === 'string') continue;
    for (const collection of db.getSiblingDB(name).getCollectionNames())
      if (!value || !(collection in value)) missing.push(`${name}.${collection}`);
  }
  if (missing.length)
    throw new Error(`Collections without a mode in scripts/catalog-sync/collections.json:\n  ${missing.join('\n  ')}`);
}

/** The ids of the migration scripts this database has run (rmu-platform.migrations, only scripts/migrations/*.js). */
function appliedMigrations() {
  return db
    .getSiblingDB('rmu-platform')
    .migrations.find({}, { _id: 1 })
    .toArray()
    .map((m) => String(m._id))
    .filter((id) => id.endsWith('.js'))
    .sort();
}
