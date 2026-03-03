import { formatTime } from '$lib/time';
import { renderMarkdown } from '$lib/markdown';

function escapeHtml(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EMAIL_LINK_STYLE = 'color:#d4a041;text-decoration:underline;';

function baseLayout(content: string): string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111111;color:#e8e4e0;font-family:'Inter',system-ui,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:32px 16px;">
<div style="text-align:center;margin-bottom:24px;">
<span style="font-size:20px;letter-spacing:3px;color:#e63b2e;font-weight:bold;">PLAYLIST PARTY</span>
</div>
<div style="background:#1e1e1e;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;">
${content}
</div>
<p style="text-align:center;font-size:12px;color:#706c68;margin-top:24px;">
Made for parties worth remembering.
</p>
</div>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
	return `<a href="${url}" style="display:inline-block;background:#e63b2e;color:#ffffff;font-weight:bold;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;margin-top:16px;">${label}</a>`;
}

function partyDetails(
	date: string,
	time: string | null,
	location: string | null,
	locationUrl?: string | null
): string {
	const displayTime = time ? formatTime(time) : null;
	let details = `<p style="font-size:14px;color:#a8a4a0;margin:12px 0 0;">📅 ${date}`;
	if (displayTime) details += ` at ${displayTime}`;
	details += `</p>`;
	if (location || locationUrl) {
		const locText = location || 'View on Google Maps';
		if (locationUrl) {
			details += `<p style="font-size:14px;color:#a8a4a0;margin:4px 0 0;">📍 <a href="${locationUrl}" style="color:#d4a041;text-decoration:underline;">${locText}</a></p>`;
		} else {
			details += `<p style="font-size:14px;color:#a8a4a0;margin:4px 0 0;">📍 ${locText}</p>`;
		}
	}
	return details;
}

export function renderEmailVerification(data: {
	email: string;
	verifyUrl: string;
}): string {
	return baseLayout(`
<h1 style="font-size:24px;margin:0 0 8px;color:#e8e4e0;">Verify Your Email</h1>
<p style="font-size:16px;color:#a8a4a0;margin:0 0 16px;">
Confirm <strong>${data.email}</strong> to start creating your party.
</p>
<div style="text-align:center;margin-top:20px;">
${ctaButton(data.verifyUrl, 'Verify Email')}
</div>
<p style="font-size:12px;color:#706c68;margin-top:16px;">
This link expires in 30 minutes. If you didn't request this, you can ignore this email.
</p>
`);
}

export function renderInviteEmail(data: {
	inviteeName: string;
	inviterName: string;
	partyName: string;
	partyDate: string;
	partyTime: string | null;
	partyLocation: string | null;
	partyLocationUrl?: string | null;
	magicUrl: string;
	description?: string;
	songsRequired?: number;
	customMessage?: string;
}): string {
	const descriptionHtml = data.description
		? `<p style="font-size:14px;color:#a8a4a0;white-space:pre-line;margin:0 0 16px;">${renderMarkdown(data.description, { linkStyle: EMAIL_LINK_STYLE })}</p>`
		: '';

	const songCount = data.songsRequired ?? 1;
	const songWord = songCount === 1 ? 'song' : `${songCount} songs`;

	const messageHtml = data.customMessage
		? `<p style="font-size:14px;color:#a8a4a0;white-space:pre-line;">${renderMarkdown(data.customMessage, { linkStyle: EMAIL_LINK_STYLE })}</p>`
		: `<p style="font-size:14px;color:#a8a4a0;">
You'll be asked to add ${songWord} to the playlist when you RSVP.
</p>
<p style="font-size:13px;color:#706c68;margin-top:12px;">
Feel free to invite your friends! But don't forward this message — you can add them on the invite page.
</p>`;

	return baseLayout(`
<h1 style="font-size:24px;margin:0 0 8px;color:#e8e4e0;">You're Invited!</h1>
<p style="font-size:16px;color:#a8a4a0;margin:0 0 16px;">
<strong>${data.inviterName}</strong> wants you at <strong>${data.partyName}</strong>.
</p>
${descriptionHtml}${partyDetails(data.partyDate, data.partyTime, data.partyLocation, data.partyLocationUrl)}
${messageHtml}
<div style="text-align:center;margin-top:20px;">
${ctaButton(data.magicUrl, 'RSVP Now')}
</div>
<p style="font-size:12px;color:#706c68;margin-top:16px;">
This link is just for you — please don't forward it.
</p>
`);
}

export function renderCreatorWelcomeEmail(data: {
	creatorName: string;
	partyName: string;
	magicUrl: string;
}): string {
	return baseLayout(`
<h1 style="font-size:24px;margin:0 0 8px;color:#e8e4e0;">Your Party is Ready!</h1>
<p style="font-size:16px;color:#a8a4a0;margin:0 0 16px;">
Hey ${data.creatorName}, <strong>${data.partyName}</strong> is live.
</p>
<p style="font-size:14px;color:#a8a4a0;">
Bookmark this link — it's your key to the party:
</p>
<div style="margin-top:16px;">
<p style="font-size:13px;color:#706c68;margin:0 0 4px;">Your Party Page:</p>
<a href="${data.magicUrl}" style="font-size:14px;color:#d4a041;word-break:break-all;">${data.magicUrl}</a>
</div>
<div style="text-align:center;margin-top:20px;">
${ctaButton(data.magicUrl, 'Go to Your Party')}
</div>
<p style="font-size:12px;color:#706c68;margin-top:16px;">
This link is personal to you — don't share it.
</p>
`);
}
