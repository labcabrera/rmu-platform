// Characters whose sheet changes with the talents of workspace spec 079, phase 7 (block D):
// - Deadeye: each range of a ranged attack stores its Deadeye share (`traitBonus`), shown apart by rmu-api-tactical;
// - Vigorous and Feeble: `endurance.traitBonus`, added by rmu-api-tactical to the Endurance of the fatigue;
// - Beast of Burden: more load without penalty (load and maximum pace), plus `equipment.dodgeEncumbrancePenalty`;
// - Overweight: its extra load now also counts in the load penalty, not only in the maximum pace.
// The derived values are computed by rmu-api-strategic, so this script only queues those characters in
// rmu-platform.pending-recalculations ({_id: characterId, reasons, since}); scripts/recalculate-characters.sh then calls
// POST /v1/characters/:id/recalculate for each one. It changes nothing in rmu-strategic.
//
// Run with `make mongo-migrate f=scripts/migrations/082-recalculate-talents-079.js` (DRY_RUN=1 to only report) with the
// rmu-api-strategic release of spec 079 (phase 7) up, then scripts/recalculate-characters.sh. Idempotent: a character
// already queued keeps a single entry.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const characters = db.getSiblingDB('rmu-strategic').getCollection('characters');
const pending = db.getSiblingDB('rmu-platform').getCollection('pending-recalculations');

const TRAIT_IDS = ['deadeye', 'vigorous', 'feeble', 'beast-of-burden', 'overweight'];
const REASON = '082-recalculate-talents-079';

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
