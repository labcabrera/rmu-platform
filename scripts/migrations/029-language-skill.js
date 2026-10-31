// Removes the generic 'language' skill: races and characters move to 'language-spoken'.
// A character that already has 'language-spoken' with the same specialization gets both entries merged.
// Run with `make mongo-migrate f=scripts/migrations/029-language-skill.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dry = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const core = db.getSiblingDB('rmu-core');
const strategic = db.getSiblingDB('rmu-strategic');
const norm = (s) => (s || '').toLowerCase().replace(/[-\s]+/g, ' ').trim();

core.races.find({ 'skillBonuses.skillId': 'language' }).forEach((race) => {
  const skillBonuses = race.skillBonuses.map((b) => (b.skillId === 'language' ? { ...b, skillId: 'language-spoken' } : b));
  print(`race ${race.name}: ${skillBonuses.filter((b) => b.skillId === 'language-spoken').map((b) => b.specialization).join(', ')}`);
  if (!dry) core.races.updateOne({ _id: race._id }, { $set: { skillBonuses, updatedAt: new Date() } });
});

strategic.characters.find({ 'skills.skillId': 'language' }).forEach((ch) => {
  const skills = [];
  for (const skill of ch.skills) {
    if (skill.skillId !== 'language') {
      skills.push(skill);
      continue;
    }
    const target = skills.concat(ch.skills).find(
      (s) => s !== skill && s.skillId === 'language-spoken' && norm(s.specialization) === norm(skill.specialization),
    );
    if (!target) {
      skills.push({ ...skill, skillId: 'language-spoken' });
      print(`character ${ch.name}: ${skill.specialization} -> language-spoken`);
      continue;
    }
    target.ranks = (target.ranks || 0) + (skill.ranks || 0);
    target.ranksDeveloped = (target.ranksDeveloped || 0) + (skill.ranksDeveloped || 0);
    target.cultureRanks = (target.cultureRanks || 0) + (skill.cultureRanks || 0);
    target.devPointsSpent = {
      normal: (target.devPointsSpent?.normal || 0) + (skill.devPointsSpent?.normal || 0),
      bonus: (target.devPointsSpent?.bonus || 0) + (skill.devPointsSpent?.bonus || 0),
    };
    target.racialBonus = Math.max(target.racialBonus || 0, skill.racialBonus || 0);
    // Same formula as the strategic SkillProcessor (ranks * 5)
    target.developmentBonus = target.ranks > 0 ? target.ranks * 5 : -20;
    target.totalBonus = (target.statBonus || 0) + target.racialBonus + (target.professionalBonus || 0) +
      target.developmentBonus + (target.customBonus || 0) + (target.traitBonus || 0);
    print(`character ${ch.name}: ${skill.specialization} merged into language-spoken ${target.specialization} (${target.ranks} ranks, total ${target.totalBonus})`);
  }
  skills.sort((a, b) => a.skillId.localeCompare(b.skillId));
  if (!dry) strategic.characters.updateOne({ _id: ch._id }, { $set: { skills, updatedAt: new Date() }, $inc: { version: 1 } });
});

print(`skill 'language': ${core.skills.countDocuments({ _id: 'language' })} to delete`);
if (!dry) core.skills.deleteOne({ _id: 'language' });
print(dry ? 'DRY RUN, nothing written' : 'done');
