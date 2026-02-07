import { chromium, FullConfig } from '@playwright/test';

const users = [
  { username: 'elena', password: 'password', file: '.auth/elena.json' },
  { username: 'hans', password: 'password', file: '.auth/hans.json' },
];

async function loginWithRetry(
  baseURL: string,
  user: { username: string; password: string; file: string },
  maxRetries = 3
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // headless: false for debugging
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseURL}/login`);
      await page.waitForLoadState('networkidle');

      // Check for rate limit
      const rateLimitMsg = page.locator('text=Too many requests');
      if (await rateLimitMsg.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`Rate limited, waiting... (attempt ${attempt}/${maxRetries})`);
        await browser.close();
        await new Promise(resolve => setTimeout(resolve, 10000 * attempt));
        continue;
      }

      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);

      // Click and wait for navigation
      const [response] = await Promise.all([
        page.waitForResponse(response => response.url().includes('/login') && response.request().method() === 'POST'),
        page.locator('button.submit:has-text("Sign in")').first().click()
      ]);
      console.log(`Login response status: ${response.status()}`);

      // Wait a bit for redirect
      await page.waitForTimeout(2000);

      // Check if still on login page
      if (page.url().includes('/login')) {
        // Check for error message
        const errorEl = page.locator('.bad, .error');
        if (await errorEl.first().isVisible().catch(() => false)) {
          const errorText = await errorEl.first().textContent();
          console.log(`Login error message: ${errorText}`);
        }
        throw new Error(`Login failed - still on login page. URL: ${page.url()}`);
      }

      // Save session
      await context.storageState({ path: user.file });
      await browser.close();
      console.log(`✓ Logged in as ${user.username}`);
      return;
    } catch (error) {
      console.log(`Login attempt ${attempt}/${maxRetries} error:`, error);
      await browser.close();
      if (attempt === maxRetries) throw error;
      console.log(`Login failed, retrying... (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:8080';

  for (const user of users) {
    await loginWithRetry(baseURL, user);
  }
}

export default globalSetup;
