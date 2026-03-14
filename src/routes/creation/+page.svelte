<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	interface Turn {
		timestamp: string;
		userMessage: string;
		assistantMessages: { text: string; toolSummary?: Record<string, number> }[];
	}

	interface SessionEntry {
		id: string;
		startTime: string;
		endTime: string;
		durationMinutes: number;
		title: string;
		turns: Turn[];
	}

	interface ConversationEntry {
		slug: string;
		displayName: string;
		sessions: SessionEntry[];
		totalTimeMinutes: number;
	}

	interface DayEntry {
		date: string;
		displayDate: string;
		totalTimeMinutes: number;
		narrative: string;
		conversations: ConversationEntry[];
	}

	interface CreationLog {
		generatedAt: string;
		stats: {
			totalSessions: number;
			totalConversations: number;
			totalDays: number;
			totalTimeMinutes: number;
		};
		days: DayEntry[];
	}

	const log = data.creationLog as unknown as CreationLog;

	function formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}m`;
		return `${h}h ${m}m`;
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function toolLabel(name: string, count: number): string {
		const labels: Record<string, string> = {
			Read: 'read',
			Edit: 'edited',
			Write: 'wrote',
			Bash: 'ran',
			Grep: 'searched',
			Glob: 'globbed',
			Agent: 'spawned agent',
			Skill: 'skill'
		};
		const verb = labels[name] || name.toLowerCase();
		return `${verb} ${count}`;
	}

	const toolColors: Record<string, string> = {
		Read: 'bg-neon-cyan/15 text-neon-cyan',
		Edit: 'bg-neon-mint/15 text-neon-mint',
		Write: 'bg-neon-mint/15 text-neon-mint',
		Bash: 'bg-neon-yellow/15 text-neon-yellow',
		Grep: 'bg-neon-purple/15 text-neon-purple',
		Glob: 'bg-neon-purple/15 text-neon-purple',
		Agent: 'bg-neon-pink/15 text-neon-pink'
	};
</script>

<svelte:head>
	<title>Creation Log - Playlist Party</title>
	<meta name="description" content="The Claude Code conversations used to build Playlist Party." />
</svelte:head>

<main class="min-h-screen px-4 py-12 max-w-4xl mx-auto">
	<!-- Header -->
	<div class="mb-12 text-center">
		<a href="/" class="inline-block mb-6 text-text-muted hover:text-neon-pink transition-colors text-sm">
			&larr; Back to Playlist Party
		</a>
		<h1 class="font-display text-4xl sm:text-5xl md:text-6xl text-neon-pink tracking-wider mb-4">CREATION LOG</h1>
		<p class="font-heading text-lg text-text-secondary mb-6">
			Every conversation with Claude Code that built this site.
		</p>
		<div class="flex flex-wrap justify-center gap-4 text-sm">
			<span class="glass rounded-full px-4 py-1.5 font-heading font-semibold text-text-primary">
				{log.stats.totalSessions} sessions
			</span>
			<span class="glass rounded-full px-4 py-1.5 font-heading font-semibold text-text-primary">
				{log.stats.totalConversations} conversations
			</span>
			<span class="glass rounded-full px-4 py-1.5 font-heading font-semibold text-text-primary">
				{log.stats.totalDays} days
			</span>
			<span class="glass rounded-full px-4 py-1.5 font-heading font-semibold text-neon-pink">
				{formatDuration(log.stats.totalTimeMinutes)} total
			</span>
		</div>
	</div>

	<!-- Days -->
	{#each log.days as day (day.date)}
		<section class="mb-12">
			<div class="flex items-baseline gap-3 mb-2 border-b border-neon-purple/20 pb-2">
				<h2 class="font-heading font-bold text-xl md:text-2xl text-text-primary">
					{day.displayDate}
				</h2>
				<span class="text-sm text-text-muted font-heading">{formatDuration(day.totalTimeMinutes)}</span>
			</div>

			{#if day.narrative}
				<p class="text-sm text-text-secondary leading-relaxed mb-4">{day.narrative}</p>
			{/if}

			{#each day.conversations as conv (conv.slug)}
				<div class="mb-6">
					<div class="flex items-baseline gap-3 mb-3">
						<h3 class="font-heading font-semibold text-lg text-neon-pink">{conv.displayName}</h3>
						<span class="text-xs text-text-muted">
							{conv.sessions.length} session{conv.sessions.length !== 1 ? 's' : ''} &middot; {formatDuration(
								conv.totalTimeMinutes
							)}
						</span>
					</div>

					{#each conv.sessions as session (session.id)}
						<details class="glass rounded-xl mb-3 group">
							<summary
								class="px-4 py-3 cursor-pointer select-none flex items-center gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
							>
								<svg
									class="w-3 h-3 text-text-muted transition-transform group-open:rotate-90 shrink-0"
									viewBox="0 0 24 24"
									fill="currentColor"
								>
									<path d="M8 5v14l11-7z" />
								</svg>
								<span class="font-heading font-medium text-sm text-text-primary truncate flex-1">
									{session.title}
								</span>
								<span class="text-xs text-text-muted shrink-0 font-heading">
									{formatTime(session.startTime)} &middot; {formatDuration(session.durationMinutes)}
								</span>
							</summary>

							<div class="px-4 pb-4 space-y-4 border-t border-neon-purple/10">
								{#each session.turns as turn, turnIdx (turnIdx)}
									<div class="pt-4">
										<!-- User message -->
										<div class="mb-2">
											<span class="text-xs font-heading font-semibold text-neon-cyan uppercase tracking-wider">You</span
											>
											<div
												class="mt-1 text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto glass-strong rounded-lg p-3"
											>
												{turn.userMessage}
											</div>
										</div>

										<!-- Assistant response -->
										{#each turn.assistantMessages as msg, msgIdx (msgIdx)}
											<div class="mt-2">
												<span class="text-xs font-heading font-semibold text-neon-mint uppercase tracking-wider"
													>Claude</span
												>

												{#if msg.toolSummary && Object.keys(msg.toolSummary).length > 0}
													<div class="flex flex-wrap gap-1.5 mt-1 mb-1.5">
														{#each Object.entries(msg.toolSummary) as [tool, count], toolIdx (toolIdx)}
															<span
																class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-heading font-medium {toolColors[
																	tool
																] || 'bg-neon-purple/15 text-neon-purple'}"
															>
																{toolLabel(tool, count as number)}
															</span>
														{/each}
													</div>
												{/if}

												{#if msg.text}
													<div
														class="mt-1 text-sm text-text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto rounded-lg p-3 bg-surface-light/50"
													>
														{msg.text}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/each}
							</div>
						</details>
					{/each}
				</div>
			{/each}
		</section>
	{/each}

	<footer class="text-center py-8 text-text-muted text-sm border-t border-neon-purple/10">
		<p>
			Generated {new Date(log.generatedAt).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			})}
			&middot;
			<a href="/" class="text-neon-pink hover:underline">Back to Playlist Party</a>
		</p>
	</footer>
</main>
