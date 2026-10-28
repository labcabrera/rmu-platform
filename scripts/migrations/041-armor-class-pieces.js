// Spec 041 follow-up (2026-10-28): the catalog had the book's generic armor pieces (light, medium and heavy helmet,
// vambraces and greaves) next to the pieces of each material, so AT 3, 5 and 9 had two helmets, two vambraces and two
// greaves. Every AT keeps one piece per slot (plus its full suit).
//
// - Strategic items of a generic piece become the material piece of the same AT and class (light → soft leather,
//   medium → laminar, heavy → brigandine): type, name, armor and the catalog data. Their value and price are kept.
// - Their ledger entries point to the material piece.
// - The 9 generic types are deleted from rmu-items.
//
// Run with `make mongo-migrate f=scripts/migrations/041-armor-class-pieces.js` (DRY_RUN=1 to only count). Idempotent:
// a second run finds nothing to change.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

const strategic = db.getSiblingDB('rmu-strategic');
const items = strategic.getCollection('items');
const ledger = strategic.getCollection('item-ledger');
const catalog = db.getSiblingDB('rmu-items').getCollection('items');

const MATERIAL = { light: 'soft-leather', medium: 'laminar', heavy: 'brigandine' };
const PIECES = ['helmet', 'vambraces', 'greaves'];
const replacements = new Map();
Object.entries(MATERIAL).forEach(([klass, material]) =>
  PIECES.forEach(piece => replacements.set(`${klass}-${piece}`, `${material}-${piece}`)),
);

let converted = 0;
let entries = 0;
let removed = 0;
replacements.forEach((targetId, genericId) => {
  const target = catalog.findOne({ _id: targetId });
  if (!target) throw new Error(`Missing catalog type ${targetId}`);
  const info = target.info || {};
  items.find({ itemTypeId: genericId }).forEach(item => {
    converted++;
    if (dryRun) return;
    items.updateOne(
      { _id: item._id, itemTypeId: genericId },
      {
        $set: {
          itemTypeId: targetId,
          name: item.name === genericId ? targetId : item.name,
          armor: target.armor,
          'info.weight': info.weight ?? null,
          'info.strength': info.strength ?? null,
          catalog: {
            cost: info.cost || null,
            rarity: info.rarity || null,
            productionHours: info.productionHours ?? null,
            imageUrl: target.imageUrl || null,
          },
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
    );
  });
  const ledgerQuery = { itemTypeId: genericId };
  entries += ledger.countDocuments(ledgerQuery);
  if (!dryRun) {
    ledger.updateMany({ itemTypeId: genericId, itemName: genericId }, { $set: { itemName: targetId } });
    ledger.updateMany(ledgerQuery, { $set: { itemTypeId: targetId } });
  }
  if (catalog.countDocuments({ _id: genericId }) > 0) {
    removed++;
    if (!dryRun) catalog.deleteOne({ _id: genericId });
  }
});

print(`${dryRun ? 'Would convert' : 'Converted'} ${converted} items and ${entries} ledger entries; ${dryRun ? 'would delete' : 'deleted'} ${removed} catalog types`);
