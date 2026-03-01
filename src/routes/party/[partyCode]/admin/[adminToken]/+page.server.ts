import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	const party = await db.query.parties.findFirst({
		where: eq(parties.partyCode, params.partyCode)
	});

	if (!party || party.adminToken !== params.adminToken) {
		error(404, 'Party not found');
	}

	const partyAttendees = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});

	const partySongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	return {
		party: {
			id: party.id,
			name: party.name,
			description: party.description,
			date: party.date,
			time: party.time,
			endTime: party.endTime,
			location: party.location,
			partyCode: party.partyCode,
			adminToken: party.adminToken,
			maxAttendees: party.maxAttendees,
			maxDepth: party.maxDepth,
			estimatedGuests: party.estimatedGuests,
			avgSongDurationSeconds: party.avgSongDurationSeconds,
			isRevealed: !!party.revealedAt
		},
		attendees: partyAttendees.map((a) => ({
			id: a.id,
			name: a.name,
			email: a.email,
			invitedBy: a.invitedBy,
			depth: a.depth,
			accepted: !!a.acceptedAt,
			inviteToken: a.inviteToken
		})),
		songs: partySongs
	};
};

export const actions = {
	reveal: async ({ params, platform }) => {
		const db = await getDb(platform);

		const party = await db.query.parties.findFirst({
			where: eq(parties.partyCode, params.partyCode)
		});

		if (!party || party.adminToken !== params.adminToken) {
			error(404, 'Party not found');
		}

		if (party.revealedAt) {
			return { alreadyRevealed: true };
		}

		await db
			.update(parties)
			.set({ revealedAt: new Date().toISOString() })
			.where(eq(parties.id, party.id));

		return { revealed: true };
	}
} satisfies Actions;
