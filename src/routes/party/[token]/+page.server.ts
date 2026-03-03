import { error, fail, redirect } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import type { Database } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { generateInviteToken } from '$lib/server/tokens';
import { extractYouTubeId } from '$lib/youtube';
import { fetchYouTubeMetadata } from '$lib/server/youtube';
import { sendInviteEmail } from '$lib/server/email';
import { checkEmailRateLimit, recordEmailSend } from '$lib/server/rate-limit';
import { computeTargetDuration, computeMaxSongs, computeOverflowDrops, canIssueInvitations } from '$lib/server/playlist';
import type { SongInfo } from '$lib/server/playlist';
import { MAX_COMMENT_LENGTH } from '$lib/comment';
import { parseInviteLines } from '$lib/parse-invites';
import type { PageServerLoad, Actions } from './$types';

function isCreator(attendee: { depth: number; invitedBy: number | null }): boolean {
	return attendee.depth === 0 && attendee.invitedBy === null;
}

type AttendeeStatus = 'pending' | 'declined' | 'attending' | 'unavailable';

function getAttendeeStatus(a: { acceptedAt: string | null; declinedAt: string | null }): AttendeeStatus {
	if (a.acceptedAt && a.declinedAt) return 'unavailable';
	if (a.acceptedAt) return 'attending';
	if (a.declinedAt) return 'declined';
	return 'pending';
}

function maskEmail(email: string): string {
	const [local, domain] = email.split('@');
	const maskedLocal = local[0] + '***' + (local.length > 1 ? local[local.length - 1] : '');
	const domainParts = domain.split('.');
	const maskedDomain = domainParts[0][0] + '***' + '.' + domainParts.slice(1).join('.');
	return maskedLocal + '@' + maskedDomain;
}

function toSongInfo(s: { id: number; addedBy: number; durationSeconds: number; addedAt: string }): SongInfo {
	return { id: s.id, addedBy: s.addedBy, durationSeconds: s.durationSeconds, addedAt: s.addedAt };
}

interface InviteValidationContext {
	db: Database;
	party: { id: number; maxAttendees: number; maxDepth: number | null; maxInvitesPerGuest: number | null; time: string | null; endTime: string | null; name: string; date: string; location: string | null; locationUrl: string | null };
	attendee: { id: number; name: string; depth: number };
	allAttendees: Array<{ id: number; email: string; invitedBy: number | null; declinedAt: string | null }>;
	allSongs: SongInfo[];
	targetDuration: number | null;
}

async function validateInvite(
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

export const load: PageServerLoad = async ({ params, platform, cookies }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.token)
	});

	if (!attendee) {
		error(404, 'Not found');
	}

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});

	if (!party) {
		error(404, 'Party not found');
	}

	const verified = cookies.get(`pv_${params.token}`) === '1';
	const creator = isCreator(attendee);
	const isPending = !attendee.acceptedAt;
	const attendeeStatus = getAttendeeStatus(attendee);

	// Load all songs
	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	const targetDuration = computeTargetDuration(party.time, party.endTime);
	const totalDuration = allSongs.reduce((sum, s) => sum + s.durationSeconds, 0);

	// Load all attendees
	const allAttendees = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});
	const activeAttendees = allAttendees.filter((a) => !a.declinedAt);
	const acceptedCount = allAttendees.filter((a) => a.acceptedAt && !a.declinedAt).length;

	// My invites
	const myInvites = allAttendees.filter((a) => a.invitedBy === attendee.id);
	const invitesSent = myInvites.length;

	const songsPerGuest = party.songsPerGuest ?? 1;
	const maxSongs = computeMaxSongs(creator, invitesSent, songsPerGuest);
	const mySongs = allSongs.filter((s) => s.addedBy === attendee.id);

	const canInvite = canIssueInvitations(
		activeAttendees.length,
		party.maxAttendees,
		allSongs.map(toSongInfo),
		targetDuration
	);

	// Build attendee name map and find host ID
	const attendeeMap = new Map(allAttendees.map((a) => [a.id, a.name]));
	const hostId = allAttendees.find((a) => isCreator(a))?.id ?? null;

	// Song attribution filtering
	const attribution = party.songAttribution as 'hidden' | 'own_tree' | 'visible';

	// For own_tree: build set of attendee IDs in this attendee's tree
	let treeIds: Set<number> | null = null;
	if (attribution === 'own_tree' && !creator) {
		treeIds = new Set<number>([attendee.id]);
		// Walk down: find all attendees invited by anyone in the tree
		const queue = [attendee.id];
		while (queue.length > 0) {
			const parentId = queue.shift()!;
			for (const a of allAttendees) {
				if (a.invitedBy === parentId && !treeIds.has(a.id)) {
					treeIds.add(a.id);
					queue.push(a.id);
				}
			}
		}
	}

	// Build set of unavailable attendee IDs
	const unavailableIds = new Set(
		allAttendees.filter((a) => a.declinedAt).map((a) => a.id)
	);

	// Build song list with conditional attribution
	const songList = allSongs.map((s) => {
		let addedByName: string | null = null;
		if (creator) {
			addedByName = attendeeMap.get(s.addedBy) || 'Unknown';
		} else if (attribution === 'visible') {
			addedByName = attendeeMap.get(s.addedBy) || 'Unknown';
		} else if (attribution === 'own_tree' && treeIds?.has(s.addedBy)) {
			addedByName = attendeeMap.get(s.addedBy) || 'Unknown';
		}

		return {
			id: s.id,
			youtubeId: s.youtubeId,
			youtubeTitle: s.youtubeTitle,
			youtubeThumbnail: s.youtubeThumbnail,
			youtubeChannelName: s.youtubeChannelName,
			durationSeconds: s.durationSeconds,
			position: s.position,
			comment: s.comment,
			addedByName,
			isMine: s.addedBy === attendee.id,
			isHost: s.addedBy === hostId,
			isUnavailable: unavailableIds.has(s.addedBy)
		};
	});

	// Base return data
	const result: Record<string, unknown> = {
		verified,
		maskedEmail: maskEmail(attendee.email),
		party: {
			name: party.name,
			description: party.description,
			date: party.date,
			time: party.time,
			endTime: party.endTime,
			location: party.location,
			locationUrl: party.locationUrl,
			maxAttendees: party.maxAttendees,
			maxDepth: party.maxDepth,
			maxInvitesPerGuest: party.maxInvitesPerGuest,
			songsPerGuest: party.songsPerGuest ?? 1,
			songAttribution: party.songAttribution,
			customInviteMessage: party.customInviteMessage
		},
		attendee: {
			name: attendee.name,
			depth: attendee.depth,
			inviteToken: attendee.inviteToken
		},
		isCreator: creator,
		isPending,
		attendeeStatus,
		songs: songList,
		totalDuration,
		targetDuration,
		acceptedCount,
		totalAttendees: activeAttendees.length,
		canInvite
	};

	if (!isPending) {
		result.mySongs = mySongs.map((s) => ({
			id: s.id,
			youtubeId: s.youtubeId,
			youtubeTitle: s.youtubeTitle,
			youtubeThumbnail: s.youtubeThumbnail,
			youtubeChannelName: s.youtubeChannelName,
			durationSeconds: s.durationSeconds,
			comment: s.comment
		}));
		result.maxSongs = maxSongs === Infinity ? -1 : maxSongs; // -1 signals unlimited
		result.songsUsed = mySongs.length;
		result.invitesSent = invitesSent;
		result.myInvites = myInvites.map((i) => ({
			name: i.name,
			email: i.email,
			accepted: !!i.acceptedAt,
			status: getAttendeeStatus(i)
		}));
	}

	// Creator extras
	if (creator) {
		result.allAttendees = allAttendees.map((a) => ({
			id: a.id,
			name: a.name,
			email: a.email,
			invitedBy: a.invitedBy,
			depth: a.depth,
			accepted: !!a.acceptedAt,
			status: getAttendeeStatus(a)
		}));
	}

	return result;
};

export const actions = {
	verify: async ({ params, request, platform, cookies }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const email = data.get('email')?.toString()?.trim();
		if (!email) return fail(400, { verifyError: 'Email is required' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { verifyError: 'Not found' });

		if (email.toLowerCase() !== attendee.email.toLowerCase()) {
			return fail(400, { verifyError: 'Email does not match this invite' });
		}

		cookies.set(`pv_${params.token}`, '1', {
			path: `/party/${params.token}`,
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		return { verified: true };
	},

	accept: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const name = data.get('name')?.toString()?.trim();
		const youtubeUrl = data.get('youtubeUrl')?.toString()?.trim();

		if (!name) return fail(400, { error: 'Your name is required' });
		if (!youtubeUrl) return fail(400, { error: 'A YouTube URL is required' });

		const videoId = extractYouTubeId(youtubeUrl);
		if (!videoId) return fail(400, { error: 'Invalid YouTube URL' });

		const durationStr = data.get('durationSeconds')?.toString()?.trim();
		let durationSeconds: number | undefined;
		if (durationStr) {
			const parsed = parseInt(durationStr, 10);
			if (!isNaN(parsed) && parsed > 0 && parsed < 7200) {
				durationSeconds = parsed;
			}
		}
		if (!durationSeconds) return fail(400, { error: 'Song duration is required' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Invite not found' });
		if (attendee.acceptedAt) return fail(400, { error: 'Invite already accepted' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		// Check for duplicate song
		const existing = await db.query.songs.findFirst({
			where: and(eq(songs.partyId, party.id), eq(songs.youtubeId, videoId))
		});
		if (existing) {
			return fail(400, { error: 'This song is already on the playlist! Pick something else.' });
		}

		const metadata = await fetchYouTubeMetadata(videoId);
		if (!metadata) {
			return fail(400, { error: 'Could not find that YouTube video. Is it public?' });
		}

		// Run overflow algorithm
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);
		const overflowResult = computeOverflowDrops(
			allSongs.map(toSongInfo),
			durationSeconds,
			targetDuration,
			attendee.id
		);

		if (overflowResult === null) {
			return fail(400, { error: 'The playlist is full and no songs can be dropped to make room.' });
		}

		// Drop songs
		for (const dropId of overflowResult.drops) {
			await db.delete(songs).where(eq(songs.id, dropId));
		}

		// Fix positions after drops
		if (overflowResult.drops.length > 0) {
			const remainingSongs = await db.query.songs.findMany({
				where: eq(songs.partyId, party.id),
				orderBy: songs.position
			});
			for (let i = 0; i < remainingSongs.length; i++) {
				if (remainingSongs[i].position !== i) {
					await db.update(songs).set({ position: i }).where(eq(songs.id, remainingSongs[i].id));
				}
			}
		}

		// Accept the invite (also clear declinedAt in case of decline → undecline → accept flow)
		await db
			.update(attendees)
			.set({ name, acceptedAt: new Date().toISOString(), declinedAt: null })
			.where(eq(attendees.id, attendee.id));

		// Get new position
		const currentSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});

		// Read optional comment
		const commentRaw = data.get('comment')?.toString()?.trim() || null;
		const comment = commentRaw ? commentRaw.slice(0, MAX_COMMENT_LENGTH) : null;

		// Add the song
		await db.insert(songs).values({
			partyId: party.id,
			addedBy: attendee.id,
			youtubeId: videoId,
			youtubeTitle: metadata.title,
			youtubeThumbnail: metadata.thumbnail,
			youtubeChannelName: metadata.channelName,
			durationSeconds,
			comment,
			position: currentSongs.length
		});

		return { accepted: true };
	},

	addSong: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const youtubeUrl = data.get('youtubeUrl')?.toString()?.trim();
		if (!youtubeUrl) return fail(400, { songError: 'A YouTube URL is required' });

		const videoId = extractYouTubeId(youtubeUrl);
		if (!videoId) return fail(400, { songError: 'Invalid YouTube URL' });

		const durationStr = data.get('durationSeconds')?.toString()?.trim();
		let durationSeconds: number | undefined;
		if (durationStr) {
			const parsed = parseInt(durationStr, 10);
			if (!isNaN(parsed) && parsed > 0 && parsed < 7200) {
				durationSeconds = parsed;
			}
		}
		if (!durationSeconds) return fail(400, { songError: 'Song duration is required' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { songError: 'Not found' });
		if (attendee.declinedAt) return fail(400, { songError: 'You have declined this invitation' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { songError: 'Party not found' });

		const creator = isCreator(attendee);

		// Check slot limit
		const allAttendees = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const invitesSent = allAttendees.filter((a) => a.invitedBy === attendee.id).length;
		const maxSongs = computeMaxSongs(creator, invitesSent, party.songsPerGuest ?? 1);
		const mySongs = await db.query.songs.findMany({
			where: and(eq(songs.partyId, party.id), eq(songs.addedBy, attendee.id))
		});

		if (mySongs.length >= maxSongs) {
			return fail(400, { songError: 'No song slots available. Invite friends to earn more!' });
		}

		// Check duplicate
		const existing = await db.query.songs.findFirst({
			where: and(eq(songs.partyId, party.id), eq(songs.youtubeId, videoId))
		});
		if (existing) {
			return fail(400, { songError: 'This song is already on the playlist! Pick something else.' });
		}

		const metadata = await fetchYouTubeMetadata(videoId);
		if (!metadata) {
			return fail(400, { songError: 'Could not find that YouTube video. Is it public?' });
		}

		// Run overflow
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);
		const overflowResult = computeOverflowDrops(
			allSongs.map(toSongInfo),
			durationSeconds,
			targetDuration,
			attendee.id
		);

		if (overflowResult === null) {
			return fail(400, { songError: 'The playlist is full and no songs can be dropped to make room.' });
		}

		for (const dropId of overflowResult.drops) {
			await db.delete(songs).where(eq(songs.id, dropId));
		}

		if (overflowResult.drops.length > 0) {
			const remainingSongs = await db.query.songs.findMany({
				where: eq(songs.partyId, party.id),
				orderBy: songs.position
			});
			for (let i = 0; i < remainingSongs.length; i++) {
				if (remainingSongs[i].position !== i) {
					await db.update(songs).set({ position: i }).where(eq(songs.id, remainingSongs[i].id));
				}
			}
		}

		const currentSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});

		// Read optional comment
		const commentRaw = data.get('comment')?.toString()?.trim() || null;
		const comment = commentRaw ? commentRaw.slice(0, MAX_COMMENT_LENGTH) : null;

		await db.insert(songs).values({
			partyId: party.id,
			addedBy: attendee.id,
			youtubeId: videoId,
			youtubeTitle: metadata.title,
			youtubeThumbnail: metadata.thumbnail,
			youtubeChannelName: metadata.channelName,
			durationSeconds,
			comment,
			position: currentSongs.length
		});

		return { songAdded: true };
	},

	sendInvite: async ({ params, request, platform, url }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const name = data.get('name')?.toString()?.trim();
		const email = data.get('email')?.toString()?.trim();

		if (!name) return fail(400, { inviteError: "Friend's name is required" });
		if (!email) return fail(400, { inviteError: "Friend's email is required" });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { inviteError: 'Not found' });
		if (attendee.declinedAt) return fail(400, { inviteError: 'You have declined this invitation' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { inviteError: 'Party not found' });

		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);

		const validationError = await validateInvite(
			{ db, party, attendee, allAttendees: allAttendeesList, allSongs: allSongs.map(toSongInfo), targetDuration },
			name,
			email
		);
		if (validationError) {
			return fail(400, { inviteError: validationError });
		}

		const newToken = generateInviteToken();

		await db.insert(attendees).values({
			partyId: party.id,
			name,
			email,
			invitedBy: attendee.id,
			inviteToken: newToken,
			depth: attendee.depth + 1
		});

		const magicUrl = `${url.origin}/party/${newToken}`;
		await sendInviteEmail(
			email,
			name,
			attendee.name,
			party.name,
			party.date,
			party.time,
			party.location,
			magicUrl,
			platform,
			party.locationUrl,
			party.customInviteMessage,
			party.creatorEmail
		);
		await recordEmailSend(db, email, 'invite');

		return { inviteSent: name, inviteUrl: magicUrl };
	},

	bulkInvite: async ({ params, request, platform, url }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const text = data.get('bulkText')?.toString() || '';
		const parsed = parseInviteLines(text);

		if (parsed.length === 0) {
			return fail(400, { bulkError: 'No valid entries found. Each line needs a name and email.' });
		}

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { bulkError: 'Not found' });

		if (!isCreator(attendee)) {
			return fail(403, { bulkError: 'Only the party creator can use bulk invite' });
		}
		if (attendee.declinedAt) return fail(400, { bulkError: 'You have declined this invitation' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { bulkError: 'Party not found' });

		const bulkResults: Array<{ name: string; email: string; success: boolean; error?: string; inviteUrl?: string }> = [];

		// Track emails within this batch to catch duplicates
		const batchEmails = new Set<string>();

		for (const entry of parsed) {
			// Check for duplicates within the batch
			const emailLower = entry.email.toLowerCase();
			if (batchEmails.has(emailLower)) {
				bulkResults.push({ name: entry.name, email: entry.email, success: false, error: 'Duplicate in this batch' });
				continue;
			}

			// Re-fetch attendees each iteration so newly added ones are visible
			const allAttendeesList = await db.query.attendees.findMany({
				where: eq(attendees.partyId, party.id)
			});
			const allSongs = await db.query.songs.findMany({
				where: eq(songs.partyId, party.id)
			});
			const targetDuration = computeTargetDuration(party.time, party.endTime);

			const validationError = await validateInvite(
				{ db, party, attendee, allAttendees: allAttendeesList, allSongs: allSongs.map(toSongInfo), targetDuration },
				entry.name,
				entry.email
			);

			if (validationError) {
				bulkResults.push({ name: entry.name, email: entry.email, success: false, error: validationError });
				continue;
			}

			const newToken = generateInviteToken();

			await db.insert(attendees).values({
				partyId: party.id,
				name: entry.name,
				email: entry.email,
				invitedBy: attendee.id,
				inviteToken: newToken,
				depth: attendee.depth + 1
			});

			const magicUrl = `${url.origin}/party/${newToken}`;
			await sendInviteEmail(
				entry.email,
				entry.name,
				attendee.name,
				party.name,
				party.date,
				party.time,
				party.location,
				magicUrl,
				platform,
				party.locationUrl,
				party.customInviteMessage,
				party.creatorEmail
			);
			await recordEmailSend(db, entry.email, 'invite');

			batchEmails.add(emailLower);
			bulkResults.push({ name: entry.name, email: entry.email, success: true, inviteUrl: magicUrl });
		}

		return { bulkResults };
	},

	decline: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (attendee.acceptedAt) return fail(400, { error: 'You have already accepted' });
		if (isCreator(attendee)) return fail(400, { error: 'The creator cannot decline' });

		await db
			.update(attendees)
			.set({ declinedAt: new Date().toISOString() })
			.where(eq(attendees.id, attendee.id));

		return { declined: true };
	},

	undecline: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (attendee.acceptedAt) return fail(400, { error: 'You have already accepted' });
		if (!attendee.declinedAt) return fail(400, { error: 'You have not declined' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		// Capacity check
		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const activeCount = allAttendeesList.filter((a) => !a.declinedAt).length;
		if (activeCount >= party.maxAttendees) {
			return fail(400, { error: 'Party is now full — no room to rejoin' });
		}

		await db
			.update(attendees)
			.set({ declinedAt: null })
			.where(eq(attendees.id, attendee.id));

		return { undeclined: true };
	},

	cantMakeIt: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!attendee.acceptedAt) return fail(400, { error: 'You have not accepted yet' });
		if (isCreator(attendee)) return fail(400, { error: 'The creator cannot mark unavailable' });

		await db
			.update(attendees)
			.set({ declinedAt: new Date().toISOString() })
			.where(eq(attendees.id, attendee.id));

		return { cantMakeIt: true };
	},

	reconfirm: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!attendee.acceptedAt || !attendee.declinedAt) return fail(400, { error: 'Invalid state' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		// Capacity check
		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const activeCount = allAttendeesList.filter((a) => !a.declinedAt).length;
		if (activeCount >= party.maxAttendees) {
			return fail(400, { error: 'Party is now full — no room to rejoin' });
		}

		await db
			.update(attendees)
			.set({ declinedAt: null })
			.where(eq(attendees.id, attendee.id));

		return { reconfirmed: true };
	},

	removeSong: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const songId = parseInt(data.get('songId')?.toString() || '', 10);
		if (isNaN(songId)) return fail(400, { error: 'Invalid song ID' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { error: 'Only the creator can remove songs' });

		const song = await db.query.songs.findFirst({
			where: and(eq(songs.id, songId), eq(songs.partyId, attendee.partyId))
		});
		if (!song) return fail(404, { error: 'Song not found' });

		await db.delete(songs).where(eq(songs.id, songId));

		// Fix positions
		const remainingSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});
		for (let i = 0; i < remainingSongs.length; i++) {
			if (remainingSongs[i].position !== i) {
				await db.update(songs).set({ position: i }).where(eq(songs.id, remainingSongs[i].id));
			}
		}

		return { songRemoved: true };
	},

	moveSong: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const songId = parseInt(data.get('songId')?.toString() || '', 10);
		const newPosition = parseInt(data.get('newPosition')?.toString() || '', 10);
		if (isNaN(songId) || isNaN(newPosition) || newPosition < 0) {
			return fail(400, { error: 'Invalid request' });
		}

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });

		// Song must belong to this attendee, or attendee must be the creator
		if (!isCreator(attendee) && allSongs[idx].addedBy !== attendee.id) {
			return fail(403, { error: 'You can only reorder your own songs' });
		}
		if (newPosition >= allSongs.length) return fail(400, { error: 'Invalid position' });

		// Splice out and insert at new position
		const [moved] = allSongs.splice(idx, 1);
		allSongs.splice(newPosition, 0, moved);

		// Update all positions
		for (let i = 0; i < allSongs.length; i++) {
			if (allSongs[i].position !== i) {
				await db.update(songs).set({ position: i }).where(eq(songs.id, allSongs[i].id));
			}
		}

		return { reordered: true };
	},

	reorderSong: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const songId = parseInt(data.get('songId')?.toString() || '', 10);
		const direction = data.get('direction')?.toString();
		if (isNaN(songId) || (direction !== 'up' && direction !== 'down')) {
			return fail(400, { error: 'Invalid request' });
		}

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });

		// Song must belong to this attendee, or attendee must be the creator
		if (!isCreator(attendee) && allSongs[idx].addedBy !== attendee.id) {
			return fail(403, { error: 'You can only reorder your own songs' });
		}

		const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= allSongs.length) return fail(400, { error: 'Cannot move further' });

		// Swap positions
		const songA = allSongs[idx];
		const songB = allSongs[swapIdx];
		await db.update(songs).set({ position: songB.position }).where(eq(songs.id, songA.id));
		await db.update(songs).set({ position: songA.position }).where(eq(songs.id, songB.id));

		return { reordered: true };
	},

	sendTestEmail: async ({ params, platform, url }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { error: 'Only the creator can send test emails' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		const magicUrl = `${url.origin}/party/${params.token}`;
		await sendInviteEmail(
			party.creatorEmail,
			attendee.name,
			attendee.name,
			party.name,
			party.date,
			party.time,
			party.location,
			magicUrl,
			platform,
			party.locationUrl,
			party.customInviteMessage,
			party.creatorEmail
		);

		return { testEmailSent: true };
	},

	updateSettings: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { error: 'Only the creator can update settings' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		const updates: Record<string, unknown> = {};

		const name = data.get('partyName')?.toString()?.trim();
		if (name) updates.name = name;

		const maxInvitesRaw = data.get('maxInvitesPerGuest')?.toString()?.trim();
		if (maxInvitesRaw === '') {
			updates.maxInvitesPerGuest = null;
		} else if (maxInvitesRaw) {
			const parsed = parseInt(maxInvitesRaw, 10);
			if (!isNaN(parsed) && parsed >= 0) updates.maxInvitesPerGuest = parsed;
		}

		const songsPerGuestRaw = data.get('songsPerGuest')?.toString()?.trim();
		if (songsPerGuestRaw) {
			const parsed = parseInt(songsPerGuestRaw, 10);
			if (!isNaN(parsed) && parsed >= 1) updates.songsPerGuest = parsed;
		}

		const attribution = data.get('songAttribution')?.toString()?.trim();
		if (attribution && ['hidden', 'own_tree', 'visible'].includes(attribution)) {
			updates.songAttribution = attribution;
		}

		if (data.has('customInviteMessage')) {
			const raw = data.get('customInviteMessage')?.toString()?.trim() || '';
			updates.customInviteMessage = raw ? raw.slice(0, 2000) : null;
		}

		if (Object.keys(updates).length > 0) {
			await db.update(parties).set(updates).where(eq(parties.id, party.id));
		}

		return { settingsUpdated: true };
	}
} satisfies Actions;
