function baseLayout(content: string): string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0612;color:#f0e6ff;font-family:'Outfit',system-ui,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:32px 16px;">
<div style="text-align:center;margin-bottom:24px;">
<span style="font-size:20px;letter-spacing:3px;color:#ff2d78;font-weight:bold;">PLAYLIST PARTY</span>
</div>
<div style="background:#1a0f2e;border:1px solid rgba(180,77,255,0.2);border-radius:16px;padding:24px;">
${content}
</div>
<p style="text-align:center;font-size:12px;color:#7a6a9d;margin-top:24px;">
Made for parties worth remembering.
</p>
</div>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
	return `<a href="${url}" style="display:inline-block;background:#ff2d78;color:#0a0612;font-weight:bold;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;margin-top:16px;">${label}</a>`;
}

function partyDetails(
	date: string,
	time: string | null,
	location: string | null
): string {
	let details = `<p style="font-size:14px;color:#c4b5e0;margin:12px 0 0;">📅 ${date}`;
	if (time) details += ` at ${time}`;
	details += `</p>`;
	if (location) details += `<p style="font-size:14px;color:#c4b5e0;margin:4px 0 0;">📍 ${location}</p>`;
	return details;
}

export function renderInviteEmail(data: {
	inviteeName: string;
	inviterName: string;
	partyName: string;
	partyDate: string;
	partyTime: string | null;
	partyLocation: string | null;
	magicUrl: string;
}): string {
	return baseLayout(`
<h1 style="font-size:24px;margin:0 0 8px;color:#f0e6ff;">You're Invited!</h1>
<p style="font-size:16px;color:#c4b5e0;margin:0 0 16px;">
<strong>${data.inviterName}</strong> wants you at <strong>${data.partyName}</strong>.
</p>
<p style="font-size:14px;color:#c4b5e0;">
Pick a song to RSVP — your track is your entrance ticket.
</p>
${partyDetails(data.partyDate, data.partyTime, data.partyLocation)}
<div style="text-align:center;margin-top:20px;">
${ctaButton(data.magicUrl, 'Pick Your Song')}
</div>
`);
}

export function renderCreatorWelcomeEmail(data: {
	creatorName: string;
	partyName: string;
	magicUrl: string;
	adminUrl: string;
}): string {
	return baseLayout(`
<h1 style="font-size:24px;margin:0 0 8px;color:#f0e6ff;">Your Party is Ready!</h1>
<p style="font-size:16px;color:#c4b5e0;margin:0 0 16px;">
Hey ${data.creatorName}, <strong>${data.partyName}</strong> is live.
</p>
<p style="font-size:14px;color:#c4b5e0;">
Bookmark these links — they're your keys to the party:
</p>
<div style="margin-top:16px;">
<p style="font-size:13px;color:#7a6a9d;margin:0 0 4px;">Your Dashboard:</p>
<a href="${data.magicUrl}" style="font-size:14px;color:#00f0ff;word-break:break-all;">${data.magicUrl}</a>
</div>
<div style="margin-top:12px;">
<p style="font-size:13px;color:#7a6a9d;margin:0 0 4px;">Admin Panel:</p>
<a href="${data.adminUrl}" style="font-size:14px;color:#d4ff00;word-break:break-all;">${data.adminUrl}</a>
</div>
<div style="text-align:center;margin-top:20px;">
${ctaButton(data.magicUrl, 'Go to Dashboard')}
</div>
`);
}

export function renderBonusEarnedEmail(data: {
	recipientName: string;
	acceptedName: string;
	partyName: string;
	dashboardUrl: string;
}): string {
	return baseLayout(`
<h1 style="font-size:24px;margin:0 0 8px;color:#f0e6ff;">Bonus Song Unlocked!</h1>
<p style="font-size:16px;color:#c4b5e0;margin:0 0 16px;">
<strong>${data.acceptedName}</strong> accepted your invite to <strong>${data.partyName}</strong>!
</p>
<p style="font-size:14px;color:#00ffa3;">
You've earned a bonus song slot. Add another track to the playlist!
</p>
<div style="text-align:center;margin-top:20px;">
${ctaButton(data.dashboardUrl, 'Add Bonus Song')}
</div>
`);
}

export function renderBonusBumpedEmail(data: {
	recipientName: string;
	partyName: string;
	bumpedSongTitle: string;
}): string {
	return baseLayout(`
<h1 style="font-size:24px;margin:0 0 8px;color:#f0e6ff;">Playlist Update</h1>
<p style="font-size:16px;color:#c4b5e0;margin:0 0 16px;">
<strong>${data.partyName}</strong> is filling up!
</p>
<p style="font-size:14px;color:#c4b5e0;">
Your bonus song "<strong>${data.bumpedSongTitle}</strong>" was bumped to make room for a new guest.
Your entry song is safe — entry songs are never dropped.
</p>
<p style="font-size:14px;color:#7a6a9d;margin-top:16px;">
The party's going to be great!
</p>
`);
}
