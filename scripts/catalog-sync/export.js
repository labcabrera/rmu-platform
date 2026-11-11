// Catalog export, step 1 (workspace spec 103, D10): copies the catalog documents into EXPORT_DB, one collection
// `<db>__<collection>` per source, plus `_manifest`. export.sh then dumps EXPORT_DB and drops it.
// Defined by export.sh: COLLECTIONS, PLATFORM_COMMIT.

checkClassified();
const target = db.getSiblingDB(EXPORT_DB);
target.dropDatabase();

const manifest = {
  _id: 'manifest',
  createdAt: new Date(),
  platformCommit: PLATFORM_COMMIT,
  migrations: appliedMigrations(),
  collections: [],
};
for (const { db: database, collection, mode, filter } of catalogEntries()) {
  const name = `${database}${SEPARATOR}${collection}`;
  db.getSiblingDB(database)
    .getCollection(collection)
    .aggregate([{ $match: filter }, { $out: { db: EXPORT_DB, coll: name } }])
    .toArray();
  const count = target.getCollection(name).countDocuments();
  manifest.collections.push({ db: database, collection, mode, filter, count });
  print(`  ${mode.padEnd(6)} ${database}.${collection}: ${count}`);
}
target.getCollection('_manifest').insertOne(manifest);
print(`${manifest.collections.length} collections, ${manifest.migrations.length} migrations`);
