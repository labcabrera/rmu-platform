// Spec 033: attack table ids of the old hardcoded list of rmu-api-attack-tables (ball-cold, bow-long...) renamed to
// the ids of the Medium table files (cold-ball, long-bow...), and a check that every id in use has a table.
// (any JSON file as the data argument; the script does not read it)
// Run with `make mongo-migrate f=scripts/migrations/033-attack-table-ids.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dry = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const RENAMES = {
  'ball-cold': 'cold-ball', 'ball-fire': 'fire-ball', 'ball-lightning': 'lightning-ball',
  'bolt-fire': 'fire-bolt', 'bolt-ice': 'ice-bolt', 'bolt-lightning': 'lightning-bolt', 'bolt-water': 'water-bolt',
  'bow-long': 'long-bow', 'bow-short': 'short-bow',
};
const COLLECTIONS = [
  ['rmu-npcs', 'npcs'], ['rmu-items', 'items'], ['rmu-strategic', 'items'], ['rmu-strategic', 'characters'],
  ['rmu-spells', 'spells'], ['rmu-tactical', 'actor-rounds'],
];
const FIELDS = /^(attackTable|alternativeTable)$/;

// Returns a copy with the renamed ids, and collects every id in use
const rename = (value, used) => {
  if (Array.isArray(value)) return value.map((v) => rename(v, used));
  if (!value || typeof value !== 'object' || value instanceof Date || value._bsontype) return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (FIELDS.test(key) && typeof v === 'string') {
      out[key] = RENAMES[v] || v;
      used.add(out[key]);
    } else {
      out[key] = rename(v, used);
    }
  }
  return out;
};

const used = new Set();
COLLECTIONS.forEach(([dbName, collection]) => {
  const coll = db.getSiblingDB(dbName)[collection];
  let changed = 0;
  coll.find({}).forEach((doc) => {
    const updated = rename(doc, used);
    if (JSON.stringify(updated) === JSON.stringify(doc)) return;
    changed += 1;
    if (!dry) coll.replaceOne({ _id: doc._id }, updated);
  });
  print(`${dbName}.${collection}: ${dry ? 'would update' : 'updated'} ${changed}`);
});
print(`ids in use: ${[...used].sort().join(', ')}`);
