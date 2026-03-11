import { json, error } from '@sveltejs/kit';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { attendees, songs, songLikes } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, platform, request }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.token)
	});
	if (!attendee) error(404, 'Not found');

	// Must be accepted
	if (!attendee.acceptedAt || attendee.declinedAt) {
		error(403, 'Only accepted guests can like songs');
	}

	const body = await request.json();
	const songId = body.songId as number;
	if (!songId) error(400, 'songId required');

	const song = await db.query.songs.findFirst({
		where: and(eq(songs.id, songId), eq(songs.partyId, attendee.partyId))
	});
	if (!song) error(404, 'Song not found');

	// Toggle like
	const existing = await db.query.songLikes.findFirst({
		where: and(eq(songLikes.songId, songId), eq(songLikes.attendeeId, attendee.id))
	});

	if (existing) {
		await db.delete(songLikes).where(and(eq(songLikes.songId, songId), eq(songLikes.attendeeId, attendee.id)));
	} else {
		await db.insert(songLikes).values({ songId, attendeeId: attendee.id });
	}

	const likeCountResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(songLikes)
		.where(eq(songLikes.songId, songId));

	return json({
		liked: !existing,
		likeCount: likeCountResult[0]?.count ?? 0
	});
};
