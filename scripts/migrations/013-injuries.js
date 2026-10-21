// Spec 013 (injuries): migrates the actor rounds of rmu-tactical to the injury model.
//
// - Effects `unconcious` are renamed `unconscious`.
// - Penalty modifiers with source `critical` become injuries of unknown type (severity derived from the penalty,
//   source.kind `manual`) and are removed from `penalty.modifiers`.
// - Effects `bleeding` become injuries of unknown type with that bleeding, and are removed from `effects`.
//
// The injury takes the id of the modifier or effect it comes from (as rmu-api-tactical does when it reads an actor
// round not migrated yet, so the ids do not change), or a new uuid when it has none.
//
// Run with `make mongo-migrate f=scripts/migrations/013-injuries.js` (DRY_RUN=1 to only count). Idempotent: only actor
// rounds that still have a legacy effect or modifier are touched.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;

const LEGACY_UNCONSCIOUS = 'unconcious';

// Spec 013, §1: a penalty of -1 to -20 or bleeding of 1-3 is light, -21 to -40 or 4-6 medium, worse is severe.
const severityRank = (value, lightMax, mediumMax) => (value > mediumMax ? 2 : value > lightMax ? 1 : 0);
const deriveSeverity = (penalty, bleeding) =>
  ['light', 'medium', 'severe'][
    Math.max(severityRank(Math.abs(Math.min(0, penalty || 0)), 20, 40), severityRank(Math.max(0, bleeding || 0), 3, 6))
  ];

const newUuid = () => {
  const hex = UUID().toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const buildInjury = (id, penalty, bleeding, actorRound) => {
  const injury = {
    id,
    type: 'unknown',
    severity: deriveSeverity(penalty, bleeding),
    penalty: Math.min(0, penalty || 0),
    initialPenalty: Math.min(0, penalty || 0),
    source: { kind: 'manual', tacticalGameId: actorRound.gameId, round: actorRound.round },
    treatments: [],
    status: 'active',
    createdAt: (actorRound.createdAt ? new Date(actorRound.createdAt) : new Date()).toISOString(),
  };
  if (bleeding > 0) {
    injury.bleeding = bleeding;
  }
  return injury;
};

/** The `$set` of a legacy actor round, or null when it has nothing to migrate. */
const migrateActorRound = (actorRound, uuid) => {
  const effects = Array.isArray(actorRound.effects) ? actorRound.effects : [];
  const modifiers = Array.isArray(actorRound.penalty?.modifiers) ? actorRound.penalty.modifiers : [];
  const legacyEffects = effects.filter((e) => e.status === LEGACY_UNCONSCIOUS || e.status === 'bleeding');
  const criticals = modifiers.filter((m) => m.source === 'critical');
  if (legacyEffects.length === 0 && criticals.length === 0) {
    return null;
  }
  const injuries = Array.isArray(actorRound.injuries) ? [...actorRound.injuries] : [];
  const known = new Set(injuries.map((injury) => injury.id));
  const add = (id, penalty, bleeding) => {
    const injuryId = id && !known.has(id) ? id : uuid();
    known.add(injuryId);
    injuries.push(buildInjury(injuryId, penalty, bleeding, actorRound));
  };
  effects.filter((e) => e.status === 'bleeding').forEach((e) => add(e.id, 0, e.value || 0));
  criticals.forEach((m) => add(m.id, m.value || 0, 0));
  return {
    effects: effects
      .filter((e) => e.status !== 'bleeding')
      .map((e) => (e.status === LEGACY_UNCONSCIOUS ? { ...e, status: 'unconscious' } : e)),
    'penalty.modifiers': modifiers.filter((m) => m.source !== 'critical'),
    injuries,
  };
};

if (typeof module !== 'undefined') {
  module.exports = { migrateActorRound, deriveSeverity };
}

if (typeof db !== 'undefined') {
  const actorRounds = db.getSiblingDB('rmu-tactical').getCollection('actor-rounds');
  const filter = {
    $or: [{ 'effects.status': { $in: [LEGACY_UNCONSCIOUS, 'bleeding'] } }, { 'penalty.modifiers.source': 'critical' }],
  };
  let updated = 0;
  let injuries = 0;
  actorRounds.find(filter).forEach((actorRound) => {
    const set = migrateActorRound(actorRound, newUuid);
    if (!set) {
      return;
    }
    const added = set.injuries.length - (actorRound.injuries || []).length;
    if (!dryRun) {
      actorRounds.updateOne({ _id: actorRound._id }, { $set: set });
    }
    updated += 1;
    injuries += added;
    print(`${dryRun ? '[dry-run] ' : ''}rmu-tactical.actor-rounds ${actorRound._id} (${actorRound.actorName}, round ${actorRound.round}): ${added} injuries`);
  });
  print(`${dryRun ? '[dry-run] would update' : 'Updated'} ${updated} actor rounds, ${injuries} injuries`);
}
