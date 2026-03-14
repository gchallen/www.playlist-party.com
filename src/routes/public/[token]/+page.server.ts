import { error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { abbreviateName } from '$lib/names';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	const party = await db.query.parties.findFirst({
		where: eq(parties.publicToken, params.token)
	});

	if (!party || !party.publishedAt) {
		error(404, 'Not found');
	}

	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	// Find the creator attendee
	const creator = await db.query.attendees.findFirst({
		where: sql`${attendees.partyId} = ${party.id} AND ${attendees.depth} = 0 AND ${attendees.invitedBy} IS NULL`
	});
	const hostId = creator?.id ?? null;

	// Filter out songs from unapproved audition attendees
	let visibleSongs = allSongs;
	if (party.inviteMode === 'audition') {
		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const unapprovedIds = new Set(
			allAttendeesList.filter((a) => !a.approvedAt && !(a.depth === 0 && a.invitedBy === null)).map((a) => a.id)
		);
		visibleSongs = allSongs.filter((s) => !unapprovedIds.has(s.addedBy));
	}

	const songList = visibleSongs.map((s) => ({
		youtubeId: s.youtubeId,
		youtubeTitle: s.youtubeTitle,
		youtubeThumbnail: s.youtubeThumbnail,
		youtubeChannelName: s.youtubeChannelName,
		durationSeconds: s.durationSeconds,
		position: s.position,
		comment: s.comment,
		isHost: s.addedBy === hostId
	}));

	// Conditionally load details based on visibility flags
	const hostName = party.publicShowHost && creator ? abbreviateName(creator.name) : null;

	let guestCount: number | null = null;
	if (party.publicShowGuestCount) {
		const allAttendeesList2 = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		guestCount = allAttendeesList2.filter((a) => {
			if (!a.acceptedAt || a.declinedAt) return false;
			if (party.inviteMode === 'audition') {
				return a.approvedAt !== null || (a.depth === 0 && a.invitedBy === null);
			}
			return true;
		}).length;
	}

	return {
		party: {
			name: party.name,
			date: party.date,
			time: party.publicShowTime ? party.time : null,
			location: party.publicShowLocation ? party.location : null,
			locationUrl: party.publicShowLocation ? party.locationUrl : null,
			description: party.publicShowDescription ? party.description : null
		},
		hostName,
		guestCount,
		songs: songList,
		totalDuration: visibleSongs.reduce((sum, s) => sum + s.durationSeconds, 0)
	};
};
