#!/usr/bin/env bun

import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const PROJECT_DIR = '/Users/challen/www/playlist-party.com';
const OUTPUT_PATH = join(PROJECT_DIR, 'src/lib/data/creation-log.json');

// Current active session creating this feature — exclude it
const EXCLUDE_SLUGS = new Set(['wise-crunching-liskov', 'witty-floating-bengio']);

interface RawSession {
	session: {
		id: string;
		slug: string;
		startTime: string;
		endTime: string;
		messageCount: number;
	};
	messages: RawMessage[];
}

interface RawMessage {
	timestamp: string;
	role: 'user' | 'assistant';
	textContent: string | null;
	thinkingContent: string | null;
	toolCalls: { name: string }[];
	model: string | null;
}

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

// Step 1: List all sessions for this project
console.log('Listing sessions...');
const listOutput = execSync('record-claude list --limit 500', {
	encoding: 'utf-8'
});

// Parse the list output — format is:
// <id> <slug> <status>
//   <date> · <N> messages
//   <path>
const sessionEntries: { id: string; slug: string }[] = [];
const lines = listOutput.split('\n');

for (let i = 0; i < lines.length; i++) {
	const idMatch = lines[i].match(/^([a-f0-9]{8})\s+(\S+)\s+(active|ended)/);
	if (idMatch) {
		const id = idMatch[1];
		const slug = idMatch[2];
		// Check if next lines contain our project path
		const pathLine = lines[i + 2]?.trim();
		if (pathLine === PROJECT_DIR) {
			if (!EXCLUDE_SLUGS.has(slug)) {
				sessionEntries.push({ id, slug });
			}
		}
	}
}

console.log(`Found ${sessionEntries.length} sessions for playlist-party`);

// Step 2: Export each session and process
const tmpDir = mkdtempSync(join(tmpdir(), 'creation-log-'));
const allSessions: Map<string, SessionEntry[]> = new Map();

for (const entry of sessionEntries) {
	const tmpFile = join(tmpDir, `${entry.id}.json`);
	try {
		execSync(`record-claude export ${entry.id} -f json -o "${tmpFile}"`, {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe']
		});

		const raw: RawSession = JSON.parse(readFileSync(tmpFile, 'utf-8'));
		const session = processSession(raw, entry.slug);
		if (session && session.turns.length > 0) {
			const slug = entry.slug;
			if (!allSessions.has(slug)) {
				allSessions.set(slug, []);
			}
			allSessions.get(slug)!.push(session);
		}
	} catch (e) {
		console.warn(`Failed to export session ${entry.id}: ${e}`);
	}
}

// Cleanup tmp dir
rmSync(tmpDir, { recursive: true, force: true });

function processSession(raw: RawSession, _slug: string): SessionEntry | null {
	const messages = raw.messages;
	if (messages.length === 0) return null;

	const turns: Turn[] = [];
	let i = 0;

	while (i < messages.length) {
		// Find a user message with text content
		if (messages[i].role === 'user' && messages[i].textContent?.trim()) {
			const userMessage = messages[i].textContent!.trim();
			const timestamp = messages[i].timestamp;
			i++;

			// Collect assistant responses until next user text message
			const assistantTexts: string[] = [];
			const toolCounts: Record<string, number> = {};

			while (i < messages.length) {
				if (messages[i].role === 'user' && messages[i].textContent?.trim()) {
					break;
				}
				if (messages[i].role === 'assistant') {
					if (messages[i].textContent?.trim()) {
						assistantTexts.push(messages[i].textContent!.trim());
					}
					for (const tc of messages[i].toolCalls) {
						toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1;
					}
				}
				i++;
			}

			const assistantMessages: {
				text: string;
				toolSummary?: Record<string, number>;
			}[] = [];
			const combinedText = assistantTexts.join('\n\n');
			if (combinedText || Object.keys(toolCounts).length > 0) {
				assistantMessages.push({
					text: combinedText,
					...(Object.keys(toolCounts).length > 0 ? { toolSummary: toolCounts } : {})
				});
			}

			if (userMessage) {
				turns.push({ timestamp, userMessage, assistantMessages });
			}
		} else {
			i++;
		}
	}

	if (turns.length === 0) return null;

	const msgTimestamps = messages
		.filter((m) => m.timestamp)
		.map((m) => new Date(m.timestamp).getTime())
		.sort((a, b) => a - b);
	const firstMsg = msgTimestamps[0];
	const lastMsg = msgTimestamps[msgTimestamps.length - 1];
	const startTime = new Date(firstMsg).toISOString();
	const endTime = new Date(lastMsg).toISOString();

	// Try all turns for a good title (first might be /clear or a caveat)
	let title = '';
	for (const turn of turns) {
		title = extractTitle(turn.userMessage);
		if (title && !title.startsWith('<')) break;
	}
	if (!title) title = 'Untitled session';

	// Clean up user messages — strip XML wrapper tags but keep content
	for (const turn of turns) {
		turn.userMessage = cleanMessage(turn.userMessage);
	}

	// Filter out turns with empty user messages after cleaning
	const cleanedTurns = turns.filter((t) => t.userMessage.trim().length > 0);
	if (cleanedTurns.length === 0) return null;

	return {
		id: raw.session.id,
		startTime,
		endTime,
		turnCount: cleanedTurns.length,
		title,
		turns: cleanedTurns
	};
}

function cleanMessage(msg: string): string {
	// Strip XML wrapper tags (teammate-message, command-name, etc.) but keep inner content
	let cleaned = msg;

	// Remove <teammate-message ...> and </teammate-message> wrappers
	cleaned = cleaned.replace(/<teammate-message[^>]*>\s*/g, '');
	cleaned = cleaned.replace(/<\/teammate-message>\s*/g, '');

	// Remove <command-name>...</command-name>, <command-message>...</command-message>, <command-args>...</command-args>
	cleaned = cleaned.replace(/<command-name>.*?<\/command-name>\s*/gs, '');
	cleaned = cleaned.replace(/<command-message>.*?<\/command-message>\s*/gs, '');
	cleaned = cleaned.replace(/<command-args>.*?<\/command-args>\s*/gs, '');

	// Remove <local-command-caveat>...</local-command-caveat> (these are system noise)
	cleaned = cleaned.replace(/<local-command-caveat>.*?<\/local-command-caveat>\s*/gs, '');

	// Remove "[Request interrupted by user]" and similar
	cleaned = cleaned.replace(/\[Request interrupted by user[^\]]*\]\s*/g, '');

	// Remove <task-notification>...</task-notification> blocks
	cleaned = cleaned.replace(/<task-notification>[\s\S]*?<\/task-notification>\s*/g, '');

	return cleaned.trim();
}

function extractTitle(firstMessage: string): string {
	// Clean XML tags first
	const msg = cleanMessage(firstMessage);

	// Check for plan pattern: "Implement the following plan: # Title"
	const planMatch = msg.match(/Implement the following plan:\s*#\s*(.+?)(?:\n|$)/i);
	if (planMatch) return planMatch[1].trim();

	// Check for teammate message with task description
	const taskMatch = msg.match(/Your task:\s*\*\*(.+?)\*\*/);
	if (taskMatch) return taskMatch[1].trim();

	// Check for team role description: 'You are the "tester"' or 'You are the **Test Developer**'
	const roleMatch = msg.match(/You are the\s+(?:"([^"]+)"|(?:\*\*([^*]+)\*\*))\s+on the\s+(\S+)\s+team/);
	if (roleMatch) {
		const role = roleMatch[1] || roleMatch[2];
		const team = roleMatch[3];
		return `Team agent: ${role} (${team})`;
	}

	// Check for "You are the **Role** doing a final review"
	const reviewMatch = msg.match(/You are the \*\*([^*]+)\*\*\s+doing a (final review|review)/);
	if (reviewMatch) {
		return `Final review: ${reviewMatch[1]}`;
	}

	// Skip commit commands, task output references, and empty messages
	if (msg.startsWith('## Your task') && msg.includes('git status')) return '';
	if (msg.startsWith('Read the output file to retrieve')) return '';
	if (!msg || msg.length < 3) return '';

	// First line, truncated
	const firstLine = msg.split('\n')[0].trim();
	if (firstLine.length > 80) return firstLine.substring(0, 77) + '...';
	return firstLine;
}

// Step 3: Narratives for each day
const dayNarratives: Record<string, string> = {
	'2026-02-28':
		'Day zero. Started with a plan and a team of three Claude Code agents — a developer, designer, and tester — building the initial app in parallel. Schema, routes, components, and E2E tests all came together in one evening session, followed by multiple rounds of test coverage review.',
	'2026-03-01':
		'Deployed for the first time and immediately iterated. Reworked the song quota system, added email confirmation for party creation, improved the create page with flexible time inputs and location fields, redesigned the theme from neon cyberpunk to retro vinyl, and overhauled the player controls.',
	'2026-03-02':
		"Feature sprint. Added songs-per-guest limits, song reordering, email abuse prevention with creator verification, a deploy script, bulk invites, the decline/can't-make-it flow, and custom invite email messages with reply-to support.",
	'2026-03-03':
		'Deep work on the invite experience. Made RSVP song count configurable, added random position insertion for songs, built markdown support for descriptions, redesigned the invite email with full creator control and live preview, and added a playlist preview for pending invitees.',
	'2026-03-04':
		'Added shareable invite links so guests could forward their invite URL, and removed the pending invite feature that had become redundant.',
	'2026-03-05':
		'The big one: Party Mode. Built the DJ live screen with fullscreen YouTube playback, multi-display support, phone controls, now-playing API, and song likes. Also updated confirmation emails.',
	'2026-03-10':
		'Major simplification. Removed the entire email-based invite system in favor of token-based invite links — no more email collection, verification flows, or invite-by-email UI. Cleaner and more privacy-friendly.',
	'2026-03-11':
		'Added IP-based email rate limiting for security, a DJ role for party attendees, and a "Play on YouTube" link for individual songs.',
	'2026-03-12':
		'Built the public-facing features: a party feed on the homepage showing published parties, and individual public party pages with song lists and guest counts.',
	'2026-03-14':
		'Added Audition Mode — a new invite flow where the party creator can review and approve/reject guests before they join.'
};

// Group by date and conversation
// Descriptive names for each conversation thread (keyed by slug)
const conversationNames: Record<string, string> = {
	'encapsulated-meandering-kahn': 'Project Kickoff',
	'www/playlist/party/com': 'Setup & Configuration',
	'-Users-challen-www-playlist-party-com': 'Initial Build with Agent Teams',
	'purrfect-munching-lerdorf': 'Song Quota & Email Invites',
	'eager-beaming-globe': 'Deploy, Polish & Ship',
	'unified-scribbling-cloud': 'Feature Sprint',
	'partitioned-rolling-squirrel': 'Invite Experience Overhaul',
	'typed-spinning-hickey': 'Share Links & Cleanup',
	'clever-gliding-planet': 'Announcements & Party Mode',
	'jiggly-greeting-brooks': 'Simplifying Invites',
	'wiggly-finding-treehouse': 'Public Features & Final Polish'
};

function humanizeSlug(slug: string): string {
	if (conversationNames[slug]) return conversationNames[slug];
	return slug
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

// Sort sessions within each conversation by startTime
for (const [, sessions] of allSessions) {
	sessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

// Group by date
const dayMap = new Map<string, Map<string, SessionEntry[]>>();

for (const [slug, sessions] of allSessions) {
	for (const session of sessions) {
		const dateStr = new Date(session.startTime).toLocaleDateString('en-CA'); // YYYY-MM-DD
		if (!dayMap.has(dateStr)) {
			dayMap.set(dateStr, new Map());
		}
		const dayConvs = dayMap.get(dateStr)!;
		if (!dayConvs.has(slug)) {
			dayConvs.set(slug, []);
		}
		dayConvs.get(slug)!.push(session);
	}
}

// Build output
const days: DayEntry[] = [...dayMap.entries()]
	.sort(([a], [b]) => a.localeCompare(b))
	.map(([date, convMap]) => {
		const conversations: ConversationEntry[] = [...convMap.entries()]
			.map(([slug, sessions]) => {
				const totalTurns = sessions.reduce((sum, s) => sum + s.turnCount, 0);
				return {
					slug,
					displayName: humanizeSlug(slug),
					sessions,
					totalTurns
				};
			})
			.sort((a, b) => {
				const aFirst = new Date(a.sessions[0].startTime).getTime();
				const bFirst = new Date(b.sessions[0].startTime).getTime();
				return aFirst - bFirst;
			});

		const totalTurns = conversations.reduce((sum, c) => sum + c.totalTurns, 0);

		const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});

		const narrative = dayNarratives[date] || '';

		return { date, displayDate, totalTurns, narrative, conversations };
	});

const totalSessions = days.reduce((sum, d) => sum + d.conversations.reduce((s, c) => s + c.sessions.length, 0), 0);
const totalConversations = new Set(days.flatMap((d) => d.conversations.map((c) => c.slug))).size;
const totalTurns = days.reduce((sum, d) => sum + d.totalTurns, 0);

const output = {
	generatedAt: new Date().toISOString(),
	stats: {
		totalSessions,
		totalConversations,
		totalDays: days.length,
		totalTurns
	},
	days
};

const json = JSON.stringify(output, null, 2);
Bun.write(OUTPUT_PATH, json);

console.log(`\nGenerated ${OUTPUT_PATH}`);
console.log(`  ${totalSessions} sessions across ${totalConversations} conversations over ${days.length} days`);
console.log(`  Total turns: ${totalTurns}`);
console.log(`  File size: ${(json.length / 1024).toFixed(0)} KB`);
