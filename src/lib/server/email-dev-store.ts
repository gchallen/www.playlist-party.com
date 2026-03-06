export interface EmailMessage {
	id: string;
	to: string;
	subject: string;
	html: string;
	sentAt: string;
	type: 'invite' | 'creator_welcome' | 'email_verification' | 'announcement';
	metadata: Record<string, string>;
}

// In-memory store for dev/test — the test harness reads this via /api/emails
const sentEmails: EmailMessage[] = [];
let emailCounter = 0;

export function getSentEmails(): EmailMessage[] {
	return sentEmails;
}

export function clearSentEmails(): void {
	sentEmails.length = 0;
	emailCounter = 0;
}

export function pushToDevStore(to: string, subject: string, html: string, type: EmailMessage['type'], metadata: Record<string, string> = {}): void {
	sentEmails.push({
		id: `email_${++emailCounter}`,
		to,
		subject,
		html,
		sentAt: new Date().toISOString(),
		type,
		metadata
	});
}
