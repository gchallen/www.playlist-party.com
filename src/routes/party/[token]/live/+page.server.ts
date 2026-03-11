import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { hasPlaylistControl } from '$lib/server/roles';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.token)
	});
	if (!attendee) error(404, 'Not found');
	if (!hasPlaylistControl(attendee)) error(403, 'Only the party creator or DJs can access the DJ screen');

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});
	if (!party) error(404, 'Party not found');

	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	const allAttendees = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});
	const attendeeMap = new Map(allAttendees.map((a) => [a.id, a.name]));

	const songList = allSongs.map((s) => ({
		id: s.id,
		youtubeId: s.youtubeId,
		title: s.youtubeTitle,
		thumbnail: s.youtubeThumbnail,
		channelName: s.youtubeChannelName,
		addedByName: attendeeMap.get(s.addedBy) ?? 'Unknown',
		position: s.position,
		durationSeconds: s.durationSeconds
	}));

	return {
		party: {
			name: party.name,
			nowPlayingSongId: party.nowPlayingSongId
		},
		songs: songList,
		token: params.token,
		isDisplay: false // overridden client-side from URL search params
	};
};

export const actions: Actions = {
	stopPartyMode: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) error(404, 'Not found');
		if (!hasPlaylistControl(attendee)) error(403, 'Only the creator or DJs can stop party mode');

		await db.update(parties).set({ nowPlayingSongId: null }).where(eq(parties.id, attendee.partyId));

		redirect(303, `/party/${params.token}`);
	}
};
