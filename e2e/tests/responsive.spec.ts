import { expect, Page, test } from '@playwright/test';
import { listRoutes, presets, staticRoutes, viewports } from './routes';

// Visible text that is only an i18n key (kebab-case, at least two words): a translation is missing.
const I18N_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/** Waits until the route has rendered its data (no skeletons or spinners left). */
const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  // The shell restores the session through Keycloak's SSO cookie; without it the data pages are not tested.
  await expect
    .poll(() => page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('oidc.user'))), {
      message: 'not signed in: the stored Keycloak session expired, run the setup project again',
      timeout: 15_000,
    })
    .toBe(true);
  await expect(page.locator('[aria-busy="true"], .MuiCircularProgress-root')).toHaveCount(0, { timeout: 15_000 });
  // Entering snackbars and dialogs are scaled down while they animate: measure them once they settle.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
};

const audit = async (page: Page) =>
  page.evaluate((keyPattern) => {
    const key = new RegExp(keyPattern);
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => !c.startsWith('css-')).join('.')}`;
    const vw = window.innerWidth;
    const overflow = document.documentElement.scrollWidth > vw + 1;
    // Wide elements are fine inside a scrollable container (tables): only count the ones that are not.
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .filter((el) => {
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (['auto', 'scroll', 'hidden'].includes(style.overflowX) && parent !== document.body) return false;
        }
        return true;
      })
      .slice(0, 5)
      .map(describe);
    const keys = [...document.querySelectorAll('body *')]
      .filter((el) => el.children.length === 0 && (el as HTMLElement).offsetParent !== null)
      .map((el) => el.textContent?.trim() ?? '')
      .filter((text) => key.test(text));
    // An input's target is its whole field; links inside running text are exempt (WCAG 2.5.8).
    const targets = [...document.querySelectorAll('button, a[href], [role="button"], input, [role="tab"]')]
      .filter((el) => !el.classList.contains('MuiSelect-nativeInput') && getComputedStyle(el).display !== 'inline')
      .map((el) => ({ el, rect: (el.closest('.MuiInputBase-root') ?? el).getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const small = targets
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .map(({ el, rect }) => {
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
        return `${describe(el)} ${Math.round(rect.width)}x${Math.round(rect.height)} "${label}"`;
      });
    return { overflow, offenders, keys: [...new Set(keys)], small, targets: targets.length };
  }, I18N_KEY.source);

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(name, () => {
    test.use({ viewport });

    const check = async (page: Page) => {
      const result = await audit(page);
      expect(result.offenders, 'elements overflowing the page horizontally').toEqual([]);
      expect(result.keys, 'untranslated i18n keys').toEqual([]);
      // Tap targets of at least 44 px on phones. RMU_E2E_LENIENT=1 only reports them (annotation), for triage.
      if (name === 'mobile') {
        test.info().annotations.push({ type: 'small tap targets', description: `${result.small.length}/${result.targets}` });
        if (!process.env.RMU_E2E_LENIENT) expect(result.small, 'tap targets under 44 px').toEqual([]);
      }
    };

    for (const route of staticRoutes) {
      test(`page ${route}`, async ({ page }) => {
        await page.goto(route);
        await settle(page);
        await check(page);
      });
    }

    for (const route of listRoutes) {
      test(`list ${route} and its first detail`, async ({ page }) => {
        await page.goto(route);
        await settle(page);
        await check(page);
        const firstCard = page.locator('.MuiCardActionArea-root').first();
        if ((await firstCard.count()) === 0) return;
        await firstCard.click();
        await page.waitForURL(/\/view\//);
        await settle(page);
        await check(page);
      });
    }

    // The combat board is the densest page, so it is checked in every theme preset, with the side panel open
    // on the first actor (spec 005). It is opened by URL: its button on the game view starts the game.
    for (const preset of presets) {
      test(`combat dashboard of the first tactical game (${preset})`, async ({ page }) => {
        await page.addInitScript(
          (value) => localStorage.setItem('rmuTheme', value),
          JSON.stringify({ preset, mode: preset === 'codex' ? 'light' : 'dark', density: 'comfortable' })
        );
        await page.goto('/tactical/games');
        await settle(page);
        const firstCard = page.locator('.MuiCardActionArea-root').first();
        test.skip((await firstCard.count()) === 0, 'no tactical games');
        await firstCard.click();
        await page.waitForURL(/\/view\//);
        await page.goto(page.url().replace('/games/view/', '/combat/'));
        await settle(page);
        await check(page);
        const actor = page.locator('[aria-pressed]').first();
        if ((await actor.count()) === 0) return;
        await actor.click();
        await settle(page);
        await check(page);
      });
    }
  });
}
