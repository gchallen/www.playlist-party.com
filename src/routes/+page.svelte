<script lang="ts">
	import { formatTime } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const eqBars = Array.from({ length: 30 }, (_, i) => ({
		height: 60 + ((i * 7 + i * i * 2) % 120),
		delay: (i * 0.08) % 0.8,
		animIndex: (i % 5) + 1,
		opacity: 0.12 + ((i * 3) % 10) / 100
	}));
</script>

<svelte:head>
	<title>Playlist Party</title>
	<meta
		name="description"
		content="Create a party, share the link, and build the playlist together. No apps, no accounts — just music and vibes."
	/>
</svelte:head>

<main class="relative min-h-screen overflow-hidden">
	<!-- Hero -->
	<section class="relative flex flex-col items-center justify-center px-4 py-20 min-h-screen">
		<!-- Equalizer bars backdrop -->
		<div
			class="absolute inset-x-0 bottom-0 top-1/3 flex items-end justify-center gap-[3px] overflow-hidden"
			aria-hidden="true"
		>
			{#each eqBars as bar, i (i)}
				<div
					class="w-[3px] md:w-[4px] rounded-t-full origin-bottom"
					style="height: {bar.height}px; animation: eq-{bar.animIndex} {0.6 +
						bar.delay}s ease-in-out infinite; animation-delay: {bar.delay}s; opacity: {bar.opacity}; background: var(--eq-bar-gradient);"
				></div>
			{/each}
		</div>

		<!-- Vinyl record decoration -->
		<div
			class="vinyl-record absolute right-[-60px] md:right-[5%] top-[15%] w-[200px] h-[200px] md:w-[280px] md:h-[280px] opacity-15 animate-vinyl"
			aria-hidden="true"
		>
			<div
				class="w-full h-full rounded-full relative"
				style="background: repeating-radial-gradient(circle at center, transparent 0px, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 5px), radial-gradient(circle, var(--color-surface-light) 0%, var(--color-surface) 100%);"
			>
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] h-[35%] rounded-full bg-neon-pink"
				>
					<div
						class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[25%] h-[25%] rounded-full bg-void"
					></div>
				</div>
			</div>
		</div>

		<!-- Hero content -->
		<div class="relative z-10 text-center max-w-3xl mx-auto">
			<h1
				class="hero-title font-display text-6xl sm:text-7xl md:text-8xl lg:text-9xl text-neon-pink leading-tight tracking-wider mb-2"
			>
				PLAYLIST<br />PARTY
			</h1>

			<p class="font-heading text-xl sm:text-2xl md:text-3xl text-text-secondary font-medium mt-6 mb-10 tracking-wide">
				Your Songs. Your Squad. Your&nbsp;Vibe.
			</p>

			<a
				href="/create"
				class="cta-btn inline-block font-heading font-bold text-xl px-10 py-4 rounded-full bg-neon-pink text-on-accent tracking-wide transition-all duration-300"
			>
				Start a Party
			</a>
		</div>
	</section>

	<!-- Live Parties Feed -->
	{#if data.feed.length > 0}
		<section class="relative z-10 max-w-6xl mx-auto px-4 pb-16">
			<h2 class="font-heading font-bold text-2xl md:text-3xl text-text-primary text-center mb-8">Playlist Parties</h2>
			<div class="grid grid-cols-1 gap-4">
				{#each data.feed as party (party.publicToken)}
					<a
						href="/public/{party.publicToken}"
						class="feed-card glass rounded-2xl p-5 block transition-all duration-200 hover:scale-[1.02]"
					>
						<h3 class="font-heading font-bold text-lg text-text-primary truncate">{party.name}</h3>
						<div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-text-secondary">
							<span class="flex items-center gap-1">
								<svg
									class="w-3.5 h-3.5 text-neon-purple"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg
								>
								{party.date}{#if party.time}<span class="text-text-muted">&nbsp;at {formatTime(party.time)}</span>{/if}
							</span>
							{#if party.hostName}
								<span class="flex items-center gap-1">
									<svg
										class="w-3.5 h-3.5 text-neon-mint"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg
									>
									{party.hostName}
								</span>
							{/if}
							{#if party.guestCount !== null}
								<span class="flex items-center gap-1">
									<svg
										class="w-3.5 h-3.5 text-neon-cyan"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
											d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
										/></svg
									>
									{party.guestCount}
								</span>
							{/if}
						</div>
						{#if party.artists.length > 0}
							<p class="mt-2.5 text-xs text-text-muted line-clamp-3">
								{party.artists.join(', ')}
							</p>
						{/if}
						<div class="mt-2.5">
							<span class="inline-flex items-center gap-1 text-xs font-heading font-semibold text-neon-pink">
								<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
									/></svg
								>
								{party.songCount}
								{party.songCount === 1 ? 'song' : 'songs'}
							</span>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- How it works -->
	<section class="relative z-10 max-w-3xl mx-auto px-4 pb-24">
		<div class="space-y-10">
			<div class="flex gap-5 md:gap-8 items-start">
				<span class="font-display text-5xl md:text-6xl text-neon-pink shrink-0 leading-none mt-1">1</span>
				<div>
					<h3 class="font-heading font-bold text-2xl md:text-3xl text-text-primary">Create a party.</h3>
					<p class="text-text-secondary text-lg md:text-xl mt-2 leading-relaxed">
						Set up your event, add your tracks, and get an invite link to share.
					</p>
				</div>
			</div>

			<div class="flex gap-5 md:gap-8 items-start">
				<span class="font-display text-5xl md:text-6xl text-neon-pink shrink-0 leading-none mt-1">2</span>
				<div>
					<h3 class="font-heading font-bold text-2xl md:text-3xl text-text-primary">Send the link.</h3>
					<p class="text-text-secondary text-lg md:text-xl mt-2 leading-relaxed">
						Share it however you want — text, group chat, carrier pigeon. Friends RSVP and add their tracks. They can
						share the link too.
					</p>
				</div>
			</div>

			<div class="flex gap-5 md:gap-8 items-start">
				<span class="font-display text-5xl md:text-6xl text-neon-pink shrink-0 leading-none mt-1">3</span>
				<div>
					<h3 class="font-heading font-bold text-2xl md:text-3xl text-text-primary">Hit play.</h3>
					<p class="text-text-secondary text-lg md:text-xl mt-2 leading-relaxed">
						The night arrives, and it's time to find out who brought the bangers! Track who's coming and enjoy the
						playlist together.
					</p>
				</div>
			</div>
		</div>
	</section>

	<footer class="relative z-10 text-center py-8 text-text-muted text-base border-t border-neon-purple/10">
		<p>Made for parties worth remembering.</p>
	</footer>
</main>

<style>
	.hero-title {
		filter: none;
	}

	.cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		transform: translateY(-2px);
	}

	:global(:root[data-theme='dark']) .cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	:global(:root[data-theme='dark']) .cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		transform: translateY(-2px);
	}

	.feed-card {
		border: 1px solid rgba(0, 0, 0, 0.06);
	}

	:global(:root[data-theme='dark']) .feed-card {
		border-color: rgba(255, 255, 255, 0.06);
	}

	.feed-card:hover {
		border-color: var(--color-neon-purple);
	}
</style>
