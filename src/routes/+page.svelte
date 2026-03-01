<script lang="ts">
	const notes = Array.from({ length: 15 }, (_, i) => ({
		char: ['\u266A', '\u266B', '\u266C', '\u2669', '\u266A'][i % 5],
		left: ((i * 17 + 5) % 90) + 5,
		delay: (i * 1.7) % 10,
		duration: 10 + ((i * 1.1) % 8),
		size: 18 + ((i * 2.5) % 16),
		dx: -40 + ((i * 13) % 80)
	}));

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
		content="Create a party playlist where every guest adds their song. No apps, no accounts — just music and vibes."
	/>
</svelte:head>

<main class="relative min-h-screen overflow-hidden">
	<!-- Floating music notes -->
	<div class="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
		{#each notes as note}
			<span
				class="absolute bottom-0 text-neon-purple/25 select-none"
				style="left: {note.left}%; font-size: {note.size}px; animation: note-rise {note.duration}s linear {note.delay}s infinite; --dx: {note.dx}px;"
			>
				{note.char}
			</span>
		{/each}
	</div>

	<!-- Hero -->
	<section class="relative min-h-screen flex flex-col items-center justify-center px-4 py-20">
		<!-- Equalizer bars backdrop -->
		<div
			class="absolute inset-x-0 bottom-0 top-1/3 flex items-end justify-center gap-[3px] overflow-hidden"
			aria-hidden="true"
		>
			{#each eqBars as bar}
				<div
					class="w-[3px] md:w-[4px] rounded-t-full origin-bottom"
					style="height: {bar.height}px; animation: eq-{bar.animIndex} {0.6 + bar.delay}s ease-in-out infinite; animation-delay: {bar.delay}s; opacity: {bar.opacity}; background: linear-gradient(to top, rgba(255, 45, 120, 0.3), rgba(180, 77, 255, 0.1));"
				></div>
			{/each}
		</div>

		<!-- Vinyl record decoration -->
		<div
			class="absolute right-[-60px] md:right-[5%] top-[15%] w-[200px] h-[200px] md:w-[280px] md:h-[280px] opacity-15 animate-vinyl"
			aria-hidden="true"
		>
			<div
				class="w-full h-full rounded-full relative"
				style="background: repeating-radial-gradient(circle at center, transparent 0px, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 5px), radial-gradient(circle, var(--color-surface-light) 0%, var(--color-surface) 100%);"
			>
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] h-[35%] rounded-full"
					style="background: linear-gradient(135deg, var(--color-neon-pink), var(--color-neon-purple));"
				>
					<div
						class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[25%] h-[25%] rounded-full bg-void"
					></div>
				</div>
			</div>
		</div>

		<!-- Hero content -->
		<div class="relative z-10 text-center max-w-3xl mx-auto">
			<h1 class="hero-title font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-neon-pink leading-tight tracking-wider mb-2">
				PLAYLIST<br />PARTY
			</h1>

			<p
				class="font-heading text-lg sm:text-xl md:text-2xl text-text-secondary font-medium mt-6 mb-10 tracking-wide"
			>
				Your Songs. Your Squad. Your&nbsp;Vibe.
			</p>

			<a href="/create" class="cta-btn inline-block font-heading font-bold text-lg md:text-xl px-10 py-4 rounded-full bg-neon-pink text-void tracking-wide transition-all duration-300">
				Start a Party
			</a>
		</div>
	</section>

	<!-- How it works -->
	<section class="relative z-10 max-w-5xl mx-auto px-4 pb-24">
		<h2 class="font-heading text-2xl md:text-3xl font-bold text-center gradient-text mb-12">
			How It Works
		</h2>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<div
				class="glass rounded-2xl p-6 md:p-8 text-center group hover:border-neon-pink/30 transition-colors duration-300"
			>
				<div
					class="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
					style="background: linear-gradient(135deg, rgba(255, 45, 120, 0.15), rgba(180, 77, 255, 0.15));"
				>
					<svg class="w-8 h-8 text-neon-pink" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
					</svg>
				</div>
				<h3 class="font-heading font-bold text-lg mb-2 text-text-primary">Drop a Track</h3>
				<p class="text-text-muted text-sm leading-relaxed">
					Paste a YouTube link as your RSVP. Your song is your entrance ticket.
				</p>
			</div>

			<div
				class="glass rounded-2xl p-6 md:p-8 text-center group hover:border-neon-cyan/30 transition-colors duration-300"
			>
				<div
					class="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
					style="background: linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(180, 77, 255, 0.15));"
				>
					<svg class="w-8 h-8 text-neon-cyan" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
						/>
					</svg>
				</div>
				<h3 class="font-heading font-bold text-lg mb-2 text-text-primary">Grow the Party</h3>
				<p class="text-text-muted text-sm leading-relaxed">
					Invite friends to earn more song slots. Every invite = another track for you.
				</p>
			</div>

			<div
				class="glass rounded-2xl p-6 md:p-8 text-center group hover:border-neon-mint/30 transition-colors duration-300"
			>
				<div
					class="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
					style="background: linear-gradient(135deg, rgba(0, 255, 163, 0.15), rgba(180, 77, 255, 0.15));"
				>
					<svg class="w-8 h-8 text-neon-mint" viewBox="0 0 24 24" fill="currentColor">
						<path d="M8 5v14l11-7z" />
					</svg>
				</div>
				<h3 class="font-heading font-bold text-lg mb-2 text-text-primary">Hit Play</h3>
				<p class="text-text-muted text-sm leading-relaxed">
					Watch the playlist grow, then reveal who brought which banger at the party.
				</p>
			</div>
		</div>
	</section>

	<footer class="relative z-10 text-center py-8 text-text-muted text-sm border-t border-neon-purple/10">
		<p>Made for parties worth remembering.</p>
	</footer>
</main>

<style>
	.hero-title {
		text-shadow:
			0 0 10px rgba(255, 45, 120, 0.5),
			0 0 20px rgba(255, 45, 120, 0.3),
			0 0 40px rgba(255, 45, 120, 0.15),
			0 0 80px rgba(255, 45, 120, 0.05);
	}

	.cta-btn {
		box-shadow:
			0 0 15px rgba(255, 45, 120, 0.4),
			0 0 30px rgba(255, 45, 120, 0.2);
	}

	.cta-btn:hover {
		box-shadow:
			0 0 20px rgba(255, 45, 120, 0.6),
			0 0 40px rgba(255, 45, 120, 0.3),
			0 0 60px rgba(255, 45, 120, 0.15);
		transform: translateY(-2px);
	}
</style>
