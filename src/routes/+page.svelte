<script lang="ts">
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
</style>
