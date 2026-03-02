<script lang="ts">
	import { enhance } from '$app/forms';
	import { parseFlexibleTime, formatTime } from '$lib/time';

	let { data, form } = $props();

	const verifiedEmail = $derived(data.verifiedEmail);
	const verificationToken = $derived(data.verificationToken);

	// Email verification state
	let emailInput = $state('');
	let emailSent = $state(false);

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
	let maxAttendeesInput = $state(50);
	let songsPerGuestInput = $state(1);
	let songsPerGuestOverride = $state(false);
	let manualOverride = $state(false);

	// Flexible time input + duration
	let startTimeInput = $state('');
	let durationHours = $state<number | null>(null);
	let parsedStartTime = $derived(parseFlexibleTime(startTimeInput));

	// Compute end time from start + duration for DB storage
	let parsedEndTime = $derived.by(() => {
		if (!parsedStartTime || !durationHours || durationHours <= 0) return null;
		const [sh, sm] = parsedStartTime.split(':').map(Number);
		const totalMinutes = sh * 60 + sm + Math.round(durationHours * 60);
		const eh = Math.floor(totalMinutes / 60) % 24;
		const em = totalMinutes % 60;
		return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
	});

	// Other form fields for persistence
	let partyName = $state('');
	let description = $state('');
	let date = $state('');
	let locationUrl = $state('');
	let createdBy = $state('');
	let maxDepthInput = $state('');
	let maxInvitesInput = $state('');

	let avgSongDurationSeconds = $derived(
		genre === 'custom' ? customMinutes * 60 + customSeconds : (GENRE_DURATIONS[genre] ?? 210)
	);

	let partyDurationMinutes = $derived.by(() => {
		if (!durationHours || durationHours <= 0) return null;
		return Math.round(durationHours * 60);
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
		songsPerGuestOverride = false;
	}

	let defaultSongsPerGuest = $derived.by(() => {
		if (!calculatedGuests || !maxAttendeesInput || maxAttendeesInput <= 0) return 1;
		return Math.max(1, Math.ceil(calculatedGuests / maxAttendeesInput));
	});

	$effect(() => {
		if (!songsPerGuestOverride) {
			songsPerGuestInput = defaultSongsPerGuest;
		}
	});

	function handleSongsPerGuestInput(e: Event) {
		const target = e.target as HTMLInputElement;
		songsPerGuestInput = Math.max(1, parseInt(target.value) || 1);
		songsPerGuestOverride = true;
	}

	let capacityInfo = $derived.by(() => {
		if (!partyDurationMinutes || !calculatedGuests) return null;
		const hours = Math.floor(partyDurationMinutes / 60);
		const mins = partyDurationMinutes % 60;
		const durationStr = hours > 0
			? mins > 0 ? `${hours}h ${mins}m` : `${hours}-hour`
			: `${mins}-minute`;
		const songWord = songsPerGuestInput === 1 ? 'song' : 'songs';
		return `Your ${durationStr} party fits ~${calculatedGuests} songs — each of ${maxAttendeesInput} guests picks ${songsPerGuestInput} ${songWord}`;
	});

	// Location URL validation
	let isValidLocationUrl = $derived.by(() => {
		if (!locationUrl.trim()) return false;
		try {
			const url = new URL(locationUrl.trim());
			const host = url.hostname.toLowerCase();
			return host.includes('google.com') || host.includes('goo.gl') || host.includes('maps.app.goo.gl');
		} catch {
			return false;
		}
	});

	let locationUrlError = $derived(locationUrl.trim() && !isValidLocationUrl);

	// Form persistence (only for State 2 — creation form)
	const STORAGE_KEY = 'create-party-form';
	let restored = $state(false);

	// Restore from sessionStorage on mount (only when verified)
	$effect(() => {
		if (!verifiedEmail) {
			restored = true;
			return;
		}
		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				const data = JSON.parse(stored);
				if (data.partyName) partyName = data.partyName;
				if (data.description) description = data.description;
				if (data.date) date = data.date;
				if (data.startTimeInput) startTimeInput = data.startTimeInput;
				if (data.durationHours != null) durationHours = data.durationHours;
				if (data.locationUrl) locationUrl = data.locationUrl;
				if (data.createdBy) createdBy = data.createdBy;
				if (data.genre) genre = data.genre;
				if (data.customMinutes !== undefined) customMinutes = data.customMinutes;
				if (data.customSeconds !== undefined) customSeconds = data.customSeconds;
				if (data.maxAttendeesInput !== undefined) maxAttendeesInput = data.maxAttendeesInput;
				if (data.manualOverride !== undefined) manualOverride = data.manualOverride;
				if (data.songsPerGuestInput !== undefined) songsPerGuestInput = data.songsPerGuestInput;
				if (data.songsPerGuestOverride !== undefined) songsPerGuestOverride = data.songsPerGuestOverride;
				if (data.maxDepthInput) maxDepthInput = data.maxDepthInput;
				if (data.maxInvitesInput) maxInvitesInput = data.maxInvitesInput;
			}
		} catch {
			// ignore
		}
		restored = true;
		return () => {};
	});

	// Save to sessionStorage on change (only after restore completes, only when verified)
	$effect(() => {
		const formData = {
			partyName, description, date, startTimeInput, durationHours,
			locationUrl, createdBy, genre,
			customMinutes, customSeconds, maxAttendeesInput,
			manualOverride, songsPerGuestInput, songsPerGuestOverride,
			maxDepthInput, maxInvitesInput
		};
		if (!restored || !verifiedEmail) return;
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
		} catch {
			// ignore
		}
	});

</script>

<svelte:head>
	<title>Start a Party - Playlist Party</title>
</svelte:head>

<main class="relative min-h-screen overflow-hidden px-4 py-12 md:py-20">
	<section class="relative z-10 max-w-xl mx-auto">
		<div class="text-center mb-2">
			<a href="/" class="inline-block font-display text-lg text-neon-pink neon-text-subtle tracking-wider mb-6">
				PLAYLIST PARTY
			</a>
			<h1 class="font-heading text-4xl md:text-5xl font-bold gradient-text">Start a Party</h1>
			<p class="text-text-secondary mt-2 text-lg">Set up your event and start building the playlist</p>
		</div>

		{#if !verifiedEmail}
			<!-- State 1: Email verification -->
			{#if emailSent || form?.emailSent}
				<div class="glass rounded-2xl p-6 md:p-8 text-center" data-testid="email-sent-message">
					{#if form?.devVerifyUrl}
						<h2 class="font-heading text-2xl font-bold text-text-primary mb-3">Verify Your Email</h2>
						<p class="text-text-secondary mb-4">Click the link below to continue creating your party.</p>
						<a href={form.devVerifyUrl} data-testid="dev-verify-link"
							class="inline-block cta-btn font-heading font-bold text-lg py-3 px-6 rounded-xl bg-neon-pink text-on-accent transition-all duration-300">
							Verify &amp; Continue
						</a>
					{:else}
						<h2 class="font-heading text-2xl font-bold text-text-primary mb-3">Check Your Email</h2>
						<p class="text-text-secondary">
							We sent a verification link to <strong class="text-neon-cyan">{emailInput || 'your email'}</strong>.
							Click the link to continue creating your party.
						</p>
						<p class="text-text-muted text-sm mt-4">The link expires in 30 minutes.</p>
					{/if}
				</div>
			{:else}
				<form method="POST" action="?/verify" use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success' && result.data?.emailSent) {
							emailSent = true;
						}
						await update();
					};
				}} class="glass rounded-2xl p-6 md:p-8 space-y-5" data-testid="verify-form">

					{#if form?.verifyError}
						<div class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading">
							{form.verifyError}
						</div>
					{/if}

					<p class="text-text-secondary text-sm">Let's get started by verifying your email address.</p>

					<div>
						<label for="email" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Your Email</label>
						<input type="email" id="email" name="email" required bind:value={emailInput}
							data-testid="creator-verify-email"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="you@example.com" />
					</div>

					<button type="submit"
						data-testid="verify-email-btn"
						class="cta-btn w-full font-heading font-bold text-xl py-3.5 rounded-xl bg-neon-pink text-on-accent transition-all duration-300">
						Verify Email
					</button>
				</form>
			{/if}
		{:else}
			<!-- State 2: Full creation form (email verified) -->
			{#if form?.error}
				<div class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading">
					{form.error}
				</div>
			{/if}

			<form method="POST" action="?/create" use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'redirect') {
						try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
						window.location.href = result.location;
					}
				};
			}} class="glass rounded-2xl p-6 md:p-8 space-y-5">
				<input type="hidden" name="verificationToken" value={verificationToken} />

				<div>
					<label for="name" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Party Name</label>
					<input type="text" id="name" name="name" required bind:value={partyName}
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
						placeholder="e.g. Kyle's Birthday Bash" />
				</div>

				<div>
					<label for="description" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Description</label>
					<textarea id="description" name="description" rows="3" bind:value={description}
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors resize-none"
						placeholder="What's the vibe?"></textarea>
				</div>

				<div class="grid grid-cols-[2fr_1fr_1fr] gap-4">
					<div>
						<label for="date" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Date</label>
						<input type="date" id="date" name="date" required bind:value={date}
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
					</div>
					<div>
						<label for="startTimeInput" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Start Time</label>
						<input type="text" id="startTimeInput" bind:value={startTimeInput} oninput={resetOverride}
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="e.g. 7pm" />
						<input type="hidden" name="time" value={parsedStartTime ?? ''} />
						{#if parsedStartTime}
							<p class="text-neon-cyan text-xs font-heading mt-1 px-1">{formatTime(parsedStartTime)}</p>
						{:else if startTimeInput.trim()}
							<p class="text-neon-pink text-xs font-heading mt-1 px-1">Couldn't parse time</p>
						{/if}
					</div>
					<div>
						<label for="durationHours" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Duration</label>
						<input type="number" id="durationHours" data-testid="duration-hours" bind:value={durationHours} oninput={resetOverride}
							step="0.5" min="0.5" max="24"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
							placeholder="Hours" />
						<input type="hidden" name="durationHours" value={durationHours ?? ''} />
						{#if parsedStartTime && parsedEndTime}
							<p class="text-neon-cyan text-xs font-heading mt-1 px-1">Ends {formatTime(parsedEndTime)}</p>
						{/if}
					</div>
				</div>

				<div>
					<label for="locationUrl" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Location</label>
					<input type="text" id="locationUrl" name="locationUrl" bind:value={locationUrl}
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
						placeholder="Paste a Google Maps link" />
					{#if isValidLocationUrl}
						<p class="text-neon-cyan text-xs font-heading mt-1 px-1">&#10003; Google Maps link</p>
					{:else if locationUrlError}
						<p class="text-neon-pink text-xs font-heading mt-1 px-1">Paste a Google Maps URL</p>
					{/if}
				</div>

				<div>
					<label for="createdBy" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Your Name</label>
					<input type="text" id="createdBy" name="createdBy" required bind:value={createdBy}
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
						placeholder="Who's throwing this?" />
				</div>

				<div>
					<label for="creatorEmail" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Your Email</label>
					<input type="email" id="creatorEmail" name="creatorEmail" data-testid="creator-email" readonly
						value={verifiedEmail}
						class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary/60 transition-colors cursor-not-allowed" />
					<p class="text-neon-cyan text-xs font-heading mt-1 px-1">&#10003; Verified</p>
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
						<div class="grid grid-cols-3 gap-4">
							<div>
								<label for="maxAttendees" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Max Guests</label>
								<input type="number" id="maxAttendees" name="maxAttendees" data-testid="max-attendees"
									value={maxAttendeesInput} oninput={handleMaxAttendeesInput} min="2" required
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
							</div>
							<div>
								<label for="songsPerGuest" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Songs / Guest</label>
								<input type="number" id="songsPerGuest" name="songsPerGuest" data-testid="songs-per-guest"
									value={songsPerGuestInput} oninput={handleSongsPerGuestInput} min="1" required
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary transition-colors" />
							</div>
							<div>
								<label for="maxInvitesPerGuest" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Invites / Guest</label>
								<input type="number" id="maxInvitesPerGuest" name="maxInvitesPerGuest" min="1" bind:value={maxInvitesInput}
									class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
									placeholder="Unlimited" />
							</div>
						</div>

						<div>
							<label for="maxDepth" class="block font-heading text-base font-semibold text-text-secondary mb-1.5">Max Invite Depth</label>
							<input type="number" id="maxDepth" name="maxDepth" min="1" bind:value={maxDepthInput}
								class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted/50 transition-colors"
								placeholder="No limit" />
						</div>
					</div>
				</div>

				<p class="text-text-muted text-sm font-heading px-1">
					The playlist may run slightly over the party duration — that's by design!
				</p>

				<button type="submit"
					class="cta-btn w-full font-heading font-bold text-xl py-3.5 rounded-xl bg-neon-pink text-on-accent transition-all duration-300 mt-2">
					Create Party
				</button>
			</form>
		{/if}
	</section>
</main>

<style>
	.cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		transform: translateY(-2px);
	}

	:global(:root[data-theme="dark"]) .cta-btn {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	:global(:root[data-theme="dark"]) .cta-btn:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		transform: translateY(-2px);
	}
</style>
