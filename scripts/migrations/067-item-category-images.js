// Generic images of more item categories (2026-11-01, after 066): rmu-mfe-assets has an `images/items/category-<category>.png`
// for the categories below, and every catalog item of them takes it as its image, replacing the one it had.
//
// Only documents whose image changes are written; their version goes up, as the API does on a change.
// Run with `make mongo-migrate f=scripts/migrations/067-item-category-images.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const CATEGORIES = ['poison', 'property', 'acid', 'intoxicant', 'jewelry'];

const items = db.getSiblingDB('rmu-items').items;

CATEGORIES.forEach(category => {
  const imageUrl = `images/items/category-${category}.png`;
  const total = items.countDocuments({ category });
  const filter = { category, imageUrl: { $ne: imageUrl } };
  const changed = items.countDocuments(filter);
  if (!dryRun && changed > 0) {
    items.updateMany(filter, { $set: { imageUrl, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  print(`${prefix}rmu-items.items ${category}: ${changed} of ${total} ${dryRun ? 'would get' : 'got'} ${imageUrl}`);
});
