// Own images of more catalog items (2026-11-02): rmu-mfe-assets has an `images/items/<item id>.png` for the items
// below, and each one takes it as its image when it had none or a generic `category-*` one.
//
// Only documents whose image changes are written; their version goes up, as the API does on a change.
// Run with `make mongo-migrate f=scripts/migrations/069-item-clothes-images.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const ITEMS = [
  'cap-fur', 'cape', 'coat', 'coat-fur', 'doublet', 'hat', 'hose', 'padded-undercoat', 'robe-normal', 'sandals',
  'shirt-fine', 'shoes-soft',
];

const items = db.getSiblingDB('rmu-items').items;

ITEMS.forEach(id => {
  const imageUrl = `images/items/${id}.png`;
  const filter = { _id: id, $or: [{ imageUrl: null }, { imageUrl: /^images\/items\/category-/ }] };
  const found = items.countDocuments({ _id: id });
  const changed = items.countDocuments(filter);
  if (!dryRun && changed > 0) {
    items.updateOne(filter, { $set: { imageUrl, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  print(`${prefix}rmu-items.items ${id}: ${found === 0 ? 'not found' : changed > 0 ? (dryRun ? 'would get ' : 'got ') + imageUrl : 'kept its image'}`);
});
