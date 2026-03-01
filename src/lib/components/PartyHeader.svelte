<script lang="ts">
	let {
		name,
		date,
		time,
		location,
		description
	}: {
		name: string;
		date: string;
		time?: string;
		location?: string;
		description?: string;
	} = $props();
</script>

<header class="glass rounded-2xl p-6 md:p-8 neon-border">
	<h1 class="font-heading text-3xl md:text-4xl font-extrabold gradient-text leading-tight">
		{name}
	</h1>

	<div class="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-text-secondary text-sm">
		<span class="flex items-center gap-2">
			<svg
				class="w-4 h-4 text-neon-purple"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="4" width="18" height="18" rx="2" />
				<path d="M16 2v4M8 2v4M3 10h18" />
			</svg>
			{date}{#if time}<span class="text-text-muted">&nbsp;at&nbsp;</span>{time}{/if}
		</span>

		{#if location}
			<span class="flex items-center gap-2">
				<svg
					class="w-4 h-4 text-neon-pink"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
				{location}
			</span>
		{/if}
	</div>

	{#if description}
		<p class="mt-4 text-text-secondary leading-relaxed text-sm md:text-base">{description}</p>
	{/if}
</header>
