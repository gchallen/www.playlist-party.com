export interface EmailMessage {
	id: string;
	to: string;
	subject: string;
	html: string;
	sentAt: string;
	type: 'invite' | 'bonus_earned' | 'bonus_bumped' | 'creator_welcome';
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

async function sendViaResend(
	to: string,
	subject: string,
	html: string,
	apiKey: string,
	fromEmail: string
): Promise<void> {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: fromEmail,
			to,
			subject,
			html
		})
	});

	if (!res.ok) {
		const body = await res.text();
		console.error(`Resend API error (${res.status}): ${body}`);
	}
}

export async function sendEmail(
	to: string,
	subject: string,
	html: string,
	type: EmailMessage['type'],
	metadata: Record<string, string> = {},
	platform?: App.Platform
): Promise<void> {
	const apiKey = platform?.env?.RESEND_API_KEY;
	const fromEmail = platform?.env?.RESEND_FROM_EMAIL || 'noreply@playlist-party.com';

	if (apiKey) {
		await sendViaResend(to, subject, html, apiKey, fromEmail);
	} else {
		const message: EmailMessage = {
			id: `email_${++emailCounter}`,
			to,
			subject,
			html,
			sentAt: new Date().toISOString(),
			type,
			metadata
		};
		sentEmails.push(message);
	}
}

export async function sendInviteEmail(
	to: string,
	inviteeName: string,
	inviterName: string,
	partyName: string,
	partyDate: string,
	partyTime: string | null,
	partyLocation: string | null,
	magicUrl: string,
	platform?: App.Platform
): Promise<void> {
	const { renderInviteEmail } = await import('./email-templates');
	const html = renderInviteEmail({
		inviteeName,
		inviterName,
		partyName,
		partyDate,
		partyTime,
		partyLocation,
		magicUrl
	});
	await sendEmail(to, `You're invited to ${partyName}!`, html, 'invite', {
		inviteeName,
		inviterName,
		partyName,
		magicUrl
	}, platform);
}

export async function sendCreatorWelcomeEmail(
	to: string,
	creatorName: string,
	partyName: string,
	magicUrl: string,
	adminUrl: string,
	platform?: App.Platform
): Promise<void> {
	const { renderCreatorWelcomeEmail } = await import('./email-templates');
	const html = renderCreatorWelcomeEmail({ creatorName, partyName, magicUrl, adminUrl });
	await sendEmail(to, `Your party "${partyName}" is ready!`, html, 'creator_welcome', {
		creatorName,
		partyName,
		magicUrl,
		adminUrl
	}, platform);
}

export async function sendBonusEarnedEmail(
	to: string,
	recipientName: string,
	acceptedName: string,
	partyName: string,
	dashboardUrl: string,
	platform?: App.Platform
): Promise<void> {
	const { renderBonusEarnedEmail } = await import('./email-templates');
	const html = renderBonusEarnedEmail({ recipientName, acceptedName, partyName, dashboardUrl });
	await sendEmail(
		to,
		`${acceptedName} accepted your invite to ${partyName}!`,
		html,
		'bonus_earned',
		{ recipientName, acceptedName, partyName, dashboardUrl },
		platform
	);
}

export async function sendBonusBumpedEmail(
	to: string,
	recipientName: string,
	partyName: string,
	bumpedSongTitle: string,
	platform?: App.Platform
): Promise<void> {
	const { renderBonusBumpedEmail } = await import('./email-templates');
	const html = renderBonusBumpedEmail({ recipientName, partyName, bumpedSongTitle });
	await sendEmail(
		to,
		`${partyName} is filling up — your bonus song was bumped`,
		html,
		'bonus_bumped',
		{ recipientName, partyName, bumpedSongTitle },
		platform
	);
}
