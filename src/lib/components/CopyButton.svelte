<script lang="ts">
	let {
		text,
		label = 'Copy link'
	}: {
		text: string;
		label?: string;
	} = $props();

	let copied = $state(false);
	let showConfetti = $state(false);

	const confetti = [
		{ cx: '-35px', cy: '-45px', cr: '150deg', bg: 'var(--color-neon-pink)' },
		{ cx: '40px', cy: '-40px', cr: '-120deg', bg: 'var(--color-neon-cyan)' },
		{ cx: '-50px', cy: '5px', cr: '200deg', bg: 'var(--color-neon-mint)' },
		{ cx: '50px', cy: '10px', cr: '-80deg', bg: 'var(--color-neon-pink)' },
		{ cx: '-20px', cy: '-55px', cr: '90deg', bg: 'var(--color-neon-cyan)' },
		{ cx: '30px', cy: '-50px', cr: '-160deg', bg: 'var(--color-neon-mint)' },
		{ cx: '-45px', cy: '-20px', cr: '260deg', bg: 'var(--color-neon-pink)' },
		{ cx: '45px', cy: '-30px', cr: '-40deg', bg: 'var(--color-neon-cyan)' },
		{ cx: '-10px', cy: '-65px', cr: '310deg', bg: 'var(--color-neon-mint)' },
		{ cx: '55px', cy: '-15px', cr: '-220deg', bg: 'var(--color-neon-pink)' }
	];

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.position = 'fixed';
			textarea.style.opacity = '0';
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
		}
		copied = true;
		showConfetti = true;
		setTimeout(() => {
			showConfetti = false;
		}, 600);
		setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

<button
	class="copy-btn relative inline-flex items-center gap-2 px-4 py-2 rounded-lg font-heading font-semibold text-sm transition-all duration-200"
	class:is-copied={copied}
	onclick={handleCopy}
>
	{#if copied}
		<svg
			class="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M20 6L9 17l-5-5" />
		</svg>
		Copied!
	{:else}
		<svg
			class="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<rect x="9" y="9" width="13" height="13" rx="2" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</svg>
		{label}
	{/if}

	{#if showConfetti}
		<div class="absolute inset-0 pointer-events-none overflow-visible">
			{#each confetti as piece (piece.cx)}
				<span
					class="confetti-piece absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full"
					style="background: {piece.bg}; --cx: {piece.cx}; --cy: {piece.cy}; --cr: {piece.cr};"
				></span>
			{/each}
		</div>
	{/if}
</button>

<style>
	.copy-btn {
		background: var(--color-surface-light);
		color: var(--color-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.1);
	}

	:global(:root[data-theme='dark']) .copy-btn {
		border-color: rgba(255, 255, 255, 0.1);
	}

	.copy-btn:hover:not(.is-copied) {
		border-color: rgba(0, 0, 0, 0.2);
		background: var(--color-surface-hover);
	}

	:global(:root[data-theme='dark']) .copy-btn:hover:not(.is-copied) {
		border-color: rgba(255, 255, 255, 0.2);
	}

	.copy-btn.is-copied {
		background: color-mix(in srgb, var(--color-neon-mint) 12%, transparent);
		color: var(--color-neon-mint);
		border-color: color-mix(in srgb, var(--color-neon-mint) 25%, transparent);
	}

	.confetti-piece {
		animation: confetti-pop 0.6s ease-out forwards;
	}
</style>
