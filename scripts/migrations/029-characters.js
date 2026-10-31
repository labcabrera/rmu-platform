// Spec 029: realms, realm stat and spell lists of the stored characters.
// - rmu-core skill-categories: realmBonus '2' -> 2.
// - rmu-strategic characters: info.realmTypes (the fixed realms of the profession, or [realmType]); the realm stat
//   placeholder in the skills of the realm categories; spell list specializations as list codes with the list skill and
//   costs of spec 029.
// Derived values (rank bonus of table 3-0b, totals, hits, power) are recalculated by strategic afterwards: publish a
// race-updated event per race (the workspace data/scripts/recalculate-characters.sh).
// Run with `make mongo-migrate f=scripts/migrations/029-characters.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dry = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const core = db.getSiblingDB('rmu-core');
const strategic = db.getSiblingDB('rmu-strategic');
const spells = db.getSiblingDB('rmu-spells');

const LIST_SKILLS = ['base-spell-list', 'open-spell-list', 'closed-spell-list', 'arcane-spell-list', 'restricted-spell-list'];
const COST_KEYS = {
  'base-spell-list': 'spells-base-open',
  'open-spell-list': 'spells-base-open',
  'closed-spell-list': 'spells-closed',
  'arcane-spell-list': 'spells-arcane',
  'restricted-spell-list': 'spells-restricted',
  'magic-ritual': 'spells-ritual-magic',
};
const norm = (s) => (s || '').toLowerCase().replace(/[’']/g, "'").replace(/[-_\s]+/g, ' ').trim();

// 1. Categories
const realmCategories = {};
core['skill-categories'].find({ realmBonus: { $exists: true, $ne: null } }).forEach((c) => {
  realmCategories[c._id] = Number(c.realmBonus) || 0;
  if (typeof c.realmBonus === 'string') {
    print(`category ${c._id}: realmBonus '${c.realmBonus}' -> ${Number(c.realmBonus)}`);
    if (!dry) core['skill-categories'].updateOne({ _id: c._id }, { $set: { realmBonus: Number(c.realmBonus) } });
  }
});
const realmSkills = {};
core.skills.find({ categoryId: { $in: Object.keys(realmCategories) } }).forEach((s) => (realmSkills[s._id] = realmCategories[s.categoryId]));
const professions = {};
core.professions.find().forEach((p) => (professions[p._id] = p));
const lists = spells['spell-lists'].find({}, { code: 1, name: 1, type: 1, professionId: 1, realms: 1 }).toArray();
const listByCode = Object.fromEntries(lists.map((l) => [l.code, l]));
const listByName = Object.fromEntries(lists.map((l) => [norm(l.name), l]));

const listSkill = (list, professionId) =>
  list.type === 'base' ? (list.professionId === professionId ? 'base-spell-list' : 'restricted-spell-list') : list.type === 'open' ? 'open-spell-list' : 'closed-spell-list';

// 2. Characters
let changed = 0;
const unresolved = [];
strategic.characters.find().forEach((ch) => {
  const profession = professions[ch.info.professionId] || {};
  const fixed = profession.fixedRealmTypes || [];
  const realmTypes = fixed.length > 0 ? fixed : [ch.info.realmType];
  const notes = [];
  if (JSON.stringify(ch.info.realmTypes) !== JSON.stringify(realmTypes)) notes.push(`realms ${realmTypes.join('+')}`);
  const skills = ch.skills.map((skill) => {
    let result = { ...skill };
    const times = realmSkills[skill.skillId] || 0;
    if (times > 0 && !(skill.statistics || []).includes('realm')) {
      result.statistics = [...(skill.statistics || []), ...Array(times).fill('realm')];
      notes.push(`${skill.skillId} +realm`);
    }
    if (LIST_SKILLS.includes(skill.skillId) && skill.specialization) {
      const list = listByCode[skill.specialization] || listByName[norm(skill.specialization)];
      if (!list) {
        unresolved.push(`${ch.name}: ${skill.skillId} '${skill.specialization}'`);
      } else {
        result.specialization = list.code;
        result.skillId = listSkill(list, ch.info.professionId);
        if (result.skillId !== skill.skillId || result.specialization !== skill.specialization) notes.push(`${skill.specialization} -> ${result.skillId}/${list.code}`);
      }
    }
    const costKey = COST_KEYS[result.skillId];
    if (costKey && (!result.development || result.development.length === 0) && profession.skillCosts && profession.skillCosts[costKey]) {
      result.development = profession.skillCosts[costKey];
      notes.push(`${result.skillId} costs ${result.development.join('/')}`);
    }
    return result;
  });
  if (notes.length === 0) return;
  changed++;
  print(`${ch.name} (${ch.info.professionId}): ${notes.join('; ')}`);
  if (!dry) {
    strategic.characters.updateOne(
      { _id: ch._id },
      { $set: { 'info.realmTypes': realmTypes, 'info.realmType': realmTypes[0], skills, updatedAt: new Date() }, $inc: { version: 1 } },
    );
  }
});
print(`${changed} characters changed`);
if (unresolved.length) print(`unresolved spell lists (left as they are):\n  ${unresolved.join('\n  ')}`);
print(dry ? 'DRY RUN, nothing written' : 'done');
