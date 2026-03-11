import { json, error } from '@sveltejs/kit';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs, songLikes } from '$lib/server/db/schema';
import { hasPlaylistControl } from '$lib/server/roles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.token)
	});
	if (!attendee) error(404, 'Not found');

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});
	if (!party) error(404, 'Party not found');

	if (!party.nowPlayingSongId) {
		return json({ active: false });
	}

	const song = await db.query.songs.findFirst({
		where: and(eq(songs.id, party.nowPlayingSongId), eq(songs.partyId, party.id))
	});

	if (!song) {
		return json({ active: false });
	}

	const addedByAttendee = await db.query.attendees.findFirst({
		where: eq(attendees.id, song.addedBy)
	});

	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	const likeCountResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(songLikes)
		.where(eq(songLikes.songId, song.id));

	const likeCount = likeCountResult[0]?.count ?? 0;

	const existingLike = await db.query.songLikes.findFirst({
		where: and(eq(songLikes.songId, song.id), eq(songLikes.attendeeId, attendee.id))
	});

	return json({
		active: true,
		songId: song.id,
		youtubeId: song.youtubeId,
		title: song.youtubeTitle,
		channelName: song.youtubeChannelName,
		thumbnail: song.youtubeThumbnail,
		addedByName: addedByAttendee?.name ?? 'Unknown',
		position: allSongs.findIndex((s) => s.id === song.id) + 1,
		totalSongs: allSongs.length,
		likeCount,
		liked: !!existingLike
	});
};

export const POST: RequestHandler = async ({ params, platform, request }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.token)
	});
	if (!attendee) error(404, 'Not found');

	// Creator or DJ only
	if (!hasPlaylistControl(attendee)) {
		error(403, 'Only the party creator or DJs can control playback');
	}

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});
	if (!party) error(404, 'Party not found');

	const body = await request.json();
	const action = body.action as string | undefined;

	if (action === 'next' || action === 'prev') {
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id),
			orderBy: songs.position
		});

		const currentIdx = allSongs.findIndex((s) => s.id === party.nowPlayingSongId);
		const targetIdx = action === 'next' ? currentIdx + 1 : currentIdx - 1;
		const targetSong = allSongs[targetIdx];

		if (!targetSong) {
			return json({ ok: false, reason: 'no_song' });
		}

		await db.update(parties).set({ nowPlayingSongId: targetSong.id }).where(eq(parties.id, party.id));
		return json({ ok: true, songId: targetSong.id });
	}

	const songId = body.songId as number | null;

	if (songId !== null) {
		const song = await db.query.songs.findFirst({
			where: and(eq(songs.id, songId), eq(songs.partyId, party.id))
		});
		if (!song) error(400, 'Song not found in this party');
	}

	await db.update(parties).set({ nowPlayingSongId: songId }).where(eq(parties.id, party.id));

	return json({ ok: true });
};
