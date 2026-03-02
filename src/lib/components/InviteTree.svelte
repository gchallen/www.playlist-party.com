<script lang="ts">
	type TreeNode = {
		name: string | null;
		depth: number;
		acceptedAt: string | null;
		children: TreeNode[];
	};

	let { tree }: { tree: TreeNode } = $props();
</script>

{#snippet treeNode(node: TreeNode)}
	<div class="tree-node">
		<div class="flex items-center gap-2 py-1.5">
			<div
				class="w-2.5 h-2.5 rounded-full flex-shrink-0"
				class:accepted-dot={node.acceptedAt}
				class:pending-dot={!node.acceptedAt}
			></div>

			<div
				class="node-card px-3 py-1.5 rounded-lg text-sm font-heading"
				class:is-accepted={node.acceptedAt}
				class:is-pending={!node.acceptedAt}
			>
				{node.name || 'Pending...'}
				{#if node.depth > 0}
					<span class="text-text-muted text-xs ml-1.5">depth {node.depth}</span>
				{/if}
			</div>
		</div>

		{#if node.children.length > 0}
			<div class="ml-5 pl-4 border-l border-neon-purple/20">
				{#each node.children as child}
					{@render treeNode(child)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<div class="glass rounded-2xl p-4 md:p-6">
	<h3
		class="font-heading font-bold text-sm uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2"
	>
		<svg
			class="w-4 h-4 text-neon-purple"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M16 3.13a4 4 0 0 1 0 7.75" />
		</svg>
		Invite Tree
	</h3>
	{@render treeNode(tree)}
</div>

<style>
	.accepted-dot {
		background: var(--color-neon-mint);
		box-shadow: 0 0 6px color-mix(in srgb, var(--color-neon-mint) 50%, transparent);
	}

	.pending-dot {
		background: color-mix(in srgb, var(--color-text-muted) 40%, transparent);
		animation: pulse-glow 2s ease-in-out infinite;
	}

	.node-card.is-accepted {
		background: var(--glass-bg);
		backdrop-filter: blur(8px);
		border: 1px solid color-mix(in srgb, var(--color-neon-mint) 15%, transparent);
		color: var(--color-text-primary);
	}

	.node-card.is-pending {
		background: color-mix(in srgb, var(--glass-bg) 50%, transparent);
		border: 1px dashed color-mix(in srgb, var(--color-text-muted) 25%, transparent);
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
