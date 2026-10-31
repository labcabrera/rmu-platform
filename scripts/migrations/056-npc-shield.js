// NPC shield model (workspace spec 056, decisions 7 and 8; ADR 0010, 2026-10-31): the shield of an NPC becomes
// `{type, db, ranks, bonus}`.
//
// - Every stored NPC with a shield and no `db` gets the DB of its type (Core Law Table 9-6: target 15, normal 20,
//   full 25, wall 30). Its type, ranks and bonus are kept, and its version goes up, as the API does on a change.
// - The moose of Creature Law (`cl1-moose`) loses its shield: its `(target)` is an erratum read as `(none)`.
// - A shield whose type is not one of Table 9-6 is only reported: the npcs API no longer accepts it, so it needs a
//   decision by hand.
//
// Run with `make mongo-migrate f=scripts/migrations/056-npc-shield.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const npcs = db.getSiblingDB('rmu-npcs').npcs;

const SHIELD_TYPE_DB = { target: 15, normal: 20, full: 25, wall: 30 };
const MOOSE_ID = 'cl1-moose';

let removed = 0;
const moose = npcs.findOne({ _id: MOOSE_ID });
if (!moose) {
  print(`WARNING: no NPC ${MOOSE_ID}; no shield removed`);
} else if (moose.shield === null || moose.shield === undefined) {
  print(`rmu-npcs.npcs ${MOOSE_ID} (${moose.name}): already without shield`);
} else {
  if (!dryRun) {
    npcs.updateOne({ _id: MOOSE_ID }, { $set: { shield: null, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  removed += 1;
  print(`${prefix}rmu-npcs.npcs ${MOOSE_ID} (${moose.name}): shield ${JSON.stringify(moose.shield)} removed (erratum)`);
}

let filled = 0;
let unknown = 0;
npcs.find({ _id: { $ne: MOOSE_ID }, shield: { $type: 'object' }, 'shield.db': { $exists: false } }).forEach(npc => {
  const shieldDb = SHIELD_TYPE_DB[npc.shield.type];
  if (shieldDb === undefined) {
    unknown += 1;
    print(`WARNING: rmu-npcs.npcs ${npc._id} (${npc.name}): shield type ${npc.shield.type} is not in Table 9-6; left as is`);
    return;
  }
  if (!dryRun) {
    npcs.updateOne({ _id: npc._id }, { $set: { 'shield.db': shieldDb, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  filled += 1;
  print(`${prefix}rmu-npcs.npcs ${npc._id} (${npc.name}): shield ${npc.shield.type} db ${shieldDb}`);
});

print(`${dryRun ? '[dry-run] would remove' : 'Removed'} ${removed} shields (erratum)`);
print(`${dryRun ? '[dry-run] would fill' : 'Filled'} the DB of ${filled} shields`);
if (unknown > 0) print(`WARNING: ${unknown} shields with a type outside Table 9-6`);
