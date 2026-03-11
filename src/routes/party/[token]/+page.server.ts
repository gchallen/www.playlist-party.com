import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { generateShareToken } from '$lib/server/tokens';
import { extractYouTubeId } from '$lib/youtube';
import { fetchYouTubeMetadata } from '$lib/server/youtube';
import { computeTargetDuration, computeMaxSongs, computeOverflowDrops, canIssueInvitations } from '$lib/server/playlist';
import { toSongInfo } from '$lib/server/invite-validation';
import { MAX_COMMENT_LENGTH } from '$lib/comment';
import { pickRandomTracks } from '$lib/test-tracks';
import type { PageServerLoad, Actions } from './$types';

function isCreator(attendee: { depth: number; invitedBy: number | null }): boolean {
	return attendee.depth === 0 && attendee.invitedBy === null;
}

type AttendeeStatus = 'pending' | 'declined' | 'attending' | 'unavailable';

function getAttendeeStatus(a: { acceptedAt: string | null; declinedAt: string | null }): AttendeeStatus {
	if (a.acceptedAt && a.declinedAt) return 'unavailable';
	if (a.acceptedAt) return 'attending';
	if (a.declinedAt) return 'declined';
	return 'pending';
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	let attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.token)
	});

	if (!attendee) {
		error(404, 'Not found');
	}

	// Lazy-generate shareToken for existing attendees that don't have one
	if (!attendee.shareToken) {
		const newShareToken = generateShareToken();
		await db.update(attendees).set({ shareToken: newShareToken }).where(eq(attendees.id, attendee.id));
		attendee = { ...attendee, shareToken: newShareToken };
	}

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});

	if (!party) {
		error(404, 'Party not found');
	}

	const creator = isCreator(attendee);
	const isPending = !attendee.acceptedAt;
	const attendeeStatus = getAttendeeStatus(attendee);

	// Load all songs
	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	const targetDuration = computeTargetDuration(party.time, party.endTime);
	const totalDuration = allSongs.reduce((sum, s) => sum + s.durationSeconds, 0);

	// Load all attendees
	const allAttendees = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});
	const activeAttendees = allAttendees.filter((a) => !a.declinedAt);
	const acceptedCount = allAttendees.filter((a) => a.acceptedAt && !a.declinedAt).length;

	// My invites
	const myInvites = allAttendees.filter((a) => a.invitedBy === attendee.id);
	const invitesSent = myInvites.length;

	const songsPerGuest = party.songsPerGuest ?? 1;
	const maxSongs = computeMaxSongs(creator, invitesSent, songsPerGuest);
	const mySongs = allSongs.filter((s) => s.addedBy === attendee.id);

	const canInvite = canIssueInvitations(
		activeAttendees.length,
		party.maxAttendees,
		allSongs.map(toSongInfo),
		targetDuration
	);

	// Build attendee name map and find host ID
	const attendeeMap = new Map(allAttendees.map((a) => [a.id, a.name]));
	const hostId = allAttendees.find((a) => isCreator(a))?.id ?? null;

	// Song attribution filtering
	const attribution = party.songAttribution as 'hidden' | 'own_tree' | 'visible';

	// For own_tree: build set of attendee IDs in this attendee's tree
	let treeIds: Set<number> | null = null;
	if (attribution === 'own_tree' && !creator) {
		treeIds = new Set<number>([attendee.id]);
		// Walk down: find all attendees invited by anyone in the tree
		const queue = [attendee.id];
		while (queue.length > 0) {
			const parentId = queue.shift()!;
			for (const a of allAttendees) {
				if (a.invitedBy === parentId && !treeIds.has(a.id)) {
					treeIds.add(a.id);
					queue.push(a.id);
				}
			}
		}
	}

	// Build set of unavailable attendee IDs
	const unavailableIds = new Set(
		allAttendees.filter((a) => a.declinedAt).map((a) => a.id)
	);

	// Build song list with conditional attribution
	const songList = allSongs.map((s) => {
		let addedByName: string | null = null;
		if (creator) {
			addedByName = attendeeMap.get(s.addedBy) || 'Unknown';
		} else if (attribution === 'visible') {
			addedByName = attendeeMap.get(s.addedBy) || 'Unknown';
		} else if (attribution === 'own_tree' && treeIds?.has(s.addedBy)) {
			addedByName = attendeeMap.get(s.addedBy) || 'Unknown';
		}

		return {
			id: s.id,
			youtubeId: s.youtubeId,
			youtubeTitle: s.youtubeTitle,
			youtubeThumbnail: s.youtubeThumbnail,
			youtubeChannelName: s.youtubeChannelName,
			durationSeconds: s.durationSeconds,
			position: s.position,
			comment: s.comment,
			addedByName,
			isMine: s.addedBy === attendee.id,
			isHost: s.addedBy === hostId,
			isUnavailable: unavailableIds.has(s.addedBy)
		};
	});

	// Base return data
	const result: Record<string, unknown> = {
		party: {
			name: party.name,
			description: party.description,
			date: party.date,
			time: party.time,
			endTime: party.endTime,
			location: party.location,
			locationUrl: party.locationUrl,
			maxAttendees: party.maxAttendees,
			maxDepth: party.maxDepth,
			maxInvitesPerGuest: party.maxInvitesPerGuest,
			songsPerGuest: party.songsPerGuest ?? 1,
			songsRequiredToRsvp: party.songsRequiredToRsvp ?? party.songsPerGuest ?? 1,
			songAttribution: party.songAttribution
		},
		attendee: {
			name: attendee.name,
			depth: attendee.depth,
			inviteToken: attendee.inviteToken,
			shareToken: attendee.shareToken
		},
		isCreator: creator,
		partyModeActive: !!party.nowPlayingSongId,
		isPending,
		attendeeStatus,
		songs: songList,
		totalDuration,
		targetDuration,
		acceptedCount,
		totalAttendees: activeAttendees.length,
		canInvite
	};

	if (!isPending) {
		result.mySongs = mySongs.map((s) => ({
			id: s.id,
			youtubeId: s.youtubeId,
			youtubeTitle: s.youtubeTitle,
			youtubeThumbnail: s.youtubeThumbnail,
			youtubeChannelName: s.youtubeChannelName,
			durationSeconds: s.durationSeconds,
			comment: s.comment
		}));
		result.maxSongs = maxSongs === Infinity ? -1 : maxSongs; // -1 signals unlimited
		result.songsUsed = mySongs.length;
		result.invitesSent = invitesSent;
		result.myInvites = myInvites.map((i) => ({
			name: i.name,
			email: i.email,
			accepted: !!i.acceptedAt,
			status: getAttendeeStatus(i),
			inviteToken: i.inviteToken
		}));
	}

	// Creator extras
	if (creator) {
		result.allAttendees = allAttendees.map((a) => ({
			id: a.id,
			name: a.name,
			email: a.email,
			invitedBy: a.invitedBy,
			depth: a.depth,
			accepted: !!a.acceptedAt,
			status: getAttendeeStatus(a)
		}));
	}

	return result;
};

export const actions = {
	accept: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const name = data.get('name')?.toString()?.trim();
		if (!name) return fail(400, { error: 'Your name is required' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Invite not found' });
		if (attendee.acceptedAt) return fail(400, { error: 'Invite already accepted' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		const songsRequired = party.songsRequiredToRsvp ?? party.songsPerGuest ?? 1;

		// Parse N songs from indexed form fields
		const parsedSongs: Array<{ videoId: string; durationSeconds: number; comment: string | null }> = [];
		const seenVideoIds = new Set<string>();

		for (let i = 0; i < songsRequired; i++) {
			const youtubeUrl = data.get(`youtubeUrl_${i}`)?.toString()?.trim();
			if (!youtubeUrl) return fail(400, { error: `Song ${i + 1}: A YouTube URL is required` });

			const videoId = extractYouTubeId(youtubeUrl);
			if (!videoId) return fail(400, { error: `Song ${i + 1}: Invalid YouTube URL` });

			// Check uniqueness among submitted songs
			if (seenVideoIds.has(videoId)) {
				return fail(400, { error: `Song ${i + 1}: Duplicate — each song must be different` });
			}
			seenVideoIds.add(videoId);

			const durationStr = data.get(`durationSeconds_${i}`)?.toString()?.trim();
			let durationSeconds: number | undefined;
			if (durationStr) {
				const parsed = parseInt(durationStr, 10);
				if (!isNaN(parsed) && parsed > 0 && parsed < 7200) {
					durationSeconds = parsed;
				}
			}
			if (!durationSeconds) return fail(400, { error: `Song ${i + 1}: Song duration is required` });

			const commentRaw = data.get(`comment_${i}`)?.toString()?.trim() || null;
			const comment = commentRaw ? commentRaw.slice(0, MAX_COMMENT_LENGTH) : null;

			parsedSongs.push({ videoId, durationSeconds, comment });
		}

		// Check for duplicate songs vs existing playlist
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const existingVideoIds = new Set(allSongs.map((s) => s.youtubeId));
		for (const s of parsedSongs) {
			if (existingVideoIds.has(s.videoId)) {
				return fail(400, { error: 'One of your songs is already on the playlist! Pick something else.' });
			}
		}

		// Fetch metadata for all songs
		const metadataList = await Promise.all(
			parsedSongs.map((s) => fetchYouTubeMetadata(s.videoId))
		);
		for (let i = 0; i < metadataList.length; i++) {
			if (!metadataList[i]) {
				return fail(400, { error: `Song ${i + 1}: Could not find that YouTube video. Is it public?` });
			}
		}

		// Run overflow check with total new duration
		const totalNewDuration = parsedSongs.reduce((sum, s) => sum + s.durationSeconds, 0);
		const targetDuration = computeTargetDuration(party.time, party.endTime);
		const overflowResult = computeOverflowDrops(
			allSongs.map(toSongInfo),
			totalNewDuration,
			targetDuration,
			attendee.id
		);

		if (overflowResult === null) {
			return fail(400, { error: 'The playlist is full and no songs can be dropped to make room.' });
		}

		// Drop songs
		for (const dropId of overflowResult.drops) {
			await db.delete(songs).where(eq(songs.id, dropId));
		}

		// Fix positions after drops
		if (overflowResult.drops.length > 0) {
			const remainingSongs = await db.query.songs.findMany({
				where: eq(songs.partyId, party.id),
				orderBy: songs.position
			});
			for (let i = 0; i < remainingSongs.length; i++) {
				if (remainingSongs[i].position !== i) {
					await db.update(songs).set({ position: i }).where(eq(songs.id, remainingSongs[i].id));
				}
			}
		}

		// Accept the invite (also clear declinedAt in case of decline → undecline → accept flow)
		await db
			.update(attendees)
			.set({ name, acceptedAt: new Date().toISOString(), declinedAt: null })
			.where(eq(attendees.id, attendee.id));

		// Random insertion: build position array from current songs, insert each new song at a random position
		const currentSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id),
			orderBy: songs.position
		});
		const positionArray = currentSongs.map((s) => s.id);

		const newSongIds: number[] = [];
		for (let i = 0; i < parsedSongs.length; i++) {
			const s = parsedSongs[i];
			const metadata = metadataList[i]!;
			const insertIdx = Math.floor(Math.random() * (positionArray.length + 1));

			const [inserted] = await db.insert(songs).values({
				partyId: party.id,
				addedBy: attendee.id,
				youtubeId: s.videoId,
				youtubeTitle: metadata.title,
				youtubeThumbnail: metadata.thumbnail,
				youtubeChannelName: metadata.channelName,
				durationSeconds: s.durationSeconds,
				comment: s.comment,
				position: 0 // temporary, will be fixed below
			}).returning();

			positionArray.splice(insertIdx, 0, inserted.id);
			newSongIds.push(inserted.id);
		}

		// Update all positions to match the new order
		for (let i = 0; i < positionArray.length; i++) {
			await db.update(songs).set({ position: i }).where(eq(songs.id, positionArray[i]));
		}

		return { accepted: true };
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
			if (!isNaN(parsed) && parsed > 0 && parsed < 7200) {
				durationSeconds = parsed;
			}
		}
		if (!durationSeconds) return fail(400, { songError: 'Song duration is required' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { songError: 'Not found' });
		if (attendee.declinedAt) return fail(400, { songError: 'You have declined this invitation' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { songError: 'Party not found' });

		const creator = isCreator(attendee);

		// Check slot limit
		const allAttendees = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const invitesSent = allAttendees.filter((a) => a.invitedBy === attendee.id).length;
		const maxSongs = computeMaxSongs(creator, invitesSent, party.songsPerGuest ?? 1);
		const mySongs = await db.query.songs.findMany({
			where: and(eq(songs.partyId, party.id), eq(songs.addedBy, attendee.id))
		});

		if (mySongs.length >= maxSongs) {
			return fail(400, { songError: 'No song slots available. Invite friends to earn more!' });
		}

		// Check duplicate
		const existing = await db.query.songs.findFirst({
			where: and(eq(songs.partyId, party.id), eq(songs.youtubeId, videoId))
		});
		if (existing) {
			return fail(400, { songError: 'This song is already on the playlist! Pick something else.' });
		}

		const metadata = await fetchYouTubeMetadata(videoId);
		if (!metadata) {
			return fail(400, { songError: 'Could not find that YouTube video. Is it public?' });
		}

		// Run overflow check
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);

		if (creator) {
			// Creator must remove songs manually to make space — no auto-drops
			if (targetDuration !== null) {
				const currentDuration = allSongs.reduce((sum, s) => sum + s.durationSeconds, 0);
				if (currentDuration + durationSeconds > targetDuration) {
					return fail(400, { songError: 'Playlist is full — remove songs to make space.' });
				}
			}
		} else {
			const overflowResult = computeOverflowDrops(
				allSongs.map(toSongInfo),
				durationSeconds,
				targetDuration,
				attendee.id
			);

			if (overflowResult === null) {
				return fail(400, { songError: 'The playlist is full and no songs can be dropped to make room.' });
			}

			for (const dropId of overflowResult.drops) {
				await db.delete(songs).where(eq(songs.id, dropId));
			}

			if (overflowResult.drops.length > 0) {
				const remainingSongs = await db.query.songs.findMany({
					where: eq(songs.partyId, party.id),
					orderBy: songs.position
				});
				for (let i = 0; i < remainingSongs.length; i++) {
					if (remainingSongs[i].position !== i) {
						await db.update(songs).set({ position: i }).where(eq(songs.id, remainingSongs[i].id));
					}
				}
			}
		}

		const currentSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});

		// Read optional comment
		const commentRaw = data.get('comment')?.toString()?.trim() || null;
		const comment = commentRaw ? commentRaw.slice(0, MAX_COMMENT_LENGTH) : null;

		await db.insert(songs).values({
			partyId: party.id,
			addedBy: attendee.id,
			youtubeId: videoId,
			youtubeTitle: metadata.title,
			youtubeThumbnail: metadata.thumbnail,
			youtubeChannelName: metadata.channelName,
			durationSeconds,
			comment,
			position: currentSongs.length
		});

		return { songAdded: true };
	},

	decline: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (attendee.acceptedAt) return fail(400, { error: 'You have already accepted' });
		if (isCreator(attendee)) return fail(400, { error: 'The creator cannot decline' });

		await db
			.update(attendees)
			.set({ declinedAt: new Date().toISOString() })
			.where(eq(attendees.id, attendee.id));

		return { declined: true };
	},

	undecline: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (attendee.acceptedAt) return fail(400, { error: 'You have already accepted' });
		if (!attendee.declinedAt) return fail(400, { error: 'You have not declined' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		// Capacity check
		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const activeCount = allAttendeesList.filter((a) => !a.declinedAt).length;
		if (activeCount >= party.maxAttendees) {
			return fail(400, { error: 'Party is now full — no room to rejoin' });
		}

		await db
			.update(attendees)
			.set({ declinedAt: null })
			.where(eq(attendees.id, attendee.id));

		return { undeclined: true };
	},

	cantMakeIt: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!attendee.acceptedAt) return fail(400, { error: 'You have not accepted yet' });
		if (isCreator(attendee)) return fail(400, { error: 'The creator cannot mark unavailable' });

		await db
			.update(attendees)
			.set({ declinedAt: new Date().toISOString() })
			.where(eq(attendees.id, attendee.id));

		return { cantMakeIt: true };
	},

	reconfirm: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!attendee.acceptedAt || !attendee.declinedAt) return fail(400, { error: 'Invalid state' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		// Capacity check
		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const activeCount = allAttendeesList.filter((a) => !a.declinedAt).length;
		if (activeCount >= party.maxAttendees) {
			return fail(400, { error: 'Party is now full — no room to rejoin' });
		}

		await db
			.update(attendees)
			.set({ declinedAt: null })
			.where(eq(attendees.id, attendee.id));

		return { reconfirmed: true };
	},

	removeSong: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const songId = parseInt(data.get('songId')?.toString() || '', 10);
		if (isNaN(songId)) return fail(400, { error: 'Invalid song ID' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { error: 'Only the creator can remove songs' });

		const song = await db.query.songs.findFirst({
			where: and(eq(songs.id, songId), eq(songs.partyId, attendee.partyId))
		});
		if (!song) return fail(404, { error: 'Song not found' });

		await db.delete(songs).where(eq(songs.id, songId));

		// Fix positions
		const remainingSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});
		for (let i = 0; i < remainingSongs.length; i++) {
			if (remainingSongs[i].position !== i) {
				await db.update(songs).set({ position: i }).where(eq(songs.id, remainingSongs[i].id));
			}
		}

		return { songRemoved: true };
	},

	moveSong: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const songId = parseInt(data.get('songId')?.toString() || '', 10);
		const newPosition = parseInt(data.get('newPosition')?.toString() || '', 10);
		if (isNaN(songId) || isNaN(newPosition) || newPosition < 0) {
			return fail(400, { error: 'Invalid request' });
		}

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });

		// Song must belong to this attendee, or attendee must be the creator
		if (!isCreator(attendee) && allSongs[idx].addedBy !== attendee.id) {
			return fail(403, { error: 'You can only reorder your own songs' });
		}
		if (newPosition >= allSongs.length) return fail(400, { error: 'Invalid position' });

		// Splice out and insert at new position
		const [moved] = allSongs.splice(idx, 1);
		allSongs.splice(newPosition, 0, moved);

		// Update all positions
		for (let i = 0; i < allSongs.length; i++) {
			if (allSongs[i].position !== i) {
				await db.update(songs).set({ position: i }).where(eq(songs.id, allSongs[i].id));
			}
		}

		return { reordered: true };
	},

	reorderSong: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const songId = parseInt(data.get('songId')?.toString() || '', 10);
		const direction = data.get('direction')?.toString();
		if (isNaN(songId) || (direction !== 'up' && direction !== 'down')) {
			return fail(400, { error: 'Invalid request' });
		}

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });

		// Song must belong to this attendee, or attendee must be the creator
		if (!isCreator(attendee) && allSongs[idx].addedBy !== attendee.id) {
			return fail(403, { error: 'You can only reorder your own songs' });
		}

		const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= allSongs.length) return fail(400, { error: 'Cannot move further' });

		// Swap positions
		const songA = allSongs[idx];
		const songB = allSongs[swapIdx];
		await db.update(songs).set({ position: songB.position }).where(eq(songs.id, songA.id));
		await db.update(songs).set({ position: songA.position }).where(eq(songs.id, songB.id));

		return { reordered: true };
	},

	updateSettings: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { error: 'Only the creator can update settings' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		const updates: Record<string, unknown> = {};

		const name = data.get('partyName')?.toString()?.trim();
		if (name) updates.name = name;

		const maxInvitesRaw = data.get('maxInvitesPerGuest')?.toString()?.trim();
		if (maxInvitesRaw === '') {
			updates.maxInvitesPerGuest = null;
		} else if (maxInvitesRaw) {
			const parsed = parseInt(maxInvitesRaw, 10);
			if (!isNaN(parsed) && parsed >= 1) updates.maxInvitesPerGuest = parsed;
		}

		const songsPerGuestRaw = data.get('songsPerGuest')?.toString()?.trim();
		if (songsPerGuestRaw) {
			const parsed = parseInt(songsPerGuestRaw, 10);
			if (!isNaN(parsed) && parsed >= 1) updates.songsPerGuest = parsed;
		}

		const songsRequiredToRsvpRaw = data.get('songsRequiredToRsvp')?.toString()?.trim();
		if (songsRequiredToRsvpRaw === '') {
			updates.songsRequiredToRsvp = null;
		} else if (songsRequiredToRsvpRaw) {
			const parsed = parseInt(songsRequiredToRsvpRaw, 10);
			const spg = (updates.songsPerGuest as number) ?? party.songsPerGuest ?? 1;
			if (!isNaN(parsed) && parsed >= 1 && parsed <= spg) {
				updates.songsRequiredToRsvp = parsed;
			}
		}

		const attribution = data.get('songAttribution')?.toString()?.trim();
		if (attribution && ['hidden', 'own_tree', 'visible'].includes(attribution)) {
			updates.songAttribution = attribution;
		}

		if (Object.keys(updates).length > 0) {
			await db.update(parties).set(updates).where(eq(parties.id, party.id));
		}

		return { settingsUpdated: true };
	},

	removeInvite: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const inviteToken = data.get('inviteToken')?.toString()?.trim();
		if (!inviteToken) return fail(400, { inviteError: 'Missing invite token' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { inviteError: 'Not found' });

		const target = await db.query.attendees.findFirst({
			where: and(eq(attendees.inviteToken, inviteToken), eq(attendees.partyId, attendee.partyId))
		});
		if (!target) return fail(404, { inviteError: 'Invite not found' });

		if (target.invitedBy !== attendee.id) {
			return fail(403, { inviteError: 'You can only remove your own invites' });
		}

		if (target.acceptedAt || target.declinedAt) {
			return fail(400, { inviteError: 'Can only remove pending invites' });
		}

		await db.delete(attendees).where(eq(attendees.id, target.id));

		return { inviteRemoved: target.name };
	},

	declineOnBehalf: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const inviteToken = data.get('inviteToken')?.toString()?.trim();
		if (!inviteToken) return fail(400, { inviteError: 'Missing invite token' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { inviteError: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { inviteError: 'Only the creator can decline on behalf of guests' });

		const target = await db.query.attendees.findFirst({
			where: and(eq(attendees.inviteToken, inviteToken), eq(attendees.partyId, attendee.partyId))
		});
		if (!target) return fail(404, { inviteError: 'Guest not found' });

		if (isCreator(target)) return fail(400, { inviteError: 'The creator cannot be declined' });
		if (target.declinedAt) return fail(400, { inviteError: 'This guest has already declined' });

		await db
			.update(attendees)
			.set({ declinedAt: new Date().toISOString() })
			.where(eq(attendees.id, target.id));

		return { declinedOnBehalf: target.name };
	},

	distributeSongs: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { songError: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { songError: 'Only the creator can distribute songs' });

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		if (allSongs.length < 2) return { distributed: true };

		// Group songs by who added them
		const byAdder = new Map<number, typeof allSongs>();
		for (const song of allSongs) {
			const list = byAdder.get(song.addedBy) ?? [];
			list.push(song);
			byAdder.set(song.addedBy, list);
		}

		// For each adder's songs, assign evenly-spaced target positions
		const total = allSongs.length;
		const positioned: { song: (typeof allSongs)[0]; target: number }[] = [];
		for (const [, adderSongs] of byAdder) {
			const count = adderSongs.length;
			for (let i = 0; i < count; i++) {
				// Space evenly: (i + 0.5) * total / count
				// Add small random jitter to break ties between different adders
				positioned.push({
					song: adderSongs[i],
					target: ((i + 0.5) * total) / count + (Math.random() - 0.5) * 0.1
				});
			}
		}

		// Sort by target position
		positioned.sort((a, b) => a.target - b.target);

		// Update positions in DB
		for (let i = 0; i < positioned.length; i++) {
			if (positioned[i].song.position !== i) {
				await db.update(songs).set({ position: i }).where(eq(songs.id, positioned[i].song.id));
			}
		}

		return { distributed: true };
	},

	devAddRandomSongs: async ({ params, request, platform }) => {
		if (!dev) return fail(403, { songError: 'Dev-only action' });

		const db = await getDb(platform);
		const data = await request.formData();

		const count = Math.min(Math.max(parseInt(data.get('count')?.toString() || '1', 10) || 1, 1), 50);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { devError: 'Not found' });
		if (!attendee.acceptedAt) return fail(400, { devError: 'Must be accepted first' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { devError: 'Party not found' });

		const existingSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id),
			orderBy: songs.position
		});
		const existingVideoIds = new Set(existingSongs.map((s) => s.youtubeId));

		const tracks = pickRandomTracks(count, existingVideoIds);
		if (tracks.length === 0) {
			return fail(400, { devError: 'No more unique tracks available' });
		}

		const positionArray = existingSongs.map((s) => s.id);

		for (const track of tracks) {
			const insertIdx = Math.floor(Math.random() * (positionArray.length + 1));

			const [inserted] = await db.insert(songs).values({
				partyId: party.id,
				addedBy: attendee.id,
				youtubeId: track.videoId,
				youtubeTitle: track.title,
				youtubeThumbnail: track.thumbnail,
				youtubeChannelName: track.channelName,
				durationSeconds: track.durationSeconds,
				position: 0
			}).returning();

			positionArray.splice(insertIdx, 0, inserted.id);
		}

		for (let i = 0; i < positionArray.length; i++) {
			await db.update(songs).set({ position: i }).where(eq(songs.id, positionArray[i]));
		}

		return { devSongsAdded: tracks.length };
	}
} satisfies Actions;
