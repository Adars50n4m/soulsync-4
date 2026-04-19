import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export type MigrationFunction = (db: SQLite.SQLiteDatabase) => Promise<void>;

interface DatabaseConfig {
  name: string;
  migrations: MigrationFunction;
  onOpen?: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

// Default timeout for individual queries (10 seconds)
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

class DatabaseManager {
  private static instance: DatabaseManager;
  private databases: Map<string, SQLite.SQLiteDatabase> = new Map();
  private openPromises: Map<string, Promise<SQLite.SQLiteDatabase>> = new Map();

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Validates that a cached DB connection is still alive.
   * Returns false if the connection is stale/broken or HUNG.
   */
  private async isConnectionHealthy(db: SQLite.SQLiteDatabase, name: string): Promise<boolean> {
    try {
      // 🛡️ FAIL FAST: If DB is locked, don't hang the whole app boot.
      // 200ms is plenty for a simple 'SELECT 1' unless there is a severe lock.
      const healthCheck = db.getFirstAsync<{ ok: number }>('SELECT 1 as ok;');
      const result = await DatabaseManager.withTimeout(healthCheck, 200, `HealthCheck-${name}`);
      return result?.ok === 1;
    } catch (e) {
      console.warn(`[DatabaseManager] Health check failed/timed-out for ${name}`);
      return false;
    }
  }

  /**
   * Opens a database with standard Soul configuration (WAL, Foreign Keys)
   * and runs migrations.
   */
  public async getDatabase(config: DatabaseConfig): Promise<SQLite.SQLiteDatabase> {
    const { name, migrations, onOpen } = config;

    // Return cached instance if available AND healthy
    if (this.databases.has(name)) {
      const cached = this.databases.get(name)!;
      const startHealth = Date.now();
      if (await this.isConnectionHealthy(cached, name)) {
        return cached;
      }
      console.warn(`[DatabaseManager] Health check slow/failed after ${Date.now() - startHealth}ms. Re-initializing ${name}.`);
      this.databases.delete(name);
    }

    // Return existing open promise if one is in flight (prevents race conditions)
    if (this.openPromises.has(name)) {
      return this.openPromises.get(name)!;
    }

    const openPromise = (async () => {
      const startOpen = Date.now();
      try {
        console.log(`[DatabaseManager] ⏳ Opening database: ${name}`);
        const db = await SQLite.openDatabaseAsync(name);
        console.log(`[DatabaseManager] 📑 DB file opened in ${Date.now() - startOpen}ms`);

        // Standard configuration
        console.log(`[DatabaseManager] ⚙️ Configuring PRAGMAs...`);
        const startPragma = Date.now();
        await db.execAsync('PRAGMA journal_mode = WAL;');
        await db.execAsync('PRAGMA foreign_keys = ON;');
        await db.execAsync('PRAGMA busy_timeout = 5000;');
        console.log(`[DatabaseManager] ✅ PRAGMAs set in ${Date.now() - startPragma}ms`);

        // Run migrations
        if (migrations) {
          console.log(`[DatabaseManager] 🔨 Running migrations...`);
          const startMigrate = Date.now();
          await migrations(db);
          console.log(`[DatabaseManager] ✅ Migrations complete in ${Date.now() - startMigrate}ms`);
        }

        // Custom post-open logic
        if (onOpen) {
          await onOpen(db);
        }

        console.log(`[DatabaseManager] ✨ Database ${name} is fully ready after ${Date.now() - startOpen}ms`);
        this.databases.set(name, db);
        return db;
      } catch (error) {
        console.error(`[DatabaseManager] ❌ Failed to open database ${name} after ${Date.now() - startOpen}ms:`, error);
        this.openPromises.delete(name);
        throw error;
      } finally {
        this.openPromises.delete(name);
      }
    })();

    this.openPromises.set(name, openPromise);
    return openPromise;
  }

  /**
   * Wraps a DB operation with a timeout to prevent indefinite hangs.
   */
  public static withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
    label = 'query'
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[DatabaseManager] ${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  /**
   * Closes all open databases.
   */
  public async closeAll(): Promise<void> {
    for (const [name, db] of this.databases.entries()) {
      try {
        await db.closeAsync();
        this.databases.delete(name);
        console.log(`[DatabaseManager] Closed database: ${name}`);
      } catch (e) {
        console.error(`[DatabaseManager] Error closing ${name}:`, e);
        this.databases.delete(name);
      }
    }
  }
}

export const dbManager = DatabaseManager.getInstance();
