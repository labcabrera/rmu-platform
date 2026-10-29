// Specializations become normalized keys (workspace spec 050, 2026-10-29). References store the kebab-case key of an
// enumeration (`black-speech`); the name the user wrote (`Black Speech`) stays in the enumeration for display.
//
// - rmu-core enumerations: `name` is set from the old key (dashes as spaces) and `key` becomes its slug. Two
//   enumerations of the same category and realm that end with the same key are listed; the oldest is kept and the
//   others removed, since references only store the key.
// - rmu-core races: `skillBonuses[].specialization` and `defaultLanguage` (also the old `{id, name}` form) as keys.
// - rmu-core cultures: `languages[]` and `skillRanks[].specialization` as keys.
// - rmu-strategic characters: the specializations of skills whose category is an enumeration catalog become keys. Two
//   skills that end with the same key are merged (ranks, culture ranks, ranks developed and points spent add up; the
//   racial bonus and the professional marks come from the entry that has them) and their bonuses are recomputed.
// - Values that the catalog of the realm (or the global one) does not have are created as enumerations of that realm
//   (global for cultures, which have no realm), owned by the realm owner, so every reference resolves to a name.
//
// Run with `make mongo-migrate f=scripts/migrations/050-specialization-keys.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`, with the new rmu-api-core so its unique index {category, realmId, key} can be built. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

const core = db.getSiblingDB('rmu-core');
const strategic = db.getSiblingDB('rmu-strategic');

const toKey = value =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const toOptionalKey = value => (value === null || value === undefined || toKey(value) === '' ? null : toKey(value));

// The categories whose specializations are enumerations (strategic CATALOG_SPECIALIZATION_CATEGORIES)
const CATALOG = new Set([
  'animal-type', 'creature-lore', 'environment', 'historic-lore', 'language', 'material-lore', 'melee-weapon-type',
  'outlook-type', 'race-archetype', 'ranged-weapon-type', 'region', 'religion', 'skill-administration',
  'skill-combat-training', 'skill-culinary', 'skill-directed-spell', 'skill-fabric-craft', 'skill-flying',
  'skill-influence', 'skill-leathercraft', 'skill-magic-ritual', 'skill-mechanics', 'skill-metalcraft', 'skill-music',
  'skill-service', 'skill-stonecraft', 'skill-trade', 'skill-woodcraft', 'spell-lore', 'unarmed-ag-attack',
  'unarmed-st-attack', 'vehicle',
]);

const report = { enumerations: 0, removed: [], races: 0, cultures: 0, characters: 0, merged: [], created: [] };
const verb = (done, would) => (dryRun ? would : done);

// 1. Enumerations: name and normalized key
const scopes = new Map();
core.enumerations
  .find()
  .sort({ createdAt: 1, _id: 1 })
  .forEach(e => {
    const key = toKey(e.key);
    const scope = `${e.category}|${e.realmId ?? ''}|${key}`;
    if (scopes.has(scope)) {
      report.removed.push(`${e.category} '${e.key}' (${e._id}) duplicates '${scopes.get(scope)}'`);
      if (!dryRun) core.enumerations.deleteOne({ _id: e._id });
      return;
    }
    scopes.set(scope, e.key);
    const name = e.name ?? String(e.key).replace(/-/g, ' ');
    if (e.key === key && e.name === name) return;
    report.enumerations++;
    if (!dryRun) {
      core.enumerations.updateOne({ _id: e._id }, { $set: { key, name, updatedAt: new Date() }, $inc: { version: 1 } });
    }
  });

// Keys of a category visible in a realm (its own and the global ones), updated with the ones this script creates
const catalogKeys = (category, realmId) => {
  const keys = new Set();
  scopes.forEach((_, scope) => {
    const [c, r, k] = scope.split('|');
    if (c === category && (r === '' || r === (realmId ?? ''))) keys.add(k);
  });
  return keys;
};
const realmOwner = new Map();
const ownerOf = realmId => {
  if (!realmOwner.has(realmId)) realmOwner.set(realmId, core.realms.findOne({ _id: realmId })?.owner ?? null);
  return realmOwner.get(realmId);
};
// Creates the enumeration of a value the catalog does not have; `fallbackOwner` when there is no realm owner
const ensureEnumeration = (category, realmId, value, fallbackOwner, where) => {
  const key = toKey(value);
  if (!key || catalogKeys(category, realmId).has(key)) return;
  const owner = (realmId && ownerOf(realmId)) || fallbackOwner;
  scopes.set(`${category}|${realmId ?? ''}|${key}`, value);
  report.created.push(`${category} '${key}' ('${value}') in ${realmId ? `realm ${realmId}` : 'the global scope'}, for ${where}`);
  if (!dryRun) {
    core.enumerations.insertOne({
      _id: require('crypto').randomUUID(),
      version: 0,
      key,
      name: String(value).replace(/-/g, ' ').trim(),
      category,
      realmId: realmId ?? null,
      description: null,
      imageUrl: null,
      owner,
      accessType: 'public',
      entitySource: 'user',
      createdAt: new Date(),
    });
  }
};

const skillCategory = new Map();
core.skills.find({}, { specialization: 1 }).forEach(s => skillCategory.set(s._id, s.specialization ?? null));
const isCatalog = skillId => CATALOG.has(skillCategory.get(skillId));

// 2. Races
core.races.find().forEach(race => {
  const set = {};
  const bonuses = (race.skillBonuses || []).map(b => ({ ...b, specialization: toOptionalKey(b.specialization) }));
  if (JSON.stringify(bonuses) !== JSON.stringify(race.skillBonuses || [])) set.skillBonuses = bonuses;
  const language = race.defaultLanguage && typeof race.defaultLanguage === 'object' ? race.defaultLanguage.name : race.defaultLanguage;
  const defaultLanguage = toOptionalKey(language);
  if (defaultLanguage !== race.defaultLanguage) set.defaultLanguage = defaultLanguage;
  bonuses.forEach(b => {
    if (b.specialization && isCatalog(b.skillId)) {
      ensureEnumeration(skillCategory.get(b.skillId), race.realmId, language && toKey(language) === b.specialization ? language : b.specialization, race.owner, `race ${race.name}`);
    }
  });
  if (defaultLanguage) ensureEnumeration('language', race.realmId, language, race.owner, `race ${race.name}`);
  if (Object.keys(set).length === 0) return;
  report.races++;
  print(`${verb('set', 'would set')} race ${race.name}: ${JSON.stringify(set)}`);
  if (!dryRun) core.races.updateOne({ _id: race._id }, { $set: { ...set, updatedAt: new Date() }, $inc: { version: 1 } });
});

// 3. Cultures
core.cultures.find().forEach(culture => {
  const set = {};
  if (culture.languages) {
    const languages = [...new Set(culture.languages.map(toKey).filter(Boolean))];
    if (JSON.stringify(languages) !== JSON.stringify(culture.languages)) set.languages = languages;
    culture.languages.forEach(l => ensureEnumeration('language', null, l, culture.owner, `culture ${culture.name}`));
  }
  const ranks = (culture.skillRanks || []).map(r => (r.specialization ? { ...r, specialization: toKey(r.specialization) } : r));
  if (JSON.stringify(ranks) !== JSON.stringify(culture.skillRanks || [])) set.skillRanks = ranks;
  if (Object.keys(set).length === 0) return;
  report.cultures++;
  print(`${verb('set', 'would set')} culture ${culture.name}: ${JSON.stringify(set)}`);
  if (!dryRun) core.cultures.updateOne({ _id: culture._id }, { $set: { ...set, updatedAt: new Date() }, $inc: { version: 1 } });
});

// 4. Characters
const rankBonus = ranks => {
  if (ranks <= 0) return -25;
  let left = ranks;
  let bonus = 0;
  for (const [size, perRank] of [[10, 5], [10, 3], [10, 2], [Infinity, 1]]) {
    const taken = Math.min(left, size);
    bonus += taken * perRank;
    left -= taken;
    if (left === 0) break;
  }
  return bonus;
};
const sum = (a, b) => (a || 0) + (b || 0);
const withTotal = skill => {
  const developmentBonus = rankBonus(skill.ranks || 0);
  const totalBonus =
    (skill.statBonus || 0) + (skill.racialBonus || 0) + (skill.professionalBonus || 0) + developmentBonus +
    (skill.customBonus || 0) + (skill.traitBonus || 0);
  return { ...skill, developmentBonus, totalBonus };
};
const merge = (a, b) =>
  withTotal({
    ...a,
    ranks: sum(a.ranks, b.ranks),
    ranksDeveloped: sum(a.ranksDeveloped, b.ranksDeveloped),
    cultureRanks: sum(a.cultureRanks, b.cultureRanks),
    devPointsSpent: {
      normal: sum(a.devPointsSpent?.normal, b.devPointsSpent?.normal),
      bonus: sum(a.devPointsSpent?.bonus, b.devPointsSpent?.bonus),
    },
    racialBonus: a.racialBonus || b.racialBonus || 0,
    professional: a.professional ?? b.professional ?? null,
    professionalBonus: a.professionalBonus || b.professionalBonus || 0,
    knackBonus: a.knackBonus ?? b.knackBonus ?? null,
    styleAbilities: [...(a.styleAbilities || []), ...(b.styleAbilities || [])],
  });

const gameRealm = new Map();
const realmOfGame = gameId => {
  if (!gameRealm.has(gameId)) gameRealm.set(gameId, strategic.getCollection('strategic-games').findOne({ _id: gameId })?.realmId ?? null);
  return gameRealm.get(gameId);
};

strategic.characters.find({ 'skills.0': { $exists: true } }).forEach(character => {
  const realmId = realmOfGame(character.gameId);
  const skills = [];
  const byKey = new Map();
  let changed = false;
  character.skills.forEach(entry => {
    let skill = entry;
    if (entry.specialization && isCatalog(entry.skillId)) {
      const key = toKey(entry.specialization);
      ensureEnumeration(skillCategory.get(entry.skillId), realmId, entry.specialization, character.owner, `character ${character.name}`);
      if (key !== entry.specialization) {
        skill = { ...entry, specialization: key };
        changed = true;
      }
    }
    const id = `${skill.skillId}#${skill.specialization ?? ''}`;
    if (byKey.has(id)) {
      const index = byKey.get(id);
      report.merged.push(`${character.name} (${character._id}): ${skill.skillId} '${entry.specialization}' into '${skill.specialization}'`);
      skills[index] = merge(skills[index], skill);
      changed = true;
      return;
    }
    byKey.set(id, skills.length);
    skills.push(skill);
  });
  if (!changed) return;
  report.characters++;
  if (!dryRun) {
    strategic.characters.updateOne(
      { _id: character._id, version: character.version },
      { $set: { skills, updatedAt: new Date() }, $inc: { version: 1 } },
    );
  }
});

print(`enumerations: ${report.enumerations} ${verb('normalized', 'to normalize')}, ${report.removed.length} duplicates ${verb('removed', 'to remove')}`);
report.removed.forEach(line => print(`  removed: ${line}`));
print(`enumerations ${verb('created', 'to create')}: ${report.created.length}`);
report.created.forEach(line => print(`  created: ${line}`));
print(`races: ${report.races}, cultures: ${report.cultures}, characters: ${report.characters} ${verb('updated', 'to update')}`);
report.merged.forEach(line => print(`  merged: ${line}`));
