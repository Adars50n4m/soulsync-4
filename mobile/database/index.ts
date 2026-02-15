import { MIGRATE_DB } from './schema';

let dbInstance: any | null = null; // Use any to allow partial mock/null

export const getDB = async (): Promise<any> => {
  if (dbInstance) {
    return dbInstance;
  }

  let SQLite;
  try {
    // Lazy load the native module
    SQLite = require('expo-sqlite');
  } catch (e) {
    console.warn('[SQLite] Native module not found. Offline features disabled.');
    return null;
  }

  try {
    if (!SQLite || !SQLite.openDatabaseAsync) {
        console.warn('[SQLite] openDatabaseAsync not found.');
        return null;
    }

    dbInstance = await SQLite.openDatabaseAsync('soulsync.db');
    await MIGRATE_DB(dbInstance);
    return dbInstance;
  } catch (error) {
    console.error('[SQLite] Failed to open database:', error);
    // Return null so service knows DB is unavailable
    return null;
  }
};
