<script lang="ts">
	let {
		token,
		isAccepted
	}: {
		token: string;
		isAccepted: boolean;
	} = $props();

	type NowPlayingData = {
		active: boolean;
		songId?: number;
		youtubeId?: string;
		title?: string;
		channelName?: string;
		thumbnail?: string;
		addedByName?: string;
		position?: number;
		totalSongs?: number;
		likeCount?: number;
		liked?: boolean;
	};

	let nowPlaying = $state<NowPlayingData>({ active: false });
	let likeLoading = $state(false);

	async function fetchNowPlaying() {
		try {
			const res = await fetch(`/api/party/${token}/now-playing`);
			if (res.ok) {
				nowPlaying = await res.json();
			}
		} catch {
			// Silently ignore fetch errors
		}
	}

	async function toggleLike() {
		if (!nowPlaying.active || !nowPlaying.songId || !isAccepted || likeLoading) return;
		likeLoading = true;

		// Optimistic update
		const wasLiked = nowPlaying.liked;
		nowPlaying.liked = !wasLiked;
		nowPlaying.likeCount = (nowPlaying.likeCount ?? 0) + (wasLiked ? -1 : 1);

		try {
			const res = await fetch(`/api/party/${token}/like`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ songId: nowPlaying.songId })
			});
			if (res.ok) {
				const data = await res.json();
				nowPlaying.liked = data.liked;
				nowPlaying.likeCount = data.likeCount;
			} else {
				// Revert on error
				nowPlaying.liked = wasLiked;
				nowPlaying.likeCount = (nowPlaying.likeCount ?? 0) + (wasLiked ? 1 : -1);
			}
		} catch {
			nowPlaying.liked = wasLiked;
			nowPlaying.likeCount = (nowPlaying.likeCount ?? 0) + (wasLiked ? 1 : -1);
		} finally {
			likeLoading = false;
		}
	}

	$effect(() => {
		fetchNowPlaying();
		const interval = setInterval(fetchNowPlaying, 5000);
		return () => clearInterval(interval);
	});
</script>

{#if nowPlaying.active}
	<div class="now-playing-card glass-strong rounded-2xl p-4 mb-6 animate-fade-in">
		<div class="flex items-center gap-2 mb-3">
			<div class="flex items-end gap-[2px] h-4">
				<span class="eq-bar w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-1"></span>
				<span class="eq-bar w-[3px] rounded-sm bg-neon-cyan origin-bottom h-full animate-eq-2"></span>
				<span class="eq-bar w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-3"></span>
			</div>
			<span class="text-xs font-heading font-semibold text-neon-pink uppercase tracking-wider">Now Playing</span>
		</div>

		<div class="flex gap-3">
			{#if nowPlaying.thumbnail}
				<div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
					<img src={nowPlaying.thumbnail} alt="" class="w-full h-full object-cover" />
				</div>
			{/if}
			<div class="flex-1 min-w-0">
				<p class="font-heading font-semibold text-sm text-text-primary truncate">{nowPlaying.title}</p>
				<p class="text-text-secondary text-xs truncate">{nowPlaying.channelName}</p>
				{#if nowPlaying.addedByName}
					<p class="text-neon-mint text-xs mt-0.5">Added by {nowPlaying.addedByName}</p>
				{/if}
			</div>
			<div class="flex flex-col items-center justify-center flex-shrink-0">
				<button
					onclick={toggleLike}
					disabled={!isAccepted || likeLoading}
					class="like-btn p-2 rounded-full transition-all duration-200"
					class:liked={nowPlaying.liked}
					class:opacity-40={!isAccepted}
					title={isAccepted ? (nowPlaying.liked ? 'Unlike' : 'Like') : 'Accept invite to like songs'}
				>
					<svg class="w-6 h-6" viewBox="0 0 24 24" fill={nowPlaying.liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
						<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
					</svg>
				</button>
				<span class="text-xs font-heading text-text-muted mt-0.5">{nowPlaying.likeCount ?? 0}</span>
			</div>
		</div>

		{#if nowPlaying.position && nowPlaying.totalSongs}
			<div class="mt-2 text-xs text-text-muted text-right">
				{nowPlaying.position} / {nowPlaying.totalSongs}
			</div>
		{/if}
	</div>
{/if}

<style>
	.like-btn {
		color: var(--color-text-muted);
	}
	.like-btn:hover:not(:disabled) {
		color: var(--color-neon-pink);
	}
	.like-btn.liked {
		color: var(--color-neon-pink);
	}
</style>
