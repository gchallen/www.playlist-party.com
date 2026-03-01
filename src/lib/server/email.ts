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

export async function sendEmail(
	to: string,
	subject: string,
	html: string,
	type: EmailMessage['type'],
	metadata: Record<string, string> = {}
): Promise<void> {
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

	// In production with RESEND_API_KEY, this would call the Resend API:
	// POST https://api.resend.com/emails
	// For now, all emails go to the in-memory store.
}

export async function sendInviteEmail(
	to: string,
	inviteeName: string,
	inviterName: string,
	partyName: string,
	partyDate: string,
	partyTime: string | null,
	partyLocation: string | null,
	magicUrl: string
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
	});
}

export async function sendCreatorWelcomeEmail(
	to: string,
	creatorName: string,
	partyName: string,
	magicUrl: string,
	adminUrl: string
): Promise<void> {
	const { renderCreatorWelcomeEmail } = await import('./email-templates');
	const html = renderCreatorWelcomeEmail({ creatorName, partyName, magicUrl, adminUrl });
	await sendEmail(to, `Your party "${partyName}" is ready!`, html, 'creator_welcome', {
		creatorName,
		partyName,
		magicUrl,
		adminUrl
	});
}

export async function sendBonusEarnedEmail(
	to: string,
	recipientName: string,
	acceptedName: string,
	partyName: string,
	dashboardUrl: string
): Promise<void> {
	const { renderBonusEarnedEmail } = await import('./email-templates');
	const html = renderBonusEarnedEmail({ recipientName, acceptedName, partyName, dashboardUrl });
	await sendEmail(
		to,
		`${acceptedName} accepted your invite to ${partyName}!`,
		html,
		'bonus_earned',
		{ recipientName, acceptedName, partyName, dashboardUrl }
	);
}

export async function sendBonusBumpedEmail(
	to: string,
	recipientName: string,
	partyName: string,
	bumpedSongTitle: string
): Promise<void> {
	const { renderBonusBumpedEmail } = await import('./email-templates');
	const html = renderBonusBumpedEmail({ recipientName, partyName, bumpedSongTitle });
	await sendEmail(
		to,
		`${partyName} is filling up — your bonus song was bumped`,
		html,
		'bonus_bumped',
		{ recipientName, partyName, bumpedSongTitle }
	);
}
