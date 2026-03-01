<script lang="ts">
	import { enhance } from '$app/forms';
	import SongCard from '$lib/components/SongCard.svelte';

	let { data, form } = $props();

	function formatAvgDuration(seconds: number | null | undefined): string {
		if (!seconds) return '—';
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${String(secs).padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>Admin - {data.party.name} - Playlist Party</title>
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

		<!-- Admin header -->
		<div class="glass rounded-2xl p-6 md:p-8 neon-border">
			<div class="flex items-center gap-2 mb-2">
				<svg
					class="w-5 h-5 text-neon-yellow"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z"
					/>
				</svg>
				<span class="font-heading text-xs font-semibold text-neon-yellow uppercase tracking-wider"
					>Admin</span
				>
			</div>
			<h1 class="font-heading text-3xl md:text-4xl font-extrabold gradient-text leading-tight">
				{data.party.name}
			</h1>
			<p class="text-text-muted text-sm mt-2">
				Party Code: <code class="bg-surface px-2 py-0.5 rounded text-neon-cyan font-mono"
					>{data.party.partyCode}</code
				>
			</p>
		</div>

		<!-- Settings -->
		<div class="mt-6 glass rounded-2xl p-5" data-testid="party-settings">
			<h2 class="font-heading font-bold text-sm uppercase tracking-wider text-text-muted mb-3">
				Party Settings
			</h2>
			<div class="grid grid-cols-4 gap-4 text-center">
				<div>
					<p class="text-2xl font-heading font-bold text-neon-cyan" data-testid="max-attendees">{data.party.maxAttendees}</p>
					<p class="text-text-muted text-xs mt-0.5">Max Attendees</p>
				</div>
				<div>
					<p class="text-2xl font-heading font-bold text-neon-mint" data-testid="estimated-guests">
						{data.party.estimatedGuests ?? '—'}
					</p>
					<p class="text-text-muted text-xs mt-0.5">Expected Guests</p>
				</div>
				<div>
					<p class="text-2xl font-heading font-bold text-neon-purple" data-testid="max-depth">
						{data.party.maxDepth ?? '∞'}
					</p>
					<p class="text-text-muted text-xs mt-0.5">Max Depth</p>
				</div>
				<div>
					<p class="text-2xl font-heading font-bold text-neon-pink" data-testid="avg-song-duration">
						{formatAvgDuration(data.party.avgSongDurationSeconds)}
					</p>
					<p class="text-text-muted text-xs mt-0.5">Avg Song</p>
				</div>
			</div>
		</div>

		<!-- Reveal Names -->
		<div class="mt-6 glass rounded-2xl p-5">
			<h2 class="font-heading font-bold text-sm uppercase tracking-wider text-text-muted mb-3">
				Reveal Names
			</h2>
			{#if data.party.isRevealed || form?.revealed}
				<div class="flex items-center gap-2 text-neon-mint">
					<svg
						class="w-5 h-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					>
						<path d="M20 6L9 17l-5-5" />
					</svg>
					<span class="font-heading font-semibold text-sm">Names have been revealed!</span>
				</div>
			{:else}
				<p class="text-text-muted text-sm mb-3">
					Once revealed, everyone sees who added which song. This can't be undone!
				</p>
				<form method="POST" action="?/reveal" use:enhance>
					<button
						type="submit"
						class="inline-flex items-center gap-2 font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/20 hover:bg-neon-yellow/20 transition-all duration-200"
					>
						<svg
							class="w-4 h-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						Reveal Names
					</button>
				</form>
			{/if}
		</div>

		<!-- Attendees -->
		<section class="mt-6" data-testid="attendees-section">
			<h2 class="font-heading font-bold text-sm uppercase tracking-wider text-text-muted mb-3">
				Attendees ({data.attendees.length})
			</h2>
			<div class="space-y-1.5">
				{#each data.attendees as attendee}
					<div class="glass rounded-xl p-3 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div
								class="w-2 h-2 rounded-full flex-shrink-0"
								class:bg-neon-mint={attendee.accepted}
								class:bg-text-muted={!attendee.accepted}
								style={attendee.accepted
									? 'box-shadow: 0 0 6px rgba(0, 255, 163, 0.5);'
									: 'opacity: 0.4;'}
							></div>
							<div>
								<span
									class="font-heading text-sm"
									class:text-text-primary={attendee.accepted}
									class:text-text-muted={!attendee.accepted}
									class:italic={!attendee.accepted}
								>
									{attendee.name || 'Pending...'}
								</span>
								{#if attendee.email}
									<p class="text-text-muted/50 text-[11px]">{attendee.email}</p>
								{/if}
							</div>
							<span class="text-text-muted/40 text-xs">depth {attendee.depth}</span>
						</div>
						<span
							class="text-xs font-heading"
							class:text-neon-mint={attendee.accepted}
							class:text-text-muted={!attendee.accepted}
						>
							{attendee.accepted ? 'Accepted' : 'Pending'}
						</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- Songs -->
		<section class="mt-6 mb-8" data-testid="songs-section">
			<h2 class="font-heading font-bold text-sm uppercase tracking-wider text-text-muted mb-3">
				Songs ({data.songs.length})
			</h2>
			{#if data.songs.length > 0}
				<div class="glass rounded-2xl p-2 space-y-0.5">
					{#each data.songs as song, i}
						<div class="relative">
							<SongCard
								youtubeId={song.youtubeId}
								title={song.youtubeTitle}
								channelName={song.youtubeChannelName || ''}
								position={i + 1}
							/>
							{#if song.songType === 'bonus'}
								<span class="absolute top-2 right-2 text-[10px] font-heading font-semibold text-neon-yellow bg-neon-yellow/10 border border-neon-yellow/20 px-1.5 py-0.5 rounded-full">
									bonus
								</span>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="glass rounded-2xl p-6 text-center">
					<p class="text-text-muted text-sm">No songs yet.</p>
				</div>
			{/if}
		</section>
	</div>
</div>
