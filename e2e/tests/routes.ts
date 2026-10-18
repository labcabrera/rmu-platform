// Main routes of the web. Detail pages take the first card of their list, so the test does not depend
// on fixed ids.
export const listRoutes = [
  '/core/realms',
  '/core/races',
  '/core/professions',
  '/core/cultures',
  '/core/skills',
  '/core/traits',
  '/strategic/games',
  '/strategic/factions',
  '/strategic/characters',
  '/tactical/games',
  '/npcs',
  '/items',
  '/spells/spells',
  '/spells/spell-lists',
];

export const staticRoutes = ['/', '/core', '/strategic', '/tactical', '/spells', '/user-profile'];

export const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};
