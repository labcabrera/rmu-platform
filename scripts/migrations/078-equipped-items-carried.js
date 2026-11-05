// Worn equipment in the load (workspace spec 077, decisions B1.1, B1.3 and B1.7). rmu-api-strategic counts in the load
// every item in a slot and scales a worn armor by `wearer weight / armor.fittedWeight`; this script fixes the data
// stored before.
//
// rmu-strategic.items:
// - an item in a slot of its character (`equipment.slots`) gets `carried: true` (equipping always set it in the API,
//   but older data and the imports did not);
// - an armor without `armor.fittedWeight` gets the body weight of the character that holds it (`info.weight`), or 185
//   (the weight the catalog tables are given for) when it has no holder or no weight. Its weight was computed for that
//   holder when it was created, so the worn weight does not change.
// Each item that changes gets its version up, as the API does on a change.
//
// The characters with equipped items or with armor need their sheet recalculated (load, armorEncumbrance): their ids
// go to rmu-platform.pending-recalculations ({_id: characterId, reasons, since}), which
// scripts/recalculate-characters.sh empties through POST /v1/characters/:id/recalculate.
//
// Run with `make mongo-migrate f=scripts/migrations/078-equipped-items-carried.js` (DRY_RUN=1 to only report), after
// `make mongo-backup` and with the rmu-api-strategic release of spec 077 up (an older strategic ignores fittedWeight
// but would keep the old load). Then run scripts/recalculate-characters.sh. Idempotent: items already carried and
// armors with fittedWeight are left as they are.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const strategic = db.getSiblingDB('rmu-strategic');
const characters = strategic.getCollection('characters');
const items = strategic.getCollection('items');
const pending = db.getSiblingDB('rmu-platform').getCollection('pending-recalculations');

const DEFAULT_FITTED_WEIGHT = 185;
const REASON = '078-equipped-items-carried';

const toRecalculate = new Set();
const weights = new Map();
let carried = 0;
let fitted = 0;

characters.find({}, { _id: 1, name: 1, 'info.weight': 1, 'equipment.slots': 1 }).forEach(character => {
  weights.set(character._id, character.info && character.info.weight > 0 ? character.info.weight : null);
  const slots = (character.equipment && character.equipment.slots) || {};
  const equipped = [...new Set(Object.values(slots).filter(id => typeof id === 'string' && id))];
  if (equipped.length === 0) return;
  toRecalculate.add(character._id);
  items.find({ _id: { $in: equipped }, characterId: character._id, carried: { $ne: true } }, { _id: 1, name: 1 }).forEach(item => {
    print(`${prefix}item ${item._id} (${item.name}) of character ${character._id} (${character.name}): carried`);
    if (!dryRun) items.updateOne({ _id: item._id }, { $set: { carried: true, updatedAt: new Date() }, $inc: { version: 1 } });
    carried++;
  });
});

items.find({ armor: { $type: 'object' }, 'armor.fittedWeight': { $exists: false } }, { _id: 1, name: 1, characterId: 1 }).forEach(item => {
  const holderWeight = item.characterId ? weights.get(item.characterId) : null;
  const fittedWeight = holderWeight || DEFAULT_FITTED_WEIGHT;
  print(`${prefix}armor ${item._id} (${item.name}): fittedWeight ${fittedWeight}${holderWeight ? ` (character ${item.characterId})` : ''}`);
  if (!dryRun) items.updateOne({ _id: item._id }, { $set: { 'armor.fittedWeight': fittedWeight, updatedAt: new Date() }, $inc: { version: 1 } });
  if (item.characterId && weights.has(item.characterId)) toRecalculate.add(item.characterId);
  fitted++;
});

toRecalculate.forEach(characterId => {
  if (!dryRun) {
    pending.updateOne({ _id: characterId }, { $addToSet: { reasons: REASON }, $setOnInsert: { since: new Date() } }, { upsert: true });
  }
});

print(
  `${prefix}${carried} equipped items ${dryRun ? 'would be' : 'were'} marked carried, ` +
    `${fitted} armors ${dryRun ? 'would get' : 'got'} fittedWeight, ` +
    `${toRecalculate.size} characters ${dryRun ? 'would be' : 'were'} queued for scripts/recalculate-characters.sh`,
);
