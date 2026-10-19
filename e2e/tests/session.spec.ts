import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';

// Remembered sessions (spec 006): the Keycloak cookie, not the browser storage, brings the user back.
// A browser restart is simulated by a new context that only keeps the persistent cookies.
// It signs in with RMU_E2E_USER / RMU_E2E_PASSWORD and changes nothing but that user's sessions.

const user = process.env.RMU_E2E_USER ?? '';
const password = process.env.RMU_E2E_PASSWORD ?? '';

const hasOidcUser = (page: Page) =>
  page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('oidc.user')));

const accessToken = (page: Page) =>
  page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('oidc.user'));
    return key ? (JSON.parse(sessionStorage.getItem(key) ?? '{}').access_token as string) : '';
  });

async function signIn(page: Page, rememberMe: boolean) {
  await page.goto('/');
  await page.getByRole('button', { name: /^(login|iniciar sesión)$/i }).click();
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  if (rememberMe) await page.locator('#rememberMe').check();
  await page.locator('#kc-login').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sso/'));
  await expect.poll(() => hasOidcUser(page)).toBe(true);
}

// Closing the browser drops session cookies and sessionStorage; persistent cookies survive.
async function restart(browser: Browser, context: BrowserContext) {
  const cookies = (await context.cookies()).filter((cookie) => cookie.expires > 0);
  await context.close();
  const next = await browser.newContext();
  await next.addCookies(cookies);
  return next;
}

test.describe('remembered session', () => {
  // Two sign-ins of the same user within a second trip Keycloak's brute-force quick login check.
  test.describe.configure({ mode: 'serial' });
  test.skip(!user || !password, 'Set RMU_E2E_USER and RMU_E2E_PASSWORD');

  test('with "Remember me" a new tab and a browser restart need no credentials', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, true);

    const tab = await context.newPage();
    await tab.goto('/');
    await expect.poll(() => hasOidcUser(tab)).toBe(true);

    const restarted = await restart(browser, context);
    const again = await restarted.newPage();
    await again.goto('/');
    await expect.poll(() => hasOidcUser(again)).toBe(true);

    // The token carries the audience and issuer the APIs check, and /me answers without Keycloak.
    const token = await accessToken(again);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(claims.aud).toContain('rmu-api');
    expect(claims.iss).toMatch(/\/sso\/realms\/rmu$/);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(15 * 60);
    const me = await again.request.get('/api/users/v1/users/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status()).toBe(200);
    expect((await me.json()).identityProvider).toBe('local');

    // Logging out ends the Keycloak session: the next sign-in asks for credentials.
    await again.getByRole('button', { name: /open menu|abrir menú/i }).click();
    await again.getByRole('menuitem', { name: /log out|cerrar sesión/i }).click();
    await again.waitForURL((url) => !url.pathname.startsWith('/sso/'));
    await expect.poll(() => hasOidcUser(again)).toBe(false);
    await again.getByRole('button', { name: /^(login|iniciar sesión)$/i }).click();
    await expect(again.locator('#username')).toBeVisible();
    await restarted.close();
  });

  test('without "Remember me" a browser restart asks again', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, false);

    const tab = await context.newPage();
    await tab.goto('/');
    await expect.poll(() => hasOidcUser(tab)).toBe(true);

    const restarted = await restart(browser, context);
    const again = await restarted.newPage();
    await again.goto('/');
    await expect(again.getByRole('button', { name: /^(login|iniciar sesión)$/i })).toBeVisible();
    expect(await hasOidcUser(again)).toBe(false);
    await restarted.close();
  });

  test('the login page offers Google', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^(login|iniciar sesión)$/i }).click();
    await expect(page.locator('#social-google')).toBeVisible();
    await expect(page.locator('#rememberMe')).toBeVisible();
  });
});
