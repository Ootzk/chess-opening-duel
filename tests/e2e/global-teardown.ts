import { execSync } from 'child_process';

const TEST_USERS = ['elena', 'hans'];

async function globalTeardown() {
  console.log('🧹 Cleaning up test data...');

  try {
    // MongoDB cleanup via docker exec
    const mongoCommand = `
      db.game5.deleteMany({ "players.user.id": { $in: ${JSON.stringify(TEST_USERS)} } });
      db.series.deleteMany({ "players.userId": { $in: ${JSON.stringify(TEST_USERS)} } });
      db.challenge.deleteMany({ $or: [
        { "challenger.user.id": { $in: ${JSON.stringify(TEST_USERS)} } },
        { "destUser.id": { $in: ${JSON.stringify(TEST_USERS)} } }
      ]});
    `.replace(/\n/g, ' ');

    const result = execSync(
      `docker exec chess-opening-duel-mongodb-1 mongosh lichess --quiet --eval '${mongoCommand}'`,
      { encoding: 'utf-8', timeout: 10000 }
    );

    console.log('✓ Test data cleaned up');
    if (result.trim()) {
      console.log(result.trim());
    }
  } catch (error) {
    console.error('⚠ Cleanup failed (non-fatal):', error);
    // Don't throw - cleanup failure shouldn't fail tests
  }
}

export default globalTeardown;
