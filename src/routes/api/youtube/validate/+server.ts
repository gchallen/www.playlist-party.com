import { json } from '@sveltejs/kit';
import { extractYouTubeId } from '$lib/youtube';
import { fetchYouTubeMetadata } from '$lib/server/youtube';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { url } = await request.json();

	if (!url || typeof url !== 'string') {
		return json({ error: 'URL is required' }, { status: 400 });
	}

	const videoId = extractYouTubeId(url);
	if (!videoId) {
		return json({ error: 'Invalid YouTube URL' }, { status: 400 });
	}

	const metadata = await fetchYouTubeMetadata(videoId);
	if (!metadata) {
		return json({ error: 'Video not found or unavailable' }, { status: 404 });
	}

	return json({
		videoId,
		title: metadata.title,
		channelName: metadata.channelName,
		thumbnail: metadata.thumbnail
	});
};
