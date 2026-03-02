import { error, fail, redirect } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { generateInviteToken } from '$lib/server/tokens';
import { extractYouTubeId } from '$lib/youtube';
import { fetchYouTubeMetadata } from '$lib/server/youtube';
import { sendInviteEmail } from '$lib/server/email';
import { computeTargetDuration, computeMaxSongs, computeOverflowDrops, canIssueInvitations } from '$lib/server/playlist';
import type { SongInfo } from '$lib/server/playlist';
import { MAX_COMMENT_LENGTH } from '$lib/comment';
import type { PageServerLoad, Actions } from './$types';

function isCreator(attendee: { depth: number; invitedBy: number | null }): boolean {
	return attendee.depth === 0 && attendee.invitedBy === null;
}

function maskEmail(email: string): string {
	const [local, domain] = email.split('@');
	const maskedLocal = local[0] + '***' + (local.length > 1 ? local[local.length - 1] : '');
	const domainParts = domain.split('.');
	const maskedDomain = domainParts[0][0] + '***' + '.' + domainParts.slice(1).join('.');
	return maskedLocal + '@' + maskedDomain;
}

function toSongInfo(s: { id: number; addedBy: number; durationSeconds: number; addedAt: string }): SongInfo {
	return { id: s.id, addedBy: s.addedBy, durationSeconds: s.durationSeconds, addedAt: s.addedAt };
}

export const load: PageServerLoad = async ({ params, platform, cookies }) => {
	const db = await getDb(platform);

	const attendee = await db.query.attendees.findFirst({
		where: eq(attendees.inviteToken, params.token)
	});

	if (!attendee) {
		error(404, 'Not found');
	}

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, attendee.partyId)
	});

	if (!party) {
		error(404, 'Party not found');
	}

	const verified = cookies.get(`pv_${params.token}`) === '1';
	const creator = isCreator(attendee);
	const isPending = !attendee.acceptedAt;

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
	const acceptedCount = allAttendees.filter((a) => a.acceptedAt).length;

	// My invites
	const myInvites = allAttendees.filter((a) => a.invitedBy === attendee.id);
	const invitesSent = myInvites.length;

	const songsPerGuest = party.songsPerGuest ?? 1;
	const maxSongs = computeMaxSongs(creator, invitesSent, songsPerGuest);
	const mySongs = allSongs.filter((s) => s.addedBy === attendee.id);

	const canInvite = canIssueInvitations(
		allAttendees.length,
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
			isHost: s.addedBy === hostId
		};
	});

	// Base return data
	const result: Record<string, unknown> = {
		verified,
		maskedEmail: maskEmail(attendee.email),
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
			songAttribution: party.songAttribution
		},
		attendee: {
			name: attendee.name,
			depth: attendee.depth,
			inviteToken: attendee.inviteToken
		},
		isCreator: creator,
		isPending,
		songs: songList,
		totalDuration,
		targetDuration,
		acceptedCount,
		totalAttendees: allAttendees.length,
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
			accepted: !!i.acceptedAt
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
			accepted: !!a.acceptedAt
		}));
	}

	return result;
};

export const actions = {
	verify: async ({ params, request, platform, cookies }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const email = data.get('email')?.toString()?.trim();
		if (!email) return fail(400, { verifyError: 'Email is required' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { verifyError: 'Not found' });

		if (email.toLowerCase() !== attendee.email.toLowerCase()) {
			return fail(400, { verifyError: 'Email does not match this invite' });
		}

		cookies.set(`pv_${params.token}`, '1', {
			path: `/party/${params.token}`,
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		return { verified: true };
	},

	accept: async ({ params, request, platform }) => {
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
		if (!durationSeconds) return fail(400, { error: 'Song duration is required' });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
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
			return fail(400, { error: 'This song is already on the playlist! Pick something else.' });
		}

		const metadata = await fetchYouTubeMetadata(videoId);
		if (!metadata) {
			return fail(400, { error: 'Could not find that YouTube video. Is it public?' });
		}

		// Run overflow algorithm
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);
		const overflowResult = computeOverflowDrops(
			allSongs.map(toSongInfo),
			durationSeconds,
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

		// Accept the invite
		await db
			.update(attendees)
			.set({ name, acceptedAt: new Date().toISOString() })
			.where(eq(attendees.id, attendee.id));

		// Get new position
		const currentSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});

		// Read optional comment
		const commentRaw = data.get('comment')?.toString()?.trim() || null;
		const comment = commentRaw ? commentRaw.slice(0, MAX_COMMENT_LENGTH) : null;

		// Add the song
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

		// Run overflow
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);
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

	sendInvite: async ({ params, request, platform, url }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const name = data.get('name')?.toString()?.trim();
		const email = data.get('email')?.toString()?.trim();

		if (!name) return fail(400, { inviteError: "Friend's name is required" });
		if (!email) return fail(400, { inviteError: "Friend's email is required" });

		const attendee = await db.query.attendees.findFirst({
			where: eq(attendees.inviteToken, params.token)
		});
		if (!attendee) return fail(404, { inviteError: 'Not found' });

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, attendee.partyId)
		});
		if (!party) return fail(404, { inviteError: 'Party not found' });

		const allAttendees = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});

		// Check max attendees
		if (allAttendees.length >= party.maxAttendees) {
			return fail(400, { inviteError: 'Party is full — max attendees reached' });
		}

		// Check max depth
		if (party.maxDepth !== null && attendee.depth + 1 > party.maxDepth) {
			return fail(400, { inviteError: 'Maximum invite depth reached' });
		}

		// Check maxInvitesPerGuest
		const myInvites = allAttendees.filter((a) => a.invitedBy === attendee.id);
		if (party.maxInvitesPerGuest !== null && myInvites.length >= party.maxInvitesPerGuest) {
			return fail(400, { inviteError: `You can only send ${party.maxInvitesPerGuest} invites` });
		}

		// Check canIssueInvitations (duration gating)
		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);
		if (!canIssueInvitations(allAttendees.length, party.maxAttendees, allSongs.map(toSongInfo), targetDuration)) {
			return fail(400, { inviteError: 'The playlist is full — no room for more guests right now' });
		}

		// Check duplicate email
		const existingAttendee = allAttendees.find(
			(a) => a.email.toLowerCase() === email.toLowerCase()
		);
		if (existingAttendee) {
			return fail(400, { inviteError: 'This person has already been invited!' });
		}

		const newToken = generateInviteToken();

		await db.insert(attendees).values({
			partyId: party.id,
			name,
			email,
			invitedBy: attendee.id,
			inviteToken: newToken,
			depth: attendee.depth + 1
		});

		const magicUrl = `${url.origin}/party/${newToken}`;
		await sendInviteEmail(
			email,
			name,
			attendee.name,
			party.name,
			party.date,
			party.time,
			party.location,
			magicUrl,
			platform,
			party.locationUrl
		);

		return { inviteSent: name, inviteUrl: magicUrl };
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
		if (!isCreator(attendee)) return fail(403, { error: 'Only the creator can reorder songs' });

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });
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
		if (!isCreator(attendee)) return fail(403, { error: 'Only the creator can reorder songs' });

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, attendee.partyId),
			orderBy: songs.position
		});

		const idx = allSongs.findIndex((s) => s.id === songId);
		if (idx === -1) return fail(404, { error: 'Song not found' });

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
			if (!isNaN(parsed) && parsed >= 0) updates.maxInvitesPerGuest = parsed;
		}

		const songsPerGuestRaw = data.get('songsPerGuest')?.toString()?.trim();
		if (songsPerGuestRaw) {
			const parsed = parseInt(songsPerGuestRaw, 10);
			if (!isNaN(parsed) && parsed >= 1) updates.songsPerGuest = parsed;
		}

		const attribution = data.get('songAttribution')?.toString()?.trim();
		if (attribution && ['hidden', 'own_tree', 'visible'].includes(attribution)) {
			updates.songAttribution = attribution;
		}

		if (Object.keys(updates).length > 0) {
			await db.update(parties).set(updates).where(eq(parties.id, party.id));
		}

		return { settingsUpdated: true };
	}
} satisfies Actions;
