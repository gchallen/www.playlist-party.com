<script lang="ts">
	import PartyHeader from '$lib/components/PartyHeader.svelte';
	import SongCard from '$lib/components/SongCard.svelte';

	let { data } = $props();

	function formatDuration(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		return `${minutes}m`;
	}

	function formatPlayTime(startsAtSeconds: number): string {
		if (data.party.time) {
			const [h, m] = data.party.time.split(':').map(Number);
			const startMinutes = h * 60 + m;
			const playMinutes = startMinutes + Math.floor(startsAtSeconds / 60);
			const playHour = Math.floor(playMinutes / 60) % 24;
			const playMin = playMinutes % 60;
			const ampm = playHour >= 12 ? 'PM' : 'AM';
			const displayHour = playHour % 12 || 12;
			return `~${displayHour}:${String(playMin).padStart(2, '0')} ${ampm}`;
		}
		const mins = Math.floor(startsAtSeconds / 60);
		const secs = startsAtSeconds % 60;
		return `~+${mins}:${String(secs).padStart(2, '0')}`;
	}

	const endTimeSeconds = $derived(() => {
		if (!data.party.endTime || !data.party.time) return null;
		const [sh, sm] = data.party.time.split(':').map(Number);
		const [eh, em] = data.party.endTime.split(':').map(Number);
		let diff = (eh * 60 + em) - (sh * 60 + sm);
		if (diff <= 0) diff += 24 * 60;
		return diff * 60;
	});

	const progressPercent = $derived(() => {
		const end = endTimeSeconds();
		if (end && end > 0) {
			return Math.min(100, (data.totalDurationSeconds / end) * 100);
		}
		return null;
	});
</script>

<svelte:head>
	<title>{data.party.name} - Playlist Party</title>
</svelte:head>

<div class="min-h-screen px-4 py-8 md:py-12">
	<div class="max-w-2xl mx-auto">
		<div class="text-center mb-6">
			<a
				href="/"
				class="inline-block font-display text-lg text-neon-pink neon-text-subtle tracking-wider"
			>
				PLAYLIST PARTY
			</a>
		</div>

		<PartyHeader
			name={data.party.name}
			date={data.party.date}
			time={data.party.time}
			location={data.party.location}
			description={data.party.description}
		/>

		<!-- Stats bar -->
		<div class="mt-6 glass rounded-2xl p-4">
			<div class="flex items-center justify-between gap-4 text-sm">
				<span class="text-text-muted font-heading">
					<span class="text-neon-cyan font-bold">{data.acceptedCount}</span> guest{data.acceptedCount === 1 ? '' : 's'}
				</span>
				<div class="flex-1" data-testid="playlist-progress">
					{#if data.totalDurationSeconds > 0}
						<div class="flex items-center gap-3">
							<div class="flex-1 h-2 bg-surface rounded-full overflow-hidden">
								{#if progressPercent() !== null}
									<div
										class="h-full rounded-full transition-all duration-500"
										style="width: {progressPercent()}%; background: linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-purple));"
									></div>
								{:else}
									<div
										class="h-full rounded-full"
										style="width: 100%; background: linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-purple)); opacity: 0.5;"
									></div>
								{/if}
							</div>
							<span class="text-text-muted text-xs font-heading whitespace-nowrap" data-testid="total-duration">
								{formatDuration(data.totalDurationSeconds)}{#if endTimeSeconds()} / {formatDuration(endTimeSeconds()!)}{/if}
							</span>
						</div>
					{:else}
						<span class="text-text-muted text-xs" data-testid="total-duration">No songs yet</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="mt-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="font-heading text-xl font-bold gradient-text">Playlist</h2>
				<span class="text-text-muted text-sm font-heading">
					{data.songs.length}
					{data.songs.length === 1 ? 'track' : 'tracks'}
				</span>
			</div>

			{#if data.songs.length === 0}
				<div class="glass rounded-2xl p-10 text-center">
					<div
						class="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center opacity-30"
						style="background: linear-gradient(135deg, rgba(180, 77, 255, 0.2), rgba(255, 45, 120, 0.2));"
					>
						<svg class="w-10 h-10 text-neon-purple" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
							/>
						</svg>
					</div>
					<p class="text-text-muted">
						No songs yet. The playlist will grow as people accept their invitations!
					</p>
				</div>
			{:else}
				<div class="glass rounded-2xl p-2 space-y-0.5">
					{#each data.songs as song, i}
						<div>
							<SongCard
								youtubeId={song.youtubeId}
								title={song.youtubeTitle}
								channelName={song.youtubeChannelName || ''}
								addedBy={song.addedByName}
								revealed={data.party.isRevealed}
								position={i + 1}
							/>
							<div class="pl-10 pb-1 text-[10px] text-text-muted/60 font-heading">
								{formatPlayTime(song.startsAtSeconds)}
								{#if song.songType === 'bonus'}
									<span class="ml-1.5 text-neon-yellow/70">bonus</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
