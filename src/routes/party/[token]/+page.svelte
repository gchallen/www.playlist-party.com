<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import PartyHeader from '$lib/components/PartyHeader.svelte';
	import SongCard from '$lib/components/SongCard.svelte';
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte';
	import PlayerControls from '$lib/components/PlayerControls.svelte';
	import InviteTree from '$lib/components/InviteTree.svelte';
	import { extractYouTubeId } from '$lib/youtube';
	import { MAX_COMMENT_LENGTH } from '$lib/comment';
	import { computeSongStartTimes } from '$lib/time';
	import { loadYouTubeIframeApi } from '$lib/youtube-api';

	let { data, form } = $props();

	// ─── Playback state ───
	let currentPlayingIndex = $state<number | null>(null);
	let isActuallyPlaying = $state(false);
	let currentTime = $state(0);
	let currentDuration = $state(0);
	let loopEnabled = $state(true);
	let volume = $state(1);
	let muted = $state(false);
	let ytPlayer: YouTubePlayer;

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
		computeSongStartTimes(data.party.time, localSongs.map((s) => s.durationSeconds))
	);

	const totalPlaylistDuration = $derived(
		localSongs.reduce((sum, s) => sum + (s.durationSeconds || 0), 0)
	);

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

	// ─── Playback handlers ───
	function playSong(i: number) {
		const wasNull = currentPlayingIndex === null;
		const sameVideo = currentPlayingIndex === i ||
			(wasNull && i === 0); // first track was already cued
		currentPlayingIndex = i;
		// If the video is already loaded (same ID), the $effect won't fire,
		// so explicitly start playback
		if (sameVideo) {
			ytPlayer?.play();
		}
	}

	const currentSong = $derived(
		currentPlayingIndex !== null
			? localSongs[currentPlayingIndex]
			: localSongs.length > 0
				? localSongs[0]
				: null
	);

	const canPrev = $derived(currentPlayingIndex !== null && currentPlayingIndex > 0);
	const canNext = $derived(
		currentPlayingIndex !== null && currentPlayingIndex < localSongs.length - 1
	);

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

	let youtubeUrl = $state('');
	let durationSeconds = $state<number | null>(null);
	let player: any = null;

	// For add-song form (accepted attendees)
	let addSongUrl = $state('');
	let addSongDuration = $state<number | null>(null);
	let addSongPlayer: any = null;

	const videoId = $derived(youtubeUrl ? extractYouTubeId(youtubeUrl) : null);
	const addSongVideoId = $derived(addSongUrl ? extractYouTubeId(addSongUrl) : null);

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

	const maxSongs = $derived((data as any).maxSongs === -1 ? Infinity : (data as any).maxSongs);
	const slotsDisplay = $derived.by(() => {
		if (data.isCreator) return 'unlimited';
		const m = maxSongs;
		if (m === undefined) return '';
		return `${(data as any).songsUsed} / ${m}`;
	});

	const fillPercent = $derived.by(() => {
		if (!data.targetDuration || data.targetDuration <= 0) return 0;
		return Math.min((data.totalDuration / data.targetDuration) * 100, 100);
	});

	// Build invite tree for creator
	type TreeNode = {
		name: string;
		depth: number;
		acceptedAt: string | null;
		children: TreeNode[];
	};

	const inviteTree = $derived.by((): TreeNode | null => {
		if (!data.isCreator || !(data as any).allAttendees) return null;
		const attendees = (data as any).allAttendees as Array<{
			id: number;
			name: string;
			invitedBy: number | null;
			depth: number;
			accepted: boolean;
		}>;

		const nodeMap = new Map<number, TreeNode>();
		const root = attendees.find((a) => a.depth === 0 && a.invitedBy === null);
		if (!root) return null;

		for (const a of attendees) {
			nodeMap.set(a.id, {
				name: a.name,
				depth: a.depth,
				acceptedAt: a.accepted ? 'yes' : null,
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
	function createDurationDetector(
		vid: string,
		onDuration: (seconds: number) => void
	): { destroy: () => void } {
		const iframe = document.createElement('iframe');
		iframe.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
		iframe.allow = 'autoplay';
		iframe.src = `https://www.youtube-nocookie.com/embed/${vid}?enablejsapi=1`;
		document.body.appendChild(iframe);

		let ytPlayer: any = null;
		let destroyed = false;

		iframe.onload = async () => {
			if (destroyed) return;
			const YT = await loadYouTubeIframeApi();
			if (destroyed) return;
			ytPlayer = new YT.Player(iframe, {
				events: {
					onReady: (event: any) => {
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

	// Detect duration for accept form
	$effect(() => {
		if (!videoId) {
			durationSeconds = null;
			if (player) { player.destroy(); player = null; }
			return;
		}
		if (player) { player.destroy(); player = null; }
		player = createDurationDetector(videoId, (dur) => { durationSeconds = dur; });
		return () => { if (player) { player.destroy(); player = null; } };
	});

	// Detect duration for add-song form
	$effect(() => {
		if (!addSongVideoId) {
			addSongDuration = null;
			if (addSongPlayer) { addSongPlayer.destroy(); addSongPlayer = null; }
			return;
		}
		if (addSongPlayer) { addSongPlayer.destroy(); addSongPlayer = null; }
		addSongPlayer = createDurationDetector(addSongVideoId, (dur) => { addSongDuration = dur; });
		return () => { if (addSongPlayer) { addSongPlayer.destroy(); addSongPlayer = null; } };
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
			time={data.party.time}
			location={data.party.location}
			locationUrl={data.party.locationUrl}
			description={data.isPending ? data.party.description : undefined}
		/>

		{#if !data.verified}
			<!-- ─── EMAIL VERIFICATION GATE ─── -->
			<div class="mt-8 glass rounded-2xl p-6 md:p-8" data-testid="verify-gate">
				<h2 class="font-heading text-2xl font-extrabold gradient-text mb-2">Confirm Your Identity</h2>
				<p class="text-text-secondary mb-6 font-heading text-sm">
					Enter the email address for <span class="text-neon-cyan">{data.maskedEmail}</span> to continue.
				</p>

				{#if form?.verifyError}
					<div class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading">
						{form.verifyError}
					</div>
				{/if}

				<form method="POST" action="?/verify" use:enhance class="space-y-4">
					<div>
						<label for="verify-email" class="block font-heading text-sm font-semibold text-text-secondary mb-1.5">Your Email</label>
						<input type="email" id="verify-email" name="email" required
							data-testid="verify-email-input"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="you@email.com" />
					</div>
					<button type="submit" data-testid="verify-email-btn"
						class="cta-btn w-full font-heading font-bold text-lg py-3.5 rounded-xl bg-neon-pink text-on-accent transition-all duration-300">
						Continue
					</button>
				</form>
			</div>
		{:else}

		<!-- ─── PENDING INVITEE MODE ─── -->
		{#if data.isPending}
			<div class="mt-8 glass rounded-2xl p-6 md:p-8">
				<h2 class="font-heading text-2xl font-extrabold gradient-text mb-2">You're Invited!</h2>
				<p class="text-text-secondary mb-6 font-heading text-sm">
					Accept your invitation by adding a song to the playlist. Your track is your RSVP!
				</p>

				{#if form?.error}
					<div class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading">
						{form.error}
					</div>
				{/if}

				<form method="POST" action="?/accept" use:enhance class="space-y-5">
					<div>
						<label for="name" class="block font-heading text-sm font-semibold text-text-secondary mb-1.5">Your Name</label>
						<input type="text" id="name" name="name" required value={data.attendee.name}
							data-testid="name-input"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="What do people call you?" />
					</div>

					<div>
						<label for="youtubeUrl" class="block font-heading text-sm font-semibold text-text-secondary mb-1.5">
							Your Song
							<svg class="inline-block w-4 h-4 text-red-500 -mt-0.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
						</label>
						<input type="url" id="youtubeUrl" name="youtubeUrl" required bind:value={youtubeUrl}
							data-testid="youtube-url"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="Search YouTube, copy the link, paste it here" />
						<p class="text-text-muted text-xs mt-1.5 ml-1">
							Find a song on <a href="https://youtube.com" target="_blank" rel="noopener" class="text-neon-cyan hover:underline">youtube.com</a>, copy its URL, and paste it above
						</p>
					</div>

					{#if durationSeconds}
						<div class="flex items-center gap-3 p-3 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20" data-testid="duration-display">
							<span class="font-heading text-sm text-text-secondary">
								Duration: <span class="text-neon-cyan font-semibold">{formatShortDuration(durationSeconds)}</span>
							</span>
						</div>
					{/if}

					<div>
						<label for="comment" class="block font-heading text-sm font-semibold text-text-secondary mb-1.5">Comment <span class="text-text-muted font-normal">(optional)</span></label>
						<textarea id="comment" name="comment" maxlength={MAX_COMMENT_LENGTH} rows="2"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm resize-none"
							placeholder="Why this song? Supports **bold**, *italic*, and [links](url)"></textarea>
					</div>

					<input type="hidden" name="durationSeconds" value={durationSeconds || ''} />

					<button type="submit" data-testid="accept-btn"
						class="cta-btn w-full font-heading font-bold text-lg py-3.5 rounded-xl bg-neon-pink text-on-accent transition-all duration-300">
						Accept & Add Song
					</button>
				</form>
			</div>

		<!-- ─── ACCEPTED ATTENDEE / CREATOR MODE ─── -->
		{:else}
			<!-- Stats bar -->
			<div class="mt-3 flex flex-wrap gap-3 text-sm font-heading">
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
			</div>

			<!-- Welcome bar -->
			<div class="mt-4 glass rounded-2xl p-5">
				<p class="font-heading font-bold text-text-primary">
					{#if data.isCreator}
						Your Party, {data.attendee.name}
					{:else}
						Welcome, {data.attendee.name}!
					{/if}
				</p>
				{#if !data.isCreator}
					<div class="mt-2" data-testid="song-slots">
						<span class="font-heading text-sm text-text-secondary">
							Your songs: <span class="text-neon-cyan">{slotsDisplay}</span>
						</span>
						<span class="text-text-muted text-sm ml-2">
							(1 for accepting{#if (data as any).invitesSent > 0} + {(data as any).invitesSent} for invites sent{/if})
						</span>
					</div>
				{/if}
			</div>

			<!-- Invite Friends -->
			<section class="mt-6">
				<h2 class="font-heading text-lg font-bold gradient-text mb-3">Invite Friends</h2>

				{#if form?.inviteError}
					<div class="mb-3 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading">
						{form.inviteError}
					</div>
				{/if}

				{#if form?.inviteSent}
					<div class="mb-4 p-3 rounded-xl bg-neon-mint/10 border border-neon-mint/20 text-sm font-heading" data-testid="invite-sent-success">
						<p class="text-neon-mint">Invite sent to {form.inviteSent}!</p>
						{#if form?.inviteUrl}
							<a href={form.inviteUrl} target="_blank" rel="noopener"
								class="inline-block mt-2 text-neon-cyan text-xs hover:underline break-all"
								data-testid="invite-link">
								{form.inviteUrl}
							</a>
						{/if}
					</div>
				{/if}

				<!-- Invite list -->
				{#if (data as any).myInvites?.length > 0}
					<div class="space-y-2 mb-4">
						{#each (data as any).myInvites as invite}
							<div class="glass rounded-xl p-3 flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div class="w-2 h-2 rounded-full flex-shrink-0"
										class:bg-neon-mint={invite.accepted}
										class:bg-text-muted={!invite.accepted}
										style={invite.accepted ? '' : 'opacity: 0.4;'}
									></div>
									<div>
										<span class="font-heading text-sm"
											class:text-text-primary={invite.accepted}
											class:text-text-muted={!invite.accepted}>
											{invite.name}
										</span>
										<span class="text-xs text-text-muted ml-2">{invite.email}</span>
									</div>
								</div>
								<span class="text-xs font-heading"
									class:text-neon-mint={invite.accepted}
									class:text-text-muted={!invite.accepted}>
									{invite.accepted ? 'Accepted' : 'Pending'}
								</span>
							</div>
						{/each}
					</div>
				{/if}

				{#if data.canInvite}
					<form method="POST" action="?/sendInvite" use:enhance class="glass rounded-2xl p-5" data-testid="invite-form">
						<div class="flex flex-col sm:flex-row gap-3 mb-3">
							<div class="flex-1">
								<label for="invite-name" class="block font-heading text-xs font-semibold text-text-secondary mb-1">Friend's Name</label>
								<input type="text" id="invite-name" name="name" required data-testid="invite-name"
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
									placeholder="Their name" />
							</div>
							<div class="flex-1">
								<label for="invite-email" class="block font-heading text-xs font-semibold text-text-secondary mb-1">Friend's Email</label>
								<input type="email" id="invite-email" name="email" required data-testid="invite-email"
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
									placeholder="friend@email.com" />
							</div>
						</div>
						<button type="submit" data-testid="send-invite-btn"
							class="inline-flex items-center gap-2 font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-surface-light text-text-primary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200">
							<svg class="w-4 h-4 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
								<path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
							</svg>
							Send Invite
						</button>
						<p class="text-text-muted text-xs mt-2 ml-1">
							Each invite you send earns you +1 song slot!
						</p>
					</form>
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
			</section>

			<!-- Add Song Form -->
			{#if !data.isPending && ((data as any).songsUsed < maxSongs || data.isCreator)}
				<div class="mt-4 glass rounded-2xl p-5">
					<h3 class="font-heading font-semibold text-sm text-text-secondary mb-3">
						Add a Song
						<svg class="inline-block w-4 h-4 text-red-500 -mt-0.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
					</h3>

					{#if form?.songError}
						<div class="mb-3 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading">
							{form.songError}
						</div>
					{/if}

					{#if form?.songAdded}
						<div class="mb-3 p-3 rounded-xl bg-neon-mint/10 border border-neon-mint/20 text-neon-mint text-sm font-heading">
							Song added!
						</div>
					{/if}

					<form method="POST" action="?/addSong" use:enhance class="space-y-3">
						<div class="flex gap-2">
							<input type="url" name="youtubeUrl" required bind:value={addSongUrl}
								class="flex-1 bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
								placeholder="Paste a YouTube link" />
							<button type="submit"
								class="font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-neon-pink text-on-accent hover:bg-neon-pink/90 transition-colors flex-shrink-0">
								Add
							</button>
						</div>
						{#if addSongDuration}
							<div class="flex items-center gap-2 text-xs font-heading text-text-secondary">
								<span>Duration: <span class="text-neon-cyan">{formatShortDuration(addSongDuration)}</span></span>
							</div>
						{/if}
						<textarea name="comment" maxlength={MAX_COMMENT_LENGTH} rows="2"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm resize-none"
							placeholder="Why this song? (optional)"></textarea>
						<input type="hidden" name="durationSeconds" value={addSongDuration || ''} />
					</form>
				</div>
			{/if}

			<!-- My Songs (non-creator) -->
			{#if !data.isCreator && (data as any).mySongs?.length > 0}
				<section class="mt-6">
					<h2 class="font-heading text-lg font-bold gradient-text mb-3">Your Songs</h2>
					<div class="glass rounded-2xl p-2 space-y-0.5">
						{#each (data as any).mySongs as song, i}
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

			<!-- Playlist Progress -->
			{#if data.targetDuration || data.songs.length > 0}
				<div class="mt-6 glass rounded-2xl p-4" data-testid="playlist-progress">
					<div class="flex items-center justify-between mb-2">
						<span class="font-heading text-sm font-semibold text-text-secondary">Playlist</span>
					</div>
					<div class="h-2 bg-surface rounded-full overflow-hidden">
						<div class="h-full rounded-full transition-all duration-500"
							style="width: {fillPercent}%; background: linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-mint));">
						</div>
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
						addedBy={currentSong?.addedByName ?? ''}
						youtubeId={currentSong?.youtubeId ?? ''}
						isPlaying={isActuallyPlaying}
						{currentTime}
						duration={currentDuration}
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
						onloop={() => loopEnabled = !loopEnabled}
						onseek={(s) => ytPlayer?.seekTo(s)}
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
								isPlaying={currentPlayingIndex === i && isActuallyPlaying}
								onclick={() => playSong(i)}
								showControls={data.isCreator}
								songId={song.id}
								canMoveUp={i > 0}
								canMoveDown={i < localSongs.length - 1}
								token={data.attendee.inviteToken}
								comment={song.comment}
								startTime={songStartTimes[i]}
								isDraggable={data.isCreator}
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
						onplaystatechange={(playing) => isActuallyPlaying = playing}
						onprogress={(t, d) => { currentTime = t; currentDuration = d; }}
					/>
				</div>
			{/if}

			<!-- Creator: Invite Tree -->
			{#if data.isCreator && inviteTree}
				<section class="mt-8">
					<InviteTree tree={inviteTree} />
				</section>
			{/if}

			<!-- Creator: Settings -->
			{#if data.isCreator}
				<section class="mt-8 mb-8">
					<h2 class="font-heading text-lg font-bold gradient-text mb-3">Party Settings</h2>

					{#if form?.settingsUpdated}
						<div class="mb-3 p-3 rounded-xl bg-neon-mint/10 border border-neon-mint/20 text-neon-mint text-sm font-heading">
							Settings updated!
						</div>
					{/if}

					<form method="POST" action="?/updateSettings" use:enhance class="glass rounded-2xl p-5 space-y-4">
						<div>
							<label for="setting-attribution" class="block font-heading text-xs font-semibold text-text-secondary mb-1">
								Song Attribution
							</label>
							<select id="setting-attribution" name="songAttribution" data-testid="song-attribution"
								class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary transition-colors text-sm">
								<option value="hidden" selected={data.party.songAttribution === 'hidden'}>Hidden — guests don't see who added songs</option>
								<option value="own_tree" selected={data.party.songAttribution === 'own_tree'}>Own tree — guests see songs from their invite chain</option>
								<option value="visible" selected={data.party.songAttribution === 'visible'}>Visible — everyone sees who added songs</option>
							</select>
						</div>

						<div>
							<label for="setting-max-invites" class="block font-heading text-xs font-semibold text-text-secondary mb-1">
								Max Invites Per Guest
							</label>
							<input type="number" id="setting-max-invites" name="maxInvitesPerGuest" min="0"
								data-testid="max-invites-per-guest"
								value={data.party.maxInvitesPerGuest ?? ''}
								placeholder="Unlimited"
								class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm" />
						</div>

						<button type="submit"
							class="font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-surface-light text-text-primary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200">
							Save Settings
						</button>
					</form>
				</section>
			{/if}
		{/if}
		{/if}

	</div>
</div>

<style>
	.cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		transform: translateY(-1px);
	}

	:global(:root[data-theme="dark"]) .cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	:global(:root[data-theme="dark"]) .cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		transform: translateY(-1px);
	}
</style>
