<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();

	const GENRE_DURATIONS: Record<string, number> = {
		pop: 210,
		rock: 240,
		'alt-indie': 240,
		'hiphop-rnb': 225,
		'electronic-dance': 330,
		jazz: 360,
		classical: 480
	};

	let genre = $state('pop');
	let customMinutes = $state(4);
	let customSeconds = $state(0);
	let startTime = $state('');
	let endTime = $state('');
	let maxAttendeesInput = $state(50);
	let manualOverride = $state(false);

	let avgSongDurationSeconds = $derived(
		genre === 'custom' ? customMinutes * 60 + customSeconds : (GENRE_DURATIONS[genre] ?? 210)
	);

	let partyDurationMinutes = $derived.by(() => {
		if (!startTime || !endTime) return null;
		const [sh, sm] = startTime.split(':').map(Number);
		const [eh, em] = endTime.split(':').map(Number);
		let diff = (eh * 60 + em) - (sh * 60 + sm);
		if (diff <= 0) diff += 24 * 60;
		return diff;
	});

	let calculatedGuests = $derived.by(() => {
		if (!partyDurationMinutes || !avgSongDurationSeconds) return null;
		return Math.floor((partyDurationMinutes * 60) / avgSongDurationSeconds);
	});

	$effect(() => {
		if (calculatedGuests !== null && !manualOverride) {
			maxAttendeesInput = calculatedGuests;
		}
	});

	function handleMaxAttendeesInput(e: Event) {
		const target = e.target as HTMLInputElement;
		maxAttendeesInput = parseInt(target.value) || 2;
		manualOverride = true;
	}

	function resetOverride() {
		manualOverride = false;
	}

	let capacityInfo = $derived.by(() => {
		if (!partyDurationMinutes || !calculatedGuests) return null;
		const hours = Math.floor(partyDurationMinutes / 60);
		const mins = partyDurationMinutes % 60;
		const durationStr = hours > 0
			? mins > 0 ? `${hours}h ${mins}m` : `${hours}-hour`
			: `${mins}-minute`;
		return `Your ${durationStr} party can host up to ${calculatedGuests} guests with everyone getting at least one song`;
	});
</script>

<svelte:head>
	<title>Start a Party - Playlist Party</title>
</svelte:head>

<main class="relative min-h-screen overflow-hidden px-4 py-12 md:py-20">
	<section class="relative z-10 max-w-lg mx-auto">
		<div class="text-center mb-2">
			<a href="/" class="inline-block font-display text-lg text-neon-pink neon-text-subtle tracking-wider mb-6">
				PLAYLIST PARTY
			</a>
			<h1 class="font-heading text-4xl md:text-5xl font-bold gradient-text">Start a Party</h1>
			<p class="text-text-muted mt-2 text-lg">Set up your event and start building the playlist</p>
		</div>

		{#if form?.error}
			<div class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading">
				{form.error}
			</div>
		{/if}

		<form method="POST" use:enhance class="glass rounded-2xl p-6 md:p-8 space-y-5">
			<div>
				<label for="name" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Party Name</label>
				<input type="text" id="name" name="name" required
					class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
					placeholder="e.g. Kyle's Birthday Bash" />
			</div>

			<div>
				<label for="description" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Description</label>
				<textarea id="description" name="description" rows="3"
					class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors resize-none"
					placeholder="What's the vibe?"></textarea>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="date" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Date</label>
					<input type="date" id="date" name="date" required
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
				</div>
				<div>
					<label for="time" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Start Time</label>
					<input type="time" id="time" name="time" bind:value={startTime} onchange={resetOverride}
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
				</div>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="endTime" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">End Time</label>
					<input type="time" id="endTime" name="endTime" data-testid="end-time" bind:value={endTime} onchange={resetOverride}
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
				</div>
				<div>
					<label for="location" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Location</label>
					<input type="text" id="location" name="location"
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
						placeholder="Where's the party?" />
				</div>
			</div>

			<div>
				<label for="createdBy" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Your Name</label>
				<input type="text" id="createdBy" name="createdBy" required
					class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
					placeholder="Who's throwing this?" />
			</div>

			<div>
				<label for="creatorEmail" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Your Email</label>
				<input type="email" id="creatorEmail" name="creatorEmail" data-testid="creator-email" required
					class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
					placeholder="you@example.com" />
			</div>

			<div class="pt-2 border-t border-neon-purple/10">
				<p class="font-heading text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Party Music</p>

				<div class="space-y-4">
					<div>
						<label for="genre" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Genre / Avg Song Length</label>
						<select id="genre" data-testid="genre-select" bind:value={genre} onchange={resetOverride}
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors">
							<option value="pop">Pop (3:30)</option>
							<option value="rock">Rock (4:00)</option>
							<option value="alt-indie">Alternative / Indie (4:00)</option>
							<option value="hiphop-rnb">Hip-Hop / R&B (3:45)</option>
							<option value="electronic-dance">Electronic / Dance (5:30)</option>
							<option value="jazz">Jazz (6:00)</option>
							<option value="classical">Classical (8:00)</option>
							<option value="custom">Custom</option>
						</select>
					</div>

					{#if genre === 'custom'}
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="customMinutes" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Minutes</label>
								<input type="number" id="customMinutes" bind:value={customMinutes} onchange={resetOverride} min="0" max="30"
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
							</div>
							<div>
								<label for="customSeconds" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Seconds</label>
								<input type="number" id="customSeconds" bind:value={customSeconds} onchange={resetOverride} min="0" max="59"
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
							</div>
						</div>
					{/if}

					{#if capacityInfo}
						<p data-testid="guest-capacity-info" class="text-base text-neon-cyan font-heading px-1">
							{capacityInfo}
						</p>
					{/if}
				</div>
			</div>

			<div class="pt-2 border-t border-neon-purple/10">
				<p class="font-heading text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Guest Limits</p>

				<div class="space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="maxAttendees" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Maximum Guests</label>
							<input type="number" id="maxAttendees" name="maxAttendees" data-testid="max-attendees"
								value={maxAttendeesInput} oninput={handleMaxAttendeesInput} min="2" required
								class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
						</div>
						<div>
							<label for="maxInvitesPerGuest" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Invites Per Guest</label>
							<input type="number" id="maxInvitesPerGuest" name="maxInvitesPerGuest" min="1"
								class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
								placeholder="Unlimited" />
						</div>
					</div>

					<div>
						<label for="maxDepth" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Max Invite Depth</label>
						<input type="number" id="maxDepth" name="maxDepth" min="1"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="No limit" />
					</div>
				</div>
			</div>

			<p class="text-text-muted/60 text-sm font-heading px-1">
				The playlist may run slightly over the party duration — that's by design!
			</p>

			<button type="submit"
				class="cta-btn w-full font-heading font-bold text-xl py-3.5 rounded-xl bg-neon-pink text-on-accent transition-all duration-300 mt-2">
				Create Party
			</button>
		</form>
	</section>
</main>

<style>
	.cta-btn {
		box-shadow: 0 4px 15px rgba(229, 34, 114, 0.3);
	}

	.cta-btn:hover {
		box-shadow: 0 6px 25px rgba(229, 34, 114, 0.4);
		transform: translateY(-2px);
	}

	:global(:root[data-theme="dark"]) .cta-btn {
		box-shadow:
			0 0 15px rgba(255, 45, 120, 0.4),
			0 0 30px rgba(255, 45, 120, 0.2);
	}

	:global(:root[data-theme="dark"]) .cta-btn:hover {
		box-shadow:
			0 0 20px rgba(255, 45, 120, 0.6),
			0 0 40px rgba(255, 45, 120, 0.3),
			0 0 60px rgba(255, 45, 120, 0.15);
		transform: translateY(-2px);
	}
</style>
