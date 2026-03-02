<script lang="ts">
	let {
		title = '',
		addedBy = '',
		isPlaying = false,
		progress = 0,
		videoId = '',
		onprev,
		onnext,
		ontoggle
	}: {
		title?: string;
		addedBy?: string;
		isPlaying?: boolean;
		progress?: number;
		videoId?: string;
		onprev?: (() => void) | null;
		onnext?: (() => void) | null;
		ontoggle?: () => void;
	} = $props();
</script>

<div class="glass rounded-2xl px-3 py-2.5">
	{#if title}
		<div class="mb-2 min-w-0">
			<p class="font-heading font-semibold text-sm text-text-primary truncate">{title}</p>
			{#if addedBy}
				<p class="text-text-secondary text-xs truncate">Added by {addedBy}</p>
			{/if}
		</div>
	{/if}

	<div class="h-1 bg-surface rounded-full overflow-hidden mb-2.5">
		<div class="h-full rounded-full transition-all duration-300 bg-neon-pink" style="width: {progress}%;"></div>
	</div>

	<div class="flex items-center justify-center gap-2">
		<button
			onclick={onprev ?? undefined}
			disabled={!onprev}
			class="p-1.5 rounded-lg text-text-muted transition-colors"
			class:hover:text-neon-cyan={!!onprev}
			class:opacity-30={!onprev}
			aria-label="Previous"
		>
			<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
		</button>

		<button
			onclick={ontoggle}
			disabled={!videoId}
			class="p-2 rounded-full transition-colors {videoId ? 'bg-neon-pink/10 text-neon-pink hover:bg-neon-pink/20' : 'bg-surface text-text-muted opacity-30'}"
			aria-label={isPlaying ? 'Pause' : 'Play'}
		>
			{#if isPlaying}
				<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
			{:else}
				<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
			{/if}
		</button>

		<button
			onclick={onnext ?? undefined}
			disabled={!onnext}
			class="p-1.5 rounded-lg text-text-muted transition-colors"
			class:hover:text-neon-cyan={!!onnext}
			class:opacity-30={!onnext}
			aria-label="Next"
		>
			<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
		</button>
	</div>
</div>
