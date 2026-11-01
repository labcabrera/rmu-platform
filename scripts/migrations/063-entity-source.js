// Rulebook vs user content (workspace spec 063, 2026-11-01). Items, the core rule entities and the spell catalog get
// `entitySource: 'system' | 'user'`: a system entity is changed or deleted only by an admin, a user entity by its owner
// (or an admin). The APIs read a missing field as `user`, so this script must run before the system entities are
// protected, but nobody loses a permission they had while it has not run.
//
// Rules per collection (decided with the user, see the spec):
//   rmu-items.items                    no realm -> system; with a realm -> user. `fur-belt` (not in Core Law) is deleted.
//   rmu-core.professions, effect-types existing value kept; missing -> user
//   rmu-core.enumerations              no realm (global, admin-only since spec 050) -> system; with a realm -> user
//   rmu-core.traits, cultures, skills, maneuver-modifiers -> system
//   rmu-core.races                     realm marked `generic` (RMU Core) -> system; any other realm -> user
//   rmu-core.realms                    user
//   rmu-spells.spell-lists, spells     system
// KEEP_USER lists ids that must stay `user` whatever the rule says (edit it after reviewing the dry run).
//
// Only documents whose value changes are written; their version goes up, as the API does on a change.
// Run with `make mongo-migrate f=scripts/migrations/063-entity-source.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const KEEP_USER = [];

const items = db.getSiblingDB('rmu-items');
const core = db.getSiblingDB('rmu-core');
const spells = db.getSiblingDB('rmu-spells');

const hasRealm = doc => doc.realmId !== null && doc.realmId !== undefined && doc.realmId !== '';
const genericRealms = new Set(core.realms.find({ generic: true }, { _id: 1 }).toArray().map(realm => String(realm._id)));

const rules = [
  { db: items, name: 'items', rule: doc => (hasRealm(doc) ? 'user' : 'system') },
  { db: core, name: 'professions', rule: doc => doc.entitySource ?? 'user' },
  { db: core, name: 'effect-types', rule: doc => doc.entitySource ?? 'user' },
  { db: core, name: 'enumerations', rule: doc => (hasRealm(doc) ? 'user' : 'system') },
  { db: core, name: 'traits', rule: () => 'system' },
  { db: core, name: 'cultures', rule: () => 'system' },
  { db: core, name: 'skills', rule: () => 'system' },
  { db: core, name: 'maneuver-modifiers', rule: () => 'system' },
  { db: core, name: 'races', rule: doc => (genericRealms.has(String(doc.realmId)) ? 'system' : 'user') },
  { db: core, name: 'realms', rule: () => 'user' },
  { db: spells, name: 'spell-lists', rule: () => 'system' },
  { db: spells, name: 'spells', rule: () => 'system' },
];

const furBelt = items.items.findOne({ _id: 'fur-belt' });
if (furBelt) {
  if (!dryRun) items.items.deleteOne({ _id: 'fur-belt' });
  print(`${prefix}rmu-items.items: ${dryRun ? 'would delete' : 'deleted'} fur-belt (not a Core Law item)`);
}

rules.forEach(({ db: database, name, rule }) => {
  const collection = database.getCollection(name);
  const totals = { system: 0, user: 0 };
  const writes = [];
  collection.find({}, { _id: 1, realmId: 1, entitySource: 1 }).forEach(doc => {
    const target = KEEP_USER.includes(String(doc._id)) ? 'user' : rule(doc);
    totals[target] += 1;
    if (doc.entitySource === target) return;
    writes.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { entitySource: target, updatedAt: new Date() }, $inc: { version: 1 } },
      },
    });
  });
  if (!dryRun && writes.length) collection.bulkWrite(writes, { ordered: false });
  print(
    `${prefix}${database.getName()}.${name}: system ${totals.system}, user ${totals.user}; ` +
      `${dryRun ? 'would change' : 'changed'} ${writes.length}`,
  );
});
