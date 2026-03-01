<script lang="ts">
	import { enhance } from '$app/forms';
	import { renderComment } from '$lib/comment';

	let {
		youtubeId,
		title,
		channelName,
		addedBy,
		revealed = false,
		isMine = false,
		isPlaying = false,
		position,
		showControls = false,
		songId,
		canMoveUp = false,
		canMoveDown = false,
		token,
		comment,
		onclick
	}: {
		youtubeId: string;
		title: string;
		channelName: string;
		addedBy?: string | null;
		revealed?: boolean;
		isMine?: boolean;
		isPlaying?: boolean;
		position: number;
		showControls?: boolean;
		songId?: number;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		token?: string;
		comment?: string | null;
		onclick?: () => void;
	} = $props();

	let expanded = $state(false);

	const thumbnailUrl = $derived(`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`);

	function toggleExpand(e: MouseEvent) {
		// Don't toggle if clicking on a button or form control
		if ((e.target as HTMLElement).closest('button, form, a')) return;
		if (comment) expanded = !expanded;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="song-card w-full rounded-xl transition-all duration-200 text-left group"
	class:is-playing={isPlaying}
	class:cursor-pointer={!!comment}
	onclick={toggleExpand}
>
	<div class="flex items-center gap-3 p-2">
		<span
			class="w-8 text-center font-heading font-bold text-sm flex-shrink-0"
			class:text-neon-pink={isPlaying}
			class:text-text-muted={!isPlaying}
		>
			{position}
		</span>

		<button class="relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden flex-shrink-0" {onclick}>
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
		</button>

		<div class="flex-1 min-w-0">
			<p
				class="font-heading font-semibold text-sm truncate"
				class:text-neon-pink={isPlaying}
				class:text-text-primary={!isPlaying}
			>
				{title}
			</p>
			<p class="text-text-muted text-xs truncate">
				{channelName}
				{#if comment}
					<svg class="inline-block w-3 h-3 ml-1 -mt-0.5 text-neon-purple/60" viewBox="0 0 24 24" fill="currentColor">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
					</svg>
				{/if}
			</p>
			{#if revealed && addedBy}
				<p class="text-neon-mint text-xs mt-0.5">Added by {addedBy}</p>
			{:else if isMine}
				<p class="text-neon-cyan/60 text-xs mt-0.5">Your song</p>
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

		{#if showControls && songId !== undefined && token}
			<div class="flex items-center gap-1 flex-shrink-0">
				{#if canMoveUp}
					<form method="POST" action="/party/{token}?/reorderSong" use:enhance>
						<input type="hidden" name="songId" value={songId} />
						<input type="hidden" name="direction" value="up" />
						<button type="submit" data-testid="move-up-btn" class="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-neon-cyan transition-colors" title="Move up">
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
						</button>
					</form>
				{/if}
				{#if canMoveDown}
					<form method="POST" action="/party/{token}?/reorderSong" use:enhance>
						<input type="hidden" name="songId" value={songId} />
						<input type="hidden" name="direction" value="down" />
						<button type="submit" data-testid="move-down-btn" class="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-neon-cyan transition-colors" title="Move down">
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
						</button>
					</form>
				{/if}
				<form method="POST" action="/party/{token}?/removeSong" use:enhance>
					<input type="hidden" name="songId" value={songId} />
					<button type="submit" data-testid="remove-song-btn" class="p-1.5 rounded-lg hover:bg-neon-pink/10 text-text-muted hover:text-neon-pink transition-colors" title="Remove song">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
					</button>
				</form>
			</div>
		{/if}
	</div>

	{#if comment && expanded}
		<div class="comment-box mx-2 mb-2 ml-12 p-2.5 rounded-lg bg-surface/60 border border-neon-purple/10 text-xs text-text-secondary font-heading leading-relaxed">
			{@html renderComment(comment)}
		</div>
	{/if}
</div>

<style>
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

	.comment-box :global(a) {
		color: var(--color-neon-cyan);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.comment-box :global(a:hover) {
		color: var(--color-neon-pink);
	}
</style>
