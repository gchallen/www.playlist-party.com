<script lang="ts">
	import { enhance } from '$app/forms';
	import PartyHeader from '$lib/components/PartyHeader.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{data.party.name} — Playlist Party</title>
</svelte:head>

<div class="max-w-2xl mx-auto px-4 py-8 space-y-6">
	<PartyHeader
		name={data.party.name}
		date={data.party.date}
		time={data.party.time ?? undefined}
		location={data.party.location ?? undefined}
		locationUrl={data.party.locationUrl ?? undefined}
		description={data.party.description ?? undefined}
	/>

	<div class="glass rounded-2xl p-6 text-center space-y-4">
		<p class="font-heading text-lg text-text-primary">
			<span class="text-neon-cyan font-bold">{data.sharerName}</span> wants you at this party!
		</p>

		<div class="flex justify-center gap-6 text-sm text-text-secondary">
			<span class="flex items-center gap-1.5">
				<svg
					class="w-4 h-4 text-neon-purple"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				>
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
						d="M23 21v-2a4 4 0 0 0-3-3.87"
					/><path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
				{data.attendeeCount} attending
			</span>
			<span class="flex items-center gap-1.5">
				<svg
					class="w-4 h-4 text-neon-pink"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				>
					<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
				</svg>
				{data.songCount} songs
			</span>
		</div>
	</div>

	{#if data.inviteMode === 'audition' && data.applicationPrompt}
		<div class="glass rounded-2xl p-6 border border-neon-cyan/20 bg-neon-cyan/5">
			<h3 class="font-heading text-sm font-bold text-neon-cyan uppercase tracking-wider mb-2">Application Prompt</h3>
			<p class="text-text-primary text-sm" style="white-space:pre-line">{data.applicationPrompt}</p>
		</div>
	{/if}

	{#if form?.joinSuccess}
		<div class="glass rounded-2xl p-6 text-center neon-border" data-testid="join-success">
			<div class="text-3xl mb-3">&#127881;</div>
			{#if data.inviteMode === 'audition'}
				<h2 class="font-heading text-xl font-bold text-neon-mint mb-2">Application Submitted!</h2>
				<p class="text-text-secondary text-sm">
					Check your email for a link to submit your songs. The host will review your application.
				</p>
			{:else}
				<h2 class="font-heading text-xl font-bold text-neon-mint mb-2">You're in!</h2>
				<p class="text-text-secondary text-sm">
					Check your email for your personal invite link to RSVP and add songs to the playlist.
				</p>
			{/if}
		</div>
	{:else if data.isFull}
		<div class="glass rounded-2xl p-6 text-center" data-testid="party-full">
			<p class="text-text-muted text-sm font-heading">This party is full — no more spots available right now.</p>
		</div>
	{:else}
		<div class="glass rounded-2xl p-6">
			<h2 class="font-heading text-lg font-bold gradient-text mb-4">
				{data.inviteMode === 'audition' ? 'Apply to Attend' : 'Request an Invite'}
			</h2>

			{#if form?.joinError}
				<div
					class="mb-4 p-3 rounded-xl bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-sm font-heading"
					data-testid="join-error"
				>
					{form.joinError}
				</div>
			{/if}

			<form method="POST" action="?/join" use:enhance data-testid="join-form">
				<div class="flex flex-col sm:flex-row gap-3 mb-4">
					<div class="flex-1">
						<label for="join-name" class="block font-heading text-xs font-semibold text-text-secondary mb-1"
							>Your Name</label
						>
						<input
							type="text"
							id="join-name"
							name="name"
							required
							data-testid="join-name"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
							placeholder="Your name"
						/>
					</div>
					<div class="flex-1">
						<label for="join-email" class="block font-heading text-xs font-semibold text-text-secondary mb-1"
							>Your Email</label
						>
						<input
							type="email"
							id="join-email"
							name="email"
							required
							data-testid="join-email"
							class="w-full bg-surface border border-neon-purple/20 rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/50 transition-colors text-sm"
							placeholder="you@email.com"
						/>
					</div>
				</div>
				<button
					type="submit"
					data-testid="join-btn"
					class="inline-flex items-center gap-2 font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-neon-pink text-on-accent hover:bg-neon-pink/90 transition-colors"
				>
					<svg
						class="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					>
						<path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
					</svg>
					{data.inviteMode === 'audition' ? 'Apply to Attend' : 'Request Invite'}
				</button>
			</form>
		</div>
	{/if}
</div>
