import type { Database } from '$lib/server/db';
import type { SongInfo } from '$lib/server/playlist';
import { canIssueInvitations } from '$lib/server/playlist';
import { checkEmailRateLimit } from '$lib/server/rate-limit';

export interface InviteValidationContext {
	db: Database;
	party: {
		id: number;
		maxAttendees: number;
		maxDepth: number | null;
		maxInvitesPerGuest: number | null;
		time: string | null;
		endTime: string | null;
		name: string;
		date: string;
		location: string | null;
		locationUrl: string | null;
	};
	attendee: { id: number; name: string; depth: number };
	allAttendees: Array<{ id: number; email: string; invitedBy: number | null; declinedAt: string | null }>;
	allSongs: SongInfo[];
	targetDuration: number | null;
}

export function toSongInfo(s: {
	id: number;
	addedBy: number;
	durationSeconds: number;
	addedAt: string;
}): SongInfo {
	return { id: s.id, addedBy: s.addedBy, durationSeconds: s.durationSeconds, addedAt: s.addedAt };
}

export async function validateInvite(
	ctx: InviteValidationContext,
	name: string,
	email: string
): Promise<string | null> {
	// Check max attendees (exclude declined)
	const activeCount = ctx.allAttendees.filter((a) => !a.declinedAt).length;
	if (activeCount >= ctx.party.maxAttendees) {
		return 'Party is full — max attendees reached';
	}

	// Check max depth
	if (ctx.party.maxDepth !== null && ctx.attendee.depth + 1 > ctx.party.maxDepth) {
		return 'Maximum invite depth reached';
	}

	// Check maxInvitesPerGuest
	const myInvites = ctx.allAttendees.filter((a) => a.invitedBy === ctx.attendee.id);
	if (ctx.party.maxInvitesPerGuest !== null && myInvites.length >= ctx.party.maxInvitesPerGuest) {
		return `You can only send ${ctx.party.maxInvitesPerGuest} invites`;
	}

	// Check canIssueInvitations (duration gating)
	if (!canIssueInvitations(activeCount, ctx.party.maxAttendees, ctx.allSongs, ctx.targetDuration)) {
		return 'The playlist is full — no room for more guests right now';
	}

	// Check duplicate email
	const existingAttendee = ctx.allAttendees.find(
		(a) => a.email.toLowerCase() === email.toLowerCase()
	);
	if (existingAttendee) {
		return 'This person has already been invited!';
	}

	// Rate limit check
	const rateLimit = await checkEmailRateLimit(ctx.db, email);
	if (!rateLimit.allowed) {
		return rateLimit.retryAfterMessage || 'Too many emails sent to this address';
	}

	return null;
}
