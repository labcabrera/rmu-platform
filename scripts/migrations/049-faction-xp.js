// Spec 049: the factions have no XP pool any more; removes management.availableXP from the stored factions.
// Run with `make mongo-migrate f=scripts/migrations/049-faction-xp.js` (DRY_RUN=1 to only report),
// after `make mongo-backup`.
// Moved from the workspace data/scripts on 2026-10-31 (workspace spec 056).
const dry = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const strategic = db.getSiblingDB('rmu-strategic');
const filter = { 'management.availableXP': { $exists: true } };
strategic.factions.find(filter).forEach((faction) => print(`faction ${faction.name}: availableXP ${faction.management.availableXP}`));
const count = strategic.factions.countDocuments(filter);
if (!dry) strategic.factions.updateMany(filter, { $unset: { 'management.availableXP': '' } });
print(`${dry ? '[DRY_RUN] would update' : 'updated'} ${count} factions`);
