// Spells without an image of their own (2026-11-09): every spell gets a null `imageUrl`, and shows the image of its
// spell list. The image files are not touched: images/spells/ holds the images of the lists.
//
// Only documents that change are written; their version goes up, as the API does on a change.
// Run with `make mongo-migrate f=scripts/migrations/083-spell-images-from-list.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const spells = db.getSiblingDB('rmu-spells').spells;

const withImage = { imageUrl: { $ne: null } };
const withoutField = { imageUrl: { $exists: false } };

print(`${prefix}rmu-spells.spells: ${spells.countDocuments({})} in total`);
spells.aggregate([{ $match: withImage }, { $group: { _id: '$imageUrl', n: { $sum: 1 } } }]).forEach(row => {
  print(`${prefix}  ${row.n} with image '${row._id}'`);
});
print(`${prefix}  ${spells.countDocuments(withoutField)} without the field`);

if (!dryRun) {
  const cleared = spells.updateMany(withImage, { $set: { imageUrl: null, updatedAt: new Date() }, $inc: { version: 1 } });
  const filled = spells.updateMany(withoutField, { $set: { imageUrl: null } });
  print(`rmu-spells.spells: ${cleared.modifiedCount} images removed, ${filled.modifiedCount} set to null`);
}
