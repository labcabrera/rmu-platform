// Players of the factions (workspace spec 072, decisions 10 and 13). Before spec 072 a faction had a `leaderId` and
// its members were the owners of its characters; now a faction keeps `players`, the users who change it and what
// hangs from it.
//
// 1. rmu-strategic.factions: `players` = its `leaderId` plus the owners of its characters, keeping only the users who
//    are `player` members of its game (masters already change everything, spectators change nothing). `leaderId` is
//    removed. Each faction that changes gets its version up.
// 2. rmu-tactical.tactical-games: `strategicMembers` ({userId, role} of the members of the strategic game) and
//    `factionPlayers` ({factionId: players} of every faction of the strategic game), as the API fills them from the
//    strategic events. Each game that changes gets its version up.
//
// Run with `make mongo-migrate f=scripts/migrations/075-faction-players.js` (DRY_RUN=1 to only report), after
// `make mongo-backup` and after migration 074. Deploy strategic and tactical with spec 072 first, or stop them: an old
// strategic would keep writing `leaderId`. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const strategic = db.getSiblingDB('rmu-strategic');
const tactical = db.getSiblingDB('rmu-tactical');
const MAX_FACTION_PLAYERS = 20;

const games = new Map();
strategic.getCollection('strategic-games').find({}, { members: 1, name: 1 }).forEach(game => games.set(game._id, game));
const playersOfGame = gameId => {
  const game = games.get(gameId);
  return new Set(((game && game.members) || []).filter(member => member.role === 'player').map(member => member.userId));
};
const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

// 1. Factions
let changedFactions = 0;
const playersByFaction = new Map();
strategic.factions.find({}).forEach(faction => {
  const gamePlayers = playersOfGame(faction.gameId);
  const candidates = [...(faction.players || [])];
  if (faction.leaderId) candidates.push(faction.leaderId);
  strategic.characters.distinct('owner', { 'faction.id': faction._id }).forEach(owner => candidates.push(owner));
  const players = [...new Set(candidates)].filter(userId => userId && gamePlayers.has(userId)).slice(0, MAX_FACTION_PLAYERS);
  playersByFaction.set(faction._id, { gameId: faction.gameId, players });
  const unchanged = faction.players && sameList(faction.players, players) && faction.leaderId === undefined;
  if (unchanged) return;
  changedFactions++;
  print(`${prefix}faction ${faction._id} (${faction.name}): players [${players.join(', ')}]${faction.leaderId ? `, leader ${faction.leaderId} removed` : ''}`);
  if (!dryRun) {
    strategic.factions.updateOne(
      { _id: faction._id },
      { $set: { players, updatedAt: new Date() }, $unset: { leaderId: 1 }, $inc: { version: 1 } },
    );
  }
});

// 2. Tactical games
let changedTacticalGames = 0;
tactical.getCollection('tactical-games').find({}).forEach(tacticalGame => {
  const game = games.get(tacticalGame.strategicGameId);
  if (!game) return;
  const strategicMembers = (game.members || []).map(member => ({ userId: member.userId, role: member.role }));
  const factionPlayers = {};
  playersByFaction.forEach((value, factionId) => {
    if (value.gameId === tacticalGame.strategicGameId) factionPlayers[factionId] = value.players;
  });
  const unchanged =
    JSON.stringify(tacticalGame.strategicMembers || null) === JSON.stringify(strategicMembers) &&
    JSON.stringify(tacticalGame.factionPlayers || null) === JSON.stringify(factionPlayers);
  if (unchanged) return;
  changedTacticalGames++;
  print(`${prefix}tactical game ${tacticalGame._id} (${tacticalGame.name}): ${strategicMembers.length} members, ${Object.keys(factionPlayers).length} factions`);
  if (!dryRun) {
    tactical.getCollection('tactical-games').updateOne(
      { _id: tacticalGame._id },
      { $set: { strategicMembers, factionPlayers }, $inc: { version: 1 } },
    );
  }
});

print(
  `${prefix}${changedFactions} factions and ${changedTacticalGames} tactical games ${dryRun ? 'would change' : 'changed'}`,
);
