import { drizzle } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type Database = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzleSqlite<typeof schema>>;

let _db: Database | null = null;

export async function getDb(platform?: App.Platform): Promise<Database> {
	if (_db) return _db;

	if (platform?.env?.DB) {
		_db = drizzle(platform.env.DB, { schema });
		return _db;
	}

	// Local/Docker: use better-sqlite3
	const BetterSqlite3 = (await import('better-sqlite3')).default;
	const sqlite = new BetterSqlite3('local.db');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	_db = drizzleSqlite(sqlite, { schema });
	return _db;
}
