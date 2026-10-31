// Spec 037: characters keep a copy of the stats of each skill (CharacterSkill.statistics, sorted). After
// fix-skill-definitions-037.js changed the third stat of administration, spell-lore, survival and trading, this script
// rewrites that copy from rmu-core (category + skill stats). Then run the workspace
// data/scripts/recalculate-characters.sh.
// Run with `make mongo-migrate f=scripts/migrations/037-character-skill-stats.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const core = db.getSiblingDB('rmu-core');
const strategic = db.getSiblingDB('rmu-strategic');
const SKILLS = ['administration', 'spell-lore', 'survival', 'trading'];
const stats = {};
SKILLS.forEach(id => {
  const skill = core.skills.findOne({ _id: id });
  const category = core.getCollection('skill-categories').findOne({ _id: skill.categoryId });
  stats[id] = (category.bonus || []).concat(skill.bonus || []).slice().sort();
});
let count = 0;
strategic.characters.find({ 'skills.skillId': { $in: SKILLS } }).forEach(character => {
  let changed = false;
  const skills = character.skills.map(s => {
    if (!SKILLS.includes(s.skillId) || JSON.stringify(s.statistics) === JSON.stringify(stats[s.skillId])) return s;
    print(`${dryRun ? 'would ' : ''}update ${character.name} ${s.skillId}: ${JSON.stringify(s.statistics)} -> ${JSON.stringify(stats[s.skillId])}`);
    changed = true;
    count++;
    return Object.assign({}, s, { statistics: stats[s.skillId] });
  });
  if (changed && !dryRun) strategic.characters.updateOne({ _id: character._id }, { $set: { skills }, $inc: { version: 1 } });
});
print(`${dryRun ? '[DRY_RUN] ' : ''}${count} character skills`);
