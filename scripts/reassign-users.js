// Reassign every user reference of the rmu-* databases to one user (workspace spec 103, decision D4).
//
// Run it with scripts/mongo-reassign-users.sh, which defines DRY_RUN, TARGET_SUB, TARGET_NAME and KEEP_SUBS.
// Used once, after restoring the local database into production: the data belongs to accounts of other
// Keycloak instances, and every one of them becomes the production account TARGET_SUB.
//
// 1. Old subs: the _id of rmu-users.users plus every value of the known user fields, minus TARGET_SUB and KEEP_SUBS.
// 2. Every string equal to an old sub, at any depth of any document, becomes TARGET_SUB. A `userName` next to
//    a rewritten `userId` becomes TARGET_NAME.
// 3. Clean-up of what the merge duplicates:
//    - members (strategic games, tactical strategicMembers): one entry, the highest role, none for the owner;
//    - realm shares: one entry, the highest level, none for the owner;
//    - id lists (players, factionPlayers, gameReaderIds, games[].memberIds): unique, without the owner.
// 4. rmu-users: the old users, their friendships, invites and messages are deleted. The user document of
//    TARGET_SUB is created by rmu-api-users on the first sign-in.
// 5. A final sweep fails if any old sub is left. The run is recorded in rmu-platform.migrations.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!UUID.test(TARGET_SUB)) throw new Error(`TARGET_SUB is not a Keycloak user id: ${TARGET_SUB}`);
if (!TARGET_NAME) throw new Error('TARGET_NAME is empty');

const USER_FIELDS = [
  'owner',
  'updatedBy',
  'createdBy',
  'userId',
  'strategicGameOwner',
  'activatedBy',
  'requesterId',
  'addresseeId',
  'ownerId',
  'inviterId',
];
const ROLE_RANK = { owner: 5, master: 4, player: 3, spectator: 2, cover: 1 };
const LEVEL_RANK = { write: 2, read: 1 };
const USERS_DB = 'rmu-users';

const databases = db
  .adminCommand({ listDatabases: 1 })
  .databases.map((d) => d.name)
  .filter((name) => name.startsWith('rmu-') && name !== 'rmu-platform');

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && v._bsontype === undefined;

// --- 1. Old subs ------------------------------------------------------------------------------------------
const keep = new Set([TARGET_SUB, ...KEEP_SUBS]);
const oldSubs = new Set();
db.getSiblingDB(USERS_DB)
  .users.find({}, { _id: 1 })
  .forEach((u) => oldSubs.add(String(u._id)));

function collectFields(value) {
  if (Array.isArray(value)) return value.forEach(collectFields);
  if (!isPlainObject(value)) return;
  for (const [key, v] of Object.entries(value)) {
    if (USER_FIELDS.includes(key) && typeof v === 'string' && UUID.test(v)) oldSubs.add(v);
    else collectFields(v);
  }
}
for (const name of databases) {
  const database = db.getSiblingDB(name);
  for (const collection of database.getCollectionNames()) database[collection].find().forEach(collectFields);
}
keep.forEach((sub) => oldSubs.delete(sub));
print(`Target ${TARGET_SUB} (${TARGET_NAME}); ${oldSubs.size} old subs: ${[...oldSubs].join(', ')}`);

// --- 2 and 3. Rewrite and clean-up -------------------------------------------------------------------------
function rewrite(value) {
  if (typeof value === 'string') return oldSubs.has(value) ? TARGET_SUB : value;
  if (Array.isArray(value)) return value.map(rewrite);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) out[key] = rewrite(v);
  if (typeof value.userId === 'string' && oldSubs.has(value.userId) && 'userName' in value) out.userName = TARGET_NAME;
  return out;
}

const uniqueIds = (ids, owner) => [...new Set(ids)].filter((id) => id !== owner);

function bestBy(entries, owner, rank, field) {
  const byUser = new Map();
  for (const entry of entries) {
    if (entry.userId === owner) continue;
    const current = byUser.get(entry.userId);
    if (!current || (rank[entry[field]] ?? 0) > (rank[current[field]] ?? 0)) byUser.set(entry.userId, entry);
  }
  return entries.filter((entry) => byUser.get(entry.userId) === entry);
}

function cleanUp(doc) {
  const owner = doc.owner;
  if (Array.isArray(doc.members)) doc.members = bestBy(doc.members, owner, ROLE_RANK, 'role');
  if (Array.isArray(doc.strategicMembers))
    doc.strategicMembers = bestBy(doc.strategicMembers, doc.strategicGameOwner ?? owner, ROLE_RANK, 'role');
  if (Array.isArray(doc.shares)) doc.shares = bestBy(doc.shares, owner, LEVEL_RANK, 'level');
  if (Array.isArray(doc.players)) doc.players = uniqueIds(doc.players);
  if (Array.isArray(doc.gameReaderIds)) doc.gameReaderIds = uniqueIds(doc.gameReaderIds, owner);
  if (Array.isArray(doc.games))
    doc.games = doc.games.map((game) =>
      Array.isArray(game.memberIds) ? { ...game, memberIds: uniqueIds(game.memberIds, game.ownerId) } : game,
    );
  if (isPlainObject(doc.factionPlayers))
    for (const faction of Object.keys(doc.factionPlayers))
      if (Array.isArray(doc.factionPlayers[faction])) doc.factionPlayers[faction] = uniqueIds(doc.factionPlayers[faction]);
  return doc;
}

const summary = [];
for (const name of databases) {
  if (name === USERS_DB) continue;
  const database = db.getSiblingDB(name);
  for (const collection of database.getCollectionNames()) {
    let changed = 0;
    const ops = [];
    database[collection].find().forEach((doc) => {
      const updated = cleanUp(rewrite(doc));
      if (JSON.stringify(EJSON.serialize(updated)) === JSON.stringify(EJSON.serialize(doc))) return;
      changed++;
      ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: updated } });
      if (ops.length === 500 && !DRY_RUN) database[collection].bulkWrite(ops.splice(0));
    });
    if (ops.length && !DRY_RUN) database[collection].bulkWrite(ops);
    if (changed) summary.push(`${name}.${collection}: ${changed}`);
  }
}

// --- 4. rmu-users ----------------------------------------------------------------------------------------
const users = db.getSiblingDB(USERS_DB);
const old = [...oldSubs];
const userDeletes = {
  users: { _id: { $in: old } },
  friendship: { $or: [{ requesterId: { $in: old } }, { addresseeId: { $in: old } }] },
  friend_invite: { inviterId: { $in: old } },
  'user-messages': { $or: [{ userId: { $in: old } }, { from: { $in: old } }] },
};
for (const [collection, filter] of Object.entries(userDeletes)) {
  const count = users[collection].countDocuments(filter);
  if (count && !DRY_RUN) users[collection].deleteMany(filter);
  if (count) summary.push(`${USERS_DB}.${collection}: ${count} deleted`);
}
for (const collection of users.getCollectionNames().filter((c) => !(c in userDeletes))) {
  let changed = 0;
  users[collection].find().forEach((doc) => {
    const updated = rewrite(doc);
    if (JSON.stringify(EJSON.serialize(updated)) === JSON.stringify(EJSON.serialize(doc))) return;
    changed++;
    if (!DRY_RUN) users[collection].replaceOne({ _id: doc._id }, updated);
  });
  if (changed) summary.push(`${USERS_DB}.${collection}: ${changed}`);
}

print(`${DRY_RUN ? 'Would change' : 'Changed'}:`);
summary.forEach((line) => print(`  ${line}`));

// --- 5. Sweep ------------------------------------------------------------------------------------------------
if (!DRY_RUN) {
  const left = [];
  const find = (value, path, where) => {
    if (typeof value === 'string') {
      if (oldSubs.has(value)) left.push(`${where} ${path}`);
    } else if (Array.isArray(value)) value.forEach((v) => find(v, `${path}[]`, where));
    else if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) find(v, path ? `${path}.${k}` : k, where);
  };
  for (const name of databases) {
    const database = db.getSiblingDB(name);
    for (const collection of database.getCollectionNames())
      database[collection].find().forEach((doc) => find(doc, '', `${name}.${collection}`));
  }
  if (left.length) throw new Error(`Old subs left in:\n  ${[...new Set(left)].join('\n  ')}`);
  db.getSiblingDB('rmu-platform').migrations.updateOne(
    { _id: '103-reassign-users' },
    { $set: { appliedAt: new Date(), targetSub: TARGET_SUB, oldSubs: old } },
    { upsert: true },
  );
  print('No old subs left; recorded 103-reassign-users');
}
