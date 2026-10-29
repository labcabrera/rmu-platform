// Survival takes the regions of the realm as specialization, like Region Lore (2026-10-29). It used the `environment`
// enumeration (forest, desert...).
//
// - rmu-core: the `survival` skill changes its specialization from `environment` to `region`, so the character forms
//   offer the `region` enumerations of the game's realm.
// - rmu-strategic: the Survival specialization of each character is matched, ignoring case and accents, with the
//   regions of the realm of its game and stored as the region key (`mordor` -> `Mordor`). Values that match no region
//   (for example an old environment such as `Forest`) are listed and left unchanged: assign them by hand. A character
//   with two Survival entries that would end in the same region is also listed and left unchanged.
//
// The `environment` enumerations are kept: the tactical game environment still uses them.
//
// Run with `make mongo-migrate f=scripts/migrations/048-survival-region.js` (DRY_RUN=1 to only count). Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

const core = db.getSiblingDB('rmu-core');
const strategic = db.getSiblingDB('rmu-strategic');

const normalize = value => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const skill = core.skills.findOne({ _id: 'survival' });
if (!skill) throw new Error('Missing skill survival');
const skillChanged = skill.specialization !== 'region';
if (skillChanged && !dryRun) {
  core.skills.updateOne({ _id: 'survival' }, { $set: { specialization: 'region', updatedAt: new Date() }, $inc: { version: 1 } });
}

const regionsByRealm = new Map();
const regionsOf = realmId => {
  if (!regionsByRealm.has(realmId)) {
    const keys = new Map();
    core.enumerations.find({ category: 'region', realmId }).forEach(e => keys.set(normalize(e.key), e.key));
    regionsByRealm.set(realmId, keys);
  }
  return regionsByRealm.get(realmId);
};

let updated = 0;
let unchanged = 0;
const pending = [];
strategic.characters.find({ 'skills.skillId': 'survival' }).forEach(character => {
  const game = strategic.getCollection('strategic-games').findOne({ _id: character.gameId });
  const regions = game && game.realmId ? regionsOf(game.realmId) : new Map();
  const changes = [];
  const targets = new Set();
  character.skills.forEach((entry, index) => {
    if (entry.skillId !== 'survival' || !entry.specialization) return;
    const key = regions.get(normalize(entry.specialization));
    if (!key) {
      pending.push(`${character.name} (${character._id}): '${entry.specialization}' is not a region of the realm`);
      return;
    }
    if (targets.has(key)) {
      pending.push(`${character.name} (${character._id}): two Survival entries end in '${key}'`);
      return;
    }
    targets.add(key);
    if (key !== entry.specialization) changes.push({ index, from: entry.specialization, to: key });
  });
  if (changes.length === 0) {
    unchanged++;
    return;
  }
  updated++;
  changes.forEach(c => print(`${dryRun ? 'would set' : 'set'} ${character.name}: '${c.from}' -> '${c.to}'`));
  if (!dryRun) {
    const set = { updatedAt: new Date() };
    changes.forEach(c => (set[`skills.${c.index}.specialization`] = c.to));
    strategic.characters.updateOne({ _id: character._id, version: character.version }, { $set: set, $inc: { version: 1 } });
  }
});

print(`skill survival: ${skillChanged ? (dryRun ? 'would change' : 'changed') + ' to region' : 'already region'}`);
print(`characters: ${updated} ${dryRun ? 'to update' : 'updated'}, ${unchanged} unchanged, ${pending.length} pending`);
pending.forEach(line => print(`  pending: ${line}`));
