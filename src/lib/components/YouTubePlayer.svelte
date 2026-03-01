<script lang="ts">
	import { untrack } from 'svelte';

	let {
		videoId = '',
		autoplay = false,
		onended,
		onready,
		onerror
	}: {
		videoId?: string;
		autoplay?: boolean;
		onended?: () => void;
		onready?: () => void;
		onerror?: (code: number) => void;
	} = $props();

	let expanded = $state(false);
	let playerReady = $state(false);
	let player: any = null;
	const containerId = `yt-${Math.random().toString(36).slice(2, 9)}`;

	$effect(() => {
		if (typeof window === 'undefined') return;

		const initialVideoId = untrack(() => videoId);
		const shouldAutoplay = untrack(() => autoplay);

		const initPlayer = () => {
			const el = document.getElementById(containerId);
			if (!el) return;

			player = new (window as any).YT.Player(containerId, {
				width: '100%',
				height: '100%',
				videoId: initialVideoId || undefined,
				playerVars: {
					autoplay: shouldAutoplay ? 1 : 0,
					modestbranding: 1,
					rel: 0,
					playsinline: 1
				},
				events: {
					onReady: () => {
						playerReady = true;
						onready?.();
					},
					onStateChange: (e: any) => {
						if (e.data === (window as any).YT.PlayerState.ENDED) {
							onended?.();
						}
					},
					onError: (e: any) => {
						onerror?.(e.data);
					}
				}
			});
		};

		if ((window as any).YT?.Player) {
			initPlayer();
		} else {
			const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
			if (!existing) {
				const tag = document.createElement('script');
				tag.src = 'https://www.youtube.com/iframe_api';
				document.head.appendChild(tag);
			}
			(window as any).onYouTubeIframeAPIReady = initPlayer;
		}

		return () => {
			if (player?.destroy) player.destroy();
		};
	});

	$effect(() => {
		if (!player || !playerReady || !videoId) return;
		if (autoplay) {
			player.loadVideoById(videoId);
		} else {
			player.cueVideoById(videoId);
		}
	});
</script>

{#if videoId}
	<div class="fixed bottom-0 left-0 right-0 z-40 transition-all duration-300">
		<div
			class="glass-strong mx-auto transition-all duration-300"
			class:rounded-t-2xl={!expanded}
			class:max-w-sm={!expanded}
			class:mx-4={!expanded}
			class:w-full={expanded}
		>
			<div class="flex items-center justify-between px-3 py-2 border-b border-neon-purple/15">
				<span class="font-heading text-xs font-semibold text-neon-cyan tracking-wider uppercase"
					>Now Playing</span
				>
				<button
					class="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
					onclick={() => (expanded = !expanded)}
					aria-label={expanded ? 'Collapse player' : 'Expand player'}
				>
					<svg
						class="w-4 h-4 transition-transform duration-200"
						class:rotate-180={expanded}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M18 15l-6-6-6 6" />
					</svg>
				</button>
			</div>

			<div class="player-container relative bg-void/50" class:expanded>
				<div id={containerId} class="absolute inset-0"></div>
				{#if !playerReady}
					<div class="absolute inset-0 flex items-center justify-center">
						<div
							class="w-8 h-8 border-2 border-neon-purple/30 border-t-neon-purple rounded-full animate-spin"
						></div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.player-container {
		aspect-ratio: 16 / 9;
		max-height: 200px;
	}

	.player-container.expanded {
		max-height: 70vh;
	}
</style>
