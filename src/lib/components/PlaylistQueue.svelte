<script lang="ts">
	import SongCard from './SongCard.svelte';

	type Song = {
		id: string;
		youtubeId: string;
		title: string;
		channelName: string;
		addedBy?: string;
		position: number;
	};

	let {
		songs = [],
		currentIndex = -1,
		revealed = false,
		onplay,
		onprev,
		onnext,
		onshuffle
	}: {
		songs?: Song[];
		currentIndex?: number;
		revealed?: boolean;
		onplay?: (index: number) => void;
		onprev?: () => void;
		onnext?: () => void;
		onshuffle?: () => void;
	} = $props();
</script>

<div class="glass rounded-2xl overflow-hidden">
	<div class="p-4 md:p-5 border-b border-neon-purple/15">
		<div class="flex items-center justify-between">
			<div>
				<h2 class="font-heading font-bold text-lg gradient-text">Playlist</h2>
				<p class="text-text-muted text-sm mt-0.5">
					{songs.length}
					{songs.length === 1 ? 'track' : 'tracks'}
				</p>
			</div>
			{#if songs.length > 0}
				<div class="flex items-end gap-[2px] h-6 opacity-40" aria-hidden="true">
					<span class="w-[2px] rounded-sm bg-neon-purple origin-bottom h-full animate-eq-3"
					></span>
					<span class="w-[2px] rounded-sm bg-neon-purple origin-bottom h-full animate-eq-1"
					></span>
					<span class="w-[2px] rounded-sm bg-neon-purple origin-bottom h-full animate-eq-5"
					></span>
					<span class="w-[2px] rounded-sm bg-neon-purple origin-bottom h-full animate-eq-2"
					></span>
				</div>
			{/if}
		</div>
	</div>

	{#if songs.length > 0}
		<div class="max-h-[60vh] overflow-y-auto p-2 space-y-0.5">
			{#each songs as song, i}
				<SongCard
					youtubeId={song.youtubeId}
					title={song.title}
					channelName={song.channelName}
					addedBy={song.addedBy}
					{revealed}
					isPlaying={i === currentIndex}
					position={song.position}
					onclick={() => onplay?.(i)}
				/>
			{/each}
		</div>

		<div class="p-3 border-t border-neon-purple/15 flex items-center justify-center gap-2">
			<button
				class="control-btn p-2.5 rounded-full transition-colors"
				onclick={onprev}
				aria-label="Previous track"
			>
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
					<path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
				</svg>
			</button>

			<button
				class="control-btn p-2.5 rounded-full transition-colors"
				onclick={onnext}
				aria-label="Next track"
			>
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
					<path d="M16 18h2V6h-2v12zM4 18l8.5-6L4 6v12z" />
				</svg>
			</button>

			<div class="w-px h-6 bg-neon-purple/15 mx-1"></div>

			<button
				class="control-btn p-2.5 rounded-full transition-colors"
				onclick={onshuffle}
				aria-label="Shuffle"
			>
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
					/>
				</svg>
			</button>
		</div>
	{:else}
		<div class="p-8 text-center">
			<div
				class="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center opacity-30"
				style="background: rgba(0, 0, 0, 0.06);"
			>
				<svg class="w-8 h-8 text-neon-purple" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
					/>
				</svg>
			</div>
			<p class="text-text-muted text-sm">No tracks yet. Be the first to drop one!</p>
		</div>
	{/if}
</div>

<style>
	.control-btn {
		color: var(--color-text-secondary);
	}

	.control-btn:hover {
		color: var(--color-text-primary);
		background: var(--color-surface-light);
	}
</style>
