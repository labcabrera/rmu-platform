import { expect, Page, test } from '@playwright/test';

// Combat flow of spec 005 against the running stack, on the first tactical game. Opt-in (RMU_E2E_COMBAT=1,
// `make e2e-combat`): it changes the game (initiatives, actions, phases), so run it on a test game. It needs
// at least three actors able to act and, for the attack, an actor of another faction.

const notified = (page: Page, text: RegExp) => expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();

/** Opens the action palette of the n-th actor that can declare, and picks an entry by its name. */
const declare = async (page: Page, actorIndex: number, entry: RegExp) => {
  await page.getByRole('button', { name: /^declare$/i }).nth(actorIndex).click();
  await page.getByRole('menuitem', { name: entry }).click();
};

/**
 * Rolls every dice button (attack, location, criticals, fumble; open-ended rolls ask for more dice) until the
 * main button `name` is enabled.
 */
const rollUntil = async (page: Page, name: RegExp) => {
  const target = page.getByRole('button', { name });
  for (let i = 0; i < 8 && (await target.isDisabled()); i++) {
    const dice = page.getByRole('button', { name: /roll the dice/i });
    const count = await dice.count();
    if (count === 0) break;
    for (let d = 0; d < count; d++) {
      if (await dice.nth(d).isEnabled()) await dice.nth(d).click();
      await page.waitForTimeout(400);
    }
  }
  await expect(target).toBeEnabled();
};

test('initiative, movement, melee attack, generic action, log and next phase', async ({ page }) => {
  await page.goto('/tactical/games');
  const firstCard = page.locator('.MuiCardActionArea-root').first();
  await expect(firstCard).toBeVisible({ timeout: 15_000 });
  await firstCard.click();
  await page.waitForURL(/\/view\//);
  await page.goto(page.url().replace('/games/view/', '/combat/'));

  // Initiative: roll them all, then start phase 1.
  const rollAll = page.getByRole('button', { name: /roll all initiatives/i });
  if (await rollAll.isVisible()) {
    await rollAll.click();
    const confirm = page.getByRole('dialog').getByRole('button', { name: /roll all initiatives/i });
    if (await confirm.isVisible()) await confirm.click();
    await notified(page, /initiatives rolled/i);
    await page.getByRole('button', { name: /start phase 1/i }).click();
  }
  await expect(page.getByRole('button', { name: /^declare$/i }).first()).toBeVisible();

  // Movement of the first actor: skill and pace, then resolve.
  await declare(page, 0, /normal movement/i);
  await notified(page, /declared/i);
  await page.getByRole('button', { name: /^next$/i }).click();
  await page.getByRole('radiogroup', { name: /pace/i }).getByRole('radio').first().click();
  await page.getByRole('button', { name: /^resolve$/i }).click();
  await notified(page, /movement resolved/i);

  // Melee attack of the second actor: first target, prepare, parry if asked, rolls, apply.
  await declare(page, 1, /melee attack/i);
  await page.getByRole('radiogroup', { name: /target/i }).getByRole('radio').first().click();
  await page.getByRole('button', { name: /^next$/i }).click();
  await page.getByRole('button', { name: /^prepare$/i }).click();
  await notified(page, /attack prepared/i);
  const parry = page.getByRole('button', { name: /^parry$/i });
  if (await parry.isVisible()) {
    await parry.click();
    await notified(page, /parry declared/i);
  }
  await rollUntil(page, /^apply$/i);
  await page.getByRole('button', { name: /^apply$/i }).click();
  await notified(page, /attack applied/i);

  // Generic action of the third actor.
  await declare(page, 2, /stand up/i);
  await page.getByRole('button', { name: /^complete$/i }).click();
  await notified(page, /completed/i);

  // The log lists the three actions.
  await page.getByRole('tab', { name: /log/i }).click();
  await expect(page.getByText(/normal movement|movement/i).first()).toBeVisible();
  await expect(page.getByText(/melee attack/i).first()).toBeVisible();
  await expect(page.getByText(/stand up/i).first()).toBeVisible();

  // Next phase, confirming what is left pending.
  await page.getByRole('tab', { name: /board/i }).click();
  await page.getByRole('button', { name: /start phase 2|start upkeep/i }).click();
  const confirmNext = page.getByRole('dialog').getByRole('button', { name: /start phase 2|start upkeep/i });
  if (await confirmNext.isVisible()) await confirmNext.click();
  await expect(page.getByRole('button', { name: /start phase 3|start upkeep|start round/i })).toBeVisible();
});
