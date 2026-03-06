import { eq } from 'drizzle-orm';
import { emailQueue } from './db/schema';
import type { Database } from './db';
import { getDb } from './db';
import { pushToDevStore } from './email';

const MAX_ATTEMPTS = 3;

interface EnqueueOptions {
	to: string;
	subject: string;
	html: string;
	type: string;
	replyTo?: string;
}

export async function enqueueEmails(
	db: Database,
	emails: EnqueueOptions[]
): Promise<number> {
	if (emails.length === 0) return 0;
	await db.insert(emailQueue).values(
		emails.map((e) => ({
			to: e.to,
			subject: e.subject,
			html: e.html,
			type: e.type,
			replyTo: e.replyTo
		}))
	);
	return emails.length;
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

	for (const row of pending) {
		try {
			if (apiKey) {
				const body: Record<string, unknown> = {
					from: fromEmail,
					to: row.to,
					subject: row.subject,
					html: row.html
				};
				if (row.replyTo) body.reply_to = row.replyTo;

				const res = await fetch('https://api.resend.com/emails', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(body)
				});

				if (!res.ok) {
					const text = await res.text();
					throw new Error(`Resend ${res.status}: ${text}`);
				}
			}
			if (!apiKey) {
				pushToDevStore(row.to, row.subject, row.html, row.type as 'announcement');
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
