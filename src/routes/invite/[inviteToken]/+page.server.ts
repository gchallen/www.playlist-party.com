import { error, fail, redirect } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { extractYouTubeId } from '$lib/youtube';
import { fetchYouTubeMetadata } from '$lib/server/youtube';
import { sendBonusEarnedEmail, sendBonusBumpedEmail } from '$lib/server/email';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.inviteToken)
	});

	if (!attendee) {
		error(404, 'Invite not found');
	}

	if (attendee.acceptedAt) {
		redirect(303, `/attendee/${params.inviteToken}`);
	}

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});

	if (!party) {
		error(404, 'Party not found');
	}

	// Get total playlist duration for estimated play time
	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id)
	});
	const totalPlaylistDuration = allSongs.reduce(
		(sum, s) => sum + (s.durationSeconds || 0),
		0
	);

	return {
		party: {
			name: party.name,
			description: party.description,
			date: party.date,
			time: party.time,
			location: party.location,
			avgSongDurationSeconds: party.avgSongDurationSeconds
		},
		attendeeName: attendee.name,
		inviteToken: params.inviteToken,
		totalPlaylistDuration
	};
};

export const actions = {
	default: async ({ params, request, platform, url }) => {
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

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.inviteToken)
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
			return fail(400, {
				error: 'This song is already on the playlist! Pick something else.'
			});
		}

		// Fetch YouTube metadata
		const metadata = await fetchYouTubeMetadata(videoId);
		if (!metadata) {
			return fail(400, { error: 'Could not find that YouTube video. Is it public?' });
		}

		// Get current songs for position
		const existingSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});

		// Accept the invite (name may be changed by invitee)
		await db
			.update(attendees)
			.set({ name, acceptedAt: new Date().toISOString() })
			.where(eq(attendees.id, attendee.id));

		// Add the entry song
		await db.insert(songs).values({
			partyId: party.id,
			addedBy: attendee.id,
			youtubeId: videoId,
			youtubeTitle: metadata.title,
			youtubeThumbnail: metadata.thumbnail,
			youtubeChannelName: metadata.channelName,
			durationSeconds,
			songType: 'entry',
			position: existingSongs.length
		});

		// Send bonus notification to inviter
		if (attendee.invitedBy) {
			const inviter = await db.query.attendees.findFirst({
				where: eq(attendees.id, attendee.invitedBy)
			});
			if (inviter) {
				const dashboardUrl = `${url.origin}/attendee/${inviter.inviteToken}`;
				await sendBonusEarnedEmail(
					inviter.email,
					inviter.name,
					name,
					party.name,
					dashboardUrl
				);
			}
		}

		// Auto-drop on overflow: if total songs > maxAttendees (playlist target)
		const updatedSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});

		if (updatedSongs.length > party.maxAttendees) {
			// Group songs by addedBy
			const songsByAttendee = new Map<number, typeof updatedSongs>();
			for (const song of updatedSongs) {
				const group = songsByAttendee.get(song.addedBy) || [];
				group.push(song);
				songsByAttendee.set(song.addedBy, group);
			}

			// Find attendee with the most songs who has bonus songs
			let maxCount = 0;
			let targetAttendeeId: number | null = null;
			for (const [attendeeId, attendeeSongs] of songsByAttendee) {
				if (
					attendeeSongs.some((s) => s.songType === 'bonus') &&
					attendeeSongs.length > maxCount
				) {
					maxCount = attendeeSongs.length;
					targetAttendeeId = attendeeId;
				}
			}

			if (targetAttendeeId !== null) {
				const targetSongs = songsByAttendee.get(targetAttendeeId)!;
				// Find the most recent bonus song (latest addedAt)
				const bonusSongs = targetSongs
					.filter((s) => s.songType === 'bonus')
					.sort(
						(a, b) =>
							new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
					);

				if (bonusSongs.length > 0) {
					const bumpedSong = bonusSongs[0];
					await db.delete(songs).where(eq(songs.id, bumpedSong.id));

					// Notify the attendee whose song was bumped
					const bumpedAttendee = await db.query.attendees.findFirst({
						where: eq(attendees.id, targetAttendeeId)
					});
					if (bumpedAttendee) {
						await sendBonusBumpedEmail(
							bumpedAttendee.email,
							bumpedAttendee.name,
							party.name,
							bumpedSong.youtubeTitle
						);
					}
				}
			}
		}

		redirect(303, `/attendee/${params.inviteToken}`);
	}
} satisfies Actions;
