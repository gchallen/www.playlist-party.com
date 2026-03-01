import { error, fail } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { generateInviteToken } from '$lib/server/tokens';
import { extractYouTubeId } from '$lib/youtube';
import { fetchYouTubeMetadata } from '$lib/server/youtube';
import { sendInviteEmail } from '$lib/server/email';
import type { PageServerLoad, Actions } from './$types';

function computeBonusAvailable(
	estimatedGuests: number | null,
	maxAttendees: number,
	currentAccepted: number,
	totalSongs: number
): boolean {
	if (estimatedGuests === null || currentAccepted / estimatedGuests < 1.0) {
		return true;
	}
	if (currentAccepted < maxAttendees) {
		const taperRatio =
			(maxAttendees - currentAccepted) / (maxAttendees - estimatedGuests);
		return taperRatio > 0 && totalSongs < maxAttendees;
	}
	return false;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.inviteToken)
	});

	if (!attendee) {
		error(404, 'Attendee not found');
	}

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});

	if (!party) {
		error(404, 'Party not found');
	}

	// Get this attendee's songs
	const mySongs = await db.query.songs.findMany({
		where: and(eq(songs.partyId, party.id), eq(songs.addedBy, attendee.id))
	});

	// Get invites this attendee has created
	const myInvites = await db.query.attendees.findMany({
		where: and(eq(attendees.partyId, party.id), eq(attendees.invitedBy, attendee.id))
	});

	// Bonus songs: earned from accepted invitees
	const earnedBonuses = myInvites.filter((i) => i.acceptedAt).length;

	// Entry/bonus counts
	const hasEntrySong = mySongs.some((s) => s.songType === 'entry');
	const bonusSongsUsed = mySongs.filter((s) => s.songType === 'bonus').length;

	// All attendees for counts
	const allAttendees = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});
	const acceptedCount = allAttendees.filter((a) => a.acceptedAt).length;

	// All songs for playlist stats
	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id)
	});
	const totalSongs = allSongs.length;
	const totalDuration = allSongs.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

	// Bonus availability
	const bonusAvailable = computeBonusAvailable(
		party.estimatedGuests,
		party.maxAttendees,
		acceptedCount,
		totalSongs
	);

	return {
		party: {
			name: party.name,
			description: party.description,
			date: party.date,
			time: party.time,
			endTime: party.endTime,
			location: party.location,
			partyCode: party.partyCode,
			maxAttendees: party.maxAttendees,
			maxDepth: party.maxDepth,
			estimatedGuests: party.estimatedGuests,
			avgSongDurationSeconds: party.avgSongDurationSeconds
		},
		attendee: {
			name: attendee.name,
			depth: attendee.depth,
			inviteToken: attendee.inviteToken
		},
		mySongs: mySongs.map((s) => ({
			id: s.id,
			youtubeId: s.youtubeId,
			youtubeTitle: s.youtubeTitle,
			youtubeThumbnail: s.youtubeThumbnail,
			youtubeChannelName: s.youtubeChannelName,
			durationSeconds: s.durationSeconds,
			songType: s.songType
		})),
		myInvites: myInvites.map((i) => ({
			name: i.name,
			email: i.email,
			accepted: !!i.acceptedAt
		})),
		hasEntrySong,
		bonusSongsUsed,
		earnedBonuses,
		bonusAvailable,
		acceptedCount,
		totalSongs,
		totalDuration,
		adminToken: attendee.depth === 0 ? party.adminToken : null
	};
};

export const actions = {
	sendInvite: async ({ params, request, platform, url }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const name = data.get('name')?.toString()?.trim();
		const email = data.get('email')?.toString()?.trim();

		if (!name) return fail(400, { error: "Friend's name is required" });
		if (!email) return fail(400, { error: "Friend's email is required" });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.inviteToken)
		});

		if (!attendee) return fail(404, { error: 'Attendee not found' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});

		if (!party) return fail(404, { error: 'Party not found' });

		// Check max attendees (count ALL attendees, not just accepted)
		const allAttendees = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});

		if (allAttendees.length >= party.maxAttendees) {
			return fail(400, { error: 'Party is full — max attendees reached' });
		}

		// Check max depth
		if (party.maxDepth !== null && attendee.depth + 1 > party.maxDepth) {
			return fail(400, { error: 'Maximum invite depth reached' });
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

		// Send invite email
		const magicUrl = `${url.origin}/invite/${newToken}`;
		await sendInviteEmail(
			email,
			name,
			attendee.name,
			party.name,
			party.date,
			party.time,
			party.location,
			magicUrl,
			platform
		);

		return { inviteSent: name };
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
			if (isNaN(parsed) || parsed <= 0 || parsed >= 7200) {
				return fail(400, { songError: 'Invalid duration' });
			}
			durationSeconds = parsed;
		}

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.inviteToken)
		});

		if (!attendee) return fail(404, { songError: 'Attendee not found' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});

		if (!party) return fail(404, { songError: 'Party not found' });

		// Count my songs
		const mySongs = await db.query.songs.findMany({
			where: and(eq(songs.partyId, party.id), eq(songs.addedBy, attendee.id))
		});

		// Count accepted invitees (earned bonuses)
		const myInvites = await db.query.attendees.findMany({
			where: and(eq(attendees.partyId, party.id), eq(attendees.invitedBy, attendee.id))
		});
		const earnedBonuses = myInvites.filter((i) => i.acceptedAt).length;

		// Check bonus availability
		const allAttendees = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const acceptedCount = allAttendees.filter((a) => a.acceptedAt).length;
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const bonusAvailable = computeBonusAvailable(
			party.estimatedGuests,
			party.maxAttendees,
			acceptedCount,
			allSongs.length
		);

		const maxSongs = 1 + (bonusAvailable ? earnedBonuses : 0);
		if (mySongs.length >= maxSongs) {
			return fail(400, {
				songError: 'No bonus song slots available. Invite friends to earn more!'
			});
		}

		// Check duplicate
		const existing = await db.query.songs.findFirst({
			where: and(eq(songs.partyId, party.id), eq(songs.youtubeId, videoId))
		});

		if (existing) {
			return fail(400, {
				songError: 'This song is already on the playlist! Pick something else.'
			});
		}

		// Fetch metadata
		const metadata = await fetchYouTubeMetadata(videoId);
		if (!metadata) {
			return fail(400, { songError: 'Could not find that YouTube video. Is it public?' });
		}

		await db.insert(songs).values({
			partyId: party.id,
			addedBy: attendee.id,
			youtubeId: videoId,
			youtubeTitle: metadata.title,
			youtubeThumbnail: metadata.thumbnail,
			youtubeChannelName: metadata.channelName,
			durationSeconds,
			songType: 'bonus',
			position: allSongs.length
		});

		return { songAdded: true };
	}
} satisfies Actions;
