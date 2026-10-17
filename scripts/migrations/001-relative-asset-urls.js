// Stores image references as paths relative to the root of rmu-mfe-assets
// (`images/races/elf.png`) instead of absolute URLs, so the data does not depend on where the
// assets are deployed. The frontends resolve the paths against RMU_MFE_ASSETS_URI.
//
// Run with `make mongo-migrate f=scripts/migrations/001-relative-asset-urls.js` (DRY_RUN=1 to only
// count). Idempotent: values that are already relative, empty or from another host are left as is.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

// Hosts the assets were served from: the public CDN and the old local Python server.
const assetPrefixes = ['https://assets.labcabrera.com/', 'http://localhost:4000/'];

const targets = {
  'rmu-core': { professions: 'imageUrl', realms: 'imageUrl', races: 'imageUrl', cultures: 'imageUrl' },
  'rmu-items': { items: 'imageUrl' },
  'rmu-media': { images: 'url' },
  'rmu-npcs': { npcs: 'imageUrl' },
  'rmu-spells': { spells: 'imageUrl', 'spell-lists': 'imageUrl' },
  'rmu-strategic': { characters: 'imageUrl', factions: 'imageUrl', 'strategic-games': 'imageUrl' },
  'rmu-tactical': { 'actor-rounds': 'imageUrl', 'tactical-games': 'imageUrl' },
  'rmu-users': { users: 'imageUrl' },
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

let total = 0;
for (const [dbName, collections] of Object.entries(targets)) {
  const database = db.getSiblingDB(dbName);
  for (const [collection, field] of Object.entries(collections)) {
    let count = 0;
    for (const prefix of assetPrefixes) {
      const filter = { [field]: { $regex: `^${escapeRegex(prefix)}` } };
      const matched = database.getCollection(collection).countDocuments(filter);
      if (matched > 0 && !dryRun) {
        database
          .getCollection(collection)
          .updateMany(filter, [{ $set: { [field]: { $replaceOne: { input: `$${field}`, find: prefix, replacement: '' } } } }]);
      }
      count += matched;
    }
    total += count;
    print(`${dryRun ? '[dry-run] ' : ''}${dbName}.${collection}.${field}: ${count}`);
  }
}
print(`${dryRun ? '[dry-run] would update' : 'Updated'} ${total} documents`);
