const YOUTUBE_PATTERNS = [
	// youtube.com/watch?v=VIDEO_ID
	/(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
	// youtu.be/VIDEO_ID
	/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
	// youtube.com/embed/VIDEO_ID
	/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
	// youtube.com/v/VIDEO_ID
	/(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
	// youtube.com/shorts/VIDEO_ID
	/(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
];

export function extractYouTubeId(url: string): string | null {
	for (const pattern of YOUTUBE_PATTERNS) {
		const match = url.match(pattern);
		if (match) return match[1];
	}
	return null;
}

export function getYouTubeThumbnail(videoId: string): string {
	return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}
