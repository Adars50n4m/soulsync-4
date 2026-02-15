
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

  try {
    for (const query of queries) {
      await db.execAsync(query);
    }
    console.log('[SQLite] Database initialized and tables created/verified.');
  } catch (error) {
    console.error('[SQLite] Migration failed:', error);
    throw error;
  }
};
