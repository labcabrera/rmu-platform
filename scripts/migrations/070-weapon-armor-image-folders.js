// Weapon and armor images in their own folders (2026-11-02): rmu-mfe-assets moved the images of weapons to
// `images/weapons/` and the ones of armor and shields to `images/armor/`. The catalog items (`imageUrl`) and the
// items of characters and factions (`catalog.imageUrl`) that point to the old `images/items/<name>.png` get the new
// path. The `images/items/category-*.png` images stay where they are.
//
// Only documents whose image changes are written; their version goes up, as the API does on a change.
// Run with `make mongo-migrate f=scripts/migrations/070-weapon-armor-image-folders.js` (DRY_RUN=1 to only report),
// after `make mongo-backup` and together with the rmu-mfe-assets image that has the new folders. Idempotent.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const prefix = dryRun ? '[dry-run] ' : '';
const FOLDERS = {
  weapons: [
    'arming-sword', 'battle-axe', 'blackjack', 'blowdart', 'blowpipe', 'bola', 'broadsword', 'claymore',
    'club', 'composite-bow', 'crossbow', 'dagger', 'dart', 'epee', 'falchion', 'figthing-stick', 'flail',
    'glaive', 'great-falchion', 'halberd', 'hand-axe', 'hand-crossbow', 'heavy-crossbow', 'heavy-flail',
    'javelin', 'large-net', 'light-flail', 'light-mace', 'ligth-stick', 'long-axe', 'long-bow',
    'long-scimitar', 'long-spear', 'longsword', 'mace', 'machete', 'net', 'poleaxe', 'rapier', 'scimitar',
    'short-bow', 'short-sword', 'sling', 'slingshot', 'small-net', 'spear', 'staff-sling', 'throwing-club',
    'war-hammer', 'war-mattock', 'whip',
  ],
  armor: [
    'brigandine-greaves', 'brigandine-helmet', 'brigandine-torso-armor', 'brigandine-vambraces',
    'full-shield', 'heavy-cloth-greaves', 'heavy-cloth-helmet', 'heavy-cloth-torso-armor',
    'heavy-cloth-vambraces', 'hide-scale-greaves', 'hide-scale-helmet', 'hide-scale-torso-armor',
    'hide-scale-vambraces', 'laminar-greaves', 'laminar-helmet', 'laminar-torso-armor', 'laminar-vambraces',
    'mail-greaves', 'mail-helmet', 'mail-torso-armor', 'mail-vambraces', 'metal-scale-greaves',
    'metal-scale-helmet', 'metal-scale-torso-armor', 'metal-scale-vambraces', 'normal-shield',
    'plate-greaves', 'plate-helmet', 'plate-torso-armor', 'plate-vambraces', 'rigid-leather-greaves',
    'rigid-leather-helmet', 'rigid-leather-torso-armor', 'rigid-leather-torso-greaves',
    'rigid-leather-torso-helmet', 'rigid-leather-torso-vambraces', 'rigid-leather-vambraces',
    'soft-leather-greaves', 'soft-leather-helmet', 'soft-leather-torso-armor', 'soft-leather-vambraces',
    'target-shield', 'wall-shield',
  ],
};

const targets = [
  { collection: db.getSiblingDB('rmu-items').items, label: 'rmu-items.items', field: 'imageUrl' },
  { collection: db.getSiblingDB('rmu-strategic').items, label: 'rmu-strategic.items', field: 'catalog.imageUrl' },
];

targets.forEach(({ collection, label, field }) => {
  let changed = 0;
  Object.entries(FOLDERS).forEach(([folder, names]) => {
    names.forEach(name => {
      const filter = { [field]: `images/items/${name}.png` };
      const count = collection.countDocuments(filter);
      if (count === 0) return;
      changed += count;
      if (!dryRun) {
        collection.updateMany(filter, {
          $set: { [field]: `images/${folder}/${name}.png`, updatedAt: new Date() },
          $inc: { version: 1 },
        });
      }
    });
  });
  print(`${prefix}${label}: ${changed} document(s) ${dryRun ? 'would move' : 'moved'} to images/weapons or images/armor`);
});
