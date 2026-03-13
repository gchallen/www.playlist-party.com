<script lang="ts">
	import PartyHeader from '$lib/components/PartyHeader.svelte';
	import SongCard from '$lib/components/SongCard.svelte';
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte';
	import PlayerControls from '$lib/components/PlayerControls.svelte';
	import { formatDuration, computeSongStartTimes } from '$lib/time';
	import { loadYouTubeIframeApi } from '$lib/youtube-api';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Playback state
	let currentPlayingIndex = $state<number | null>(null);
	let isActuallyPlaying = $state(false);
	let currentTime = $state(0);
	let currentDuration = $state(0);
	let loopEnabled = $state(true);
	let volume = $state(1);
	let muted = $state(false);
	let ytPlayer = $state<YouTubePlayer>();

	const currentVideoId = $derived(
		currentPlayingIndex !== null && currentPlayingIndex < data.songs.length
			? data.songs[currentPlayingIndex].youtubeId
			: data.songs.length > 0
				? data.songs[0].youtubeId
				: ''
	);

	const startTimes = $derived(
		computeSongStartTimes(
			data.party.time,
			data.songs.map((s) => s.durationSeconds)
		)
	);

	const youtubePlaylistUrl = $derived(
		data.songs.length > 0
			? `https://www.youtube.com/watch_videos?video_ids=${data.songs
					.slice(0, 50)
					.map((s) => s.youtubeId)
					.join(',')}`
			: null
	);

	const currentPlaylistTime = $derived(() => {
		if (currentPlayingIndex === null) return 0;
		let t = 0;
		for (let i = 0; i < currentPlayingIndex; i++) {
			t += data.songs[i].durationSeconds;
		}
		return t + currentTime;
	});

	function playSong(index: number) {
		currentPlayingIndex = index;
	}

	function handleEnded() {
		if (currentPlayingIndex === null) return;
		if (currentPlayingIndex < data.songs.length - 1) {
			currentPlayingIndex++;
		} else if (loopEnabled) {
			currentPlayingIndex = 0;
		} else {
			isActuallyPlaying = false;
		}
	}

	function togglePlayPause() {
		if (currentPlayingIndex === null && data.songs.length > 0) {
			currentPlayingIndex = 0;
			return;
		}
		ytPlayer?.togglePlayPause();
	}

	function handleSeek(seconds: number) {
		ytPlayer?.seekTo(seconds);
	}

	function handleVolume(vol: number) {
		volume = vol;
		muted = false;
		ytPlayer?.unmute();
		ytPlayer?.setVolume(vol);
	}

	function handleMute() {
		muted = !muted;
		if (muted) ytPlayer?.mute();
		else ytPlayer?.unmute();
	}

	// Preload YouTube API
	loadYouTubeIframeApi();
</script>

<svelte:head>
	<title>{data.party.name} - Playlist Party</title>
	<meta name="description" content="Check out the playlist for {data.party.name} on Playlist Party" />
</svelte:head>

<div class="max-w-3xl mx-auto px-4 py-8 space-y-6">
	<a
		href="/"
		class="inline-flex items-center gap-1.5 text-text-secondary hover:text-neon-pink transition-colors text-sm font-heading"
	>
		<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
			><path d="M19 12H5M12 19l-7-7 7-7" /></svg
		>
		Back to Playlist Party
	</a>

	<PartyHeader
		name={data.party.name}
		date={data.party.date}
		time={data.party.time ?? undefined}
		location={data.party.location ?? undefined}
		locationUrl={data.party.locationUrl ?? undefined}
		description={data.party.description ?? undefined}
	/>

	<!-- Stats bar -->
	<div class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-secondary font-heading">
		{#if data.hostName}
			<span class="flex items-center gap-1.5">
				<svg class="w-4 h-4 text-neon-mint" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg
				>
				Hosted by {data.hostName}
			</span>
		{/if}
		<span class="flex items-center gap-1.5">
			<svg class="w-4 h-4 text-neon-purple" viewBox="0 0 24 24" fill="currentColor"
				><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg
			>
			{data.songs.length}
			{data.songs.length === 1 ? 'song' : 'songs'}
			<span class="text-text-muted">{formatDuration(data.totalDuration)}</span>
		</span>
		{#if data.guestCount !== null}
			<span class="flex items-center gap-1.5">
				<svg class="w-4 h-4 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
						d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
					/></svg
				>
				{data.guestCount}
				{data.guestCount === 1 ? 'guest' : 'guests'}
			</span>
		{/if}
	</div>

	{#if youtubePlaylistUrl}
		<a
			href={youtubePlaylistUrl}
			target="_blank"
			rel="noopener"
			class="inline-flex items-center gap-1.5 text-xs font-heading font-semibold px-3 py-1.5 rounded-lg bg-surface-light text-text-secondary border border-neon-purple/20 hover:border-neon-purple/40 hover:text-text-primary transition-all duration-200"
			title="Open playlist on YouTube"
		>
			<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"
				><path
					d="M21.582 6.186a2.506 2.506 0 0 0-1.768-1.768C18.254 4 12 4 12 4s-6.254 0-7.814.418A2.506 2.506 0 0 0 2.418 6.186C2 7.746 2 12 2 12s0 4.254.418 5.814a2.506 2.506 0 0 0 1.768 1.768C5.746 20 12 20 12 20s6.254 0 7.814-.418a2.506 2.506 0 0 0 1.768-1.768C22 16.254 22 12 22 12s0-4.254-.418-5.814zM10 15.464V8.536L16 12l-6 3.464z"
				/></svg
			>
			Play on YouTube{#if data.songs.length > 50}&nbsp;(first 50){/if}
		</a>
	{/if}

	{#if data.songs.length > 0}
		<!-- YouTube Player -->
		<YouTubePlayer
			bind:this={ytPlayer}
			videoId={currentVideoId}
			autoplay={currentPlayingIndex !== null}
			onended={handleEnded}
			onplaystatechange={(playing) => (isActuallyPlaying = playing)}
			onprogress={(ct, dur) => {
				currentTime = ct;
				currentDuration = dur;
			}}
		/>

		<!-- Player Controls -->
		<PlayerControls
			title={currentPlayingIndex !== null
				? data.songs[currentPlayingIndex].youtubeTitle
				: (data.songs[0]?.youtubeTitle ?? '')}
			youtubeId={currentVideoId}
			isPlaying={isActuallyPlaying}
			{currentTime}
			duration={currentDuration}
			trackIndex={(currentPlayingIndex ?? 0) + 1}
			totalTracks={data.songs.length}
			currentPlaylistTime={currentPlaylistTime()}
			totalPlaylistDuration={data.totalDuration}
			{loopEnabled}
			{volume}
			{muted}
			ontoggle={togglePlayPause}
			onprev={currentPlayingIndex !== null && currentPlayingIndex > 0 ? () => currentPlayingIndex!-- : null}
			onnext={currentPlayingIndex !== null && currentPlayingIndex < data.songs.length - 1
				? () => currentPlayingIndex!++
				: null}
			onloop={() => (loopEnabled = !loopEnabled)}
			onseek={handleSeek}
			onvolume={handleVolume}
			onmute={handleMute}
		/>

		<!-- Song list -->
		<div class="glass rounded-2xl p-4 space-y-0.5">
			{#each data.songs as song, i (song.youtubeId + '-' + i)}
				<SongCard
					youtubeId={song.youtubeId}
					title={song.youtubeTitle}
					channelName={song.youtubeChannelName ?? ''}
					position={i + 1}
					comment={song.comment}
					isHost={song.isHost}
					isPlaying={currentPlayingIndex === i}
					startTime={startTimes[i] || null}
					onclick={() => playSong(i)}
				/>
			{/each}
		</div>
	{:else}
		<div class="glass rounded-2xl p-8 text-center">
			<p class="text-text-muted font-heading">No songs yet — check back later!</p>
		</div>
	{/if}
</div>
