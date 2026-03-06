import { dev } from '$app/environment';
import { getDb } from '$lib/server/db';
import { errorLog } from '$lib/server/db/schema';
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
	const errorId = crypto.randomUUID().slice(0, 8);
	const detail = error instanceof Error ? error.stack || error.message : String(error);
	console.error(`[${errorId}] ${status} ${event.request.method} ${event.url.pathname}: ${detail}`);

	try {
		const db = await getDb(event.platform);
		await db.insert(errorLog).values({
			errorId,
			status,
			method: event.request.method,
			path: event.url.pathname,
			detail
		});
	} catch {
		// Don't let error logging failures mask the original error
	}

	return {
		message,
		errorId,
		...(dev ? { detail } : {})
	};
};
