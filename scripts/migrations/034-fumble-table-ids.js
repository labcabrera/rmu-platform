// Spec 034: fumble table ids that have no table in rmu-api-attack-tables, renamed to a Core Law column, and a check
// that every id in use has a table. Then run recalculate-characters.sh with the new strategic image up (the shield
// attack takes melee-one-hand from the code).
// Run with `make mongo-migrate f=scripts/migrations/034-fumble-table-ids.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dry = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const TABLES = ['animals', 'bows', 'elemental-balls-cones', 'elemental-bolts', 'melee-one-hand', 'melee-two-hand',
  'mounted-arms', 'slings', 'thrown', 'unarmed'];
const RENAMES = { 'melee-two-hands': 'melee-two-hand', 'elemental-balls': 'elemental-balls-cones', shield: 'melee-one-hand' };
const NATURAL = ['beak', 'bite', 'claw', 'horn', 'ram', 'stinger', 'trample'];
const COLLECTIONS = [
  ['rmu-npcs', 'npcs'], ['rmu-items', 'items'], ['rmu-strategic', 'items'], ['rmu-strategic', 'characters'],
  ['rmu-spells', 'spells'], ['rmu-tactical', 'actor-rounds'], ['rmu-tactical', 'actions'],
];

// Column for an id with no table: by name, else by the attack table next to it
const columnFor = (fumbleTable, attackTable) => {
  if (RENAMES[fumbleTable]) return RENAMES[fumbleTable];
  if (TABLES.includes(fumbleTable)) return fumbleTable;
  if (NATURAL.includes(attackTable)) return 'animals';
  if (/-ball$/.test(attackTable || '')) return 'elemental-balls-cones';
  if (/-bolt$/.test(attackTable || '')) return 'elemental-bolts';
  return 'melee-one-hand';
};

const used = new Set();
const fix = (value) => {
  if (Array.isArray(value)) return value.map(fix);
  if (!value || typeof value !== 'object' || value instanceof Date || value._bsontype) return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) out[key] = fix(v);
  if (typeof out.fumbleTable === 'string') {
    out.fumbleTable = columnFor(out.fumbleTable, out.attackTable);
    used.add(out.fumbleTable);
  }
  return out;
};

COLLECTIONS.forEach(([dbName, collection]) => {
  const coll = db.getSiblingDB(dbName)[collection];
  let changed = 0;
  coll.find({}).forEach((doc) => {
    const updated = fix(doc);
    if (JSON.stringify(updated) === JSON.stringify(doc)) return;
    changed += 1;
    if (!dry) coll.replaceOne({ _id: doc._id }, updated);
  });
  print(`${dbName}.${collection}: ${dry ? 'would update' : 'updated'} ${changed}`);
});
print(`ids in use: ${[...used].sort().join(', ')}`);
const missing = [...used].filter((id) => !TABLES.includes(id));
if (missing.length) throw new Error(`fumble ids without table: ${missing.join(', ')}`);
