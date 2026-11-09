// Ambush is specialized in a Combat Training skill (Character Companion, 2026-11-09), but the enumeration
// `skill-combat-training` only had `blade`. This fills it with the specializations of those skills: melee and ranged
// weapon types, unarmed attacks, and `shield`, which has no specialization of its own. `exotic` is in both weapon
// types and is added once. Characters keep the specialization they have.
//
// Run with `make mongo-migrate f=scripts/migrations/084-ambush-combat-specializations.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const crypto = require('crypto');

const enumerations = db.getSiblingDB('rmu-core').getCollection('enumerations');
const TARGET = 'skill-combat-training';
const SOURCES = ['melee-weapon-type', 'ranged-weapon-type', 'unarmed-st-attack', 'unarmed-ag-attack'];

const reference = enumerations.findOne({ category: TARGET, key: 'blade', realmId: null });
if (!reference) throw new Error(`${TARGET}: the system entry 'blade' is missing`);

const names = new Map([['shield', 'shield']]);
enumerations
  .find({ category: { $in: SOURCES }, realmId: null })
  .forEach(entry => names.set(entry.key, entry.name));

const existing = new Set(enumerations.distinct('key', { category: TARGET, realmId: null }));
const now = new Date();
const missing = [...names.keys()].filter(key => !existing.has(key)).sort();
const documents = missing.map(key => ({
  _id: crypto.randomUUID(),
  key,
  category: TARGET,
  realmId: null,
  description: null,
  imageUrl: null,
  name: names.get(key),
  owner: reference.owner,
  accessType: 'public',
  entitySource: 'system',
  createdAt: now,
  updatedAt: now,
  version: 1,
}));

print(`${prefix}${TARGET}: ${documents.length} to add, ${existing.size} already there: ${missing.join(', ')}`);
if (!dryRun && documents.length) enumerations.insertMany(documents);
