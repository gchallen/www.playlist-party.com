<script lang="ts">
	let {
		youtubeId,
		title,
		channelName,
		addedBy,
		revealed = false,
		isPlaying = false,
		position,
		onclick
	}: {
		youtubeId: string;
		title: string;
		channelName: string;
		addedBy?: string;
		revealed?: boolean;
		isPlaying?: boolean;
		position: number;
		onclick?: () => void;
	} = $props();

	const thumbnailUrl = $derived(`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`);
</script>

<button
	class="song-card w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 text-left group"
	class:is-playing={isPlaying}
	{onclick}
>
	<span
		class="w-8 text-center font-heading font-bold text-sm flex-shrink-0"
		class:text-neon-pink={isPlaying}
		class:text-text-muted={!isPlaying}
	>
		{position}
	</span>

	<div class="relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden flex-shrink-0">
		<img src={thumbnailUrl} alt="" class="w-full h-full object-cover" loading="lazy" />
		{#if !isPlaying}
			<div
				class="absolute inset-0 bg-void/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
			>
				<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
					<path d="M8 5v14l11-7z" />
				</svg>
			</div>
		{/if}
	</div>

	<div class="flex-1 min-w-0">
		<p
			class="font-heading font-semibold text-sm truncate"
			class:text-neon-pink={isPlaying}
			class:text-text-primary={!isPlaying}
		>
			{title}
		</p>
		<p class="text-text-muted text-xs truncate">{channelName}</p>
		{#if revealed && addedBy}
			<p class="text-neon-mint text-xs mt-0.5">Added by {addedBy}</p>
		{:else if addedBy}
			<p class="text-text-muted/50 text-xs mt-0.5 italic">???</p>
		{/if}
	</div>

	{#if isPlaying}
		<div class="flex items-end gap-[2px] h-5 flex-shrink-0 pr-1">
			<span class="eq-bar w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-1"></span>
			<span class="eq-bar w-[3px] rounded-sm bg-neon-cyan origin-bottom h-full animate-eq-2"></span>
			<span class="eq-bar w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-3"></span>
			<span class="eq-bar w-[3px] rounded-sm bg-neon-cyan origin-bottom h-full animate-eq-4"></span>
			<span class="eq-bar w-[3px] rounded-sm bg-neon-pink origin-bottom h-full animate-eq-5"></span>
		</div>
	{/if}
</button>

<style>
	.song-card {
		cursor: pointer;
	}

	.song-card:hover:not(.is-playing) {
		background: rgba(42, 26, 78, 0.5);
	}

	.song-card.is-playing {
		background: rgba(255, 45, 120, 0.08);
		border: 1px solid rgba(255, 45, 120, 0.15);
	}

	.song-card:not(.is-playing) {
		border: 1px solid transparent;
	}
</style>
