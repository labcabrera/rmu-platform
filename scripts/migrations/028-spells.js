// Spec 028: moves the spell lists and spells of rmu-spells to the model of spec 028. Idempotent: documents already
// migrated are left as they are.
// - lists: `realm` becomes `realms: [realm]`;
// - spells: the old modifiers become the new ones (as SpellModifiers.fromPlain reads them in rmu-api-spells), the
//   stray top-level `area` field is removed, and `basedOn`/`effects` are added empty.
// Run with `make mongo-migrate f=scripts/migrations/028-spells.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const sdb = db.getSiblingDB('rmu-spells');
const lists = sdb.getCollection('spell-lists');
const spells = sdb.getCollection('spells');

let listCount = 0;
lists.find({ realm: { $exists: true } }).forEach(l => {
  const realms = l.realms && l.realms.length ? l.realms : (l.realm ? [l.realm] : []);
  listCount++;
  print(`${dryRun ? 'would migrate' : 'migrate'} list ${l.name}: realms ${JSON.stringify(realms)}`);
  if (!dryRun) lists.updateOne({ _id: l._id }, { $set: { realms }, $unset: { realm: '' } });
});

const isLegacy = m => m && ['target', 'rrModifier', 'notRequiredPowerPoints', 'partOfSetOfSpells'].some(k => k in m)
  || (m && m.range && m.range.type === 'distance-level')
  || (m && m.duration && !('raw' in m.duration) && ['lvl', 'rr-failure', undefined].includes(m.duration.type));

function range(r) {
  if (!r || !r.type) return null;
  const perLevel = r.type === 'distance-level';
  return { type: perLevel ? 'distance' : r.type, value: r.value ?? null, perLevel: r.perLevel ?? perLevel, increment: r.increment ?? null, raw: r.raw ?? null };
}
function area(a, t) {
  if (a && a.kind) return a;
  if (!t || !t.mode) return null;
  const kind = t.mode === 'target' ? 'targets' : t.mode === 'volume' ? 'volume' : 'radius';
  return { kind, count: t.count ?? null, perLevel: false, radius: null, dimensions: null, targetTypes: t.types || [], raw: t.modifier ?? null };
}
function duration(d) {
  if (!d || !d.type) return null;
  const type = { lvl: 'per-level', 'rr-failure': 'per-failure' }[d.type] || d.type;
  return {
    type,
    value: d.value ?? d.duration ?? null,
    scale: d.scale ?? d.durationScale ?? null,
    perLevel: d.perLevel ?? (d.type === 'lvl' ? 1 : null),
    perFailure: d.perFailure ?? (d.type === 'rr-failure' ? (d.failureScale ?? 1) : null),
    concentration: !!(d.concentration ?? d.requiredConcentration ?? type === 'concentration'),
    raw: d.raw ?? null,
  };
}
function resistance(r, legacy) {
  if (r && r.kind) return r;
  return typeof legacy === 'number' ? { kind: 'realm', modifier: legacy, scaling: 'all-or-nothing' } : null;
}

let spellCount = 0;
spells.find({ $or: [{ area: { $exists: true } }, { effects: { $exists: false } }, { modifiers: { $exists: false } }, { 'modifiers.target': { $exists: true } }, { 'modifiers.rrModifier': { $exists: true } }, { 'modifiers.notRequiredPowerPoints': { $exists: true } }, { 'modifiers.partOfSetOfSpells': { $exists: true } }, { 'modifiers.duration.requiredConcentration': { $exists: true } }, { 'modifiers.range.type': 'distance-level' }] }).forEach(s => {
  const m = s.modifiers || {};
  const set = { basedOn: s.basedOn ?? null, effects: s.effects || [] };
  if (isLegacy(m) || !s.modifiers) {
    set.modifiers = {
      typeCode: m.typeCode ?? null,
      type: m.type ?? null,
      subtype: m.subtype ?? null,
      instant: !!m.instant,
      powerPoints: m.powerPoints ?? (m.notRequiredPowerPoints === true ? 0 : null),
      setGroup: m.setGroup ?? null,
      range: range(m.range),
      area: area(m.area, m.target),
      duration: duration(m.duration),
      resistance: resistance(m.resistance, m.rrModifier),
    };
  }
  spellCount++;
  print(`${dryRun ? 'would migrate' : 'migrate'} spell ${s.name}`);
  if (!dryRun) spells.updateOne({ _id: s._id }, { $set: set, $unset: { area: '' } });
});
print(`${dryRun ? '[DRY_RUN] ' : ''}migrated ${listCount} lists and ${spellCount} spells`);
