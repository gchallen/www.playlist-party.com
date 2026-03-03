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
		isHost = false,
		isPlaying = false,
		isUnavailable = false,
		position,
		showControls = false,
		showRemove = false,
		songId,
		canMoveUp = false,
		canMoveDown = false,
		token,
		comment,
		onclick,
		startTime,
		isDraggable = false,
		ondragstart,
		ondragover,
		ondragend
	}: {
		youtubeId: string;
		title: string;
		channelName: string;
		addedBy?: string | null;
		revealed?: boolean;
		isMine?: boolean;
		isHost?: boolean;
		isPlaying?: boolean;
		isUnavailable?: boolean;
		position: number;
		showControls?: boolean;
		showRemove?: boolean;
		songId?: number;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		token?: string;
		comment?: string | null;
		onclick?: () => void;
		startTime?: string | null;
		isDraggable?: boolean;
		ondragstart?: (e: DragEvent) => void;
		ondragover?: (e: DragEvent) => void;
		ondragend?: (e: DragEvent) => void;
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
	class:cursor-pointer={!!comment && !isDraggable}
	style={isUnavailable ? 'opacity: 0.55;' : ''}
	draggable={isDraggable ? 'true' : undefined}
	{ondragstart}
	{ondragover}
	{ondragend}
	onclick={toggleExpand}
>
	<div class="flex items-center gap-3 p-2">
		<span
			class="w-14 text-left font-heading flex-shrink-0 pl-1"
			class:text-neon-pink={isPlaying}
			class:text-text-muted={!isPlaying}
		>
			<span class="font-bold text-sm">{position}</span>
			{#if startTime}
				<span class="block text-xs font-normal text-text-muted leading-tight">{startTime}</span>
			{/if}
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
			<p class="text-text-secondary text-xs truncate">
				{channelName}
				{#if comment}
					<svg class="inline-block w-3 h-3 ml-1 -mt-0.5 text-neon-purple" viewBox="0 0 24 24" fill="currentColor">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
					</svg>
				{/if}
			</p>
			{#if isMine}
				<p class="text-neon-cyan text-xs mt-0.5">You{#if isUnavailable} <span class="text-neon-yellow">(unavailable)</span>{/if}</p>
			{:else if isHost}
				<p class="text-neon-mint text-xs mt-0.5">Host</p>
			{:else if revealed && addedBy}
				<p class="text-neon-mint text-xs mt-0.5">{addedBy}{#if isUnavailable} <span class="text-neon-yellow">(unavailable)</span>{/if}</p>
			{:else}
				<p class="text-text-muted text-xs mt-0.5">Guest{#if isUnavailable} <span class="text-neon-yellow">(unavailable)</span>{/if}</p>
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

		{#if (showControls || showRemove) && songId !== undefined && token}
			<div class="flex items-center gap-1 flex-shrink-0">
				{#if showControls}
					{#if isDraggable}
						<span data-testid="drag-handle" class="p-1.5 cursor-grab text-text-muted hover:text-neon-cyan transition-colors">
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
								<circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
								<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
								<circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
							</svg>
						</span>
					{:else}
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
					{/if}
				{/if}
				{#if showRemove}
					<form method="POST" action="/party/{token}?/removeSong" use:enhance>
						<input type="hidden" name="songId" value={songId} />
						<button type="submit" data-testid="remove-song-btn" class="p-1.5 rounded-lg hover:bg-neon-pink/10 text-text-muted hover:text-neon-pink transition-colors" title="Remove song">
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
						</button>
					</form>
				{/if}
			</div>
		{/if}
	</div>

	{#if comment && expanded}
		<div class="comment-box mx-2 mb-2 ml-12 p-2.5 rounded-lg bg-surface-light border border-neon-purple/15 text-xs text-text-secondary font-heading leading-relaxed">
			{@html renderComment(comment)}
		</div>
	{/if}
</div>

<style>
	.song-card:hover:not(.is-playing) {
		background: rgba(0, 0, 0, 0.03);
	}

	:global(:root[data-theme="dark"]) .song-card:hover:not(.is-playing) {
		background: rgba(255, 255, 255, 0.04);
	}

	.song-card.is-playing {
		background: rgba(194, 48, 36, 0.06);
		border: 1px solid rgba(194, 48, 36, 0.12);
	}

	:global(:root[data-theme="dark"]) .song-card.is-playing {
		background: rgba(230, 59, 46, 0.08);
		border: 1px solid rgba(230, 59, 46, 0.15);
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
