// Base and user images (workspace spec 057, 2026-10-31).
//
// - rmu-media.images keeps only the images users upload: the base images are the manifest of rmu-mfe-assets now,
//   so their records (`images/<category>/...` outside user-data) are deleted.
// - Every stored image path of the other databases that points to an upload moves from `images/user-data/` to
//   `uploads/user-data/`, where rmu-api-media stores the uploads.
// - Paths to base images removed on 2026-10-31 get the replacement the user chose (REPLACEMENTS).
//
// Run it before rmu-api-media `scripts/move-uploads.mjs`, which moves the upload files and their media records: that
// script takes every record outside uploads/ for an upload, so the base image records must be gone first.
// Run with `make mongo-migrate f=scripts/migrations/057-image-paths.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';

const UPLOADS_FROM = 'images/user-data/';
const UPLOADS_TO = 'uploads/user-data/';
const REPLACEMENTS = {
  'images/generic/disease.png': 'images/generic/poison.png',
  'images/generic/hp.png': 'images/generic/spells.png',
  'images/npcs/unknown-alt-2.png': 'images/npcs/unknown.png',
  'images/races/generic-dark-human-01.png': 'images/races/generic-human-01.png',
  'images/races/unknown-alt.png': 'images/races/unknown.png',
};

const rewrite = path => {
  if (path.startsWith(UPLOADS_FROM)) return UPLOADS_TO + path.slice(UPLOADS_FROM.length);
  return REPLACEMENTS[path] ?? path;
};

// The document with every image path rewritten, and how many changed.
const rewriteDoc = value => {
  if (typeof value === 'string') {
    const next = rewrite(value);
    return { value: next, changed: next === value ? 0 : 1 };
  }
  if (Array.isArray(value)) {
    let changed = 0;
    const next = value.map(item => {
      const r = rewriteDoc(item);
      changed += r.changed;
      return r.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype) {
    let changed = 0;
    const next = {};
    Object.keys(value).forEach(key => {
      const r = rewriteDoc(value[key]);
      changed += r.changed;
      next[key] = r.value;
    });
    return { value: next, changed };
  }
  return { value, changed: 0 };
};

const media = db.getSiblingDB('rmu-media').images;
const baseFilter = { url: { $regex: '^images/' }, category: { $ne: 'user-data' } };
const baseCount = media.countDocuments(baseFilter);
if (!dryRun) media.deleteMany(baseFilter);
print(`${prefix}rmu-media.images: ${baseCount} base image records deleted`);
const leftover = media.countDocuments({ url: { $regex: '^images/' }, category: 'user-data' });
if (leftover > 0) print(`WARNING: rmu-media.images has ${leftover} uploads still under images/: run rmu-api-media scripts/move-uploads.mjs now`);

db.adminCommand({ listDatabases: 1 })
  .databases.map(d => d.name)
  .filter(name => name.startsWith('rmu-') && name !== 'rmu-media' && name !== 'rmu-platform')
  .forEach(dbName => {
    const database = db.getSiblingDB(dbName);
    database.getCollectionNames().forEach(collectionName => {
      const collection = database.getCollection(collectionName);
      let docs = 0;
      let paths = 0;
      collection.find({}).forEach(doc => {
        const r = rewriteDoc(doc);
        if (!r.changed) return;
        docs += 1;
        paths += r.changed;
        if (!dryRun) collection.replaceOne({ _id: doc._id }, r.value);
      });
      if (docs) print(`${prefix}${dbName}.${collectionName}: ${paths} paths rewritten in ${docs} documents`);
    });
  });
