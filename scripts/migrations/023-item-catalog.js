// Spec 023 (equipment): copies to the strategic items stored before it what they keep of their catalog type.
//
// - `catalog`: cost, rarity, production hours and image of the type in rmu-items.
// - `value`: the average cost of the type, when the item has none.
//
// Items whose type is no longer in the catalog get an empty `catalog` and keep no value. Catalog modifiers are not
// copied: an existing item already has the modifiers the game master gave it.
//
// Run with `make mongo-migrate f=scripts/migrations/023-item-catalog.js` (DRY_RUN=1 to only count). Idempotent: only
// items without `catalog` are touched.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

const strategic = db.getSiblingDB('rmu-strategic').getCollection('items');
const catalog = db.getSiblingDB('rmu-items').getCollection('items');

const types = new Map();
const typeOf = id => {
  if (!types.has(id)) types.set(id, catalog.findOne({ _id: id }));
  return types.get(id);
};

let updated = 0;
let missing = 0;
strategic.find({ catalog: { $exists: false } }).forEach(item => {
  const type = typeOf(item.itemTypeId);
  if (!type) missing++;
  const info = (type && type.info) || {};
  const set = {
    catalog: {
      cost: info.cost || null,
      rarity: info.rarity || null,
      productionHours: info.productionHours ?? null,
      imageUrl: (type && type.imageUrl) || null,
    },
  };
  if (item.value === undefined || item.value === null) set.value = (info.cost && info.cost.average) ?? null;
  updated++;
  if (!dryRun) strategic.updateOne({ _id: item._id, catalog: { $exists: false } }, { $set: set, $inc: { version: 1 } });
});

print(`${dryRun ? '[DRY_RUN] ' : ''}items: ${updated} ${dryRun ? 'to update' : 'updated'} (${missing} with a type no longer in the catalog)`);
