// Characters whose sheet changes with the talent rules of workspace spec 077 (decisions C9 and C13):
// - Iron Will no longer adds to the Mentalism RR of the sheet (rmu-api-tactical adds it against mental attacks);
// - Increased Size and Decreased Size change the size used by the hits and the attacks.
// The derived values are computed by rmu-api-strategic, so this script only queues those characters in
// rmu-platform.pending-recalculations ({_id: characterId, reasons, since}); scripts/recalculate-characters.sh then calls
// POST /v1/characters/:id/recalculate for each one. It changes nothing in rmu-strategic.
//
// Run with `make mongo-migrate f=scripts/migrations/079-recalculate-traits.js` (DRY_RUN=1 to only report) with the
// rmu-api-strategic release of spec 077 up, then scripts/recalculate-characters.sh. Idempotent: a character already
// queued keeps a single entry.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const characters = db.getSiblingDB('rmu-strategic').getCollection('characters');
const pending = db.getSiblingDB('rmu-platform').getCollection('pending-recalculations');

const TRAIT_IDS = ['iron-will', 'increased-size', 'decreased-size'];
const REASON = '079-recalculate-traits';

const counts = {};
let queued = 0;
characters.find({ 'traits.traitId': { $in: TRAIT_IDS } }, { _id: 1, name: 1, traits: 1 }).forEach(character => {
  const found = [...new Set((character.traits || []).map(t => t && t.traitId).filter(id => TRAIT_IDS.includes(id)))];
  found.forEach(id => (counts[id] = (counts[id] || 0) + 1));
  print(`${prefix}character ${character._id} (${character.name}): ${found.join(', ')}`);
  if (!dryRun) {
    pending.updateOne({ _id: character._id }, { $addToSet: { reasons: REASON }, $setOnInsert: { since: new Date() } }, { upsert: true });
  }
  queued++;
});

Object.keys(counts).forEach(id => print(`${prefix}${id}: ${counts[id]} characters`));
print(`${prefix}${queued} characters ${dryRun ? 'would be' : 'were'} queued for scripts/recalculate-characters.sh`);
