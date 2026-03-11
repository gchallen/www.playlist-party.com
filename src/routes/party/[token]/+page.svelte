<script lang="ts">
	import { dev } from '$app/environment';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import PartyHeader from '$lib/components/PartyHeader.svelte';
	import SongCard from '$lib/components/SongCard.svelte';
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte';
	import PlayerControls from '$lib/components/PlayerControls.svelte';
	import InviteTree, { type TreeNode } from '$lib/components/InviteTree.svelte';
	import NowPlayingCard from '$lib/components/NowPlayingCard.svelte';
	import { extractYouTubeId } from '$lib/youtube';
	import { MAX_COMMENT_LENGTH } from '$lib/comment';
	import { computeSongStartTimes } from '$lib/time';
	import { loadYouTubeIframeApi } from '$lib/youtube-api';
	import { pickRandomTracks } from '$lib/test-tracks';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// ─── Playback state ───
	let currentPlayingIndex = $state<number | null>(null);
	let isActuallyPlaying = $state(false);
	let currentTime = $state(0);
	let currentDuration = $state(0);
	let loopEnabled = $state(true);
	let volume = $state(1);
	let muted = $state(false);
	let ytPlayer = $state<YouTubePlayer>();

	// ─── Drag-and-drop state ───
	let songOverride = $state<typeof data.songs | null>(null);
	const localSongs = $derived(songOverride ?? data.songs);
	let dragIdx = $state<number | null>(null);
	let dragSongId = $state<number | null>(null);

	// ─── Derived values ───
	// If user has selected a song, show that; otherwise preload the first song
	const currentVideoId = $derived(
		currentPlayingIndex !== null && currentPlayingIndex < localSongs.length
			? localSongs[currentPlayingIndex].youtubeId
			: localSongs.length > 0
				? localSongs[0].youtubeId
				: ''
	);
	const userSelectedSong = $derived(currentPlayingIndex !== null);

	const songStartTimes = $derived(
		computeSongStartTimes(
			data.party.time,
			localSongs.map((s) => s.durationSeconds)
		)
	);

	const totalPlaylistDuration = $derived(localSongs.reduce((sum, s) => sum + (s.durationSeconds || 0), 0));

	const currentPlaylistTime = $derived.by(() => {
		if (currentPlayingIndex === null) return 0;
		let t = 0;
		for (let i = 0; i < currentPlayingIndex; i++) {
			t += localSongs[i]?.durationSeconds || 0;
		}
		return t + currentTime;
	});

	const trackPosition = $derived({
		index: currentPlayingIndex !== null ? currentPlayingIndex + 1 : 0,
		total: localSongs.length
	});

	const youtubePlaylistUrl = $derived(
		localSongs.length > 0
			? `https://www.youtube.com/watch_videos?video_ids=${localSongs
					.slice(0, 50)
					.map((s) => s.youtubeId)
					.join(',')}`
			: null
	);

	// ─── Playback handlers ───
	function playSong(i: number) {
		const wasNull = currentPlayingIndex === null;
		const sameVideo = currentPlayingIndex === i || (wasNull && i === 0); // first track was already cued
		currentPlayingIndex = i;
		// If the video is already loaded (same ID), the $effect won't fire,
		// so explicitly start playback
		if (sameVideo) {
			ytPlayer?.play();
		}
	}

	const currentSong = $derived(
		currentPlayingIndex !== null ? localSongs[currentPlayingIndex] : localSongs.length > 0 ? localSongs[0] : null
	);

	const canPrev = $derived(currentPlayingIndex !== null && currentPlayingIndex > 0);
	const canNext = $derived(currentPlayingIndex !== null && currentPlayingIndex < localSongs.length - 1);

	function onPlayerEnded() {
		if (canNext) {
			currentPlayingIndex!++;
		} else if (loopEnabled && localSongs.length > 0) {
			currentPlayingIndex = 0;
		} else {
			currentPlayingIndex = null;
		}
	}

	function onPlayerError() {
		if (canNext) {
			currentPlayingIndex!++;
		} else {
			currentPlayingIndex = null;
		}
	}

	function onPrev() {
		if (canPrev) currentPlayingIndex!--;
	}

	function onNext() {
		if (canNext) currentPlayingIndex!++;
	}

	// ─── Drag-and-drop handlers ───
	function handleDragStart(i: number, songId: number, e: DragEvent) {
		dragIdx = i;
		dragSongId = songId;
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(i: number, e: DragEvent) {
		e.preventDefault();
		if (dragIdx === null || dragIdx === i) return;
		const items = [...localSongs];
		const [moved] = items.splice(dragIdx, 1);
		items.splice(i, 0, moved);
		songOverride = items;
		dragIdx = i;
	}

	async function handleDragEnd() {
		if (dragSongId === null) return;
		const newPos = localSongs.findIndex((s) => s.id === dragSongId);
		const id = dragSongId;
		dragSongId = null;
		dragIdx = null;

		const formData = new FormData();
		formData.set('songId', String(id));
		formData.set('newPosition', String(newPos));
		await fetch(`?/moveSong`, { method: 'POST', body: formData });
		songOverride = null;
		await invalidateAll();
	}

	// ─── Multi-song RSVP state ───
	const songsRequiredToRsvp = $derived(data.party.songsRequiredToRsvp ?? 1);

	type RsvpSong = { youtubeUrl: string; durationSeconds: number | null; comment: string };
	let rsvpSongs = $state<RsvpSong[]>([]);
	let rsvpPlayers: Array<{ destroy: () => void } | null> = [];

	// Initialize rsvpSongs array when songsRequiredToRsvp changes
	$effect(() => {
		const n = songsRequiredToRsvp;
		if (rsvpSongs.length !== n) {
			rsvpSongs = Array.from({ length: n }, () => ({ youtubeUrl: '', durationSeconds: null, comment: '' }));
		}
	});

	const rsvpVideoIds = $derived(rsvpSongs.map((s) => (s.youtubeUrl ? extractYouTubeId(s.youtubeUrl) : null)));

	// Duration detection for each RSVP slot
	$effect(() => {
		// Clean up old players
		for (const p of rsvpPlayers) {
			if (p) p.destroy();
		}
		rsvpPlayers = rsvpVideoIds.map((vid, i) => {
			if (!vid) {
				rsvpSongs[i].durationSeconds = null;
				return null;
			}
			return createDurationDetector(vid, (dur) => {
				rsvpSongs[i].durationSeconds = dur;
			});
		});
		return () => {
			for (const p of rsvpPlayers) {
				if (p) p.destroy();
			}
		};
	});

	// For add-song form (accepted attendees)
	let addSongUrl = $state('');
	let addSongDuration = $state<number | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let addSongPlayer: any = null;

	const addSongVideoId = $derived(addSongUrl ? extractYouTubeId(addSongUrl) : null);

	// ─── Dev tools state ───
	let devBulkCount = $state(5);

	function randomFillRsvp() {
		const tracks = pickRandomTracks(songsRequiredToRsvp);
		for (let i = 0; i < tracks.length && i < rsvpSongs.length; i++) {
			rsvpSongs[i].youtubeUrl = tracks[i].url;
			rsvpSongs[i].durationSeconds = tracks[i].durationSeconds;
		}
	}

	function formatDuration(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function formatShortDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	const maxSongs = $derived(data.maxSongs === -1 ? Infinity : (data.maxSongs ?? 0));
	const slotsDisplay = $derived.by(() => {
		if (data.hasPlaylistControl) return 'unlimited';
		if (data.maxSongs == null) return '';
		return `${data.songsUsed ?? 0} / ${maxSongs}`;
	});

	const fillPercent = $derived.by(() => {
		if (!data.targetDuration || data.targetDuration <= 0) return 0;
		return Math.min((data.totalDuration / data.targetDuration) * 100, 100);
	});

	// Build invite tree for creator
	const inviteTree = $derived.by((): TreeNode | null => {
		if (!data.isCreator || !data.allAttendees) return null;
		const attendees = data.allAttendees;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation, not reactive state
		const nodeMap = new Map<number, TreeNode>();
		const root = attendees.find((a) => a.depth === 0 && a.invitedBy === null);
		if (!root) return null;

		for (const a of attendees) {
			nodeMap.set(a.id, {
				name: a.name,
				depth: a.depth,
				acceptedAt: a.accepted ? 'yes' : null,
				status: a.status,
				children: []
			});
		}

		for (const a of attendees) {
			if (a.invitedBy !== null) {
				const parent = nodeMap.get(a.invitedBy);
				const child = nodeMap.get(a.id);
				if (parent && child) parent.children.push(child);
			}
		}

		return nodeMap.get(root.id) || null;
	});

	// Helper: create a hidden iframe to detect duration via YouTube embed API
	function createDurationDetector(vid: string, onDuration: (seconds: number) => void): { destroy: () => void } {
		const iframe = document.createElement('iframe');
		iframe.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
		iframe.allow = 'autoplay';
		iframe.src = `https://www.youtube-nocookie.com/embed/${vid}?enablejsapi=1`;
		document.body.appendChild(iframe);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let ytPlayer: any = null;
		let destroyed = false;

		iframe.onload = async () => {
			if (destroyed) return;
			const YT = await loadYouTubeIframeApi();
			if (destroyed) return;
			ytPlayer = new YT.Player(iframe, {
				events: {
					onReady: (event: { target: { getDuration: () => number } }) => {
						const dur = event.target.getDuration();
						if (dur > 0) onDuration(Math.round(dur));
					}
				}
			});
		};

		return {
			destroy() {
				destroyed = true;
				if (ytPlayer?.destroy) ytPlayer.destroy();
				if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
			}
		};
	}

	// Detect duration for add-song form
	$effect(() => {
		if (!addSongVideoId) {
			addSongDuration = null;
			if (addSongPlayer) {
				addSongPlayer.destroy();
				addSongPlayer = null;
			}
			return;
		}
		if (addSongPlayer) {
			addSongPlayer.destroy();
			addSongPlayer = null;
		}
		addSongPlayer = createDurationDetector(addSongVideoId, (dur) => {
			addSongDuration = dur;
		});
		return () => {
			if (addSongPlayer) {
				addSongPlayer.destroy();
				addSongPlayer = null;
			}
		};
	});
</script>

<svelte:head>
	<title>{data.isPending ? `You're Invited to ${data.party.name}!` : data.party.name} - Playlist Party</title>
</svelte:head>

<div class="min-h-screen px-4 py-8 md:py-12">
	<div class="max-w-2xl mx-auto">
		<div class="text-center mb-6">
			<a href="/" class="inline-block font-display text-lg text-neon-pink neon-text-subtle tracking-wider">
				PLAYLIST PARTY
			</a>
		</div>

		<!-- Party Header -->
		<PartyHeader
			name={data.party.name}
			date={data.party.date}
			time={data.party.time ?? undefined}
			location={data.party.location ?? undefined}
			locationUrl={data.party.locationUrl ?? undefined}
			description={data.isPending ? (data.party.description ?? undefined) : undefined}
		/>

		<!-- ─── DECLINED VIEW ─── -->
		{#if data.attendeeStatus === 'declined'}
			<div class="mt-8 glass rounded-2xl p-6 md:p-8 text-center" data-testid="declined-view">
				<h2 class="font-heading text-2xl font-extrabold text-neon-pink mb-2">Invitation Declined</h2>
				<p class="text-text-secondary mb-6 font-heading text-sm">You declined this invitation. Changed your mind?</p>

				{#if form?.error}
					<div
						class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
					>
						{form.error}
					</div>
				{/if}

				<form method="POST" action="?/undecline" use:enhance>
					<button
						type="submit"
						data-testid="undecline-btn"
						class="cta-btn font-heading font-bold text-lg py-3.5 px-8 rounded-xl bg-neon-cyan text-on-accent transition-all duration-300"
					>
						I Want to Come!
					</button>
				</form>
			</div>

			<!-- ─── PENDING INVITEE MODE ─── -->
		{:else if data.isPending}
			<div class="mt-8 glass rounded-2xl p-6 md:p-8">
				<h2 class="font-heading text-2xl font-extrabold gradient-text mb-2">You're Invited!</h2>
				<p class="text-text-secondary mb-6 font-heading text-sm">
					Accept your invitation by adding {songsRequiredToRsvp === 1 ? 'a song' : `${songsRequiredToRsvp} songs`} to the
					playlist. {songsRequiredToRsvp === 1 ? 'Your track is your RSVP!' : 'Your tracks are your RSVP!'}
				</p>

				{#if form?.error}
					<div
						class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
					>
						{form.error}
					</div>
				{/if}

				<form method="POST" action="?/accept" use:enhance class="space-y-5">
					<div>
						<label for="name" class="block font-heading text-sm font-semibold text-text-secondary mb-1.5"
							>Your Name</label
						>
						<input
							type="text"
							id="name"
							name="name"
							required
							value={data.attendee.name}
							data-testid="name-input"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="What do people call you?"
						/>
					</div>

					{#each rsvpSongs as song, i (i)}
						<div class="space-y-3 {i > 0 ? 'pt-3 border-t border-neon-purple/10' : ''}">
							{#if songsRequiredToRsvp > 1}
								<p class="font-heading text-sm font-semibold text-neon-cyan">Song {i + 1}</p>
							{/if}
							<div>
								<label for="youtubeUrl_{i}" class="block font-heading text-sm font-semibold text-text-secondary mb-1.5">
									{songsRequiredToRsvp > 1 ? '' : 'Your Song'}
									<svg class="inline-block w-4 h-4 text-red-500 -mt-0.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"
										><path
											d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
										/></svg
									>
								</label>
								<input
									type="url"
									id="youtubeUrl_{i}"
									name="youtubeUrl_{i}"
									required
									bind:value={song.youtubeUrl}
									data-testid={i === 0 ? 'youtube-url' : `youtube-url-${i}`}
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
									placeholder="Search YouTube, copy the link, paste it here"
								/>
								{#if i === 0}
									<p class="text-text-muted text-xs mt-1.5 ml-1">
										Find a song on <a
											href="https://youtube.com"
											target="_blank"
											rel="noopener"
											class="text-neon-cyan hover:underline">youtube.com</a
										>, copy its URL, and paste it above
									</p>
								{/if}
							</div>

							{#if song.durationSeconds}
								<div
									class="flex items-center gap-3 p-3 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20"
									data-testid={i === 0 ? 'duration-display' : `duration-display-${i}`}
								>
									<span class="font-heading text-sm text-text-secondary">
										Duration: <span class="text-neon-cyan font-semibold"
											>{formatShortDuration(song.durationSeconds)}</span
										>
									</span>
								</div>
							{/if}

							<div>
								<label for="comment_{i}" class="block font-heading text-sm font-semibold text-text-secondary mb-1.5"
									>Comment <span class="text-text-muted font-normal">(optional)</span></label
								>
								<textarea
									id="comment_{i}"
									name="comment_{i}"
									maxlength={MAX_COMMENT_LENGTH}
									rows="2"
									bind:value={song.comment}
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm resize-none"
									placeholder="Why this song? Supports **bold**, *italic*, and [links](url)"
								></textarea>
							</div>

							<input type="hidden" name="durationSeconds_{i}" value={song.durationSeconds || ''} />
						</div>
					{/each}

					{#if dev}
						<button
							type="button"
							onclick={randomFillRsvp}
							class="w-full font-heading font-bold text-sm py-2.5 rounded-xl bg-neon-yellow/20 text-neon-yellow border border-neon-yellow/30 hover:bg-neon-yellow/30 transition-all duration-200"
						>
							[Dev] Random Fill
						</button>
					{/if}

					<button
						type="submit"
						data-testid="accept-btn"
						class="cta-btn w-full font-heading font-bold text-lg py-3.5 rounded-xl bg-neon-pink text-on-accent transition-all duration-300"
					>
						Accept & Add {songsRequiredToRsvp === 1 ? 'Song' : `${songsRequiredToRsvp} Songs`}
					</button>
				</form>

				{#if !data.isCreator}
					<div class="mt-4 text-center">
						<form method="POST" action="?/decline" use:enhance>
							<button
								type="submit"
								data-testid="decline-btn"
								class="font-heading text-sm text-text-muted hover:text-neon-pink transition-colors"
							>
								Decline this invitation
							</button>
						</form>
					</div>
				{/if}

				{#if localSongs.length > 0}
					<section class="mt-6">
						<h2 class="font-heading text-lg font-bold gradient-text mb-1">Current Playlist</h2>
						<p class="text-text-muted text-xs mb-3 font-heading">
							{localSongs.length}
							{localSongs.length === 1 ? 'song' : 'songs'} so far — pick something that fits the vibe!
						</p>
						<div class="glass rounded-2xl p-2 space-y-0.5">
							{#each localSongs as song, i (song.id)}
								<SongCard
									youtubeId={song.youtubeId}
									title={song.youtubeTitle}
									channelName={song.youtubeChannelName || ''}
									position={i + 1}
									addedBy={song.addedByName}
									revealed={!!song.addedByName}
									isHost={song.isHost}
									comment={song.comment}
								/>
							{/each}
						</div>
					</section>
				{/if}
			</div>

			<!-- ─── ACCEPTED ATTENDEE / CREATOR MODE ─── -->
		{:else}
			<!-- Stats bar (host only) -->
			{#if data.isCreator}
				<div class="mt-3 flex flex-wrap items-center gap-3 text-sm font-heading">
					<span class="text-text-secondary">
						{data.acceptedCount} / {data.party.maxAttendees} attendees
					</span>
					<span class="text-text-muted">|</span>
					<span class="text-text-secondary">
						{data.songs.length} songs &middot; {formatDuration(data.totalDuration)}
						{#if data.targetDuration}
							/ {formatDuration(data.targetDuration)}
						{/if}
					</span>
					<span class="text-text-muted">|</span>
					{#if data.partyModeActive}
						<a
							href="/party/{data.attendee.inviteToken}/live"
							class="inline-flex items-center gap-1.5 text-neon-pink font-semibold"
						>
							<span class="relative flex h-2 w-2">
								<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-pink opacity-75"
								></span>
								<span class="relative inline-flex rounded-full h-2 w-2 bg-neon-pink"></span>
							</span>
							Party Mode Live!
						</a>
					{:else}
						<a
							href="/party/{data.attendee.inviteToken}/live"
							data-testid="start-party-mode"
							class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neon-pink/10 text-neon-pink font-semibold hover:bg-neon-pink/20 transition-colors"
						>
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
							Start Party Mode
						</a>
					{/if}
				</div>
			{:else if data.hasPlaylistControl}
				<!-- DJ bar (non-creator DJs) -->
				<div class="mt-3 flex flex-wrap items-center gap-3 text-sm font-heading">
					<span class="inline-flex items-center gap-1.5 text-neon-cyan font-semibold" data-testid="dj-badge">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
							><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg
						>
						DJ
					</span>
					<span class="text-text-muted">|</span>
					{#if data.partyModeActive}
						<a
							href="/party/{data.attendee.inviteToken}/live"
							class="inline-flex items-center gap-1.5 text-neon-pink font-semibold"
						>
							<span class="relative flex h-2 w-2">
								<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-pink opacity-75"
								></span>
								<span class="relative inline-flex rounded-full h-2 w-2 bg-neon-pink"></span>
							</span>
							Party Mode Live!
						</a>
					{:else}
						<a
							href="/party/{data.attendee.inviteToken}/live"
							data-testid="start-party-mode"
							class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neon-pink/10 text-neon-pink font-semibold hover:bg-neon-pink/20 transition-colors"
						>
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
							Start Party Mode
						</a>
					{/if}
				</div>
			{/if}

			<!-- Unavailable banner -->
			{#if data.attendeeStatus === 'unavailable'}
				<div
					class="mt-4 glass rounded-2xl p-5 border border-neon-yellow/20 bg-neon-yellow/5"
					data-testid="unavailable-banner"
				>
					<p class="font-heading font-bold text-neon-yellow mb-2">You've marked yourself unavailable</p>
					<p class="text-text-secondary text-sm mb-3">Your songs are still on the playlist. Changed your plans?</p>
					{#if form?.error}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
						>
							{form.error}
						</div>
					{/if}
					<form method="POST" action="?/reconfirm" use:enhance>
						<button
							type="submit"
							data-testid="reconfirm-btn"
							class="font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-neon-cyan text-on-accent hover:bg-neon-cyan/90 transition-colors"
						>
							I Can Make It!
						</button>
					</form>
				</div>
			{/if}

			<!-- Welcome bar -->
			<div class="mt-4 glass rounded-2xl p-5">
				<p class="font-heading font-bold text-text-primary">
					{#if data.isCreator}
						Your Party, {data.attendee.name}
					{:else}
						Welcome, {data.attendee.name}!
					{/if}
				</p>
				{#if !data.isCreator && data.attendeeStatus !== 'unavailable'}
					<div class="mt-2" data-testid="song-slots">
						<span class="font-heading text-sm text-text-secondary">
							Your songs: <span class="text-neon-cyan">{slotsDisplay}</span>
						</span>
						<span class="text-text-muted text-sm ml-2">
							({data.party.songsPerGuest} for joining{#if (data.invitesSent ?? 0) > 0}
								+ {data.invitesSent} for invites sent{/if})
						</span>
					</div>
				{/if}
				{#if !data.isCreator && data.attendeeStatus === 'attending'}
					<div class="mt-2">
						<form method="POST" action="?/cantMakeIt" use:enhance>
							<button
								type="submit"
								data-testid="cant-make-it-btn"
								class="font-heading text-xs text-text-muted hover:text-neon-yellow transition-colors"
							>
								Can't make it anymore?
							</button>
						</form>
					</div>
				{/if}
			</div>

			<!-- Invite Friends -->
			{#if data.attendeeStatus !== 'unavailable'}
				<details class="mt-6 group" open>
					<summary
						class="font-heading text-lg font-bold gradient-text mb-3 cursor-pointer list-none flex items-center gap-2 select-none"
					>
						<svg
							class="w-4 h-4 transition-transform group-open:rotate-90"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"><path d="M9 18l6-6-6-6" /></svg
						>
						Invite Friends
					</summary>

					{#if form?.inviteError}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
						>
							{form.inviteError}
						</div>
					{/if}

					{#if form?.inviteRemoved}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-mint/10 border border-neon-mint/20 text-neon-mint text-sm font-heading"
							data-testid="invite-removed-success"
						>
							Invite for {form.inviteRemoved} has been removed.
						</div>
					{/if}

					{#if form?.declinedOnBehalf}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-yellow/10 border border-neon-yellow/20 text-neon-yellow text-sm font-heading"
							data-testid="declined-on-behalf-success"
						>
							{form.declinedOnBehalf} marked as can't make it.
						</div>
					{/if}

					{#if form?.djToggled}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-sm font-heading"
							data-testid="dj-toggled-success"
						>
							{form.djToggled}
							{form.isDj ? 'is now a DJ' : 'is no longer a DJ'}.
						</div>
					{/if}
					<!-- Invite list -->
					{#if (data.myInvites?.length ?? 0) > 0}
						<div class="space-y-2 mb-4">
							{#each data.myInvites as invite (invite.inviteToken)}
								<div class="glass rounded-xl p-3" data-testid="invite-row">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2">
											<div
												class="w-2 h-2 rounded-full flex-shrink-0"
												class:bg-neon-mint={invite.status === 'attending'}
												class:bg-neon-pink={invite.status === 'declined'}
												class:bg-neon-yellow={invite.status === 'unavailable'}
												class:bg-text-muted={invite.status === 'pending'}
												style={invite.status === 'pending' ? 'opacity: 0.4;' : ''}
											></div>
											<div>
												<span
													class="font-heading text-sm"
													class:text-text-primary={invite.status === 'attending'}
													class:text-text-muted={invite.status === 'pending' ||
														invite.status === 'declined' ||
														invite.status === 'unavailable'}
												>
													{invite.name}
												</span>
												<span class="text-xs text-text-muted ml-2">{invite.email}</span>
											</div>
										</div>
										<div class="flex items-center gap-2">
											{#if data.isCreator && invite.status === 'attending'}
												<form method="POST" action="?/toggleDj" use:enhance>
													<input type="hidden" name="attendeeId" value={invite.id} />
													<button
														type="submit"
														title={invite.isDj ? 'Remove DJ role' : 'Make DJ'}
														data-testid="toggle-dj-btn"
														class="text-sm font-heading font-semibold px-2 py-0.5 rounded-lg transition-colors {invite.isDj
															? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/30'
															: 'bg-surface-light text-text-muted border border-neon-purple/20 hover:text-neon-cyan hover:border-neon-cyan/30'}"
													>
														{invite.isDj ? 'DJ' : 'Make DJ'}
													</button>
												</form>
											{/if}
											{#if data.isCreator && (invite.status === 'pending' || invite.status === 'attending')}
												<form method="POST" action="?/declineOnBehalf" use:enhance>
													<input type="hidden" name="inviteToken" value={invite.inviteToken} />
													<button
														type="submit"
														title="Mark as can't make it"
														data-testid="decline-on-behalf-btn"
														class="text-text-muted hover:text-neon-yellow transition-colors p-1"
													>
														<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
															><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line
																x1="9"
																y1="9"
																x2="9.01"
																y2="9"
															/><line x1="15" y1="9" x2="15.01" y2="9" /></svg
														>
													</button>
												</form>
											{/if}
											{#if invite.status === 'pending'}
												<form method="POST" action="?/removeInvite" use:enhance>
													<input type="hidden" name="inviteToken" value={invite.inviteToken} />
													<button
														type="submit"
														title="Remove invite"
														data-testid="remove-invite-btn"
														class="text-text-muted hover:text-neon-pink transition-colors p-1"
													>
														<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
															><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg
														>
													</button>
												</form>
											{/if}
											<button
												type="button"
												title="Copy invite link"
												class="text-text-muted hover:text-neon-cyan transition-colors p-1"
												onclick={async (e) => {
													const url = `${window.location.origin}/party/${invite.inviteToken}`;
													await navigator.clipboard.writeText(url);
													const btn = e.currentTarget;
													btn.textContent = '✓';
													setTimeout(() => {
														btn.innerHTML =
															'<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
													}, 1500);
												}}
											>
												<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
													><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path
														d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
													/></svg
												>
											</button>
											<span
												class="text-xs font-heading"
												class:text-neon-mint={invite.status === 'attending'}
												class:text-neon-pink={invite.status === 'declined'}
												class:text-neon-yellow={invite.status === 'unavailable'}
												class:text-text-muted={invite.status === 'pending'}
											>
												{invite.status === 'attending'
													? 'Accepted'
													: invite.status === 'declined'
														? 'Declined'
														: invite.status === 'unavailable'
															? "Can't make it"
															: 'Pending'}
											</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					{#if data.isCreator && data.allAttendees && data.allAttendees.length > 1}
						{@const allGuests = data.allAttendees.filter((a) => a.depth > 0 && a.status !== 'declined')}
						{@const confirmedGuests = allGuests.filter((a) => a.status === 'attending')}
						{#if allGuests.length > 0}
							<div class="flex flex-wrap gap-2 mb-4">
								<a
									href={`mailto:?bcc=${allGuests.map((a) => a.email).join(',')}&subject=${encodeURIComponent(data.party.name)}`}
									class="inline-flex items-center gap-1.5 font-heading text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-light text-text-secondary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200"
									data-testid="email-all-guests"
								>
									<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
										><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline
											points="22,6 12,13 2,6"
										/></svg
									>
									Email All Guests ({allGuests.length})
								</a>
								{#if confirmedGuests.length > 0 && confirmedGuests.length !== allGuests.length}
									<a
										href={`mailto:?bcc=${confirmedGuests.map((a) => a.email).join(',')}&subject=${encodeURIComponent(data.party.name)}`}
										class="inline-flex items-center gap-1.5 font-heading text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-light text-text-secondary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200"
										data-testid="email-confirmed-guests"
									>
										<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
											><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline
												points="22,6 12,13 2,6"
											/></svg
										>
										Email Confirmed ({confirmedGuests.length})
									</a>
								{/if}
							</div>
						{/if}
					{/if}

					{#if data.canInvite}
						<!-- Share Invite Link -->
						{#if data.attendee.shareToken}
							<div class="glass rounded-2xl p-5 mb-4" data-testid="share-link-section">
								<h3 class="font-heading font-semibold text-xs text-text-secondary mb-2 uppercase tracking-wider">
									Share Invite Link
								</h3>
								<p class="text-text-muted text-xs mb-2">
									Anyone with this link can request an invite — credited to you
								</p>
								<div class="flex gap-2">
									<input
										type="text"
										readonly
										value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${data.attendee.shareToken}`}
										data-testid="share-link-input"
										class="flex-1 bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary text-sm select-all"
									/>
									<button
										type="button"
										data-testid="copy-share-link"
										class="font-heading font-semibold text-sm px-4 py-2.5 rounded-xl bg-surface-light text-text-primary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200 flex-shrink-0"
										onclick={async (e) => {
											const url = `${window.location.origin}/share/${data.attendee.shareToken}`;
											await navigator.clipboard.writeText(url);
											const btn = e.currentTarget;
											btn.textContent = 'Copied!';
											setTimeout(() => {
												btn.textContent = 'Copy';
											}, 1500);
										}}
									>
										Copy
									</button>
								</div>
							</div>
						{/if}
					{:else}
						<div class="glass rounded-2xl p-5 text-center">
							<p class="text-text-muted text-sm">
								{#if data.totalAttendees >= data.party.maxAttendees}
									Party is at capacity!
								{:else}
									Playlist is full — no room for more guests right now.
								{/if}
							</p>
						</div>
					{/if}
				</details>
			{/if}

			<!-- Add Song Form -->
			{#if !data.isPending && data.attendeeStatus !== 'unavailable' && ((data.songsUsed ?? 0) < maxSongs || data.hasPlaylistControl)}
				<div class="mt-4 glass rounded-2xl p-5">
					<h3 class="font-heading font-semibold text-sm text-text-secondary mb-3">
						Add a Song
						<svg class="inline-block w-4 h-4 text-red-500 -mt-0.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"
							><path
								d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
							/></svg
						>
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

					<form method="POST" action="?/addSong" use:enhance class="space-y-3">
						<div class="flex gap-2">
							<input
								type="url"
								name="youtubeUrl"
								required
								bind:value={addSongUrl}
								class="flex-1 bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
								placeholder="Paste a YouTube link"
							/>
							<button
								type="submit"
								class="font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-neon-pink text-on-accent hover:bg-neon-pink/90 transition-colors flex-shrink-0"
							>
								Add
							</button>
						</div>
						{#if addSongDuration}
							<div class="flex items-center gap-2 text-xs font-heading text-text-secondary">
								<span>Duration: <span class="text-neon-cyan">{formatShortDuration(addSongDuration)}</span></span>
							</div>
						{/if}
						<textarea
							name="comment"
							maxlength={MAX_COMMENT_LENGTH}
							rows="2"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm resize-none"
							placeholder="Why this song? (optional)"
						></textarea>
						<input type="hidden" name="durationSeconds" value={addSongDuration || ''} />
					</form>

					{#if dev}
						<div class="mt-4 pt-4 border-t border-neon-yellow/20">
							<h4 class="font-heading font-semibold text-xs text-neon-yellow mb-2">[Dev] Bulk Add Random Songs</h4>

							{#if form?.devSongsAdded}
								<div
									class="mb-2 p-2 rounded-lg bg-neon-mint/10 border border-neon-mint/20 text-neon-mint text-xs font-heading"
								>
									Added {form.devSongsAdded} random songs!
								</div>
							{/if}
							{#if form?.devError}
								<div
									class="mb-2 p-2 rounded-lg bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-xs font-heading"
								>
									{form.devError}
								</div>
							{/if}

							<form method="POST" action="?/devAddRandomSongs" use:enhance class="flex items-center gap-2">
								<input
									type="number"
									name="count"
									min="1"
									max="50"
									bind:value={devBulkCount}
									class="w-20 bg-surface border border-neon-yellow/30 rounded-lg px-3 py-1.5 text-text-primary text-sm"
								/>
								<button
									type="submit"
									class="font-heading font-semibold text-xs px-4 py-1.5 rounded-lg bg-neon-yellow/20 text-neon-yellow border border-neon-yellow/30 hover:bg-neon-yellow/30 transition-colors"
								>
									Add Songs
								</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}

			<!-- My Songs (non-creator) -->
			{#if !data.hasPlaylistControl && (data.mySongs?.length ?? 0) > 0}
				<section class="mt-6">
					<h2 class="font-heading text-lg font-bold gradient-text mb-3">Your Songs</h2>
					<div class="glass rounded-2xl p-2 space-y-0.5">
						{#each data.mySongs as song, i (song.id)}
							<SongCard
								youtubeId={song.youtubeId}
								title={song.youtubeTitle}
								channelName={song.youtubeChannelName || ''}
								position={i + 1}
								comment={song.comment}
							/>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Now Playing Card (visible when party mode is active) -->
			{#if !data.isPending}
				<div class="mt-6">
					<NowPlayingCard
						token={data.attendee.inviteToken}
						isAccepted={data.attendeeStatus === 'attending'}
						isCreator={data.hasPlaylistControl}
					/>
				</div>
			{/if}

			<!-- Playlist Progress -->
			{#if data.targetDuration || data.songs.length > 0}
				<div class="mt-6 glass rounded-2xl p-4" data-testid="playlist-progress">
					<div class="flex items-center justify-between mb-2">
						<span class="font-heading text-sm font-semibold text-text-secondary">Playlist</span>
					</div>
					<div class="h-2 bg-surface rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all duration-500"
							style="width: {fillPercent}%; background: linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-mint));"
						></div>
					</div>
					{#if data.totalDuration > (data.targetDuration || 0) && data.targetDuration}
						<p class="text-xs text-neon-yellow mt-1.5 font-heading">
							Playlist is slightly over target — that's by design!
						</p>
					{/if}
				</div>
			{/if}

			<!-- Player Controls (top) -->
			{#if localSongs.length > 0}
				<div class="mt-4">
					<PlayerControls
						title={currentSong?.youtubeTitle ?? ''}
						addedBy={currentSong?.isMine ? 'You' : currentSong?.isHost ? 'Host' : currentSong?.addedByName || 'Guest'}
						youtubeId={currentSong?.youtubeId ?? ''}
						isPlaying={isActuallyPlaying}
						{currentTime}
						duration={currentDuration || currentSong?.durationSeconds || 0}
						trackIndex={trackPosition.index}
						totalTracks={trackPosition.total}
						{currentPlaylistTime}
						{totalPlaylistDuration}
						{loopEnabled}
						{volume}
						{muted}
						onprev={canPrev ? onPrev : null}
						onnext={canNext ? onNext : null}
						ontoggle={() => {
							if (currentPlayingIndex === null && localSongs.length > 0) {
								currentPlayingIndex = 0;
								ytPlayer?.play();
							} else {
								ytPlayer?.togglePlayPause();
							}
						}}
						onloop={() => (loopEnabled = !loopEnabled)}
						onseek={(s) => {
							currentTime = s;
							ytPlayer?.seekTo(s);
						}}
						onvolume={(v) => {
							volume = v;
							if (muted && v > 0) muted = false;
							ytPlayer?.setVolume(v);
						}}
						onmute={() => {
							muted = !muted;
							if (muted) ytPlayer?.mute();
							else ytPlayer?.unmute();
						}}
					/>
				</div>
			{/if}

			<!-- Song List -->
			<section class="mt-4">
				{#if (data.hasPlaylistControl && localSongs.length >= 2) || youtubePlaylistUrl}
					<div class="flex items-center gap-2 mb-2">
						{#if data.hasPlaylistControl && localSongs.length >= 2}
							<form method="POST" action="?/distributeSongs" use:enhance>
								<button
									type="submit"
									data-testid="distribute-songs-btn"
									class="inline-flex items-center gap-1.5 text-xs font-heading font-semibold px-3 py-1.5 rounded-lg bg-surface-light text-text-secondary border border-neon-purple/20 hover:border-neon-purple/40 hover:text-text-primary transition-all duration-200"
									title="Evenly space each guest's songs throughout the playlist"
								>
									<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
										><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg
									>
									Distribute by Guest
								</button>
							</form>
						{/if}
						{#if youtubePlaylistUrl}
							<a
								href={youtubePlaylistUrl}
								target="_blank"
								rel="noopener"
								data-testid="play-on-youtube-btn"
								class="inline-flex items-center gap-1.5 text-xs font-heading font-semibold px-3 py-1.5 rounded-lg bg-surface-light text-text-secondary border border-neon-purple/20 hover:border-neon-purple/40 hover:text-text-primary transition-all duration-200"
								title="Open playlist on YouTube"
							>
								<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M21.582 6.186a2.506 2.506 0 0 0-1.768-1.768C18.254 4 12 4 12 4s-6.254 0-7.814.418A2.506 2.506 0 0 0 2.418 6.186C2 7.746 2 12 2 12s0 4.254.418 5.814a2.506 2.506 0 0 0 1.768 1.768C5.746 20 12 20 12 20s6.254 0 7.814-.418a2.506 2.506 0 0 0 1.768-1.768C22 16.254 22 12 22 12s0-4.254-.418-5.814zM10 15.464V8.536L16 12l-6 3.464z"
									/></svg
								>
								Play on YouTube{#if localSongs.length > 50}&nbsp;(first 50){/if}
							</a>
						{/if}
						{#if form?.distributed}
							<span class="text-xs text-neon-mint font-heading animate-pulse ml-auto">Songs distributed!</span>
						{/if}
					</div>
				{/if}
				{#if localSongs.length === 0}
					<div class="glass rounded-2xl p-6 text-center">
						<p class="text-text-muted text-sm">No songs yet. Be the first to add one!</p>
					</div>
				{:else}
					<div class="glass rounded-2xl p-2 space-y-0.5">
						{#each localSongs as song, i (song.id)}
							<SongCard
								youtubeId={song.youtubeId}
								title={song.youtubeTitle}
								channelName={song.youtubeChannelName || ''}
								position={i + 1}
								addedBy={song.addedByName}
								revealed={!!song.addedByName}
								isMine={song.isMine}
								isHost={song.isHost}
								isPlaying={currentPlayingIndex === i && isActuallyPlaying}
								onclick={() => playSong(i)}
								showControls={data.hasPlaylistControl || song.isMine}
								showRemove={data.hasPlaylistControl}
								songId={song.id}
								canMoveUp={i > 0}
								canMoveDown={i < localSongs.length - 1}
								token={data.attendee.inviteToken}
								comment={song.comment}
								startTime={songStartTimes[i]}
								isDraggable={data.hasPlaylistControl || song.isMine}
								isUnavailable={data.hasPlaylistControl && song.isUnavailable}
								ondragstart={(e) => handleDragStart(i, song.id, e)}
								ondragover={(e) => handleDragOver(i, e)}
								ondragend={handleDragEnd}
							/>
						{/each}
					</div>
				{/if}
			</section>

			<!-- YouTube Video (bottom) -->
			{#if localSongs.length > 0}
				<div class="mt-4">
					<YouTubePlayer
						bind:this={ytPlayer}
						videoId={currentVideoId}
						autoplay={userSelectedSong}
						onended={onPlayerEnded}
						onerror={onPlayerError}
						onplaystatechange={(playing) => (isActuallyPlaying = playing)}
						onprogress={(t, d) => {
							currentTime = t;
							currentDuration = d;
						}}
					/>
				</div>
			{/if}

			<!-- Creator: Invite Tree -->
			{#if data.isCreator && inviteTree}
				<details class="mt-8 group" open>
					<summary
						class="font-heading text-lg font-bold gradient-text mb-3 cursor-pointer list-none flex items-center gap-2 select-none"
					>
						<svg
							class="w-4 h-4 transition-transform group-open:rotate-90"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"><path d="M9 18l6-6-6-6" /></svg
						>
						Guest Tree
					</summary>
					<InviteTree tree={inviteTree} />
				</details>
			{/if}

			<!-- Creator: Settings -->
			{#if data.isCreator}
				<details class="mt-8 mb-8 group" open>
					<summary
						class="font-heading text-lg font-bold gradient-text mb-3 cursor-pointer list-none flex items-center gap-2 select-none"
					>
						<svg
							class="w-4 h-4 transition-transform group-open:rotate-90"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"><path d="M9 18l6-6-6-6" /></svg
						>
						Party Settings
					</summary>

					{#if form?.settingsUpdated}
						<div
							class="mb-3 p-3 rounded-xl bg-neon-mint/10 border border-neon-mint/20 text-neon-mint text-sm font-heading"
						>
							Settings updated!
						</div>
					{/if}

					<form method="POST" action="?/updateSettings" use:enhance class="glass rounded-2xl p-5 space-y-4">
						<div>
							<label
								for="setting-attribution"
								class="block font-heading text-xs font-semibold text-text-secondary mb-1"
							>
								Song Attribution
							</label>
							<select
								id="setting-attribution"
								name="songAttribution"
								data-testid="song-attribution"
								class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary transition-colors text-sm"
							>
								<option value="hidden" selected={data.party.songAttribution === 'hidden'}
									>Hidden — guests don't see who added songs</option
								>
								<option value="own_tree" selected={data.party.songAttribution === 'own_tree'}
									>Own tree — guests see songs from their invite chain</option
								>
								<option value="visible" selected={data.party.songAttribution === 'visible'}
									>Visible — everyone sees who added songs</option
								>
							</select>
						</div>

						<div class="grid grid-cols-3 gap-4">
							<div>
								<label
									for="setting-songs-per-guest"
									class="block font-heading text-xs font-semibold text-text-secondary mb-1"
								>
									Songs Per Guest
								</label>
								<input
									type="number"
									id="setting-songs-per-guest"
									name="songsPerGuest"
									min="1"
									data-testid="setting-songs-per-guest"
									value={data.party.songsPerGuest}
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary transition-colors text-sm"
								/>
							</div>
							<div>
								<label
									for="setting-songs-required"
									class="block font-heading text-xs font-semibold text-text-secondary mb-1"
								>
									RSVP Songs
								</label>
								<input
									type="number"
									id="setting-songs-required"
									name="songsRequiredToRsvp"
									min="1"
									data-testid="setting-songs-required-to-rsvp"
									value={data.party.songsRequiredToRsvp ?? data.party.songsPerGuest}
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary transition-colors text-sm"
								/>
							</div>
							<div>
								<label
									for="setting-max-invites"
									class="block font-heading text-xs font-semibold text-text-secondary mb-1"
								>
									Max Invites Per Guest
								</label>
								<input
									type="number"
									id="setting-max-invites"
									name="maxInvitesPerGuest"
									min="1"
									data-testid="max-invites-per-guest"
									value={data.party.maxInvitesPerGuest ?? ''}
									placeholder="Unlimited"
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
								/>
							</div>
						</div>

						<button
							type="submit"
							class="font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-surface-light text-text-primary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200"
						>
							Save Settings
						</button>
					</form>
				</details>
			{/if}
		{/if}
	</div>
</div>

<style>
	summary::-webkit-details-marker {
		display: none;
	}

	.cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		transform: translateY(-1px);
	}

	:global(:root[data-theme='dark']) .cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	:global(:root[data-theme='dark']) .cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		transform: translateY(-1px);
	}
</style>
