// Spec 031: renames the misspelled skill ids of the rmu-core catalog (blind-figthing, ilusion-crafting) and every
// professionalSkills entry that uses them. No race, culture or character referenced them (checked 2026-10-26).
// Run with `make mongo-migrate f=scripts/migrations/031-skill-ids.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dry = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const core = db.getSiblingDB('rmu-core');
const RENAMES = { 'blind-figthing': 'blind-fighting', 'ilusion-crafting': 'illusion-crafting' };
Object.entries(RENAMES).forEach(([from, to]) => {
  const skill = core.skills.findOne({ _id: from });
  if (!skill) print(`skill ${from}: not found`);
  else if (core.skills.findOne({ _id: to })) print(`skill ${to}: already exists, ${from} left as is`);
  else {
    print(`${dry ? 'would rename' : 'rename'} skill ${from} -> ${to}`);
    if (!dry) {
      core.skills.insertOne({ ...skill, _id: to, updatedAt: new Date() });
      core.skills.deleteOne({ _id: from });
    }
  }
  core.professions.find({ professionalSkills: from }).forEach((p) => {
    print(`${dry ? 'would update' : 'update'} profession ${p._id}`);
    if (!dry) core.professions.updateOne({ _id: p._id, professionalSkills: from }, { $set: { 'professionalSkills.$': to, updatedAt: new Date() } });
  });
});
