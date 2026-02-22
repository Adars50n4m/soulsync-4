
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
      is_unsent INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      last_retry_at TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      -- Offline media support
      local_file_uri TEXT,
      media_status TEXT DEFAULT 'not_downloaded',
      thumbnail_uri TEXT,
      file_size INTEGER,
      mime_type TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      retry_count INTEGER DEFAULT 0
    );`,
    `CREATE TABLE IF NOT EXISTS media_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      remote_url TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      file_size INTEGER,
      downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);`,
    `CREATE INDEX IF NOT EXISTS idx_messages_media_status ON messages(media_status);`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);`
  ];

  // Add new columns to existing messages table if they don't exist
  const alterQueries = [
    `ALTER TABLE messages ADD COLUMN retry_count INTEGER DEFAULT 0;`,
    `ALTER TABLE messages ADD COLUMN last_retry_at TEXT;`,
    `ALTER TABLE messages ADD COLUMN error_message TEXT;`,
    `ALTER TABLE messages ADD COLUMN local_file_uri TEXT;`,
    `ALTER TABLE messages ADD COLUMN media_status TEXT DEFAULT 'not_downloaded';`,
    `ALTER TABLE messages ADD COLUMN thumbnail_uri TEXT;`,
    `ALTER TABLE messages ADD COLUMN file_size INTEGER;`,
    `ALTER TABLE messages ADD COLUMN mime_type TEXT;`
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
