<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Monoton&family=Syne:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="min-h-screen relative">
	<div
		class="fixed inset-0 pointer-events-none opacity-[0.02] z-50"
		aria-hidden="true"
		style="background-image: url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E&quot;); background-repeat: repeat; background-size: 256px;"
	></div>

	<div
		class="fixed inset-0 pointer-events-none -z-10"
		aria-hidden="true"
		style="background: radial-gradient(ellipse 80% 50% at 50% 0%, rgba(180, 77, 255, 0.08) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(255, 45, 120, 0.05) 0%, transparent 60%), var(--color-void);"
	></div>

	{@render children()}
</div>
