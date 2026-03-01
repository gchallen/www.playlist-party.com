import { json } from '@sveltejs/kit';
import { getSentEmails, clearSentEmails } from '$lib/server/email';
import type { RequestHandler } from './$types';

// GET /api/emails — returns all sent emails (for E2E test harness)
export const GET: RequestHandler = async ({ url }) => {
	const emails = getSentEmails();
	const to = url.searchParams.get('to');
	const type = url.searchParams.get('type');

	let filtered = emails;
	if (to) filtered = filtered.filter((e) => e.to === to);
	if (type) filtered = filtered.filter((e) => e.type === type);

	return json({ emails: filtered });
};

// DELETE /api/emails — clears all sent emails (call between tests)
export const DELETE: RequestHandler = async () => {
	clearSentEmails();
	return json({ cleared: true });
};
