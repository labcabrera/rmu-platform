// Spec 041 follow-up (2026-10-29): every AT keeps only its four pieces (head, torso, arms and legs); the full suits are
// no longer catalog types.
//
// - Strategic items of a full suit become the torso armor of the same material: type, name, armor (without coverage)
//   and the catalog data. They keep their id, so an equipped suit stays equipped in the body slot. Value and price are
//   kept.
// - Their ledger entries point to the torso armor.
// - The 9 full suit types are deleted from rmu-items.
//
// Run with `make mongo-migrate f=scripts/migrations/041-armor-full-suits.js` (DRY_RUN=1 to only count). Idempotent:
// a second run finds nothing to change.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

const strategic = db.getSiblingDB('rmu-strategic');
const items = strategic.getCollection('items');
const ledger = strategic.getCollection('item-ledger');
const catalog = db.getSiblingDB('rmu-items').getCollection('items');

const MATERIALS = ['heavy-cloth', 'soft-leather', 'hide-scale', 'laminar', 'rigid-leather', 'metal-scale', 'mail',
  'brigandine', 'plate'];

let converted = 0;
let entries = 0;
let removed = 0;
MATERIALS.forEach(material => {
  const suitId = `${material}-full-suit`;
  const targetId = `${material}-torso-armor`;
  const target = catalog.findOne({ _id: targetId });
  if (!target) throw new Error(`Missing catalog type ${targetId}`);
  const info = target.info || {};
  items.find({ itemTypeId: suitId }).forEach(item => {
    converted++;
    if (dryRun) return;
    items.updateOne(
      { _id: item._id, itemTypeId: suitId },
      {
        $set: {
          itemTypeId: targetId,
          name: item.name === suitId ? targetId : item.name,
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
  entries += ledger.countDocuments({ itemTypeId: suitId });
  if (!dryRun) {
    ledger.updateMany({ itemTypeId: suitId, itemName: suitId }, { $set: { itemName: targetId } });
    ledger.updateMany({ itemTypeId: suitId }, { $set: { itemTypeId: targetId } });
  }
  if (catalog.countDocuments({ _id: suitId }) > 0) {
    removed++;
    if (!dryRun) catalog.deleteOne({ _id: suitId });
  }
});

print(`${dryRun ? 'Would convert' : 'Converted'} ${converted} items and ${entries} ledger entries; ${dryRun ? 'would delete' : 'deleted'} ${removed} catalog types`);
