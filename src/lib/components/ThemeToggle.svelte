<script lang="ts">
	import { browser } from '$app/environment';

	let dark = $state(false);

	$effect(() => {
		if (browser) {
			dark = document.documentElement.dataset.theme === 'dark';
		}
	});

	function toggle() {
		dark = !dark;
		const theme = dark ? 'dark' : 'light';
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('theme', theme);
	}
</script>

<button
	onclick={toggle}
	class="fixed top-4 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center bg-surface/80 backdrop-blur-sm border border-neon-purple/15 text-text-secondary hover:text-neon-pink transition-colors duration-200 cursor-pointer"
	title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if dark}
		<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
			<circle cx="12" cy="12" r="5" />
			<line x1="12" y1="1" x2="12" y2="3" />
			<line x1="12" y1="21" x2="12" y2="23" />
			<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
			<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
			<line x1="1" y1="12" x2="3" y2="12" />
			<line x1="21" y1="12" x2="23" y2="12" />
			<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
			<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
		</svg>
	{:else}
		<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	{/if}
</button>
