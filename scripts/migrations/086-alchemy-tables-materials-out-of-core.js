// Workspace spec 096: the alchemy tables move from rmu-api-core to rmu-api-spells and the materials to rmu-api-items.
// This copies each collection from rmu-core to its new database, replacing what is there. The originals stay until the
// review of unused collections, and an origin that is missing or empty leaves its destination alone.
//
// Run with `make mongo-migrate f=scripts/migrations/086-alchemy-tables-materials-out-of-core.js` (DRY_RUN=1 to only
// report), after `make mongo-backup` and before deploying rmu-api-spells and rmu-api-items. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const core = db.getSiblingDB('rmu-core');

for (const [name, target] of [
  ['alchemy-tables', 'rmu-spells'],
  ['materials', 'rmu-items'],
]) {
  const count = core.getCollection(name).countDocuments();
  if (count === 0) {
    print(`${prefix}${name}: nothing in rmu-core, left as it is`);
    continue;
  }
  if (!dryRun) core.getCollection(name).aggregate([{ $out: { db: target, coll: name } }]).toArray();
  print(`${prefix}${name}: ${count} documents to ${target} (now ${db.getSiblingDB(target).getCollection(name).countDocuments()})`);
}
