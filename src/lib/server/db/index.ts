import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// Use a loose type so we don't need a static import of better-sqlite3's drizzle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export async function getDb(platform?: App.Platform): Promise<Database> {
	if (_db) return _db;

	if (platform?.env?.DB) {
		_db = drizzle(platform.env.DB, { schema });
		return _db;
	}

	// Local/Docker: fully dynamic imports to keep better-sqlite3 out of the Cloudflare bundle
	const { drizzle: drizzleSqlite } = await import('drizzle-orm/better-sqlite3');
	const BetterSqlite3 = (await import('better-sqlite3')).default;
	const sqlite = new BetterSqlite3('local.db');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	_db = drizzleSqlite(sqlite, { schema });
	return _db;
}
