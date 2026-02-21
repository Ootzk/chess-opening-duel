import { execSync } from 'child_process';

/**
 * Clean up MongoDB data for specific user pairs.
 * Deletes games, series, and challenges involving the given usernames.
 *
 * Called in test.beforeAll() to ensure clean state before each test,
 * regardless of whether a previous run completed successfully.
 */
export function cleanupPairData(users: string[]): void {
  try {
    const mongoCommand = `
      db.game5.deleteMany({ "players.user.id": { $in: ${JSON.stringify(users)} } });
      db.series.deleteMany({ "players.userId": { $in: ${JSON.stringify(users)} } });
      db.challenge.deleteMany({ $or: [
        { "challenger.user.id": { $in: ${JSON.stringify(users)} } },
        { "destUser.id": { $in: ${JSON.stringify(users)} } }
      ]});
      db.opening_pool.deleteMany({ "_id": { $in: ${JSON.stringify(users)} } });
    `.replace(/\n/g, ' ');
    execSync(
      `docker exec chess-opening-duel-mongodb-1 mongosh lichess --quiet --eval '${mongoCommand}'`,
      { encoding: 'utf-8', timeout: 10000 }
    );
  } catch {
    // Ignore cleanup errors
  }
}
