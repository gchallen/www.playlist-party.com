import { eq, and, gte } from 'drizzle-orm';
import { emailSends } from './db/schema';
import type { Database } from './db';

const MAX_EMAILS_PER_RECIPIENT = 5;
const MAX_EMAILS_PER_IP = 20;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getClientIp(request: Request): string {
	return (
		request.headers.get('cf-connecting-ip') ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		'unknown'
	);
}

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

export async function checkIpRateLimit(
	db: Database,
	ip: string
): Promise<{ allowed: boolean; retryAfterMessage?: string }> {
	if (ip === 'unknown') return { allowed: true };

	const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

	const recentSends = await db
		.select()
		.from(emailSends)
		.where(and(eq(emailSends.senderIp, ip), gte(emailSends.sentAt, cutoff)));

	if (recentSends.length >= MAX_EMAILS_PER_IP) {
		return {
			allowed: false,
			retryAfterMessage: `Too many emails sent from this network. Please try again later.`
		};
	}

	return { allowed: true };
}

export async function recordEmailSend(db: Database, email: string, type: string, ip?: string): Promise<void> {
	await db.insert(emailSends).values({
		recipientEmail: email.toLowerCase(),
		emailType: type,
		senderIp: ip ?? null,
		sentAt: new Date().toISOString()
	});
}
