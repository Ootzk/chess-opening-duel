import { chromium, FullConfig } from '@playwright/test';

// 7 test account pairs for parallel test execution
// Each pair tests different scenarios independently
const users = [
  // Pair 1: elena + hans (happy path: 4-game comeback 2.5-1.5)
  { username: 'elena', password: 'password', file: '.auth/elena.json' },
  { username: 'hans', password: 'password', file: '.auth/hans.json' },
  // Pair 2: boris + david (ban timeout)
  { username: 'boris', password: 'password', file: '.auth/boris.json' },
  { username: 'david', password: 'password', file: '.auth/david.json' },
  // Pair 3: yulia + luis (3-0 sweep)
  { username: 'yulia', password: 'password', file: '.auth/yulia.json' },
  { username: 'luis', password: 'password', file: '.auth/luis.json' },
  // Pair 4: mei + ivan (pick timeout)
  { username: 'mei', password: 'password', file: '.auth/mei.json' },
  { username: 'ivan', password: 'password', file: '.auth/ivan.json' },
  // Pair 5: ana + lola (sudden death 3.5-2.5)
  { username: 'ana', password: 'password', file: '.auth/ana.json' },
  { username: 'lola', password: 'password', file: '.auth/lola.json' },
  // Pair 6: carlos + nina (dramatic comeback 0-2 → 3-2)
  { username: 'carlos', password: 'password', file: '.auth/carlos.json' },
  { username: 'nina', password: 'password', file: '.auth/nina.json' },
  // Pair 7: oscar + petra (early win 2.5-0.5)
  { username: 'oscar', password: 'password', file: '.auth/oscar.json' },
  { username: 'petra', password: 'password', file: '.auth/petra.json' },
  // Pair 8: angel + bobby (pick phase disconnect abort)
  { username: 'angel', password: 'password', file: '.auth/angel.json' },
  { username: 'bobby', password: 'password', file: '.auth/bobby.json' },
  // Pair 9: marcel + vera (ban phase disconnect abort)
  { username: 'marcel', password: 'password', file: '.auth/marcel.json' },
  { username: 'vera', password: 'password', file: '.auth/vera.json' },
  // Pair 10: fatima + diego (series forfeit during game)
  { username: 'fatima', password: 'password', file: '.auth/fatima.json' },
  { username: 'diego', password: 'password', file: '.auth/diego.json' },
  // Pair 11: salma + benjamin (series forfeit at game start)
  { username: 'salma', password: 'password', file: '.auth/salma.json' },
  { username: 'benjamin', password: 'password', file: '.auth/benjamin.json' },
  // Pair 12: patricia + adriana (finished page + rematch)
  { username: 'patricia', password: 'password', file: '.auth/patricia.json' },
  { username: 'adriana', password: 'password', file: '.auth/adriana.json' },
  // Pair 13: mary + jose (countdown verification)
  { username: 'mary', password: 'password', file: '.auth/mary.json' },
  { username: 'jose', password: 'password', file: '.auth/jose.json' },
  // Pair 14: iryna + pedro (countdown cancel behavior)
  { username: 'iryna', password: 'password', file: '.auth/iryna.json' },
  { username: 'pedro', password: 'password', file: '.auth/pedro.json' },
  // Pair 15: aaron + jacob (disconnect during game → series forfeit)
  { username: 'aaron', password: 'password', file: '.auth/aaron.json' },
  { username: 'jacob', password: 'password', file: '.auth/jacob.json' },
  // Pair 16: svetlana + qing (0-2 then disconnect in game 3 → series forfeit)
  { username: 'svetlana', password: 'password', file: '.auth/svetlana.json' },
  { username: 'qing', password: 'password', file: '.auth/qing.json' },
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
