import { json, error } from '@sveltejs/kit';
import { getSentEmails, clearSentEmails } from '$lib/server/email';
import type { RequestHandler } from './$types';

function guardProduction(platform: App.Platform | undefined) {
	if (platform?.env?.RESEND_API_KEY) {
		error(404, 'Not found');
	}
}

// GET /api/emails — returns all sent emails (for E2E test harness)
export const GET: RequestHandler = async ({ url, platform }) => {
	guardProduction(platform);

	const emails = getSentEmails();
	const to = url.searchParams.get('to');
	const type = url.searchParams.get('type');

	let filtered = emails;
	if (to) filtered = filtered.filter((e) => e.to.toLowerCase() === to.toLowerCase());
	if (type) filtered = filtered.filter((e) => e.type === type);

	return json({ emails: filtered });
};

// DELETE /api/emails — clears all sent emails (call between tests)
export const DELETE: RequestHandler = async ({ platform }) => {
	guardProduction(platform);

	clearSentEmails();
	return json({ cleared: true });
};
