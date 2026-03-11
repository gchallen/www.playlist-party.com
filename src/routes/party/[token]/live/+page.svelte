<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte';

	let { data } = $props();

	type DisplayMode = 'overlay' | 'split';

	// Display-only mode: polls for song changes, no auto-advance
	const isDisplay = $derived($page.url.searchParams.has('display'));

	let displayMode = $state<DisplayMode>('split');
	let currentIndex = $state(0);
	let isPlaying = $state(false);
	let likeCount = $state(0);
	let ytPlayer = $state<YouTubePlayer>();
	let wakeLock = $state<WakeLockSentinel | null>(null);

	const currentSong = $derived(data.songs[currentIndex]);
	const nextSongs = $derived(data.songs.slice(currentIndex + 1, currentIndex + 4));
	const hasNext = $derived(currentIndex < data.songs.length - 1);
	const hasPrev = $derived(currentIndex > 0);

	// On mount: set now playing (primary only) and request wake lock
	$effect(() => {
		if (!isDisplay && data.songs.length > 0) {
			postNowPlaying({ songId: data.songs[0].id });
		}
		requestWakeLock();
		return () => {
			wakeLock?.release();
		};
	});

	// Poll for like count + detect external song changes
	$effect(() => {
		const interval = setInterval(pollState, 5000);
		return () => clearInterval(interval);
	});

	// Keyboard shortcuts
	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'v' || e.key === 'V') {
				displayMode = displayMode === 'overlay' ? 'split' : 'overlay';
			} else if (e.key === 'ArrowRight' && hasNext) {
				skipNext();
			} else if (e.key === 'ArrowLeft' && hasPrev) {
				skipPrev();
			} else if (e.key === ' ') {
				e.preventDefault();
				ytPlayer?.togglePlayPause();
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	// beforeunload warning (primary only)
	$effect(() => {
		if (isDisplay) return;
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			e.preventDefault();
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	async function requestWakeLock() {
		try {
			if ('wakeLock' in navigator) {
				wakeLock = await navigator.wakeLock.request('screen');
			}
		} catch {
			// Wake lock not supported or denied
		}
	}

	async function postNowPlaying(body: { songId: number | null } | { action: 'next' | 'prev' }) {
		try {
			await fetch(`/api/party/${data.token}/now-playing`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
		} catch {
			// Ignore errors
		}
	}

	async function pollState() {
		try {
			const res = await fetch(`/api/party/${data.token}/now-playing`);
			if (!res.ok) return;
			const d = await res.json();
			if (d.active) {
				likeCount = d.likeCount ?? 0;
				// Detect external song change (from another device/tab)
				if (d.songId && currentSong && d.songId !== currentSong.id) {
					const newIdx = data.songs.findIndex((s) => s.id === d.songId);
					if (newIdx !== -1) {
						currentIndex = newIdx;
					}
				}
			}
		} catch {
			// Ignore
		}
	}

	function skipNext() {
		if (!hasNext) return;
		currentIndex++;
		if (isDisplay) {
			postNowPlaying({ action: 'next' });
		} else {
			postNowPlaying({ songId: currentSong.id });
		}
	}

	function skipPrev() {
		if (!hasPrev) return;
		currentIndex--;
		if (isDisplay) {
			postNowPlaying({ action: 'prev' });
		} else {
			postNowPlaying({ songId: currentSong.id });
		}
	}

	function onSongEnded() {
		// Only auto-advance on the primary controller
		if (!isDisplay && hasNext) {
			skipNext();
		}
	}

	function formatDuration(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>{isDisplay ? 'Display' : 'DJ Live'} — {data.party.name}</title>
</svelte:head>

{#if data.songs.length === 0}
	<div class="h-screen flex items-center justify-center bg-void">
		<p class="text-text-muted text-lg">No songs in the playlist yet.</p>
	</div>
{:else}
	<div class="live-screen h-screen w-screen overflow-hidden bg-black text-white flex flex-col" data-theme="dark">
		{#if displayMode === 'overlay'}
			<!-- Overlay mode: video fills screen, info bar overlaid at bottom -->
			<div class="relative flex-1">
				<div class="absolute inset-0">
					<div
						class="w-full h-full [&_.glass]:rounded-none [&_.glass]:border-0 [&_.player-container]:!aspect-auto [&_.player-container]:!h-full"
					>
						<YouTubePlayer
							bind:this={ytPlayer}
							videoId={currentSong.youtubeId}
							autoplay={true}
							onended={onSongEnded}
							onplaystatechange={(playing) => (isPlaying = playing)}
						/>
					</div>
				</div>

				<!-- Overlay info bar -->
				<div
					class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-20 pb-6 px-6"
				>
					<div class="flex items-end justify-between gap-4">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-2">
								<div class="flex items-end gap-[2px] h-4">
									<span class="w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-1"></span>
									<span class="w-[3px] rounded-sm bg-neon-cyan origin-bottom h-full animate-eq-2"></span>
									<span class="w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-3"></span>
								</div>
								<span class="text-xs font-heading uppercase tracking-wider text-neon-pink">Now Playing</span>
								<span class="text-xs text-white/50 ml-2">{currentIndex + 1} / {data.songs.length}</span>
							</div>
							<h2 class="text-2xl md:text-3xl font-heading font-bold truncate">{currentSong.title}</h2>
							<p class="text-white/60 text-sm md:text-base">{currentSong.channelName}</p>
							<p class="text-neon-mint text-sm mt-1">Added by {currentSong.addedByName}</p>
						</div>

						<div class="flex items-center gap-3 flex-shrink-0">
							<div class="flex items-center gap-1.5 text-neon-pink">
								<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
									/>
								</svg>
								<span class="text-lg font-heading font-bold">{likeCount}</span>
							</div>
						</div>
					</div>

					{#if nextSongs.length > 0}
						<div class="mt-4 flex gap-2">
							<span class="text-xs text-white/40 uppercase tracking-wider self-center mr-1">Up next</span>
							{#each nextSongs as song (song.id)}
								<div class="flex items-center gap-2 bg-white/10 rounded-lg px-2 py-1.5">
									<img src={song.thumbnail} alt="" class="w-8 h-8 rounded object-cover" />
									<span class="text-xs truncate max-w-[120px]">{song.title}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Split mode: video 60%, info panel below -->
			<div class="flex-[6] min-h-0">
				<div
					class="w-full h-full [&_.glass]:rounded-none [&_.glass]:border-0 [&_.player-container]:!aspect-auto [&_.player-container]:!h-full"
				>
					<YouTubePlayer
						bind:this={ytPlayer}
						videoId={currentSong.youtubeId}
						autoplay={true}
						onended={onSongEnded}
						onplaystatechange={(playing) => (isPlaying = playing)}
					/>
				</div>
			</div>

			<div class="flex-[4] bg-[#111] flex flex-col p-6 min-h-0">
				<div class="flex items-start justify-between gap-4 mb-4">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-2">
							<div class="flex items-end gap-[2px] h-5">
								<span class="w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-1"></span>
								<span class="w-[3px] rounded-sm bg-neon-cyan origin-bottom h-full animate-eq-2"></span>
								<span class="w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-3"></span>
								<span class="w-[3px] rounded-sm bg-neon-cyan origin-bottom h-full animate-eq-4"></span>
								<span class="w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-5"></span>
							</div>
							<span class="text-sm font-heading uppercase tracking-wider text-neon-pink">Now Playing</span>
							<span class="text-sm text-white/40 ml-2">{currentIndex + 1} / {data.songs.length}</span>
						</div>
						<h2 class="text-3xl md:text-4xl font-heading font-bold leading-tight">{currentSong.title}</h2>
						<p class="text-white/50 text-lg mt-1">{currentSong.channelName}</p>
						<p class="text-neon-mint text-base mt-2">Added by {currentSong.addedByName}</p>
					</div>

					<div class="flex flex-col items-center gap-1 flex-shrink-0">
						<div class="flex items-center gap-1.5 text-neon-pink">
							<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
								<path
									d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
								/>
							</svg>
							<span class="text-2xl font-heading font-bold">{likeCount}</span>
						</div>
						<span class="text-xs text-white/30">likes</span>
					</div>
				</div>

				{#if nextSongs.length > 0}
					<div class="mt-auto">
						<span class="text-xs text-white/40 uppercase tracking-wider mb-2 block">Up next</span>
						<div class="flex gap-3">
							{#each nextSongs as song (song.id)}
								<div class="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2 flex-1 min-w-0">
									<img src={song.thumbnail} alt="" class="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
									<div class="min-w-0">
										<p class="text-sm font-heading font-semibold truncate">{song.title}</p>
										<p class="text-xs text-white/40">{song.addedByName} · {formatDuration(song.durationSeconds)}</p>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Controls bar -->
		<div
			class="controls-bar absolute top-4 right-4 flex items-center gap-2 z-50 opacity-0 hover:opacity-100 transition-opacity duration-300"
		>
			{#if isDisplay}
				<span class="px-2 py-1 rounded-full bg-neon-cyan/20 text-neon-cyan text-xs font-heading font-semibold mr-1"
					>DISPLAY</span
				>
			{/if}

			<button
				onclick={() => {
					if (hasPrev) skipPrev();
				}}
				disabled={!hasPrev}
				class="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white disabled:opacity-30 transition-all"
				title="Previous (Left arrow)"
			>
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
			</button>

			<button
				onclick={() => ytPlayer?.togglePlayPause()}
				class="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all"
				title="Play/Pause (Space)"
			>
				{#if isPlaying}
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg
					>
				{:else}
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
				{/if}
			</button>

			<button
				onclick={() => {
					if (hasNext) skipNext();
				}}
				disabled={!hasNext}
				class="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white disabled:opacity-30 transition-all"
				title="Next (Right arrow)"
			>
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"
					><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg
				>
			</button>

			<button
				onclick={() => (displayMode = displayMode === 'overlay' ? 'split' : 'overlay')}
				class="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all"
				title="Toggle layout (V)"
			>
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					{#if displayMode === 'overlay'}
						<rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="14" x2="21" y2="14" />
					{:else}
						<rect x="3" y="3" width="18" height="18" rx="2" />
					{/if}
				</svg>
			</button>

			<form method="POST" action="?/stopPartyMode" use:enhance class="inline">
				<button
					type="submit"
					class="p-2 rounded-full bg-neon-pink/80 hover:bg-neon-pink text-white transition-all"
					title="End Party Mode"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	.controls-bar:focus-within {
		opacity: 1;
	}

	/* Always show controls on touch devices */
	@media (hover: none) {
		.controls-bar {
			opacity: 1 !important;
		}
	}
</style>
