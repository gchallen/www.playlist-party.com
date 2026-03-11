import { renderInviteEmail, renderEmailVerification, renderCreatorWelcomeEmail } from './email-templates';
import { enqueueAndProcess } from './email-queue';

// Re-export dev store for /api/emails test harness
export { getSentEmails, clearSentEmails, pushToDevStore } from './email-dev-store';
export type { EmailMessage } from './email-dev-store';

export interface InviteEmailOptions {
	to: string;
	inviteeName: string;
	inviterName: string;
	partyName: string;
	magicUrl: string;
	platform?: App.Platform;
	customSubject?: string | null;
	customMessage: string;
	replyTo?: string;
}

export async function sendInviteEmail(opts: InviteEmailOptions): Promise<void> {
	const html = renderInviteEmail({
		inviteeName: opts.inviteeName,
		inviterName: opts.inviterName,
		partyName: opts.partyName,
		magicUrl: opts.magicUrl,
		customMessage: opts.customMessage
	});
	const subject = opts.customSubject || `You're Invited to ${opts.partyName}`;
	await enqueueAndProcess(opts.platform, {
		to: opts.to,
		subject,
		html,
		type: 'invite',
		replyTo: opts.replyTo,
		metadata: { magicUrl: opts.magicUrl }
	});
}

export async function sendEmailVerification(to: string, verifyUrl: string, platform?: App.Platform): Promise<void> {
	const html = renderEmailVerification({ email: to, verifyUrl });
	await enqueueAndProcess(platform, {
		to,
		subject: 'Verify your email - Playlist Party',
		html,
		type: 'email_verification'
	});
}

export async function sendCreatorWelcomeEmail(
	to: string,
	creatorName: string,
	partyName: string,
	magicUrl: string,
	platform?: App.Platform
): Promise<void> {
	const html = renderCreatorWelcomeEmail({ creatorName, partyName, magicUrl });
	await enqueueAndProcess(platform, {
		to,
		subject: `Your party "${partyName}" is ready!`,
		html,
		type: 'creator_welcome',
		metadata: { magicUrl }
	});
}
