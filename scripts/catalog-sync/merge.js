// Catalog import, merge step (workspace spec 103, D10): the package restored in STAGING_DB goes into the rmu-*
// databases without touching user data. import.sh restores the package and runs this script.
// Defined by import.sh: COLLECTIONS, DRY_RUN, PRUNE, CATALOG_OWNER_SUB, PACKAGE.
//
// Per collection of the manifest:
//   - new: in the package, not in production -> inserted;
//   - changed / same: in both -> replaced when it differs (the version goes up), left alone otherwise;
//   - conflict: the _id exists in production as user data (outside the filter) -> skipped and reported;
//   - orphan: catalog in production, not in the package. `whole` deletes them; `system` only lists them, because
//     characters can reference them, and PRUNE deletes them.
// The `owner` of every imported document becomes CATALOG_OWNER_SUB, the production admin.

const staging = db.getSiblingDB(STAGING_DB);
const manifest = staging.getCollection('_manifest').findOne({ _id: 'manifest' });
if (!manifest) throw new Error(`No manifest in ${STAGING_DB}: restore the package first`);

checkClassified();
const local = new Set(appliedMigrations());
const packaged = new Set(manifest.migrations);
const onlyHere = [...local].filter((m) => !packaged.has(m));
const onlyThere = [...packaged].filter((m) => !local.has(m));
if (onlyHere.length || onlyThere.length)
  throw new Error(
    'The migrations of this database and of the package differ. Run the pending ones on both sides first.\n' +
      `  only here: ${onlyHere.join(', ') || '-'}\n  only in the package: ${onlyThere.join(', ') || '-'}`,
  );

const modes = new Map(catalogEntries().map((e) => [`${e.db}.${e.collection}`, e]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!UUID.test(CATALOG_OWNER_SUB)) throw new Error(`CATALOG_OWNER_SUB is not a Keycloak user id: ${CATALOG_OWNER_SUB}`);

const same = (a, b) => JSON.stringify(EJSON.serialize(a)) === JSON.stringify(EJSON.serialize(b));
const report = [];
let failures = 0;

for (const entry of manifest.collections) {
  const key = `${entry.db}.${entry.collection}`;
  const current = modes.get(key);
  if (!current || current.mode !== entry.mode || !same(current.filter, entry.filter))
    throw new Error(`${key} is ${entry.mode} in the package but ${current?.mode ?? 'never'} in collections.json`);

  const source = staging.getCollection(`${entry.db}${SEPARATOR}${entry.collection}`);
  const target = db.getSiblingDB(entry.db).getCollection(entry.collection);
  const counts = { new: 0, changed: 0, same: 0, conflict: 0, orphan: 0 };
  const conflicts = [];
  const ops = [];
  const flush = (force) => {
    if (!DRY_RUN && ops.length && (force || ops.length >= 500)) target.bulkWrite(ops.splice(0), { ordered: false });
  };
  const packageIds = new Set();

  source.find().forEach((doc) => {
    packageIds.add(EJSON.stringify(doc._id));
    if ('owner' in doc) doc.owner = CATALOG_OWNER_SUB;
    const existing = target.findOne({ _id: doc._id });
    if (!existing) {
      counts.new++;
      ops.push({ insertOne: { document: doc } });
    } else if (target.countDocuments({ $and: [{ _id: doc._id }, entry.filter] }) === 0) {
      counts.conflict++;
      conflicts.push(EJSON.stringify(doc._id));
      return;
    } else {
      if (typeof existing.version === 'number') doc.version = existing.version;
      if (same(doc, existing)) {
        counts.same++;
        return;
      }
      counts.changed++;
      if (typeof existing.version === 'number') doc.version = existing.version + 1;
      ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc } });
    }
    flush(false);
  });

  const orphans = target
    .find(entry.filter, { _id: 1 })
    .toArray()
    .map((d) => d._id)
    .filter((id) => !packageIds.has(EJSON.stringify(id)));
  counts.orphan = orphans.length;
  const deleteOrphans = entry.mode === 'whole' || PRUNE;
  if (orphans.length && deleteOrphans) ops.push({ deleteMany: { filter: { _id: { $in: orphans } } } });
  flush(true);

  report.push(
    `  ${entry.mode.padEnd(6)} ${key}: new ${counts.new}, changed ${counts.changed}, same ${counts.same}, ` +
      `conflict ${counts.conflict}, orphan ${counts.orphan}${orphans.length ? (deleteOrphans ? ' (deleted)' : ' (kept)') : ''}`,
  );
  if (conflicts.length) {
    failures += conflicts.length;
    report.push(`      user documents with a catalog _id (skipped): ${conflicts.slice(0, 10).join(', ')}`);
  }
  if (orphans.length && !deleteOrphans)
    report.push(`      orphans (PRUNE=1 deletes them): ${orphans.slice(0, 10).map((id) => EJSON.stringify(id)).join(', ')}`);
  entry.result = counts;
}

print(`${DRY_RUN ? 'Would import' : 'Imported'} ${PACKAGE} (exported ${manifest.createdAt.toISOString()}, rmu-platform ${manifest.platformCommit}):`);
report.forEach((line) => print(line));
if (failures) print(`${failures} conflicts were skipped: review them by hand.`);

if (!DRY_RUN)
  db.getSiblingDB('rmu-platform')['catalog-syncs'].insertOne({
    package: PACKAGE,
    appliedAt: new Date(),
    exportedAt: manifest.createdAt,
    platformCommit: manifest.platformCommit,
    prune: PRUNE,
    collections: manifest.collections.map(({ db: d, collection, mode, result }) => ({ db: d, collection, mode, ...result })),
  });
