// Own images of more catalog items (2026-11-02): rmu-mfe-assets has an `images/items/<item id>.png` for the items
// below (crafting and travel tools). Each one takes it as its image, and so does
// the catalog copy (`catalog.imageUrl`) of the character and faction items of that type in rmu-strategic.
//
// Only documents whose image changes are written; their version goes up, as the API does on a change.
// Run with `make mongo-migrate f=scripts/migrations/073-item-crafting-tools-images.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const ITEMS = [
  'anvil', 'bellows', 'branding-iron', 'crucible', 'funnel', 'hourglass', 'ladder', 'ladle', 'loom',
  'magnifying-glass', 'mortar-and-pestle', 'needle-sewing', 'oar', 'paddle', 'paint', 'paintbrush', 'piton', 'plank',
  'poison-needle-trap', 'potters-wheel', 'spinning-wheel', 'tent-large', 'vise', 'wedge-staying', 'writing-brush',
];

const items = db.getSiblingDB('rmu-items').items;
const owned = db.getSiblingDB('rmu-strategic').items;

ITEMS.forEach(id => {
  const imageUrl = `images/items/${id}.png`;
  const filter = { _id: id, imageUrl: { $ne: imageUrl } };
  const found = items.countDocuments({ _id: id });
  const changed = items.countDocuments(filter);
  if (!dryRun && changed > 0) {
    items.updateOne(filter, { $set: { imageUrl, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  print(`${prefix}rmu-items.items ${id}: ${found === 0 ? 'not found' : changed > 0 ? (dryRun ? 'would get ' : 'got ') + imageUrl : 'kept its image'}`);
});

ITEMS.forEach(id => {
  const imageUrl = `images/items/${id}.png`;
  const filter = { itemTypeId: id, catalog: { $ne: null }, 'catalog.imageUrl': { $ne: imageUrl } };
  const changed = owned.countDocuments(filter);
  if (!dryRun && changed > 0) {
    owned.updateMany(filter, { $set: { 'catalog.imageUrl': imageUrl, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  if (changed > 0) print(`${prefix}rmu-strategic.items ${id}: ${changed} ${dryRun ? 'would get' : 'got'} ${imageUrl}`);
});
