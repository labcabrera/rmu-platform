// Race archetypes become kebab keys (workspace spec 059, 2026-10-31). `archetype` was free text with several spellings
// of the same archetype (`Human`, `human`, `High Human`, `High-Human`...); the list of races filters by it, and the
// fronts show it translated (`race-archetype-<key>`), so every rmu-core race stores the key: lowercase, accents
// stripped, any run of other characters (spaces, underscores) as one `-`, no `-` at the ends. The same rule is
// `raceArchetypeKey` in rmu-mfe-core, which the race form applies before saving.
//
// Races without archetype, or whose archetype is already a key, are left as they are; the version of the changed
// races goes up, as the API does on a change.
//
// Run with `make mongo-migrate f=scripts/migrations/059-race-archetypes.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const races = db.getSiblingDB('rmu-core').races;

const toKey = value =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const distinct = () => races.distinct('archetype').filter(value => value !== null && value !== undefined).sort();

const before = distinct();
print(`rmu-core.races: ${races.countDocuments({})} races, ${before.length} distinct archetypes before`);

const renames = {};
let changed = 0;
races.find({ archetype: { $type: 'string' } }, { archetype: 1 }).forEach(race => {
  const key = toKey(race.archetype);
  if (key === race.archetype) return;
  const next = key === '' ? null : key;
  if (!dryRun) {
    races.updateOne({ _id: race._id }, { $set: { archetype: next, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  const label = `${race.archetype} -> ${next}`;
  renames[label] = (renames[label] ?? 0) + 1;
  changed += 1;
});

Object.keys(renames)
  .sort()
  .forEach(label => print(`${prefix}${label} (${renames[label]})`));
print(`${dryRun ? '[dry-run] would normalize' : 'Normalized'} the archetype of ${changed} races`);

const after = dryRun ? [...new Set(before.map(value => (typeof value === 'string' ? toKey(value) : value)))].sort() : distinct();
print(`${prefix}${after.length} distinct archetypes after: ${after.join(', ')}`);
