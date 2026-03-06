import { eq } from 'drizzle-orm';
import { emailQueue } from './db/schema';
import type { Database } from './db';
import { getDb } from './db';
import { pushToDevStore } from './email-dev-store';
import type { EmailMessage } from './email-dev-store';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 3000, 9000]; // exponential backoff per attempt
const INTER_EMAIL_DELAY_MS = 550; // Resend allows 2 req/s — 550ms keeps us under

interface EnqueueOptions {
	to: string;
	subject: string;
	html: string;
	type: string;
	replyTo?: string;
	metadata?: Record<string, string>;
}

export async function enqueueEmails(
	db: Database,
	emails: EnqueueOptions[]
): Promise<number> {
	if (emails.length === 0) return 0;
	// Insert one at a time — bulk inserts with large HTML bodies exceed D1's query size limit
	for (const e of emails) {
		await db.insert(emailQueue).values({
			to: e.to,
			subject: e.subject,
			html: e.html,
			type: e.type,
			replyTo: e.replyTo,
			metadata: e.metadata ? JSON.stringify(e.metadata) : null
		});
	}
	return emails.length;
}

/**
 * Enqueue a single email and kick off processing.
 * Returns immediately — processing happens via waitUntil or inline fallback.
 */
export async function enqueueAndProcess(
	platform: App.Platform | undefined,
	email: EnqueueOptions
): Promise<void> {
	const db = await getDb(platform);
	await enqueueEmails(db, [email]);
	const processingPromise = processEmailQueue(platform);
	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(processingPromise);
	} else {
		await processingPromise;
	}
}

export async function processEmailQueue(platform?: App.Platform): Promise<{ sent: number; failed: number }> {
	const db = await getDb(platform);
	const apiKey = platform?.env?.RESEND_API_KEY;
	const fromEmail = platform?.env?.RESEND_FROM_EMAIL || 'noreply@playlist-party.com';

	const pending = await db
		.select()
		.from(emailQueue)
		.where(eq(emailQueue.status, 'pending'))
		.limit(50);

	let sent = 0;
	let failed = 0;

	for (let i = 0; i < pending.length; i++) {
		const row = pending[i];
		try {
			if (apiKey) {
				await sendViaResend(apiKey, fromEmail, row);
				if (i < pending.length - 1) {
					await sleep(INTER_EMAIL_DELAY_MS);
				}
			} else {
				const meta = row.metadata ? JSON.parse(row.metadata) : {};
				if (row.replyTo) meta.replyTo = row.replyTo;
				pushToDevStore(row.to, row.subject, row.html, row.type as EmailMessage['type'], meta);
			}

			await db
				.update(emailQueue)
				.set({ status: 'sent', sentAt: new Date().toISOString(), attempts: row.attempts + 1 })
				.where(eq(emailQueue.id, row.id));
			sent++;
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : String(e);
			const newAttempts = row.attempts + 1;
			await db
				.update(emailQueue)
				.set({
					status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
					attempts: newAttempts,
					lastError: errorMsg
				})
				.where(eq(emailQueue.id, row.id));
			if (newAttempts >= MAX_ATTEMPTS) failed++;
		}
	}

	return { sent, failed };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendViaResend(
	apiKey: string,
	fromEmail: string,
	row: { to: string; subject: string; html: string; replyTo: string | null; attempts: number }
): Promise<void> {
	const body: Record<string, unknown> = {
		from: fromEmail,
		to: row.to,
		subject: row.subject,
		html: row.html
	};
	if (row.replyTo) body.reply_to = row.replyTo;

	const maxRetries = MAX_ATTEMPTS - row.attempts;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		if (res.ok) return;

		const text = await res.text();
		const isRetryable = res.status === 429 || res.status >= 500;
		if (!isRetryable || attempt === maxRetries - 1) {
			throw new Error(`Resend ${res.status}: ${text}`);
		}
		await sleep(RETRY_DELAYS_MS[attempt] ?? 9000);
	}
}
