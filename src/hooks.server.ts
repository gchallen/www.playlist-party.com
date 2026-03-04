import { dev } from '$app/environment';
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
	const errorId = crypto.randomUUID().slice(0, 8);
	const detail = error instanceof Error ? error.stack || error.message : String(error);
	console.error(`[${errorId}] ${status} ${event.request.method} ${event.url.pathname}: ${detail}`);
	return {
		message,
		errorId,
		...(dev ? { detail } : {})
	};
};
