<script lang="ts">
	import { enhance } from '$app/forms';
	import PartyHeader from '$lib/components/PartyHeader.svelte';
	import SongCard from '$lib/components/SongCard.svelte';

	let { data, form } = $props();

	function formatDuration(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	const totalSongsMax = $derived(data.party.maxAttendees);
	const playlistFillPercent = $derived(
		totalSongsMax > 0 ? Math.min((data.totalSongs / totalSongsMax) * 100, 100) : 0
	);

	// Estimate target duration from endTime - time
	const targetDurationSeconds = $derived.by(() => {
		if (!data.party.time || !data.party.endTime) return null;
		function parseTime(t: string): number | null {
			const match = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
			if (!match) return null;
			let hours = parseInt(match[1], 10);
			const minutes = parseInt(match[2], 10);
			const period = match[3];
			if (period) {
				if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
				if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
			}
			return hours * 3600 + minutes * 60;
		}
		const start = parseTime(data.party.time);
		const end = parseTime(data.party.endTime);
		if (start === null || end === null) return null;
		let diff = end - start;
		if (diff <= 0) diff += 24 * 3600;
		return diff;
	});
</script>

<svelte:head>
	<title>Dashboard - {data.party.name} - Playlist Party</title>
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
		/>

		<div class="mt-3 flex flex-wrap gap-3 text-xs font-heading">
			<a
				href="/party/{data.party.partyCode}"
				class="text-neon-cyan hover:text-neon-cyan/80 transition-colors"
			>
				View Playlist
			</a>
			{#if data.attendee.depth === 0 && data.adminToken}
				<span class="text-text-muted/30">|</span>
				<a
					href="/party/{data.party.partyCode}/admin/{data.adminToken}"
					class="text-neon-purple hover:text-neon-purple/80 transition-colors"
					data-testid="admin-link"
				>
					Admin Dashboard
				</a>
			{/if}
			<span class="text-text-muted/30">|</span>
			<span class="text-text-muted">
				{data.acceptedCount} / {data.party.maxAttendees} attendees
			</span>
		</div>

		<!-- Welcome bar -->
		<div class="mt-6 glass rounded-2xl p-5">
			<div class="flex items-center justify-between flex-wrap gap-3">
				<div>
					<p class="font-heading font-bold text-text-primary">
						Welcome, {data.attendee.name}!
					</p>
				</div>
			</div>
			<div class="mt-3" data-testid="song-slots">
				<div class="flex items-center gap-3 text-sm">
					<span class="font-heading text-text-secondary">
						Entry song: {#if data.hasEntrySong}<span class="text-neon-mint">&#10003;</span>{:else}<span class="text-text-muted italic">add yours</span>{/if}
					</span>
				</div>
				<div class="flex items-center gap-3 text-sm mt-1">
					<span class="font-heading text-text-secondary">
						Bonus songs: <span class="text-neon-cyan">{data.bonusSongsUsed}</span> / <span class="text-neon-mint">{data.earnedBonuses}</span> used
					</span>
					{#if !data.bonusAvailable && data.earnedBonuses > 0}
						<span class="text-xs text-text-muted italic">(bonuses paused — playlist filling up)</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Playlist Progress -->
		{#if data.party.endTime || data.totalSongs > 0}
			<div class="mt-4 glass rounded-2xl p-4" data-testid="playlist-progress">
				<div class="flex items-center justify-between mb-2">
					<span class="font-heading text-sm font-semibold text-text-secondary">
						Playlist
					</span>
					<span class="font-heading text-xs text-text-muted">
						{data.totalSongs} songs &middot; {formatDuration(data.totalDuration)}
						{#if targetDurationSeconds}
							/ {formatDuration(targetDurationSeconds)}
						{/if}
					</span>
				</div>
				<div class="h-2 bg-surface rounded-full overflow-hidden">
					{#if targetDurationSeconds}
						<div
							class="h-full rounded-full transition-all duration-500"
							style="width: {Math.min((data.totalDuration / targetDurationSeconds) * 100, 100)}%; background: linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-mint));"
						></div>
					{:else}
						<div
							class="h-full rounded-full transition-all duration-500"
							style="width: {playlistFillPercent}%; background: linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-mint));"
						></div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- My Songs -->
		<section class="mt-8">
			<h2 class="font-heading text-lg font-bold gradient-text mb-3">Your Songs</h2>

			{#if data.mySongs.length === 0}
				<div class="glass rounded-2xl p-6 text-center">
					<p class="text-text-muted text-sm">You haven't added any songs yet.</p>
				</div>
			{:else}
				<div class="glass rounded-2xl p-2 space-y-0.5">
					{#each data.mySongs as song, i}
						<SongCard
							youtubeId={song.youtubeId}
							title={song.youtubeTitle}
							channelName={song.youtubeChannelName || ''}
							position={i + 1}
						/>
					{/each}
				</div>
			{/if}

			{#if data.bonusAvailable && data.bonusSongsUsed < data.earnedBonuses}
				<div class="mt-4 glass rounded-2xl p-5">
					<h3 class="font-heading font-semibold text-sm text-text-secondary mb-3">
						Add a Bonus Song
					</h3>

					{#if form?.songError}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
						>
							{form.songError}
						</div>
					{/if}

					{#if form?.songAdded}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-mint/10 border border-neon-mint/20 text-neon-mint text-sm font-heading"
						>
							Song added!
						</div>
					{/if}

					<form method="POST" action="?/addSong" use:enhance class="flex gap-2">
						<input
							type="url"
							name="youtubeUrl"
							required
							class="flex-1 bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
							placeholder="https://youtube.com/watch?v=..."
						/>
						<button
							type="submit"
							class="font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-neon-pink text-void hover:bg-neon-pink/90 transition-colors flex-shrink-0"
						>
							Add
						</button>
					</form>
				</div>
			{/if}
		</section>

		<!-- Invites -->
		<section class="mt-8 mb-8">
			<h2 class="font-heading text-lg font-bold gradient-text mb-3">Invite Friends</h2>

			{#if form?.error}
				<div
					class="mb-3 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
				>
					{form.error}
				</div>
			{/if}

			{#if form?.inviteSent}
				<div
					class="mb-4 p-3 rounded-xl bg-neon-mint/10 border border-neon-mint/20 text-neon-mint text-sm font-heading"
					data-testid="invite-sent-success"
				>
					Invite sent to {form.inviteSent}!
				</div>
			{/if}

			{#if data.myInvites.length > 0}
				<div class="space-y-2 mb-4">
					{#each data.myInvites as invite}
						<div class="glass rounded-xl p-3 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div
									class="w-2 h-2 rounded-full flex-shrink-0"
									class:bg-neon-mint={invite.accepted}
									class:bg-text-muted={!invite.accepted}
									style={invite.accepted
										? 'box-shadow: 0 0 6px rgba(0, 255, 163, 0.5);'
										: 'opacity: 0.4;'}
								></div>
								<div>
									<span
										class="font-heading text-sm"
										class:text-text-primary={invite.accepted}
										class:text-text-muted={!invite.accepted}
									>
										{invite.name}
									</span>
									<span class="text-xs text-text-muted/60 ml-2">{invite.email}</span>
								</div>
							</div>
							<span
								class="text-xs font-heading"
								class:text-neon-mint={invite.accepted}
								class:text-text-muted={!invite.accepted}
							>
								{invite.accepted ? 'Accepted' : 'Pending'}
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<form
				method="POST"
				action="?/sendInvite"
				use:enhance
				class="glass rounded-2xl p-5"
				data-testid="invite-form"
			>
				<div class="flex flex-col sm:flex-row gap-3 mb-3">
					<div class="flex-1">
						<label for="invite-name" class="block font-heading text-xs font-semibold text-text-secondary mb-1">
							Friend's Name
						</label>
						<input
							type="text"
							id="invite-name"
							name="name"
							required
							data-testid="invite-name"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
							placeholder="Their name"
						/>
					</div>
					<div class="flex-1">
						<label for="invite-email" class="block font-heading text-xs font-semibold text-text-secondary mb-1">
							Friend's Email
						</label>
						<input
							type="email"
							id="invite-email"
							name="email"
							required
							data-testid="invite-email"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
							placeholder="friend@email.com"
						/>
					</div>
				</div>
				<button
					type="submit"
					data-testid="send-invite-btn"
					class="inline-flex items-center gap-2 font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-surface-light text-text-primary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200"
				>
					<svg
						class="w-4 h-4 text-neon-cyan"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					>
						<path d="M22 2L11 13" />
						<path d="M22 2L15 22L11 13L2 9L22 2Z" />
					</svg>
					Send Invite
				</button>
				<p class="text-text-muted/60 text-xs mt-2 ml-1">
					Each accepted invite gives you +1 bonus song slot!
				</p>
			</form>
		</section>
	</div>
</div>
