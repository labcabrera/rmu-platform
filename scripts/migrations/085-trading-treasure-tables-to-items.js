// Workspace spec 095: the trading and treasure tables move from rmu-api-core to rmu-api-items. This copies both
// collections from rmu-core to rmu-items, replacing what is there. The originals stay until the review of unused
// collections, and an origin that is missing or empty leaves its destination alone.
//
// Run with `make mongo-migrate f=scripts/migrations/085-trading-treasure-tables-to-items.js` (DRY_RUN=1 to only
// report), after `make mongo-backup` and before deploying rmu-api-items. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const core = db.getSiblingDB('rmu-core');
const items = db.getSiblingDB('rmu-items');

for (const name of ['trading-tables', 'treasure-tables']) {
  const count = core.getCollection(name).countDocuments();
  if (count === 0) {
    print(`${prefix}${name}: nothing in rmu-core, left as it is`);
    continue;
  }
  if (!dryRun) core.getCollection(name).aggregate([{ $out: { db: 'rmu-items', coll: name } }]).toArray();
  print(`${prefix}${name}: ${count} documents to rmu-items (now ${items.getCollection(name).countDocuments()})`);
}
