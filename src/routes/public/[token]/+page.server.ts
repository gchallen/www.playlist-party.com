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

	const songList = allSongs.map((s) => ({
		youtubeId: s.youtubeId,
		youtubeTitle: s.youtubeTitle,
		youtubeThumbnail: s.youtubeThumbnail,
		youtubeChannelName: s.youtubeChannelName,
		durationSeconds: s.durationSeconds,
		position: s.position,
		comment: s.comment
	}));

	// Conditionally load details based on visibility flags
	let hostName: string | null = null;
	if (party.publicShowHost) {
		const creator = await db.query.attendees.findFirst({
			where: sql`${attendees.partyId} = ${party.id} AND ${attendees.depth} = 0 AND ${attendees.invitedBy} IS NULL`
		});
		if (creator) hostName = abbreviateName(creator.name);
	}

	let guestCount: number | null = null;
	if (party.publicShowGuestCount) {
		const allAttendees = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		guestCount = allAttendees.filter((a) => a.acceptedAt && !a.declinedAt).length;
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
		totalDuration: allSongs.reduce((sum, s) => sum + s.durationSeconds, 0)
	};
};
