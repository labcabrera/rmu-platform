// Moves the culture ranks of rmu-core from the old `fixedSkillRanks` field to the typed `skillRanks`
// list (spec 009): each `{ skillId, specialization, ranks }` becomes
// `{ type: 'skill', skillId, specialization, ranks }` and `fixedSkillRanks` is removed.
//
// Run with `make mongo-migrate f=scripts/migrations/2026-10-20-culture-skill-ranks.js` (DRY_RUN=1 to only
// count). Idempotent: only cultures that still have `fixedSkillRanks` are touched. When a culture
// already has `skillRanks`, the old entries are appended only if no 'skill' entry with the same
// skill and specialization exists.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

const cultures = db.getSiblingDB('rmu-core').getCollection('cultures');

const sameSkill = (a, b) => a.type === 'skill' && a.skillId === b.skillId && (a.specialization ?? null) === (b.specialization ?? null);

const toSkillRank = (fixed) => {
  const entry = { type: 'skill', skillId: fixed.skillId, ranks: fixed.ranks };
  if (fixed.specialization !== undefined && fixed.specialization !== null && fixed.specialization !== '') {
    entry.specialization = fixed.specialization;
  }
  return entry;
};

let updated = 0;
let entries = 0;
cultures.find({ fixedSkillRanks: { $exists: true } }).forEach((culture) => {
  const current = Array.isArray(culture.skillRanks) ? culture.skillRanks : [];
  const added = (culture.fixedSkillRanks || []).map(toSkillRank).filter((entry) => !current.some((s) => sameSkill(s, entry)));
  if (!dryRun) {
    cultures.updateOne({ _id: culture._id }, { $set: { skillRanks: [...current, ...added] }, $unset: { fixedSkillRanks: '' } });
  }
  updated += 1;
  entries += added.length;
  print(`${dryRun ? '[dry-run] ' : ''}rmu-core.cultures ${culture._id} (${culture.name}): ${added.length} skill entries`);
});
print(`${dryRun ? '[dry-run] would update' : 'Updated'} ${updated} cultures, ${entries} skill entries`);
