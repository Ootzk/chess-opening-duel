import { execSync } from 'child_process';

async function globalTeardown() {
  console.log('🧹 Resetting database...');

  try {
    // Full DB reset using lila-docker (resets MongoDB + Redis)
    execSync('./lila-docker db', {
      encoding: 'utf-8',
      timeout: 60000, // DB reset can take a while
      cwd: '/home/ootzk/Project/chess-opening-duel',
      stdio: 'inherit',
    });

    console.log('✓ Database reset complete');
  } catch (error) {
    console.error('⚠ DB reset failed (non-fatal):', error);
    // Don't throw - cleanup failure shouldn't fail tests
  }
}

export default globalTeardown;
