
export const MIGRATE_DB = async (db: any) => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      bio TEXT,
      last_synced_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      bio TEXT,
      status TEXT DEFAULT 'offline',
      last_message TEXT,
      unread_count INTEGER DEFAULT 0,
      last_synced_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      chat_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT,
      media_type TEXT,
      media_url TEXT,
      media_caption TEXT,
      reply_to_id TEXT,
      timestamp TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      is_unsent INTEGER DEFAULT 0, -- 1 if waiting to sync
      retry_count INTEGER DEFAULT 0,
      last_retry_at TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL, -- 'SEND_MESSAGE', 'UPDATE_STATUS', etc.
      payload TEXT NOT NULL, -- JSON string of data
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      retry_count INTEGER DEFAULT 0
    );`
  ];

  // Add new columns to existing messages table if they don't exist
  const alterQueries = [
    `ALTER TABLE messages ADD COLUMN retry_count INTEGER DEFAULT 0;`,
    `ALTER TABLE messages ADD COLUMN last_retry_at TEXT;`,
    `ALTER TABLE messages ADD COLUMN error_message TEXT;`
  ];

  try {
    for (const query of queries) {
      try {
        await db.execAsync(query);
      } catch (e) {
        // Ignore errors from CREATE TABLE IF NOT EXISTS
      }
    }

    // Try to add new columns (will fail if they already exist, which is fine)
    for (const alterQuery of alterQueries) {
      try {
        await db.execAsync(alterQuery);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    console.log('[SQLite] Database initialized and tables created/verified.');
  } catch (error) {
    console.error('[SQLite] Migration failed:', error);
    throw error;
  }
};
