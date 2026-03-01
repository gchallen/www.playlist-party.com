import { getYouTubeThumbnail } from '$lib/youtube';

interface YouTubeMetadata {
	title: string;
	channelName: string;
	thumbnail: string;
}

export async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata | null> {
	const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

	try {
		const response = await fetch(url);
		if (!response.ok) return null;

		const data = await response.json();
		return {
			title: data.title,
			channelName: data.author_name,
			thumbnail: getYouTubeThumbnail(videoId)
		};
	} catch {
		return null;
	}
}
