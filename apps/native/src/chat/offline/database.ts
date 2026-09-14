import type { SQLiteDatabase } from 'expo-sqlite';

let database: Promise<SQLiteDatabase> | undefined;
let pending: Promise<unknown> = Promise.resolve();
const CACHE_PAGE_LIMIT = 32 * 1024;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA max_page_count = ${CACHE_PAGE_LIMIT};
CREATE TABLE IF NOT EXISTS conversations (
  scope TEXT NOT NULL, id TEXT NOT NULL, metadata TEXT NOT NULL,
  archived INTEGER NOT NULL, touched INTEGER NOT NULL, PRIMARY KEY (scope, id)
);
CREATE TABLE IF NOT EXISTS messages (
  scope TEXT NOT NULL, thread TEXT NOT NULL, position INTEGER NOT NULL,
  turn TEXT NOT NULL, item TEXT NOT NULL, turn_data TEXT NOT NULL, data TEXT NOT NULL,
  size INTEGER NOT NULL, signature TEXT NOT NULL, PRIMARY KEY (scope, thread, position),
  FOREIGN KEY (scope, thread) REFERENCES conversations(scope, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_cursor ON messages(scope, thread, turn, item);
CREATE TABLE IF NOT EXISTS images (
  scope TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
  size INTEGER NOT NULL, touched INTEGER NOT NULL, PRIMARY KEY (scope, id)
);
CREATE TABLE IF NOT EXISTS devices (
  account TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
  touched INTEGER NOT NULL, PRIMARY KEY (account, id)
);`;

async function open() {
  const { openDatabaseAsync } = await import('expo-sqlite');
  const db = await openDatabaseAsync('chat-offline-v1.db');
  try { await db.execAsync(SCHEMA); }
  catch (error) { await db.closeAsync(); throw error; }
  return db;
}

/** One queue owns reads and transactions, preventing reads of partially written snapshots. */
export function withCache<T>(operation: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  const result = pending.then(async () => {
    database ??= open().catch((error: unknown) => { database = undefined; throw error; });
    return operation(await database);
  });
  pending = result.catch(() => { /* A failed cache operation must not poison later attempts. */ });
  return result;
}

/** withCache owns the connection, so no other query can enter this transaction. */
export function cacheTransaction(db: SQLiteDatabase, operation: (tx: SQLiteDatabase) => Promise<void>) {
  // Keep the initialized connection: Expo's exclusive helper opens another connection without our PRAGMAs.
  return db.withTransactionAsync(() => operation(db));
}
