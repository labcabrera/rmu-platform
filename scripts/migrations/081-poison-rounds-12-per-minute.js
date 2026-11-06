// Poison clock of 5-second rounds (workspace spec 079, decision 0.2). A round is 5 seconds (Core Law §8.1), 12 a
// minute; rmu-api-strategic, rmu-api-tactical and the shared lib counted 6 a minute (360 an hour, 8640 a day). The
// stages of a poisoning keep their times in rounds from the exposure, so this script moves the stored ones to the new
// clock.
//
// The table times in minutes, hours or days were turned into rounds with the old factor and are doubled; the ones the
// table gives in rounds (most onsets, the rounds of hits) were already right and are kept. Which unit each time had
// comes from rmu-core.poison-tables (row of the poison category and the stage severity); a stage without a row has
// all its times doubled. For each stage of `poison.stages`:
// - startsAt:       x2 when the row starts in minutes/hours/days (never before the previous stage);
// - endsAt:         startsAt + duration, the duration x2 when it is in minutes/hours/days;
// - hitsUntil:      startsAt + the same rounds of hits;
// - conditionAt:    startsAt + delay, x2 when the delay is in minutes/hours/days;
// - conditionUntil: conditionAt + duration, x2 when it is in minutes/hours/days.
// `poison.elapsedRounds` is moved along the same timeline (piecewise between the old and new stage times, x2 after
// the last one), so the victim stays at the same point of the poisoning.
//
// Where:
// - rmu-strategic.characters: every `injuries[].poison` (finished ones too, so the timeline shows their real times);
// - rmu-tactical.actor-rounds of the tactical games that are not finished: every `injuries[].poison`, and the
//   remaining `rounds` of the effects that a poisoning gave (`effects[].source.kind: 'poison'`), x2 when the duration of
//   the condition of their stage is in minutes/hours/days.
// Each changed document gets its version up, as the APIs do on a change.
//
// Never twice: every poisoning and effect it changes is recorded in rmu-platform.migration-081-poison-rounds
// ({_id: '<db>.<collection>:<document id>:<injury or effect id>'}) and skipped on a later run, and the script stops
// when the ledger already records it. The APIs' own shapes get no marker.
//
// Run with `make mongo-migrate f=scripts/migrations/081-poison-rounds-12-per-minute.js` (DRY_RUN=1 to only report),
// after `make mongo-backup` and with the releases of rmu-api-strategic and rmu-api-tactical of spec 079 (phase 1)
// deployed at the same time: an old API would keep counting 6 rounds a minute on the migrated times.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const NAME = '081-poison-rounds-12-per-minute.js';
const platform = db.getSiblingDB('rmu-platform');
const done = platform.getCollection('migration-081-poison-rounds');

if (platform.getCollection('migrations').findOne({ _id: NAME })) {
  print(`${prefix}${NAME} is already in the ledger: nothing to do`);
  return;
}

const tables = db.getSiblingDB('rmu-core').getCollection('poison-tables').findOne({ _id: 'core-law' });
const rows = (tables && tables.rows) || [];
if (rows.length === 0) print(`${prefix}warning: no rmu-core.poison-tables rows, every time is doubled`);

const scaled = range => (range && range.unit === 'round' ? 1 : 2);
const rowOf = (category, severity) => rows.find(row => row.category === category && row.severity === severity);
const isNumber = value => typeof value === 'number' && Number.isFinite(value);

/** New stage times, plus the old -> new anchors of the timeline. */
const migrateStages = poison => {
  const anchors = [[0, 0]];
  let previousStart = 0;
  const factors = [];
  const stages = (poison.stages || []).map(stage => {
    const row = rowOf(poison.category, stage.severity);
    const f = {
      start: row ? scaled(row.start) : 2,
      duration: row ? scaled(row.duration) : 2,
      delay: row ? scaled(row.conditionDelay) : 2,
      conditionDuration: row ? scaled(row.conditionDuration) : 2,
    };
    factors.push(f);
    const next = { ...stage };
    if (!isNumber(stage.startsAt)) return next;
    next.startsAt = Math.max(stage.startsAt * f.start, previousStart);
    previousStart = next.startsAt;
    anchors.push([stage.startsAt, next.startsAt]);
    if (isNumber(stage.endsAt)) {
      next.endsAt = next.startsAt + (stage.endsAt - stage.startsAt) * f.duration;
      anchors.push([stage.endsAt, next.endsAt]);
    }
    if (isNumber(stage.hitsUntil)) next.hitsUntil = next.startsAt + (stage.hitsUntil - stage.startsAt);
    if (isNumber(stage.conditionAt)) {
      next.conditionAt = next.startsAt + (stage.conditionAt - stage.startsAt) * f.delay;
      anchors.push([stage.conditionAt, next.conditionAt]);
      if (isNumber(stage.conditionUntil)) {
        next.conditionUntil = next.conditionAt + (stage.conditionUntil - stage.conditionAt) * f.conditionDuration;
        anchors.push([stage.conditionUntil, next.conditionUntil]);
      }
    }
    return next;
  });
  return { stages, anchors, factors };
};

/** Moves an old time along the timeline: linear between anchors, x2 after the last one. */
const moveTime = (time, anchors) => {
  const sorted = anchors.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Keep the new times non-decreasing, so the mapping is monotonic
  for (let i = 1; i < sorted.length; i++) sorted[i] = [sorted[i][0], Math.max(sorted[i][1], sorted[i - 1][1])];
  let low = sorted[0];
  for (const anchor of sorted) {
    if (anchor[0] === time) return anchor[1];
    if (anchor[0] > time) {
      const span = anchor[0] - low[0];
      return span === 0 ? anchor[1] : Math.round(low[1] + ((time - low[0]) * (anchor[1] - low[1])) / span);
    }
    low = anchor;
  }
  return low[1] + (time - low[0]) * 2;
};

const migratePoison = poison => {
  const { stages, anchors, factors } = migrateStages(poison);
  const elapsedRounds = isNumber(poison.elapsedRounds) ? moveTime(poison.elapsedRounds, anchors) : poison.elapsedRounds;
  return { poison: { ...poison, stages, elapsedRounds }, factors };
};

const summary = (before, after) =>
  `elapsed ${before.elapsedRounds} -> ${after.elapsedRounds}; ` +
  after.stages
    .map((stage, i) => {
      const old = before.stages[i];
      return `${stage.severity} ${old.startsAt}-${old.endsAt} -> ${stage.startsAt}-${stage.endsAt}`;
    })
    .join(', ');

const counts = { characters: 0, actorRounds: 0, poisonings: 0, effects: 0, skipped: 0 };

/** Migrates the poisonings (and poison effects) of one document; returns the $set and the keys to record. */
const migrateDocument = (dbName, collection, doc, withEffects) => {
  const set = {};
  const keys = [];
  const factorsByInjury = {};
  const injuries = (doc.injuries || []).map(injury => {
    if (!injury || !injury.poison) return injury;
    const key = `${dbName}.${collection}:${doc._id}:${injury.id}`;
    if (done.findOne({ _id: key })) {
      counts.skipped++;
      return injury;
    }
    const { poison, factors } = migratePoison(injury.poison);
    factorsByInjury[injury.id] = { poison: injury.poison, factors };
    print(`${prefix}${dbName}.${collection} ${doc._id} (${doc.name || doc.actorName || ''}) injury ${injury.id}: ${summary(injury.poison, poison)}`);
    keys.push(key);
    counts.poisonings++;
    return { ...injury, poison };
  });
  if (keys.length > 0) set.injuries = injuries;

  if (withEffects) {
    let effectsChanged = false;
    const effects = (doc.effects || []).map(effect => {
      if (!effect || !effect.source || effect.source.kind !== 'poison' || !isNumber(effect.rounds)) return effect;
      const key = `${dbName}.${collection}:${doc._id}:effect:${effect.id}`;
      if (done.findOne({ _id: key })) {
        counts.skipped++;
        return effect;
      }
      const injury = (doc.injuries || []).find(each => each && each.id === effect.source.injuryId);
      let factor = 2;
      if (injury && injury.poison) {
        const { factors } = factorsByInjury[injury.id] || migrateStages(injury.poison);
        const stages = injury.poison.stages || [];
        const index = stages.map((stage, i) => (stage.condition && stage.conditionApplied ? i : -1)).filter(i => i >= 0).pop();
        if (index !== undefined) factor = factors[index].conditionDuration;
      }
      if (factor === 1) return effect;
      print(`${prefix}${dbName}.${collection} ${doc._id} effect ${effect.id} (${effect.status}): rounds ${effect.rounds} -> ${effect.rounds * factor}`);
      keys.push(key);
      counts.effects++;
      effectsChanged = true;
      return { ...effect, rounds: effect.rounds * factor };
    });
    if (effectsChanged) set.effects = effects;
  }
  return { set, keys };
};

const apply = (dbName, collectionName, doc, set, keys) => {
  if (keys.length === 0 || dryRun) return;
  const update = { $set: { ...set, updatedAt: new Date() } };
  if (isNumber(doc.version)) update.$inc = { version: 1 };
  db.getSiblingDB(dbName).getCollection(collectionName).updateOne({ _id: doc._id }, update);
  keys.forEach(key => done.updateOne({ _id: key }, { $setOnInsert: { at: new Date() } }, { upsert: true }));
};

db.getSiblingDB('rmu-strategic')
  .getCollection('characters')
  .find({ 'injuries.poison': { $exists: true } }, { _id: 1, name: 1, version: 1, injuries: 1 })
  .forEach(character => {
    const { set, keys } = migrateDocument('rmu-strategic', 'characters', character, false);
    if (keys.length === 0) return;
    counts.characters++;
    apply('rmu-strategic', 'characters', character, set, keys);
  });

const tactical = db.getSiblingDB('rmu-tactical');
const openGames = tactical
  .getCollection('tactical-games')
  .find({ status: { $ne: 'finished' } }, { _id: 1 })
  .toArray()
  .map(game => game._id);
tactical
  .getCollection('actor-rounds')
  .find(
    { gameId: { $in: openGames }, $or: [{ 'injuries.poison': { $exists: true } }, { 'effects.source.kind': 'poison' }] },
    { _id: 1, actorName: 1, version: 1, injuries: 1, effects: 1 },
  )
  .forEach(actorRound => {
    const { set, keys } = migrateDocument('rmu-tactical', 'actor-rounds', actorRound, true);
    if (keys.length === 0) return;
    counts.actorRounds++;
    apply('rmu-tactical', 'actor-rounds', actorRound, set, keys);
  });

print(
  `${prefix}${counts.poisonings} poisonings and ${counts.effects} poison effects ${dryRun ? 'would be' : 'were'} moved to ` +
    `12 rounds a minute in ${counts.characters} characters and ${counts.actorRounds} actor rounds ` +
    `(${openGames.length} open tactical games); ${counts.skipped} already migrated`,
);
