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
		turnCount: number;
		title: string;
		turns: Turn[];
	}

	interface ConversationEntry {
		slug: string;
		displayName: string;
		sessions: SessionEntry[];
		totalTurns: number;
	}

	interface DayEntry {
		date: string;
		displayDate: string;
		totalTurns: number;
		narrative: string;
		conversations: ConversationEntry[];
	}

	interface CreationLog {
		generatedAt: string;
		stats: {
			totalSessions: number;
			totalConversations: number;
			totalDays: number;
			totalTurns: number;
		};
		days: DayEntry[];
	}

	let log = $derived(data.creationLog as unknown as CreationLog);

	function pluralize(n: number, word: string): string {
		return `${n} ${word}${n !== 1 ? 's' : ''}`;
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
			<span class="glass rounded-full px-4 py-1.5 font-heading font-semibold text-neon-pink">
				{log.stats.totalTurns} prompts
			</span>
			<span class="glass rounded-full px-4 py-1.5 font-heading font-semibold text-text-primary">
				{log.stats.totalSessions} sessions
			</span>
			<span class="glass rounded-full px-4 py-1.5 font-heading font-semibold text-text-primary">
				{log.stats.totalDays} days
			</span>
		</div>
	</div>

	<!-- Principles -->
	<section class="mb-16">
		<h2 class="font-heading font-bold text-2xl md:text-3xl text-text-primary mb-6 text-center">
			Agentic Development Principles
		</h2>
		<p class="text-sm text-text-secondary leading-relaxed mb-8 text-center max-w-2xl mx-auto">
			Playlist Party was built entirely with Claude Code over 10 days. Here are the principles that emerged from the
			process.
		</p>

		<div class="space-y-4">
			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">1.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary">Build something you actually want to use</span>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						The best test of any tool is whether you'd trust it with something you care about. I built Playlist Party
						because I was hosting an actual party and wanted a collaborative playlist. The first party using the app was
						great fun, and using it for real immediately surfaced issues that no amount of hypothetical planning would
						have caught. When you care about the result, you push harder on quality and make better decisions about what
						matters.
					</p>
				</div>
			</details>

			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">2.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary">Plan first, then execute</span>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						34 of 61 sessions start with "Implement the following plan:" followed by a detailed markdown spec with
						context, file changes, and verification steps. The human writes the plan (often collaboratively with Claude
						in plan mode), then hands it to Claude for execution. This separation keeps the human in the driver's seat
						on <em>what</em> and <em>why</em>, while Claude handles <em>how</em>.
					</p>
				</div>
			</details>

			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">3.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary">Make Claude check its own work</span>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						The project has 98 Playwright E2E tests that Claude wrote and runs after every change. Plans include
						explicit verification steps ("navigate to this URL, confirm this element appears"). Type checking, linting,
						and formatting run as a single <code>bun run check</code> command. When Claude can verify its own output, you
						catch problems in the same session rather than discovering them later. Tests aren't just for correctness&mdash;they're
						the feedback loop that makes autonomous agents reliable.
					</p>
				</div>
			</details>

			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">4.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary">Use parallel agents for the initial build</span>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						Day 1 used a 3-agent team&mdash;developer, designer, and tester&mdash;working simultaneously from a shared
						architecture plan. Each agent had explicit file ownership boundaries to prevent conflicts. This got a
						working app with E2E tests in a single evening. Later, specialized review teams (Coverage Analyst + Test
						Developer, Security Reviewer, Usability Reviewer) iteratively found and filled gaps in test coverage.
					</p>
				</div>
			</details>

			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">5.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary">Deploy early, iterate in production</span>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						Deployment to Cloudflare happened on Day 1, before most features existed. This enabled real-world
						feedback&mdash;a friend found a divide-by-zero bug on Day 10 that no test had caught. When deploying is
						cheap (Cloudflare's free tier, automated deploy script), there's no reason to wait.
					</p>
				</div>
			</details>

			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">6.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary">Be willing to rip out and redo</span>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						Email-based invites were built on Day 1, refined through Day 3, then completely removed on Day 10 in favor
						of share links. The pending invite feature was added and removed on the same day. When the cost of
						implementation is low, the cost of changing direction is too. Don't cling to code just because it took
						effort to write&mdash;if the design is wrong, tear it out.
					</p>
				</div>
			</details>

			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">7.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary">Human steers, Claude rows</span>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						The human's messages are high-level feature descriptions and course corrections: "I'd like to create an
						invite link feature," "A friend claimed there was something wrong." Claude turns these into detailed plans,
						then implements them. The human rarely writes code directly but stays engaged on every decision. The best
						results come from maintaining creative control while delegating execution.
					</p>
				</div>
			</details>

			<details class="glass rounded-xl group">
				<summary
					class="px-5 py-4 cursor-pointer select-none flex items-start gap-3 hover:bg-surface-hover/50 rounded-xl transition-colors"
				>
					<span class="font-heading font-bold text-neon-pink text-lg leading-tight mt-0.5">8.</span>
					<div>
						<span class="font-heading font-semibold text-text-primary"
							>Structured plans as a communication protocol</span
						>
					</div>
				</summary>
				<div class="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
					<p>
						Every plan follows a consistent format: a Context section (why), a file change table (what), implementation
						details (how), and verification steps (done-when). This structure acts as a contract between human intent
						and agent execution. When the format is predictable, both sides know what to expect, and misunderstandings
						drop dramatically.
					</p>
				</div>
			</details>
		</div>
	</section>

	<!-- Days -->
	{#each log.days as day (day.date)}
		<section class="mb-12">
			<div class="flex items-baseline gap-3 mb-2 border-b border-neon-purple/20 pb-2">
				<h2 class="font-heading font-bold text-xl md:text-2xl text-text-primary">
					{day.displayDate}
				</h2>
				<span class="text-sm text-text-muted font-heading">{pluralize(day.totalTurns, 'prompt')}</span>
			</div>

			{#if day.narrative}
				<p class="text-sm text-text-secondary leading-relaxed mb-4">{day.narrative}</p>
			{/if}

			{#each day.conversations as conv (conv.slug)}
				<div class="mb-6">
					<div class="flex items-baseline gap-3 mb-3">
						<h3 class="font-heading font-semibold text-lg text-neon-pink">{conv.displayName}</h3>
						<span class="text-xs text-text-muted">
							{pluralize(conv.sessions.length, 'session')} &middot; {pluralize(conv.totalTurns, 'prompt')}
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
									{formatTime(session.startTime)} &middot; {pluralize(session.turnCount, 'turn')}
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

	<footer class="text-center py-8 text-text-muted text-sm border-t border-neon-purple/10 space-y-2">
		<p>
			Generated {new Date(log.generatedAt).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			})}
			&middot;
			<a href="/" class="text-neon-pink hover:underline">Back to Playlist Party</a>
		</p>
		<p>
			<a
				href="https://github.com/gchallen/www.playlist-party.com"
				class="text-neon-pink/70 hover:text-neon-pink transition-colors"
				target="_blank"
				rel="noopener">View source on GitHub</a
			>
		</p>
	</footer>
</main>
