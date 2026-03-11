<script lang="ts">
	import { page } from '$app/state';
	import { dev } from '$app/environment';
</script>

<svelte:head>
	<title>{page.status} — Playlist Party</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4">
	<div class="glass rounded-2xl p-8 max-w-lg w-full text-center">
		<p class="font-heading text-6xl font-bold text-neon-pink mb-2">{page.status}</p>
		<h1 class="font-heading text-xl font-semibold text-text-primary mb-3">
			{#if page.status === 404}
				Page Not Found
			{:else if page.status >= 500}
				Something Went Wrong
			{:else}
				Error
			{/if}
		</h1>
		<p class="text-text-secondary text-sm mb-6">{page.error?.message || 'An unexpected error occurred.'}</p>

		{#if page.error?.errorId}
			<p class="text-text-muted text-xs mb-4 font-mono">Error ID: {page.error.errorId}</p>
		{/if}

		{#if dev && page.error?.detail}
			<details class="text-left mt-4">
				<summary class="text-text-muted text-xs cursor-pointer hover:text-text-secondary transition-colors"
					>Stack trace</summary
				>
				<pre
					class="mt-2 p-3 rounded-xl bg-surface text-xs text-neon-pink/80 overflow-x-auto whitespace-pre-wrap break-words border border-neon-pink/10">{page
						.error.detail}</pre>
			</details>
		{/if}

		<a
			href="/"
			class="inline-block mt-4 font-heading font-semibold text-sm px-5 py-2.5 rounded-xl bg-surface-light text-text-primary border border-neon-purple/20 hover:border-neon-purple/40 hover:bg-surface-hover transition-all duration-200"
		>
			Back to Home
		</a>
	</div>
</div>
