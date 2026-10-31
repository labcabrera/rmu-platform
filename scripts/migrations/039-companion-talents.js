// Workspace spec 039: renames the trait accute-smell to acute-smell in races, characters and actor rounds, removes the
// old catalog entry, and stores the skill category of every character skill (CharacterSkill.categoryId, used by the
// talents of a whole skill category). Run after import-companion-talents.js, then the workspace
// data/scripts/recalculate-characters.sh.
// Run with `make mongo-migrate f=scripts/migrations/039-companion-talents.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dry = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const core = db.getSiblingDB('rmu-core');
const strategic = db.getSiblingDB('rmu-strategic');
const tactical = db.getSiblingDB('rmu-tactical');
const OLD = 'accute-smell';
const NEW = 'acute-smell';

const rename = (collection, label) => {
  const filter = { 'traits.traitId': OLD };
  const count = collection.countDocuments(filter);
  print(`${dry ? 'would rename' : 'rename'} ${OLD} in ${count} ${label}`);
  if (!dry && count > 0) {
    collection.updateMany(filter, { $set: { 'traits.$[t].traitId': NEW } }, { arrayFilters: [{ 't.traitId': OLD }] });
  }
};
rename(core.races, 'races');
rename(strategic.characters, 'characters');
rename(tactical['actor-rounds'], 'actor rounds');
if (core.traits.findOne({ _id: NEW }) && core.traits.findOne({ _id: OLD })) {
  print(`${dry ? 'would remove' : 'remove'} trait ${OLD}`);
  if (!dry) core.traits.deleteOne({ _id: OLD });
}

const categories = {};
core.skills.find({}, { categoryId: 1 }).forEach((skill) => (categories[skill._id] = skill.categoryId));
let skills = 0;
let unknown = new Set();
strategic.characters.find({ skills: { $elemMatch: { categoryId: { $exists: false } } } }).forEach((character) => {
  const updatedSkills = character.skills.map((s) => {
    if (s.categoryId) return s;
    const categoryId = categories[s.skillId];
    if (!categoryId) {
      unknown.add(s.skillId);
      return s;
    }
    skills++;
    return Object.assign({}, s, { categoryId });
  });
  if (!dry) strategic.characters.updateOne({ _id: character._id }, { $set: { skills: updatedSkills }, $inc: { version: 1 } });
});
print(`${dry ? '[DRY_RUN] ' : ''}${skills} character skills with category; skills not in rmu-core: ${JSON.stringify([...unknown])}`);
