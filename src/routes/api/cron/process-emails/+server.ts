import { json, error } from '@sveltejs/kit';
import { processEmailQueue } from '$lib/server/email-queue';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request }) => {
	const secret = platform?.env?.CRON_SECRET;
	if (secret) {
		const auth = request.headers.get('authorization');
		if (auth !== `Bearer ${secret}`) {
			error(401, 'Unauthorized');
		}
	}

	const result = await processEmailQueue(platform);
	return json(result);
};
