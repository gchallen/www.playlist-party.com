import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, songs, attendees } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	const party = await db.query.parties.findFirst({
		where: eq(parties.partyCode, params.partyCode)
	});

	if (!party) {
		error(404, 'Party not found');
	}

	const partySongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	const partyAttendees = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});

	const isRevealed = !!party.revealedAt;
	const attendeeMap = new Map(partyAttendees.map((a) => [a.id, a.name]));
	const acceptedCount = partyAttendees.filter((a) => !!a.acceptedAt).length;

	// Calculate cumulative play times
	let cumulativeSeconds = 0;
	const songList = partySongs.map((s) => {
		const startsAtSeconds = cumulativeSeconds;
		cumulativeSeconds += s.durationSeconds ?? 0;
		return {
			...s,
			addedByName: isRevealed ? (attendeeMap.get(s.addedBy) || 'Unknown') : null,
			startsAtSeconds
		};
	});

	const totalDurationSeconds = cumulativeSeconds;

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
			estimatedGuests: party.estimatedGuests,
			isRevealed
		},
		songs: songList,
		totalDurationSeconds,
		acceptedCount
	};
};
