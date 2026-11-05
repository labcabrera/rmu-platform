// Intense training and saved development points (workspace spec 076, decisions A1 and A5). The game option
// `allowThirdRank` (a third rank in any skill) becomes `intenseTraining` (one skill per level beyond two ranks), and
// games get `allowSavingDevPoints: false` (the game master permission to keep unspent points) where it is missing.
//
// rmu-strategic.strategic-games:
// - `options.allowThirdRank` is renamed to `options.intenseTraining`. A game that already has `intenseTraining` keeps
//   it and only loses `allowThirdRank`;
// - `options.allowSavingDevPoints: false` where it is missing.
// Each game that changes gets its version up, as the API does on a change. Characters need nothing: their new fields
// are read with defaults.
//
// Run with `make mongo-migrate f=scripts/migrations/076-intense-training-option.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Before or after the rmu-api-strategic release of spec 076: the release reads `allowThirdRank`
// when `intenseTraining` is missing, and an old strategic reads a missing `allowThirdRank` as false. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const games = db.getSiblingDB('rmu-strategic').getCollection('strategic-games');

let renamed = 0;
let dropped = 0;
let savingAdded = 0;
games.find({ options: { $type: 'object' } }).forEach(game => {
  const options = game.options;
  const $set = {};
  const $unset = {};
  const notes = [];
  if (options.allowThirdRank !== undefined) {
    if (options.intenseTraining === undefined) {
      $set['options.intenseTraining'] = options.allowThirdRank === true;
      notes.push(`intenseTraining ${options.allowThirdRank === true}`);
      renamed++;
    } else {
      notes.push('allowThirdRank removed');
      dropped++;
    }
    $unset['options.allowThirdRank'] = 1;
  }
  if (options.allowSavingDevPoints === undefined) {
    $set['options.allowSavingDevPoints'] = false;
    notes.push('allowSavingDevPoints false');
    savingAdded++;
  }
  if (notes.length === 0) return;
  print(`${prefix}game ${game._id} (${game.name}): ${notes.join(', ')}`);
  if (!dryRun) {
    const update = { $inc: { version: 1 } };
    if (Object.keys($set).length > 0) update.$set = $set;
    if (Object.keys($unset).length > 0) update.$unset = $unset;
    games.updateOne({ _id: game._id }, update);
  }
});

print(
  `${prefix}${renamed} games ${dryRun ? 'would get' : 'got'} intenseTraining from allowThirdRank, ` +
    `${dropped} ${dryRun ? 'would only lose' : 'only lost'} allowThirdRank, ` +
    `${savingAdded} ${dryRun ? 'would get' : 'got'} allowSavingDevPoints`,
);
