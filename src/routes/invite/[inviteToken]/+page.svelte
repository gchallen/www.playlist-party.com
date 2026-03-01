<script lang="ts">
	import { enhance } from '$app/forms';
	import PartyHeader from '$lib/components/PartyHeader.svelte';
	import { extractYouTubeId } from '$lib/youtube';

	let { data, form } = $props();

	let youtubeUrl = $state('');
	let durationSeconds = $state<number | null>(null);
	let ytApiReady = $state(false);
	let playerWrapper: HTMLDivElement;
	let player: any = null;

	const videoId = $derived(youtubeUrl ? extractYouTubeId(youtubeUrl) : null);

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatEstimatedPlayTime(totalSeconds: number): string {
		if (!data.party.time) return '';
		const match = data.party.time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
		if (!match) return '';

		let hours = parseInt(match[1], 10);
		const minutes = parseInt(match[2], 10);
		const period = match[3];

		if (period) {
			if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
			if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
		}

		const startMinutes = hours * 60 + minutes;
		const playMinutes = startMinutes + Math.floor(totalSeconds / 60);

		let playHours = Math.floor(playMinutes / 60) % 24;
		const playMins = playMinutes % 60;

		const isPM = playHours >= 12;
		if (playHours > 12) playHours -= 12;
		if (playHours === 0) playHours = 12;

		return `${playHours}:${playMins.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
	}

	const estimatedPlayTime = $derived(
		data.party.time ? formatEstimatedPlayTime(data.totalPlaylistDuration) : ''
	);

	// Load YouTube IFrame API
	$effect(() => {
		if (typeof window === 'undefined') return;

		if ((window as any).YT && (window as any).YT.Player) {
			ytApiReady = true;
			return;
		}

		if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
			const tag = document.createElement('script');
			tag.src = 'https://www.youtube.com/iframe_api';
			document.head.appendChild(tag);
		}

		const prev = (window as any).onYouTubeIframeAPIReady;
		(window as any).onYouTubeIframeAPIReady = () => {
			if (prev) prev();
			ytApiReady = true;
		};
	});

	// Create/update player when videoId changes
	$effect(() => {
		if (!videoId) {
			durationSeconds = null;
			if (player) {
				player.destroy();
				player = null;
			}
			return;
		}

		if (!ytApiReady || !playerWrapper) return;

		if (player) {
			player.destroy();
			player = null;
		}

		playerWrapper.innerHTML = '';
		const target = document.createElement('div');
		playerWrapper.appendChild(target);

		player = new (window as any).YT.Player(target, {
			height: '1',
			width: '1',
			videoId,
			events: {
				onReady: (event: any) => {
					const dur = event.target.getDuration();
					if (dur > 0) {
						durationSeconds = Math.round(dur);
					}
				}
			}
		});
	});
</script>

<svelte:head>
	<title>You're Invited to {data.party.name}! - Playlist Party</title>
</svelte:head>

<div class="min-h-screen flex items-start justify-center px-4 py-12 md:py-20">
	<div class="w-full max-w-lg">
		<div class="text-center mb-8">
			<a
				href="/"
				class="inline-block font-display text-lg text-neon-pink neon-text-subtle tracking-wider mb-6"
			>
				PLAYLIST PARTY
			</a>
			<h1 class="font-heading text-3xl md:text-4xl font-extrabold gradient-text mb-2">
				You're Invited!
			</h1>
		</div>

		<PartyHeader
			name={data.party.name}
			date={data.party.date}
			time={data.party.time}
			location={data.party.location}
			description={data.party.description}
		/>

		<div class="mt-8 glass rounded-2xl p-6 md:p-8">
			<p class="text-text-secondary mb-6 font-heading text-sm">
				Accept your invitation by adding a song to the playlist. Your track is your RSVP!
			</p>

			{#if form?.error}
				<div
					class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
				>
					{form.error}
				</div>
			{/if}

			<form method="POST" use:enhance class="space-y-5">
				<div>
					<label
						for="name"
						class="block font-heading text-sm font-semibold text-text-secondary mb-1.5"
						>Your Name</label
					>
					<input
						type="text"
						id="name"
						name="name"
						required
						value={data.attendeeName}
						data-testid="name-input"
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
						placeholder="What do people call you?"
					/>
				</div>

				<div>
					<label
						for="youtubeUrl"
						class="block font-heading text-sm font-semibold text-text-secondary mb-1.5"
						>Your Song</label
					>
					<input
						type="url"
						id="youtubeUrl"
						name="youtubeUrl"
						required
						bind:value={youtubeUrl}
						data-testid="youtube-url"
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
						placeholder="https://youtube.com/watch?v=..."
					/>
					<p class="text-text-muted/60 text-xs mt-1.5 ml-1">
						Paste a YouTube link to add your track
					</p>
				</div>

				{#if durationSeconds}
					<div
						class="flex items-center gap-3 p-3 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20"
						data-testid="duration-display"
					>
						<span class="font-heading text-sm text-text-secondary">
							Duration: <span class="text-neon-cyan font-semibold">{formatDuration(durationSeconds)}</span>
						</span>
						{#if estimatedPlayTime}
							<span class="text-text-muted/40">|</span>
							<span class="font-heading text-sm text-text-secondary">
								Estimated play time: <span class="text-neon-mint font-bold">{estimatedPlayTime}</span>
							</span>
						{/if}
					</div>
				{/if}

				<input type="hidden" name="durationSeconds" value={durationSeconds || ''} />

				<!-- Hidden YouTube player for duration detection -->
				<div
					bind:this={playerWrapper}
					style="position: absolute; width: 0; height: 0; overflow: hidden;"
				></div>

				<button
					type="submit"
					data-testid="accept-btn"
					class="cta-btn w-full font-heading font-bold text-lg py-3.5 rounded-xl bg-neon-pink text-void transition-all duration-300"
				>
					Accept & Add Song
				</button>
			</form>
		</div>
	</div>
</div>

<style>
	.cta-btn {
		box-shadow:
			0 0 15px rgba(255, 45, 120, 0.3),
			0 0 30px rgba(255, 45, 120, 0.1);
	}

	.cta-btn:hover {
		box-shadow:
			0 0 20px rgba(255, 45, 120, 0.5),
			0 0 40px rgba(255, 45, 120, 0.2);
		transform: translateY(-1px);
	}
</style>
