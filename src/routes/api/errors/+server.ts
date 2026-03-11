import { json, error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { errorLog } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url, request }) => {
	const secret = platform?.env?.CRON_SECRET;
	if (secret) {
		const auth = request.headers.get('authorization');
		if (auth !== `Bearer ${secret}`) {
			error(401, 'Unauthorized');
		}
	}

	const db = await getDb(platform);
	const errorId = url.searchParams.get('id');

	if (errorId) {
		const row = await db.query.errorLog.findFirst({
			where: eq(errorLog.errorId, errorId)
		});
		if (!row) error(404, 'Error not found');
		return json(row);
	}

	const rows = await db.select().from(errorLog).orderBy(desc(errorLog.id)).limit(50);

	return json({ errors: rows });
};
