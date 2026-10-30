// Generic realms (workspace spec 055, 2026-10-30): rmu-core realms get `generic`, which marks a realm of generic
// content usable from any campaign (its NPCs can join any faction or tactical game).
//
// - The realm named `RMU Core` gets `generic: true` (and its version goes up, as the API does on a change).
// - Every other realm without the field gets `generic: false`. rmu-api-core already reads a missing field as false,
//   so this only makes the documents filterable by it.
//
// Run with `make mongo-migrate f=scripts/migrations/055-realm-generic.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const realms = db.getSiblingDB('rmu-core').realms;

const CORE_NAME = 'RMU Core';

const core = realms.find({ name: CORE_NAME }).toArray();
if (core.length === 0) print(`WARNING: no realm named ${CORE_NAME}; nothing is marked as generic`);
if (core.length > 1) print(`WARNING: ${core.length} realms named ${CORE_NAME}; all of them are marked as generic`);

let marked = 0;
core.forEach(realm => {
  if (realm.generic === true) {
    print(`rmu-core.realms ${realm._id} (${realm.name}): already generic`);
    return;
  }
  if (!dryRun) {
    realms.updateOne({ _id: realm._id }, { $set: { generic: true, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  marked += 1;
  print(`${prefix}rmu-core.realms ${realm._id} (${realm.name}): generic true`);
});

const missing = { name: { $ne: CORE_NAME }, generic: { $exists: false } };
const defaulted = realms.countDocuments(missing);
if (!dryRun && defaulted > 0) realms.updateMany(missing, { $set: { generic: false } });

print(`${dryRun ? '[dry-run] would mark' : 'Marked'} ${marked} realms as generic`);
print(`${dryRun ? '[dry-run] would set' : 'Set'} generic false on ${defaulted} realms without it`);
