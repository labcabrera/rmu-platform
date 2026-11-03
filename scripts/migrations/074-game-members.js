// Members of the strategic games (spec 071, decision 8). Before spec 071 anybody with a character in a game was one
// of its players; now only the members of a game read it and create characters in it. Every owner of a character
// who is not the owner of its game and not yet in `members` joins it as a `player`, with the name of their
// rmu-users profile (their id when they have none). Games get empty `members` and `joinRequests` when they lack them.
//
// Each game that changes gets its version up, as the API does on a change. Core learns the members with the next
// event of the game, so after this script touch each game that gained members (a PATCH that changes something, such
// as renaming it and back: a PATCH without changes neither writes nor publishes) or wait for its next change for the
// members to read its realm (spec 071, decision 2).
// Run with `make mongo-migrate f=scripts/migrations/074-game-members.js` (DRY_RUN=1 to only report), after
// `make mongo-backup`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const strategic = db.getSiblingDB('rmu-strategic');
const users = db.getSiblingDB('rmu-users').users;

const nameOf = userId => {
  const user = users.findOne({ _id: userId }, { name: 1 });
  return (user && user.name) || userId;
};

let changedGames = 0;
let addedMembers = 0;
strategic.getCollection('strategic-games').find({}).forEach(game => {
  const members = game.members || [];
  const known = new Set(members.map(member => member.userId));
  const owners = strategic.characters.distinct('owner', { gameId: game._id });
  const added = owners
    .filter(owner => owner && owner !== game.owner && !known.has(owner))
    .map(owner => ({ userId: owner, userName: nameOf(owner), role: 'player', joinedAt: new Date() }));
  const missingFields = !game.members || !game.joinRequests;
  if (added.length === 0 && !missingFields) return;
  changedGames++;
  addedMembers += added.length;
  added.forEach(member => print(`${prefix}game ${game._id} (${game.name}): ${member.userName} ${dryRun ? 'would join' : 'joins'} as player`));
  if (!dryRun) {
    strategic.getCollection('strategic-games').updateOne(
      { _id: game._id },
      {
        $set: { members: [...members, ...added], joinRequests: game.joinRequests || [], updatedAt: new Date() },
        $inc: { version: 1 },
      },
    );
  }
});
print(`${prefix}${changedGames} games ${dryRun ? 'would change' : 'changed'}, ${addedMembers} players ${dryRun ? 'would be' : 'were'} added`);
