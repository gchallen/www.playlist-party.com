import { isNotNull, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { abbreviateName } from '$lib/names';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = await getDb(platform);

	const publishedParties = await db.query.parties.findMany({
		where: isNotNull(parties.publishedAt),
		orderBy: desc(parties.publishedAt),
		limit: 8
	});

	if (publishedParties.length === 0) {
		return { feed: [] };
	}

	const feed = await Promise.all(
		publishedParties.map(async (party) => {
			// Song count and unique artists
			const partySongs = await db.query.songs.findMany({
				where: eq(songs.partyId, party.id)
			});

			const artistSet = new Set<string>();
			for (const s of partySongs) {
				if (s.youtubeChannelName) artistSet.add(s.youtubeChannelName);
			}
			const allArtists = [...artistSet].sort((a, b) => a.localeCompare(b));

			// Host name (creator = depth 0, invitedBy null)
			let hostName: string | null = null;
			if (party.publicShowHost) {
				const creator = await db.query.attendees.findFirst({
					where: sql`${attendees.partyId} = ${party.id} AND ${attendees.depth} = 0 AND ${attendees.invitedBy} IS NULL`
				});
				if (creator) hostName = abbreviateName(creator.name);
			}

			// Active attendee count
			let guestCount: number | null = null;
			if (party.publicShowGuestCount) {
				const allAttendees = await db.query.attendees.findMany({
					where: eq(attendees.partyId, party.id)
				});
				guestCount = allAttendees.filter((a) => a.acceptedAt && !a.declinedAt).length;
			}

			return {
				name: party.name,
				date: party.date,
				time: party.publicShowTime ? party.time : null,
				hostName,
				guestCount,
				songCount: partySongs.length,
				artists: allArtists,
				publicToken: party.publicToken!
			};
		})
	);

	return { feed };
};
