import { eq, and, gte } from 'drizzle-orm';
import { emailSends } from './db/schema';
import type { Database } from './db';

const MAX_EMAILS_PER_RECIPIENT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function checkEmailRateLimit(
	db: Database,
	email: string
): Promise<{ allowed: boolean; retryAfterMessage?: string }> {
	const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

	const recentSends = await db
		.select()
		.from(emailSends)
		.where(and(eq(emailSends.recipientEmail, email.toLowerCase()), gte(emailSends.sentAt, cutoff)));

	if (recentSends.length >= MAX_EMAILS_PER_RECIPIENT) {
		return {
			allowed: false,
			retryAfterMessage: `Too many emails sent to this address. Please try again later.`
		};
	}

	return { allowed: true };
}

export async function recordEmailSend(
	db: Database,
	email: string,
	type: string
): Promise<void> {
	await db.insert(emailSends).values({
		recipientEmail: email.toLowerCase(),
		emailType: type,
		sentAt: new Date().toISOString()
	});
}
