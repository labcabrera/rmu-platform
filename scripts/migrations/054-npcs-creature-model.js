// NPCs move to the Combat Stat Block of Creature Law (workspace spec 054, 2026-10-30). The new rmu-api-npcs reads old
// documents with defaults, so this migration only rewrites the fields whose meaning changed:
//
// - category: the old values become the creature categories (beast and dinosaur → animal, humanoid → race,
//   construct → artificial, dragon → fell, celestial → extra-planar); unknown ones become `other`.
// - outlookType: the misspelled `obssesive` becomes `obsessive`.
// - attacks: `{attackName, attackType, attackTable, fumbleTable, attackSize, bo, fumble}` becomes the structured attack
//   `{ob, size, attackTable, fumbleTable, …, notation}`. The old attackSize was relative to medium (0), so the size
//   class is 5 + attackSize, between 1 and 13. The old name is kept as the notation.
// - skills: `influence@intimidation` splits into skillId and specialization; ranks and bonus are kept.
// - items: `stackeable` is dropped.
// - accessType `private`, size `medium` and the empty stat block blocks are set where missing, so the documents can be
//   filtered by them.
//
// Run with `make mongo-migrate f=scripts/migrations/054-npcs-creature-model.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const npcs = db.getSiblingDB('rmu-npcs').npcs;

const CATEGORIES = {
  beast: 'animal',
  dinosaur: 'animal',
  humanoid: 'race',
  construct: 'artificial',
  dragon: 'fell',
  celestial: 'extra-planar',
};
const NEW_CATEGORIES = new Set([
  'animal', 'artificial', 'elemental', 'extra-planar', 'fell', 'fey', 'monster', 'plant', 'race', 'undead', 'other',
]);

const isOldAttack = a => a && (a.bo !== undefined || a.attackSize !== undefined || a.attackName !== undefined);
const toAttack = a => ({
  ob: a.bo ?? a.ob ?? 0,
  size: Math.min(13, Math.max(1, 5 + (a.attackSize ?? 0))),
  attackTable: a.attackTable,
  fumbleTable: a.fumbleTable ?? null,
  additionalCritical: null,
  sequence: null,
  cooperation: null,
  kata: null,
  alternativeTo: null,
  poison: null,
  hand: null,
  notation: a.attackName || null,
});

const toSkill = s => {
  const [skillId, specialization] = String(s.skillId).split('@');
  return {
    skillId,
    specialization: s.specialization ?? specialization ?? null,
    ranks: s.ranks ?? null,
    bonus: s.bonus ?? 0,
    note: s.note ?? null,
  };
};

const DEFAULTS = {
  accessType: 'private',
  type: null,
  group: null,
  levelSpread: null,
  archetype: null,
  movement: [],
  size: 'medium',
  criticalSize: null,
  criticalCodes: { reduceSeverity: false, noKnockdown: false, stunImmune: false, bleedImmune: false, immunities: [] },
  deathHits: null,
  running: null,
  shield: null,
  powerPoints: null,
  resistances: null,
  encounter: null,
  stats: null,
  details: null,
  talents: [],
  source: null,
};

let changed = 0;
npcs.find().forEach(npc => {
  const set = {};
  const category = NEW_CATEGORIES.has(npc.category) ? npc.category : CATEGORIES[npc.category] || 'other';
  if (category !== npc.category) set.category = category;
  if (npc.outlookType === 'obssesive') set.outlookType = 'obsessive';
  if ((npc.attacks || []).some(isOldAttack)) set.attacks = npc.attacks.map(a => (isOldAttack(a) ? toAttack(a) : a));
  const skills = (npc.skills || []).map(toSkill);
  if (JSON.stringify(skills) !== JSON.stringify(npc.skills || [])) set.skills = skills;
  if ((npc.items || []).some(i => 'stackeable' in i)) {
    set.items = npc.items.map(i => ({ name: i.name, itemTypeId: i.itemTypeId ?? null, amount: i.amount ?? 1 }));
  }
  Object.entries(DEFAULTS).forEach(([key, value]) => {
    if (npc[key] === undefined) set[key] = value;
  });
  if (Object.keys(set).length === 0) return;
  changed++;
  print(`${dryRun ? 'would update' : 'update'} ${npc._id} (${npc.name}): ${Object.keys(set).join(', ')}`);
  if (!dryRun) npcs.updateOne({ _id: npc._id }, { $set: set, $inc: { version: 1 } });
});
print(`${changed} NPCs ${dryRun ? 'to update' : 'updated'}`);
