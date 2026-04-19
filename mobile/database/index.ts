import { getDb } from '../services/LocalDBService';

/**
 * DEPRECATED: Use LocalDBService.getDb() directly instead.
 * This is maintained for legacy compatibility but redirects to the centralized
 * singleton to prevent multiple migration attempts on the same SQLite file.
 */
export const getDB = async (): Promise<any> => {
  return await getDb();
};
