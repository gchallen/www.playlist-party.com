<script lang="ts">
	import { formatDuration } from '$lib/time';

	let {
		title = '',
		addedBy = '',
		youtubeId = '',
		isPlaying = false,
		currentTime = 0,
		duration = 0,
		trackIndex = 0,
		totalTracks = 0,
		currentPlaylistTime = 0,
		totalPlaylistDuration = 0,
		loopEnabled = true,
		volume = 1,
		muted = false,
		ontoggle,
		onprev,
		onnext,
		onloop,
		onseek,
		onvolume,
		onmute
	}: {
		title?: string;
		addedBy?: string;
		youtubeId?: string;
		isPlaying?: boolean;
		currentTime?: number;
		duration?: number;
		trackIndex?: number;
		totalTracks?: number;
		currentPlaylistTime?: number;
		totalPlaylistDuration?: number;
		loopEnabled?: boolean;
		volume?: number;
		muted?: boolean;
		ontoggle?: () => void;
		onprev?: (() => void) | null;
		onnext?: (() => void) | null;
		onloop?: () => void;
		onseek?: (seconds: number) => void;
		onvolume?: (vol: number) => void;
		onmute?: () => void;
	} = $props();

	const thumbnailUrl = $derived(
		youtubeId ? `https://img.youtube.com/vi/${youtubeId}/default.jpg` : ''
	);

	const seekPercent = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
</script>

<div class="glass rounded-2xl px-3 py-2.5 space-y-2">
	<!-- Row 1: Track Info -->
	<div class="flex items-center gap-3 min-w-0">
		<!-- Thumbnail -->
		{#if thumbnailUrl}
			<img
				src={thumbnailUrl}
				alt=""
				class="w-[80px] h-[45px] rounded-lg object-cover flex-shrink-0 bg-surface"
			/>
		{:else}
			<div class="w-[80px] h-[45px] rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
				<svg class="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
			</div>
		{/if}

		<!-- Title + Added by -->
		<div class="flex-1 min-w-0">
			<p class="font-heading font-semibold text-sm text-text-primary truncate">
				{title || 'No track selected'}
			</p>
			{#if addedBy}
				<p class="text-text-secondary text-xs truncate">Added by {addedBy}</p>
			{/if}
		</div>

		<!-- Track X of Y -->
		{#if totalTracks > 0}
			<span class="text-text-muted text-xs font-heading flex-shrink-0 whitespace-nowrap">
				Track {trackIndex} of {totalTracks}
			</span>
		{/if}
	</div>

	<!-- Row 2: Controls -->
	<div class="flex items-center gap-1.5">
		<!-- Loop -->
		<button
			onclick={onloop}
			class="p-1.5 rounded-lg transition-colors {loopEnabled ? 'text-neon-cyan' : 'text-text-muted hover:text-text-secondary'}"
			aria-label="Loop"
			title={loopEnabled ? 'Loop on' : 'Loop off'}
		>
			<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
		</button>

		<!-- Previous -->
		<button
			onclick={onprev ?? undefined}
			disabled={!onprev}
			class="p-1.5 rounded-lg text-text-muted transition-colors"
			class:hover:text-neon-cyan={!!onprev}
			class:opacity-30={!onprev}
			aria-label="Previous"
		>
			<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
		</button>

		<!-- Play/Pause (larger) -->
		<button
			onclick={ontoggle}
			class="p-2 rounded-full transition-colors {isPlaying || youtubeId ? 'bg-neon-pink/10 text-neon-pink hover:bg-neon-pink/20' : 'bg-surface text-text-muted opacity-30'}"
			aria-label={isPlaying ? 'Pause' : 'Play'}
		>
			{#if isPlaying}
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
			{:else}
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
			{/if}
		</button>

		<!-- Next -->
		<button
			onclick={onnext ?? undefined}
			disabled={!onnext}
			class="p-1.5 rounded-lg text-text-muted transition-colors"
			class:hover:text-neon-cyan={!!onnext}
			class:opacity-30={!onnext}
			aria-label="Next"
		>
			<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
		</button>

		<!-- Current time box -->
		<div class="text-right flex-shrink-0 ml-1" style="min-width: 3rem;">
			<div class="text-xs font-heading text-text-primary leading-tight">{formatDuration(currentTime)}</div>
			<div class="text-[10px] font-heading text-text-muted leading-tight">{formatDuration(currentPlaylistTime)}</div>
		</div>

		<!-- Seek slider -->
		<input
			type="range"
			min="0"
			max={duration || 1}
			step="1"
			value={currentTime}
			oninput={(e) => onseek?.(Number(e.currentTarget.value))}
			class="seek-slider flex-1 h-1 min-w-0"
			aria-label="Seek"
		/>

		<!-- Duration box -->
		<div class="text-left flex-shrink-0" style="min-width: 3rem;">
			<div class="text-xs font-heading text-text-primary leading-tight">{formatDuration(duration)}</div>
			<div class="text-[10px] font-heading text-text-muted leading-tight">{formatDuration(totalPlaylistDuration)}</div>
		</div>

		<!-- Mute -->
		<button
			onclick={onmute}
			class="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors ml-1"
			aria-label={muted ? 'Unmute' : 'Mute'}
		>
			{#if muted || volume === 0}
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
			{:else if volume < 0.5}
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
			{:else}
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
			{/if}
		</button>

		<!-- Volume slider -->
		<input
			type="range"
			min="0"
			max="1"
			step="0.01"
			value={muted ? 0 : volume}
			oninput={(e) => onvolume?.(Number(e.currentTarget.value))}
			class="volume-slider h-1 flex-shrink-0"
			style="width: 60px;"
			aria-label="Volume"
		/>
	</div>
</div>

<style>
	.seek-slider,
	.volume-slider {
		-webkit-appearance: none;
		appearance: none;
		background: var(--color-surface);
		border-radius: 9999px;
		cursor: pointer;
	}

	.seek-slider::-webkit-slider-thumb,
	.volume-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-neon-pink);
		cursor: pointer;
	}

	.seek-slider::-moz-range-thumb,
	.volume-slider::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-neon-pink);
		border: none;
		cursor: pointer;
	}
</style>
