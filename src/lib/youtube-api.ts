/**
 * Load the YouTube IFrame API and return a Promise that resolves with window.YT.
 * Safe to call multiple times — deduplicates the script tag and promise.
 */
let apiPromise: Promise<any> | null = null;

export function loadYouTubeIframeApi(): Promise<any> {
	if (apiPromise) return apiPromise;

	apiPromise = new Promise((resolve) => {
		if ((window as any).YT?.Player) {
			resolve((window as any).YT);
			return;
		}

		const prev = (window as any).onYouTubeIframeAPIReady;
		(window as any).onYouTubeIframeAPIReady = () => {
			if (prev) prev();
			resolve((window as any).YT);
		};

		if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
			const tag = document.createElement('script');
			tag.src = 'https://www.youtube.com/iframe_api';
			document.body.appendChild(tag);
		}
	});

	return apiPromise;
}
