<script lang="ts">
	import { loadYouTubeIframeApi } from '$lib/youtube-api';

	let {
		videoId = '',
		autoplay = false,
		onended,
		onready,
		onerror,
		onplaystatechange,
		onprogress
	}: {
		videoId?: string;
		autoplay?: boolean;
		onended?: () => void;
		onready?: () => void;
		onerror?: (code: number) => void;
		onplaystatechange?: (playing: boolean) => void;
		onprogress?: (currentTime: number, duration: number) => void;
	} = $props();

	let playerReady = $state(false);
	let showEndOverlay = $state(false);
	let player: any = null;
	let playerCreated = false;
	let lastLoadedVideoId = '';
	let progressInterval: ReturnType<typeof setInterval> | null = null;
	let containerEl: HTMLDivElement;

	function startProgressTracking() {
		stopProgressTracking();
		progressInterval = setInterval(() => {
			if (!player || !playerReady) return;
			try {
				const current = player.getCurrentTime();
				const duration = player.getDuration();
				if (duration > 0) onprogress?.(current, duration);
			} catch {}
		}, 500);
	}

	function stopProgressTracking() {
		if (progressInterval) {
			clearInterval(progressInterval);
			progressInterval = null;
		}
	}

	async function createPlayer(initialVideoId: string) {
		if (playerCreated) return;
		playerCreated = true;
		lastLoadedVideoId = initialVideoId;

		const YT = await loadYouTubeIframeApi();

		const target = document.createElement('div');
		containerEl.appendChild(target);

		player = new YT.Player(target, {
			width: '100%',
			height: '100%',
			videoId: initialVideoId,
			playerVars: {
				autoplay: autoplay ? 1 : 0,
				rel: 0,
				modestbranding: 1,
				playsinline: 1
			},
			events: {
				onReady: () => {
					playerReady = true;
					onready?.();
				},
				onStateChange: (e: any) => {
					if (e.data === 1) {
						showEndOverlay = false;
						onplaystatechange?.(true);
						startProgressTracking();
					} else if (e.data === 2) {
						onplaystatechange?.(false);
						stopProgressTracking();
					} else if (e.data === 0) {
						showEndOverlay = true;
						onplaystatechange?.(false);
						const dur = player.getDuration();
						onprogress?.(dur, dur);
						stopProgressTracking();
						onended?.();
					}
				},
				onError: (e: any) => {
					onerror?.(e.data);
				}
			}
		});
	}

	$effect(() => {
		if (!videoId) return;

		if (!playerCreated) {
			createPlayer(videoId);
		} else if (player && playerReady && videoId !== lastLoadedVideoId) {
			lastLoadedVideoId = videoId;
			showEndOverlay = false;
			onprogress?.(0, 0);
			player.loadVideoById(videoId);
		}
	});

	export function togglePlayPause() {
		if (!player || !playerReady) return;
		const state = player.getPlayerState();
		if (state === 1) {
			player.pauseVideo();
		} else {
			player.playVideo();
		}
	}

	export function play() {
		if (!player || !playerReady) return;
		player.playVideo();
	}

	export function seekTo(seconds: number) {
		if (!player || !playerReady) return;
		const wasPlaying = player.getPlayerState() === 1;
		player.seekTo(seconds, true);
		if (!wasPlaying) {
			// YouTube auto-starts on seek; pause to preserve stopped state
			setTimeout(() => player.pauseVideo(), 0);
		}
	}

	export function setVolume(vol: number) {
		if (!player || !playerReady) return;
		player.setVolume(vol * 100);
	}

	export function mute() {
		if (!player || !playerReady) return;
		player.mute();
	}

	export function unmute() {
		if (!player || !playerReady) return;
		player.unMute();
	}
</script>

<div class="glass rounded-2xl overflow-hidden">
	<div class="player-container relative bg-void/50">
		<div bind:this={containerEl} class="absolute inset-0"></div>
		{#if !playerReady && videoId}
			<div class="absolute inset-0 flex items-center justify-center bg-void/80">
				<div class="w-8 h-8 border-2 border-neon-purple/30 border-t-neon-purple rounded-full animate-spin"></div>
			</div>
		{/if}
		{#if showEndOverlay}
			<button
				aria-label="Replay video"
				class="absolute inset-0 z-10 flex items-center justify-center bg-void/80 cursor-pointer border-0"
				onclick={() => { showEndOverlay = false; player?.seekTo(0, true); player?.playVideo(); }}
			>
				<svg class="w-16 h-16 text-white/70 hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	.player-container {
		aspect-ratio: 16 / 9;
	}
</style>
