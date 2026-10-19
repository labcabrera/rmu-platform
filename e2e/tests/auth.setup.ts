import { expect, test as setup } from '@playwright/test';

// Signs in once through Keycloak and stores its session cookie: the shell's silent SSO reuses it in
// every test, so they start authenticated.
setup('sign in', async ({ page }) => {
  const user = process.env.RMU_E2E_USER;
  const password = process.env.RMU_E2E_PASSWORD;
  if (!user || !password) throw new Error('Set RMU_E2E_USER and RMU_E2E_PASSWORD (a Keycloak user of the local realm)');

  await page.goto('/user-profile');
  await page.getByRole('main').getByRole('button', { name: /login|sign in|iniciar/i }).click();
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/\/user-profile/);
  await expect
    .poll(() => page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('oidc.user'))))
    .toBe(true);
  await page.context().storageState({ path: '.auth/user.json' });
});
