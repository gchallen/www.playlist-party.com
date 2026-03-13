/**
 * Load the YouTube IFrame API and return a Promise that resolves with window.YT.
 * Safe to call multiple times — deduplicates the script tag and promise.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YTNamespace = { Player: new (...args: any[]) => any; [key: string]: unknown };

let apiPromise: Promise<YTNamespace> | null = null;

type YTWindow = {
	YT?: YTNamespace;
	onYouTubeIframeAPIReady?: (() => void) | null;
};

export function loadYouTubeIframeApi(): Promise<YTNamespace> {
	if (apiPromise) return apiPromise;

	const win = window as unknown as YTWindow;

	apiPromise = new Promise((resolve) => {
		if (win.YT?.Player) {
			resolve(win.YT);
			return;
		}

		const prev = win.onYouTubeIframeAPIReady;
		win.onYouTubeIframeAPIReady = () => {
			if (prev) prev();
			resolve(win.YT!);
		};

		if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
			const tag = document.createElement('script');
			tag.src = 'https://www.youtube.com/iframe_api';
			document.body.appendChild(tag);
		}
	});

	return apiPromise;
}
