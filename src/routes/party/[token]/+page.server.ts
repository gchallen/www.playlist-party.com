import { dev } from '$app/environment';
import { error, fail } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { generateShareToken, generatePublicToken } from '$lib/server/tokens';
import { extractYouTubeId } from '$lib/youtube';
import { fetchYouTubeMetadata } from '$lib/server/youtube';
import {
	computeTargetDuration,
	computeMaxSongs,
	computeOverflowDrops,
	canIssueInvitations
} from '$lib/server/playlist';
import { toSongInfo } from '$lib/server/invite-validation';
import { isCreator, isCohost, isCreatorOrCohost, hasPlaylistControl, isApproved } from '$lib/server/roles';
import { sendApplicationApprovedEmail, sendApplicationRejectedEmail } from '$lib/server/email';
import { MAX_COMMENT_LENGTH } from '$lib/comment';
import { pickRandomTracks } from '$lib/test-tracks';
import type { PageServerLoad, Actions } from './$types';

type AttendeeStatus = 'pending' | 'declined' | 'attending' | 'unavailable' | 'applied' | 'rejected';

function getAttendeeStatus(
	a: {
		acceptedAt: string | null;
		declinedAt: string | null;
		approvedAt: string | null;
		depth: number;
		invitedBy: number | null;
	},
	party?: { inviteMode: string }
): AttendeeStatus {
	const audition = party?.inviteMode === 'audition';
	const creator = isCreator(a);
	if (audition && a.acceptedAt && a.declinedAt && !a.approvedAt && !creator) return 'rejected';
	if (a.acceptedAt && a.declinedAt) return 'unavailable';
	if (audition && a.acceptedAt && !a.approvedAt && !creator) return 'applied';
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
	const admin = isCreatorOrCohost(attendee);
	const playlistControl = hasPlaylistControl(attendee);
	const isPending = !attendee.acceptedAt;
	const approved = isApproved(attendee, party);
	const attendeeStatus = getAttendeeStatus(attendee, party);

	// Load all attendees
	const allAttendees = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});
	const activeAttendees = allAttendees.filter((a) => !a.declinedAt);
	const acceptedCount = allAttendees.filter((a) => a.acceptedAt && !a.declinedAt && isApproved(a, party)).length;

	// In audition mode, build set of unapproved attendee IDs for song filtering
	const unapprovedIds = new Set(
		party.inviteMode === 'audition' ? allAttendees.filter((a) => !isApproved(a, party)).map((a) => a.id) : []
	);

	// Load all songs
	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id),
		orderBy: songs.position
	});

	// Filter songs: exclude unapproved audition attendees' songs (unless viewer is admin)
	const visibleSongs = admin ? allSongs : allSongs.filter((s) => !unapprovedIds.has(s.addedBy));

	const targetDuration = computeTargetDuration(party.time, party.endTime);
	const totalDuration = visibleSongs.reduce((sum, s) => sum + s.durationSeconds, 0);

	// My invites
	const myInvites = allAttendees.filter((a) => a.invitedBy === attendee.id);
	const invitesSent = myInvites.length;

	const songsPerGuest = party.songsPerGuest ?? 1;
	const maxSongs = computeMaxSongs(playlistControl, invitesSent, songsPerGuest);
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
	if (attribution === 'own_tree' && !playlistControl) {
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
	const unavailableIds = new Set(allAttendees.filter((a) => a.declinedAt).map((a) => a.id));

	// Build song list with conditional attribution
	const songList = visibleSongs.map((s) => {
		let addedByName: string | null = null;
		if (playlistControl) {
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

	// Hide location from unapproved audition attendees
	const showLocation = approved || admin;

	// Build pending applications for admin in audition mode
	const pendingApplications =
		admin && party.inviteMode === 'audition'
			? allAttendees
					.filter((a) => a.acceptedAt && !a.approvedAt && !a.declinedAt && !isCreatorOrCohost(a))
					.map((a) => ({
						id: a.id,
						name: a.name,
						email: a.email,
						createdAt: a.createdAt,
						songs: allSongs
							.filter((s) => s.addedBy === a.id)
							.map((s) => ({
								youtubeId: s.youtubeId,
								youtubeTitle: s.youtubeTitle,
								youtubeThumbnail: s.youtubeThumbnail,
								youtubeChannelName: s.youtubeChannelName,
								durationSeconds: s.durationSeconds,
								comment: s.comment
							}))
					}))
			: null;

	return {
		party: {
			name: party.name,
			description: showLocation ? party.description : null,
			date: party.date,
			time: party.time,
			endTime: party.endTime,
			location: showLocation ? party.location : null,
			locationUrl: showLocation ? party.locationUrl : null,
			maxAttendees: party.maxAttendees,
			maxDepth: party.maxDepth,
			maxInvitesPerGuest: party.maxInvitesPerGuest,
			songsPerGuest: party.songsPerGuest ?? 1,
			songsRequiredToRsvp: party.songsRequiredToRsvp ?? party.songsPerGuest ?? 1,
			songAttribution: party.songAttribution,
			inviteMode: party.inviteMode,
			applicationPrompt: party.applicationPrompt,
			publishedAt: admin ? party.publishedAt : undefined,
			publicToken: admin ? party.publicToken : undefined,
			publicShowHost: admin ? party.publicShowHost : undefined,
			publicShowGuestCount: admin ? party.publicShowGuestCount : undefined,
			publicShowTime: admin ? party.publicShowTime : undefined,
			publicShowLocation: admin ? party.publicShowLocation : undefined,
			publicShowDescription: admin ? party.publicShowDescription : undefined
		},
		attendee: {
			name: attendee.name,
			depth: attendee.depth,
			inviteToken: attendee.inviteToken,
			shareToken: attendee.shareToken
		},
		isCreator: admin,
		isOriginalCreator: creator,
		hasPlaylistControl: playlistControl,
		playlistLocked: !!party.playlistLockedAt,
		partyModeActive: !!party.nowPlayingSongId,
		isPending,
		attendeeStatus,
		songs: songList,
		totalDuration,
		targetDuration,
		acceptedCount,
		totalAttendees: activeAttendees.length,
		canInvite,
		mySongs: !isPending
			? mySongs.map((s) => ({
					id: s.id,
					youtubeId: s.youtubeId,
					youtubeTitle: s.youtubeTitle,
					youtubeThumbnail: s.youtubeThumbnail,
					youtubeChannelName: s.youtubeChannelName,
					durationSeconds: s.durationSeconds,
					comment: s.comment
				}))
			: null,
		maxSongs: !isPending ? (maxSongs === Infinity ? -1 : maxSongs) : null,
		songsUsed: !isPending ? mySongs.length : null,
		invitesSent: !isPending ? invitesSent : null,
		myInvites: !isPending
			? myInvites.map((i) => ({
					id: i.id,
					name: i.name,
					email: i.email,
					accepted: !!i.acceptedAt,
					isDj: i.isDj === 1,
					isCohost: i.isCohost === 1,
					status: getAttendeeStatus(i, party),
					inviteToken: i.inviteToken
				}))
			: null,
		allAttendees: admin
			? allAttendees.map((a) => ({
					id: a.id,
					name: a.name,
					email: a.email,
					invitedBy: a.invitedBy,
					depth: a.depth,
					accepted: !!a.acceptedAt,
					isDj: a.isDj === 1,
					isCohost: a.isCohost === 1,
					status: getAttendeeStatus(a, party)
				}))
			: null,
		pendingApplications
	};
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

		// If playlist is locked, accept without songs
		if (party.playlistLockedAt) {
			await db
				.update(attendees)
				.set({ name, acceptedAt: new Date().toISOString(), declinedAt: null })
				.where(eq(attendees.id, attendee.id));
			return { accepted: true };
		}

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
		const metadataList = await Promise.all(parsedSongs.map((s) => fetchYouTubeMetadata(s.videoId)));
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

			const [inserted] = await db
				.insert(songs)
				.values({
					partyId: party.id,
					addedBy: attendee.id,
					youtubeId: s.videoId,
					youtubeTitle: metadata.title,
					youtubeThumbnail: metadata.thumbnail,
					youtubeChannelName: metadata.channelName,
					durationSeconds: s.durationSeconds,
					comment: s.comment,
					position: 0 // temporary, will be fixed below
				})
				.returning();

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

		// Lock guard: only admin can add songs when locked
		if (party.playlistLockedAt && !isCreatorOrCohost(attendee)) {
			return fail(403, { songError: 'Playlist is locked' });
		}

		const plControl = hasPlaylistControl(attendee);

		// Check slot limit
		const allAttendees = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const invitesSent = allAttendees.filter((a) => a.invitedBy === attendee.id).length;
		const maxSongs = computeMaxSongs(plControl, invitesSent, party.songsPerGuest ?? 1);
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

		if (plControl) {
			// Creator/DJ must remove songs manually to make space — no auto-drops
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

		await db.update(attendees).set({ declinedAt: new Date().toISOString() }).where(eq(attendees.id, attendee.id));

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

		await db.update(attendees).set({ declinedAt: null }).where(eq(attendees.id, attendee.id));

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
			.set({ declinedAt: new Date().toISOString(), isCohost: 0, isDj: 0 })
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

		await db.update(attendees).set({ declinedAt: null }).where(eq(attendees.id, attendee.id));

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
		if (!hasPlaylistControl(attendee)) return fail(403, { error: 'Only the creator or DJs can remove songs' });

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

		// Lock guard: only admin can move songs when locked
		if (!isCreatorOrCohost(attendee)) {
			const party = await db.query.parties.findFirst({
				where: eq(parties.id, attendee.partyId)
			});
			if (party?.playlistLockedAt) {
				return fail(403, { error: 'Playlist is locked' });
			}
		}

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });

		// Song must belong to this attendee, or attendee must have playlist control
		if (!hasPlaylistControl(attendee) && allSongs[idx].addedBy !== attendee.id) {
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

		// Lock guard: only admin can reorder songs when locked
		if (!isCreatorOrCohost(attendee)) {
			const party = await db.query.parties.findFirst({
				where: eq(parties.id, attendee.partyId)
			});
			if (party?.playlistLockedAt) {
				return fail(403, { error: 'Playlist is locked' });
			}
		}

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });

		// Song must belong to this attendee, or attendee must have playlist control
		if (!hasPlaylistControl(attendee) && allSongs[idx].addedBy !== attendee.id) {
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
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can update settings' });

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

		const inviteModeRaw = data.get('inviteMode')?.toString()?.trim();
		if (inviteModeRaw && ['standard', 'audition'].includes(inviteModeRaw)) {
			updates.inviteMode = inviteModeRaw;

			// Switching from audition to standard: auto-approve all pending applicants
			if (inviteModeRaw === 'standard' && party.inviteMode === 'audition') {
				const allAttendeesList = await db.query.attendees.findMany({
					where: eq(attendees.partyId, party.id)
				});
				const pendingApplicants = allAttendeesList.filter(
					(a) => a.acceptedAt && !a.approvedAt && !a.declinedAt && !isCreator(a)
				);
				for (const applicant of pendingApplicants) {
					await db
						.update(attendees)
						.set({ approvedAt: new Date().toISOString() })
						.where(eq(attendees.id, applicant.id));
				}
			}
		}

		const applicationPromptRaw = data.get('applicationPrompt')?.toString()?.trim();
		if (applicationPromptRaw !== undefined) {
			updates.applicationPrompt = applicationPromptRaw || null;
		}

		if (Object.keys(updates).length > 0) {
			await db.update(parties).set(updates).where(eq(parties.id, party.id));
		}

		return { settingsUpdated: true };
	},

	approveApplication: async ({ params, request, platform, url }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const attendeeId = parseInt(data.get('attendeeId')?.toString() || '', 10);
		if (isNaN(attendeeId)) return fail(400, { error: 'Invalid attendee ID' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can approve applications' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });
		if (party.inviteMode !== 'audition') return fail(400, { error: 'Party is not in audition mode' });

		const target = await db.query.attendees.findFirst({
			where: and(eq(attendees.id, attendeeId), eq(attendees.partyId, party.id))
		});
		if (!target) return fail(404, { error: 'Applicant not found' });
		if (!target.acceptedAt || target.approvedAt || target.declinedAt) {
			return fail(400, { error: 'Applicant is not in a pending application state' });
		}

		// Check capacity
		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});
		const approvedCount = allAttendeesList.filter((a) => a.acceptedAt && !a.declinedAt && isApproved(a, party)).length;
		if (approvedCount >= party.maxAttendees) {
			return fail(400, { error: 'Party is at capacity' });
		}

		// Approve the applicant
		await db.update(attendees).set({ approvedAt: new Date().toISOString() }).where(eq(attendees.id, target.id));

		// Run overflow check for the applicant's songs joining the playlist
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id),
			orderBy: songs.position
		});
		// Only include songs from approved attendees in overflow calculations
		const approvedSongs = allSongs.filter((s) => {
			const songOwner = allAttendeesList.find((a) => a.id === s.addedBy);
			if (!songOwner) return true;
			// Treat the newly-approved target as approved for this calculation
			if (songOwner.id === target.id) return true;
			return isApproved(songOwner, party);
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);
		const applicantSongs = allSongs.filter((s) => s.addedBy === target.id);
		const totalNewDuration = applicantSongs.reduce((sum, s) => sum + s.durationSeconds, 0);

		if (targetDuration !== null && totalNewDuration > 0) {
			const overflowResult = computeOverflowDrops(
				approvedSongs.filter((s) => s.addedBy !== target.id).map(toSongInfo),
				totalNewDuration,
				targetDuration,
				target.id
			);

			if (overflowResult !== null) {
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
		}

		// Send approval email
		const magicUrl = `${url.origin}/party/${target.inviteToken}`;
		await sendApplicationApprovedEmail(target.email, target.name, party.name, magicUrl, platform);

		return { approved: target.name };
	},

	rejectApplication: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const attendeeId = parseInt(data.get('attendeeId')?.toString() || '', 10);
		if (isNaN(attendeeId)) return fail(400, { error: 'Invalid attendee ID' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can reject applications' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });
		if (party.inviteMode !== 'audition') return fail(400, { error: 'Party is not in audition mode' });

		const target = await db.query.attendees.findFirst({
			where: and(eq(attendees.id, attendeeId), eq(attendees.partyId, party.id))
		});
		if (!target) return fail(404, { error: 'Applicant not found' });
		if (!target.acceptedAt || target.approvedAt || target.declinedAt) {
			return fail(400, { error: 'Applicant is not in a pending application state' });
		}

		// Mark as rejected (set declinedAt)
		await db.update(attendees).set({ declinedAt: new Date().toISOString() }).where(eq(attendees.id, target.id));

		// Delete their songs
		const targetSongs = await db.query.songs.findMany({
			where: and(eq(songs.partyId, party.id), eq(songs.addedBy, target.id))
		});
		for (const s of targetSongs) {
			await db.delete(songs).where(eq(songs.id, s.id));
		}

		// Recompute positions
		if (targetSongs.length > 0) {
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

		// Send rejection email
		await sendApplicationRejectedEmail(target.email, target.name, party.name, platform);

		return { rejected: target.name };
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
		if (!isCreatorOrCohost(attendee))
			return fail(403, { inviteError: 'Only the creator can decline on behalf of guests' });

		const target = await db.query.attendees.findFirst({
			where: and(eq(attendees.inviteToken, inviteToken), eq(attendees.partyId, attendee.partyId))
		});
		if (!target) return fail(404, { inviteError: 'Guest not found' });

		if (isCreator(target)) return fail(400, { inviteError: 'The creator cannot be declined' });
		// Co-hosts cannot decline other co-hosts (only the original creator can)
		if (isCohost(target) && !isCreator(attendee))
			return fail(403, { inviteError: 'Only the creator can decline co-hosts' });
		if (target.declinedAt) return fail(400, { inviteError: 'This guest has already declined' });

		await db
			.update(attendees)
			.set({ declinedAt: new Date().toISOString(), isCohost: 0, isDj: 0 })
			.where(eq(attendees.id, target.id));

		return { declinedOnBehalf: target.name };
	},

	distributeSongs: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { songError: 'Not found' });
		if (!hasPlaylistControl(attendee)) return fail(403, { songError: 'Only the creator or DJs can distribute songs' });

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

			const [inserted] = await db
				.insert(songs)
				.values({
					partyId: party.id,
					addedBy: attendee.id,
					youtubeId: track.videoId,
					youtubeTitle: track.title,
					youtubeThumbnail: track.thumbnail,
					youtubeChannelName: track.channelName,
					durationSeconds: track.durationSeconds,
					position: 0
				})
				.returning();

			positionArray.splice(insertIdx, 0, inserted.id);
		}

		for (let i = 0; i < positionArray.length; i++) {
			await db.update(songs).set({ position: i }).where(eq(songs.id, positionArray[i]));
		}

		return { devSongsAdded: tracks.length };
	},

	lockPlaylist: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can lock the playlist' });

		await db
			.update(parties)
			.set({ playlistLockedAt: new Date().toISOString() })
			.where(eq(parties.id, attendee.partyId));

		return { playlistLocked: true };
	},

	unlockPlaylist: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can unlock the playlist' });

		await db.update(parties).set({ playlistLockedAt: null }).where(eq(parties.id, attendee.partyId));

		return { playlistUnlocked: true };
	},

	toggleDj: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const attendeeId = parseInt(data.get('attendeeId')?.toString() || '', 10);
		if (isNaN(attendeeId)) return fail(400, { error: 'Invalid attendee ID' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can toggle DJ status' });

		const target = await db.query.attendees.findFirst({
			where: and(eq(attendees.id, attendeeId), eq(attendees.partyId, attendee.partyId))
		});
		if (!target) return fail(404, { error: 'Attendee not found' });
		if (isCreatorOrCohost(target)) return fail(400, { error: 'Co-hosts and the creator cannot be made DJs' });
		if (!target.acceptedAt) return fail(400, { error: 'Only accepted attendees can be made DJs' });

		const newValue = target.isDj === 1 ? 0 : 1;
		await db.update(attendees).set({ isDj: newValue }).where(eq(attendees.id, target.id));

		return { djToggled: target.name, isDj: newValue === 1 };
	},

	toggleCohost: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const attendeeId = parseInt(data.get('attendeeId')?.toString() || '', 10);
		if (isNaN(attendeeId)) return fail(400, { error: 'Invalid attendee ID' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreator(attendee)) return fail(403, { error: 'Only the original creator can toggle co-host status' });

		const target = await db.query.attendees.findFirst({
			where: and(eq(attendees.id, attendeeId), eq(attendees.partyId, attendee.partyId))
		});
		if (!target) return fail(404, { error: 'Attendee not found' });
		if (isCreator(target)) return fail(400, { error: 'The creator cannot be made a co-host' });
		if (!target.acceptedAt) return fail(400, { error: 'Only accepted attendees can be made co-hosts' });

		const newValue = target.isCohost === 1 ? 0 : 1;
		// When promoting to co-host, clear DJ (co-host supersedes DJ)
		const updates: Record<string, unknown> = { isCohost: newValue };
		if (newValue === 1) updates.isDj = 0;
		await db.update(attendees).set(updates).where(eq(attendees.id, target.id));

		return { cohostToggled: target.name, isCohost: newValue === 1 };
	},

	publishParty: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can publish the party' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { error: 'Party not found' });

		const updates: Record<string, unknown> = {
			publishedAt: new Date().toISOString()
		};
		if (!party.publicToken) {
			updates.publicToken = generatePublicToken();
		}

		await db.update(parties).set(updates).where(eq(parties.id, party.id));

		return { published: true };
	},

	unpublishParty: async ({ params, platform }) => {
		const db = await getDb(platform);

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can unpublish the party' });

		await db.update(parties).set({ publishedAt: null }).where(eq(parties.id, attendee.partyId));

		return { unpublished: true };
	},

	updatePublicVisibility: async ({ params, request, platform }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { error: 'Not found' });
		if (!isCreatorOrCohost(attendee)) return fail(403, { error: 'Only the creator can update visibility' });

		await db
			.update(parties)
			.set({
				publicShowHost: data.get('publicShowHost') ? 1 : 0,
				publicShowGuestCount: data.get('publicShowGuestCount') ? 1 : 0,
				publicShowTime: data.get('publicShowTime') ? 1 : 0,
				publicShowLocation: data.get('publicShowLocation') ? 1 : 0,
				publicShowDescription: data.get('publicShowDescription') ? 1 : 0
			})
			.where(eq(parties.id, attendee.partyId));

		return { visibilityUpdated: true };
	}
} satisfies Actions;
