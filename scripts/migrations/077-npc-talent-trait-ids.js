// Trait ids of the NPC sense talents (workspace spec 076, decision C7). rmu-api-npcs derives `traitId` from the talent
// name on save (`src/modules/shared/domain/npc-sense-traits.ts`), so tactical copies the creature senses to the actor
// traits; this script stores it on the talents saved before.
//
// rmu-npcs.npcs: each talent without `traitId` gets the catalog talent id that matches its normalized name
// (lowercase, no accents or punctuation, single spaces), or null. The mapping repeats the one of rmu-api-npcs: keep both
// in step. Each NPC that changes gets its version up, as the API does on a change.
//
// Run with `make mongo-migrate f=scripts/migrations/077-npc-talent-trait-ids.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Before or after the rmu-api-npcs release of spec 076: the release derives a missing `traitId` on
// read, and an old npcs ignores it. Idempotent: talents that already have `traitId` (null included) are kept.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const npcs = db.getSiblingDB('rmu-npcs').getCollection('npcs');

const SENSE_TRAIT_IDS = {
  nightvision: 'nightvision',
  'night vision': 'nightvision',
  darkvision: 'darkvision',
  'dark vision': 'darkvision',
  heatsense: 'heatsense',
  'heat sense': 'heatsense',
  'light sensitivity': 'light-sensitivity',
  'acute hearing': 'acute-hearing',
  'acute smell': 'acute-smell',
  'acute taste': 'acute-taste',
  'acute touch': 'acute-touch',
  'acute vision': 'acute-vision',
  'poor hearing': 'poor-hearing',
  'poor smell': 'poor-smell',
  'poor taste': 'poor-taste',
  'poor touch': 'poor-touch',
  'poor vision': 'poor-vision',
  'hearing cat': 'hearing-cat',
  'hearing dog': 'hearing-dog',
  'hearing hare': 'hearing-hare',
  'sight eagle': 'sight-eagle',
  'sight gecko': 'sight-gecko',
  'sight hawk': 'sight-hawk',
  'tetrachromatic vision': 'tetrachromatic-vision',
  'third eyelid': 'third-eyelid',
  'extra sense': 'extra-sense',
  'missing sense hearing': 'missing-sense-hearing',
  'missing sense smell': 'missing-sense-smell',
  'missing sense taste': 'missing-sense-taste',
  'missing sense touch': 'missing-sense-touch',
  'missing sense feel': 'missing-sense-touch',
  'missing sense feel touch': 'missing-sense-touch',
  'missing sense vision': 'missing-sense-vision',
  'missing sense sight': 'missing-sense-vision',
};

const normalize = name =>
  String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const traitIdOf = name => {
  if (!name) return null;
  const normalized = normalize(name);
  return SENSE_TRAIT_IDS[normalized] || (normalized.startsWith('extra sense ') ? 'extra-sense' : null);
};

const counts = {};
let changedNpcs = 0;
let changedTalents = 0;
npcs.find({ talents: { $elemMatch: { traitId: { $exists: false } } } }).forEach(npc => {
  let changed = 0;
  const talents = npc.talents.map(talent => {
    if (!talent || talent.traitId !== undefined) return talent;
    const traitId = traitIdOf(talent.name);
    const key = traitId || '(null)';
    counts[key] = (counts[key] || 0) + 1;
    changed++;
    return Object.assign({}, talent, { traitId });
  });
  if (changed === 0) return;
  changedNpcs++;
  changedTalents += changed;
  if (!dryRun) {
    npcs.updateOne({ _id: npc._id }, { $set: { talents, updatedAt: new Date() }, $inc: { version: 1 } });
  }
});

Object.keys(counts)
  .sort()
  .forEach(id => print(`${prefix}${id}: ${counts[id]} talents`));
print(
  `${prefix}${changedTalents} talents of ${changedNpcs} NPCs ${dryRun ? 'would get' : 'got'} traitId ` +
    `(${changedTalents - (counts['(null)'] || 0)} with a catalog id)`,
);
